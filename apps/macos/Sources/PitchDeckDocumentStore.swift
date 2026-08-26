import CryptoKit
import Darwin
import Foundation

struct PitchDeckManifest: Codable {
    let format: String
    let schemaVersion: Int
    let deckId: String
    var title: String
    let createdAt: String
    var updatedAt: String
    var checkpointRevision: Int
    var checkpointHash: String
    var journalHeadHash: String
    let canvasPreset: String
}

struct LoadedPitchDeck {
    let checkpoint: Data
    let replayRecords: [[String: Any]]
    let recoveredPreviousCheckpoint: Bool
    let repairedJournalHead: Bool
}

final class PitchDeckDocumentStore {
    static let zeroHash = String(repeating: "0", count: 64)

    let packageURL: URL
    private(set) var manifest: PitchDeckManifest
    private(set) var currentRevision: Int
    private var requiresReopen = false

    private var checkpointURL: URL { packageURL.appendingPathComponent("checkpoint.json") }
    private var journalURL: URL { packageURL.appendingPathComponent("journal.ndjson") }
    private var manifestURL: URL { packageURL.appendingPathComponent("manifest.json") }
    private var recoveryURL: URL { packageURL.appendingPathComponent("recovery", isDirectory: true) }
    private var previousCheckpointURL: URL { recoveryURL.appendingPathComponent("previous-checkpoint.json") }

    private init(packageURL: URL, manifest: PitchDeckManifest, currentRevision: Int) {
        self.packageURL = packageURL
        self.manifest = manifest
        self.currentRevision = currentRevision
    }

    static func create(at requestedURL: URL, checkpoint: Data, now: Date = Date()) throws -> PitchDeckDocumentStore {
        let packageURL = requestedURL.pathExtension == "pitchdeck"
            ? requestedURL
            : requestedURL.appendingPathExtension("pitchdeck")
        let metadata = try checkpointMetadata(checkpoint)
        let parent = packageURL.deletingLastPathComponent()
        let staging = parent.appendingPathComponent(".\(packageURL.lastPathComponent).staging-\(UUID().uuidString)", isDirectory: true)
        let files = FileManager.default
        guard !files.fileExists(atPath: packageURL.path) else {
            throw WorkbenchFailure(name: "CheckpointWriteFailure", message: "A Deck already exists at the selected destination")
        }

        do {
            try files.createDirectory(at: staging, withIntermediateDirectories: false)
            try files.createDirectory(at: staging.appendingPathComponent("attachments", isDirectory: true), withIntermediateDirectories: false)
            try files.createDirectory(at: staging.appendingPathComponent("recovery", isDirectory: true), withIntermediateDirectories: false)
            try writeDurable(checkpoint, to: staging.appendingPathComponent("checkpoint.json"))
            try writeDurable(Data(), to: staging.appendingPathComponent("journal.ndjson"))
            let timestamp = iso8601(now)
            let manifest = PitchDeckManifest(
                format: "pitchdog.deck-package",
                schemaVersion: 1,
                deckId: metadata.deckId,
                title: metadata.title,
                createdAt: timestamp,
                updatedAt: timestamp,
                checkpointRevision: metadata.revision,
                checkpointHash: sha256(checkpoint),
                journalHeadHash: zeroHash,
                canvasPreset: metadata.canvasPreset
            )
            try writeDurable(try encodeManifest(manifest), to: staging.appendingPathComponent("manifest.json"))
            try syncDirectory(staging)
            try files.moveItem(at: staging, to: packageURL)
            try syncDirectory(parent)
            return PitchDeckDocumentStore(packageURL: packageURL, manifest: manifest, currentRevision: metadata.revision)
        } catch {
            try? files.removeItem(at: staging)
            throw WorkbenchFailure(name: "CheckpointWriteFailure", message: error.localizedDescription)
        }
    }

    static func open(at packageURL: URL) throws -> (PitchDeckDocumentStore, LoadedPitchDeck) {
        let files = FileManager.default
        var isDirectory: ObjCBool = false
        guard files.fileExists(atPath: packageURL.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Selected .pitchdeck package does not exist")
        }

        let manifestData = try readRequired(packageURL.appendingPathComponent("manifest.json"))
        var manifest: PitchDeckManifest
        do {
            manifest = try JSONDecoder().decode(PitchDeckManifest.self, from: manifestData)
        } catch {
            throw WorkbenchFailure(name: "UnsupportedSchema", message: "manifest.json is invalid or unsupported")
        }
        guard manifest.format == "pitchdog.deck-package", manifest.schemaVersion == 1 else {
            throw WorkbenchFailure(name: "UnsupportedSchema", message: "Only .pitchdeck package schema 1 is supported")
        }

        let currentCheckpoint = try readRequired(packageURL.appendingPathComponent("checkpoint.json"))
        var checkpoint = currentCheckpoint
        var recoveredPreviousCheckpoint = false
        if sha256(currentCheckpoint) != manifest.checkpointHash {
            let previousURL = packageURL.appendingPathComponent("recovery/previous-checkpoint.json")
            let previous = try readRequired(previousURL)
            guard sha256(previous) == manifest.checkpointHash else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Neither current nor recovery checkpoint matches manifest")
            }
            checkpoint = previous
            recoveredPreviousCheckpoint = true
        }

        let journalData = try readRequired(packageURL.appendingPathComponent("journal.ndjson"))
        let validated = try validateJournal(journalData)
        guard manifest.checkpointRevision <= validated.lastRevision else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Checkpoint revision is ahead of journal history")
        }
        let checkpointMetadata = try checkpointMetadata(checkpoint)
        guard checkpointMetadata.revision == manifest.checkpointRevision else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Checkpoint revision does not match manifest")
        }

        let store = PitchDeckDocumentStore(
            packageURL: packageURL,
            manifest: manifest,
            currentRevision: validated.lastRevision
        )
        var repairedJournalHead = false
        if manifest.journalHeadHash != validated.headHash {
            guard validated.hashes.contains(manifest.journalHeadHash) else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Manifest journal head is not in the valid hash chain")
            }
            manifest.journalHeadHash = validated.headHash
            manifest.updatedAt = iso8601(Date())
            do {
                try store.persistManifest(manifest)
                store.manifest = manifest
                repairedJournalHead = true
            } catch {
                throw WorkbenchFailure(name: "CheckpointWriteFailure", message: "Valid journal tail found, but manifest repair failed")
            }
        }

        let replayRecords = validated.records.filter { ($0["revision"] as? Int ?? -1) > manifest.checkpointRevision }
        return (
            store,
            LoadedPitchDeck(
                checkpoint: checkpoint,
                replayRecords: replayRecords,
                recoveredPreviousCheckpoint: recoveredPreviousCheckpoint,
                repairedJournalHead: repairedJournalHead
            )
        )
    }

    func appendDurably(prepared: [String: Any], now: Date = Date()) throws -> [String: Any] {
        guard !requiresReopen else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Document session requires reopen after an interrupted durable write")
        }
        guard let nextRevision = prepared["nextRevision"] as? Int,
              nextRevision == currentRevision + 1,
              var record = prepared["journalOperation"] as? [String: Any]
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Prepared change does not continue the document revision")
        }

        record["revision"] = nextRevision
        record["previousHash"] = manifest.journalHeadHash
        let recordHash = try Self.sha256(Self.canonicalJSON(record))
        record["recordHash"] = recordHash
        var line = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys, .withoutEscapingSlashes])
        line.append(0x0A)

        do {
            let handle = try FileHandle(forWritingTo: journalURL)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: line)
            try handle.synchronize()
            guard Darwin.fsync(handle.fileDescriptor) == 0 else {
                throw POSIXError(.EIO)
            }
        } catch {
            throw WorkbenchFailure(name: "CheckpointWriteFailure", message: "Journal append or fsync failed: \(error.localizedDescription)")
        }

        var nextManifest = manifest
        nextManifest.journalHeadHash = recordHash
        nextManifest.updatedAt = Self.iso8601(now)
        do {
            try persistManifest(nextManifest)
        } catch {
            requiresReopen = true
            throw WorkbenchFailure(
                name: "CheckpointWriteFailure",
                message: "Journal is durable but manifest acknowledgement failed; reopen to recover the valid tail"
            )
        }
        manifest = nextManifest
        currentRevision = nextRevision
        return record
    }

    func saveCheckpoint(_ checkpoint: Data, now: Date = Date()) throws {
        guard !requiresReopen else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Document must reopen before checkpointing")
        }
        let metadata = try Self.checkpointMetadata(checkpoint)
        guard metadata.revision == currentRevision else {
            throw WorkbenchFailure(name: "StaleRevision", message: "Checkpoint does not match the durable journal revision")
        }
        do {
            try FileManager.default.createDirectory(at: recoveryURL, withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: checkpointURL.path) {
                try Self.writeDurable(try Data(contentsOf: checkpointURL), to: previousCheckpointURL)
            }
            try Self.writeDurable(checkpoint, to: checkpointURL)
            var nextManifest = manifest
            nextManifest.title = metadata.title
            nextManifest.checkpointRevision = metadata.revision
            nextManifest.checkpointHash = Self.sha256(checkpoint)
            nextManifest.updatedAt = Self.iso8601(now)
            try persistManifest(nextManifest)
            manifest = nextManifest
        } catch {
            requiresReopen = true
            throw WorkbenchFailure(name: "CheckpointWriteFailure", message: error.localizedDescription)
        }
    }

    private func persistManifest(_ value: PitchDeckManifest) throws {
        try Self.writeDurable(try Self.encodeManifest(value), to: manifestURL)
    }

    private struct CheckpointMetadata {
        let deckId: String
        let title: String
        let revision: Int
        let canvasPreset: String
    }

    private struct ValidatedJournal {
        let records: [[String: Any]]
        let headHash: String
        let hashes: Set<String>
        let lastRevision: Int
    }

    private static func checkpointMetadata(_ data: Data) throws -> CheckpointMetadata {
        guard let checkpoint = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              checkpoint["format"] as? String == "pitchdog.deck-checkpoint",
              checkpoint["schemaVersion"] as? Int == 1,
              let revision = checkpoint["revision"] as? Int,
              let deck = checkpoint["deck"] as? [String: Any],
              let deckId = deck["deckId"] as? String,
              let title = deck["title"] as? String,
              let canvas = deck["canvasPreset"] as? [String: Any],
              let canvasPreset = canvas["id"] as? String
        else {
            throw WorkbenchFailure(name: "UnsupportedSchema", message: "Checkpoint schema is invalid or unsupported")
        }
        return CheckpointMetadata(deckId: deckId, title: title, revision: revision, canvasPreset: canvasPreset)
    }

    private static func validateJournal(_ data: Data) throws -> ValidatedJournal {
        if data.isEmpty {
            return ValidatedJournal(records: [], headHash: zeroHash, hashes: [zeroHash], lastRevision: 0)
        }
        guard data.last == 0x0A, let text = String(data: data, encoding: .utf8) else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Journal has a partial or non-UTF-8 record")
        }
        let lines = text.split(separator: "\n", omittingEmptySubsequences: true)
        var previousHash = zeroHash
        var hashes: Set<String> = [zeroHash]
        var records: [[String: Any]] = []
        var expectedRevision = 1
        for line in lines {
            guard let lineData = String(line).data(using: .utf8),
                  var record = try JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                  let recordHash = record.removeValue(forKey: "recordHash") as? String,
                  let storedPrevious = record["previousHash"] as? String,
                  let revision = record["revision"] as? Int
            else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Journal record is malformed")
            }
            guard storedPrevious == previousHash, revision == expectedRevision else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Journal hash chain or revision sequence is broken")
            }
            let calculated = sha256(try canonicalJSON(record))
            guard calculated == recordHash else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Journal record hash does not match its contents")
            }
            record["recordHash"] = recordHash
            records.append(record)
            previousHash = recordHash
            hashes.insert(recordHash)
            expectedRevision += 1
        }
        return ValidatedJournal(records: records, headHash: previousHash, hashes: hashes, lastRevision: expectedRevision - 1)
    }

    private static func canonicalJSON(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
    }

    private static func encodeManifest(_ manifest: PitchDeckManifest) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(manifest)
    }

    private static func readRequired(_ url: URL) throws -> Data {
        do {
            return try Data(contentsOf: url, options: [.mappedIfSafe])
        } catch {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Missing required package entry: \(url.lastPathComponent)")
        }
    }

    private static func writeDurable(_ data: Data, to destination: URL) throws {
        let parent = destination.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        let temporary = parent.appendingPathComponent(".\(destination.lastPathComponent).tmp-\(UUID().uuidString)")
        guard FileManager.default.createFile(atPath: temporary.path, contents: nil) else {
            throw POSIXError(.EIO)
        }
        do {
            let handle = try FileHandle(forWritingTo: temporary)
            defer { try? handle.close() }
            try handle.write(contentsOf: data)
            try handle.synchronize()
            guard Darwin.fsync(handle.fileDescriptor) == 0 else { throw POSIXError(.EIO) }
            guard Darwin.rename(temporary.path, destination.path) == 0 else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
            try syncDirectory(parent)
        } catch {
            try? FileManager.default.removeItem(at: temporary)
            throw error
        }
    }

    private static func syncDirectory(_ url: URL) throws {
        let descriptor = Darwin.open(url.path, O_RDONLY)
        guard descriptor >= 0 else { throw POSIXError(.EIO) }
        defer { Darwin.close(descriptor) }
        guard Darwin.fsync(descriptor) == 0 else { throw POSIXError(.EIO) }
    }

    private static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func iso8601(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}
