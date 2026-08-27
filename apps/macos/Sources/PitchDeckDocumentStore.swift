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
    static let writerLockFile = ".deck-workbench-writer.lock"
    static let writerLockFormat = "pitchdog.deck-writer-lock"

    let packageURL: URL
    private(set) var manifest: PitchDeckManifest
    private(set) var currentRevision: Int
    private let writerLockToken: String
    private var requiresReopen = false
    private var ownsWriterLock = true

    private init(packageURL: URL, manifest: PitchDeckManifest, currentRevision: Int, writerLockToken: String) {
        self.packageURL = packageURL
        self.manifest = manifest
        self.currentRevision = currentRevision
        self.writerLockToken = writerLockToken
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
            try writeDurable(checkpoint, relativePath: "checkpoint.json", in: staging)
            try writeDurable(Data(), relativePath: "journal.ndjson", in: staging)
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
            try writeDurable(try encodeManifest(manifest), relativePath: "manifest.json", in: staging)
            let writerLockToken = try acquireWriterLock(in: staging, now: now)
            try syncDirectory(staging)
            try files.moveItem(at: staging, to: packageURL)
            do {
                try syncDirectory(parent)
            } catch {
                try? releaseWriterLock(in: packageURL, ownerToken: writerLockToken)
                throw error
            }
            return PitchDeckDocumentStore(
                packageURL: packageURL,
                manifest: manifest,
                currentRevision: metadata.revision,
                writerLockToken: writerLockToken
            )
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
        let writerLockToken = try acquireWriterLock(in: packageURL)
        do {
        do {
            try requireContainedDirectory("attachments", in: packageURL)
            try requireContainedDirectory("recovery", in: packageURL)
        } catch {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Required package directory is missing, linked, or invalid")
        }

        let manifestData = try readRequired("manifest.json", in: packageURL)
        var manifest: PitchDeckManifest
        do {
            manifest = try JSONDecoder().decode(PitchDeckManifest.self, from: manifestData)
        } catch {
            throw WorkbenchFailure(name: "UnsupportedSchema", message: "manifest.json is invalid or unsupported")
        }
        guard manifest.format == "pitchdog.deck-package", manifest.schemaVersion == 1 else {
            throw WorkbenchFailure(name: "UnsupportedSchema", message: "Only .pitchdeck package schema 1 is supported")
        }

        let currentCheckpoint = try readRequired("checkpoint.json", in: packageURL)
        var checkpoint = currentCheckpoint
        var recoveredPreviousCheckpoint = false
        if sha256(currentCheckpoint) != manifest.checkpointHash {
            let previous = try readRequired("recovery/previous-checkpoint.json", in: packageURL)
            guard sha256(previous) == manifest.checkpointHash else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Neither current nor recovery checkpoint matches manifest")
            }
            checkpoint = previous
            recoveredPreviousCheckpoint = true
        }

        let journalData = try readRequired("journal.ndjson", in: packageURL)
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
            currentRevision: validated.lastRevision,
            writerLockToken: writerLockToken
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
        } catch {
            try? releaseWriterLock(in: packageURL, ownerToken: writerLockToken)
            throw error
        }
    }

    func appendDurably(prepared: [String: Any], now: Date = Date()) throws -> [String: Any] {
        try requireWriterLock()
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
            try Self.withContainedParent(of: "journal.ndjson", in: packageURL) { parentDescriptor, name in
                let descriptor = Darwin.openat(parentDescriptor, name, O_WRONLY | O_APPEND | O_NOFOLLOW)
                guard descriptor >= 0 else { throw Self.posixError() }
                let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
                defer { try? handle.close() }
                try Self.requireRegularFile(descriptor)
                try handle.write(contentsOf: line)
                try handle.synchronize()
                guard Darwin.fsync(handle.fileDescriptor) == 0 else {
                    throw Self.posixError()
                }
            }
        } catch {
            requiresReopen = true
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
        try requireWriterLock()
        guard !requiresReopen else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Document must reopen before checkpointing")
        }
        let metadata = try Self.checkpointMetadata(checkpoint)
        guard metadata.revision == currentRevision else {
            throw WorkbenchFailure(name: "StaleRevision", message: "Checkpoint does not match the durable journal revision")
        }
        do {
            try Self.requireContainedDirectory("recovery", in: packageURL)
            let previousCheckpoint = try Self.readRequired("checkpoint.json", in: packageURL)
            try Self.writeDurable(previousCheckpoint, relativePath: "recovery/previous-checkpoint.json", in: packageURL)
            try Self.writeDurable(checkpoint, relativePath: "checkpoint.json", in: packageURL)
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
        try requireWriterLock()
        try Self.writeDurable(try Self.encodeManifest(value), relativePath: "manifest.json", in: packageURL)
    }

    func close() throws {
        guard ownsWriterLock else { return }
        try Self.releaseWriterLock(in: packageURL, ownerToken: writerLockToken)
        ownsWriterLock = false
    }

    deinit {
        if ownsWriterLock {
            try? Self.releaseWriterLock(in: packageURL, ownerToken: writerLockToken)
        }
    }

    private func requireWriterLock() throws {
        guard ownsWriterLock else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Deck document store is closed")
        }
        try Self.requireWriterLock(in: packageURL, ownerToken: writerLockToken)
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

    private static func acquireWriterLock(in packageURL: URL, now: Date = Date()) throws -> String {
        let ownerToken = UUID().uuidString.lowercased()
        let payload: [String: Any] = [
            "format": writerLockFormat,
            "schemaVersion": 1,
            "ownerToken": ownerToken,
            "processId": ProcessInfo.processInfo.processIdentifier,
            "createdAt": iso8601(now),
        ]
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        try withContainedParent(of: writerLockFile, in: packageURL) { parentDescriptor, name in
            let descriptor = Darwin.openat(
                parentDescriptor,
                name,
                O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW,
                S_IRUSR | S_IWUSR
            )
            guard descriptor >= 0 else {
                if errno == EEXIST {
                    throw WorkbenchFailure(
                        name: "DocumentBusy",
                        message: "This Deck already has a writer lock. Close the other writer; a crash-stale lock requires explicit recovery."
                    )
                }
                throw posixError()
            }
            let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
            do {
                try handle.write(contentsOf: data)
                try handle.synchronize()
                guard Darwin.fsync(handle.fileDescriptor) == 0 else { throw posixError() }
                try handle.close()
                guard Darwin.fsync(parentDescriptor) == 0 else { throw posixError() }
            } catch {
                try? handle.close()
                _ = Darwin.unlinkat(parentDescriptor, name, 0)
                throw error
            }
        }
        return ownerToken
    }

    private static func requireWriterLock(in packageURL: URL, ownerToken: String) throws {
        try withContainedParent(of: writerLockFile, in: packageURL) { parentDescriptor, name in
            let storedToken = try writerLockOwnerToken(parentDescriptor: parentDescriptor, name: name)
            guard storedToken == ownerToken else {
                throw WorkbenchFailure(name: "DocumentBusy", message: "Another writer owns this Deck; refusing package mutation.")
            }
        }
    }

    private static func releaseWriterLock(in packageURL: URL, ownerToken: String) throws {
        try withContainedParent(of: writerLockFile, in: packageURL) { parentDescriptor, name in
            let storedToken = try writerLockOwnerToken(parentDescriptor: parentDescriptor, name: name)
            guard storedToken == ownerToken else {
                throw WorkbenchFailure(name: "DocumentBusy", message: "Writer lock ownership changed; refusing lock removal.")
            }
            guard Darwin.unlinkat(parentDescriptor, name, 0) == 0 else { throw posixError() }
            guard Darwin.fsync(parentDescriptor) == 0 else { throw posixError() }
        }
    }

    private static func writerLockOwnerToken(parentDescriptor: Int32, name: String) throws -> String {
        let descriptor = Darwin.openat(parentDescriptor, name, O_RDONLY | O_NOFOLLOW)
        guard descriptor >= 0 else {
            throw WorkbenchFailure(name: "DocumentBusy", message: "Writer lock is missing; refusing package mutation.")
        }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? handle.close() }
        try requireRegularFile(descriptor)
        let data = try handle.readToEnd() ?? Data()
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              payload["format"] as? String == writerLockFormat,
              payload["schemaVersion"] as? Int == 1,
              let token = payload["ownerToken"] as? String
        else {
            throw WorkbenchFailure(name: "DocumentBusy", message: "Writer lock is invalid; explicit recovery is required.")
        }
        return token
    }

    private static func readRequired(_ relativePath: String, in packageURL: URL) throws -> Data {
        do {
            return try withContainedParent(of: relativePath, in: packageURL) { parentDescriptor, name in
                let descriptor = Darwin.openat(parentDescriptor, name, O_RDONLY | O_NOFOLLOW)
                guard descriptor >= 0 else { throw posixError() }
                let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
                defer { try? handle.close() }
                try requireRegularFile(descriptor)
                return try handle.readToEnd() ?? Data()
            }
        } catch {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Required package entry is missing, linked, or not a regular file: \(relativePath)")
        }
    }

    private static func writeDurable(_ data: Data, relativePath: String, in packageURL: URL) throws {
        try withContainedParent(of: relativePath, in: packageURL) { parentDescriptor, name in
            try rejectNonRegularDestination(name, parentDescriptor: parentDescriptor)
            let temporary = ".\(name).tmp-\(UUID().uuidString)"
            let descriptor = Darwin.openat(
                parentDescriptor,
                temporary,
                O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW,
                S_IRUSR | S_IWUSR
            )
            guard descriptor >= 0 else { throw posixError() }
            let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
            do {
                try handle.write(contentsOf: data)
                try handle.synchronize()
                guard Darwin.fsync(handle.fileDescriptor) == 0 else { throw posixError() }
                try handle.close()
                guard Darwin.renameat(parentDescriptor, temporary, parentDescriptor, name) == 0 else {
                    throw posixError()
                }
                guard Darwin.fsync(parentDescriptor) == 0 else { throw posixError() }
            } catch {
                try? handle.close()
                _ = Darwin.unlinkat(parentDescriptor, temporary, 0)
                throw error
            }
        }
    }

    private static func withContainedParent<T>(
        of relativePath: String,
        in packageURL: URL,
        _ body: (Int32, String) throws -> T
    ) throws -> T {
        let components = relativePath.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard !components.isEmpty,
              components.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.contains("\0") })
        else {
            throw POSIXError(.EINVAL)
        }

        let rootDescriptor = Darwin.open(packageURL.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard rootDescriptor >= 0 else { throw posixError() }
        defer { Darwin.close(rootDescriptor) }

        var parentDescriptor = rootDescriptor
        for component in components.dropLast() {
            let nextDescriptor = Darwin.openat(parentDescriptor, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
            guard nextDescriptor >= 0 else {
                if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) }
                throw posixError()
            }
            if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) }
            parentDescriptor = nextDescriptor
        }
        defer {
            if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) }
        }
        return try body(parentDescriptor, components.last!)
    }

    private static func requireContainedDirectory(_ relativePath: String, in packageURL: URL) throws {
        try withContainedParent(of: "\(relativePath)/.containment-check", in: packageURL) { _, _ in }
    }

    private static func requireRegularFile(_ descriptor: Int32) throws {
        var metadata = stat()
        guard Darwin.fstat(descriptor, &metadata) == 0,
              (metadata.st_mode & S_IFMT) == S_IFREG
        else {
            throw POSIXError(.EINVAL)
        }
    }

    private static func rejectNonRegularDestination(_ name: String, parentDescriptor: Int32) throws {
        let existing = Darwin.openat(parentDescriptor, name, O_RDONLY | O_NOFOLLOW)
        if existing >= 0 {
            defer { Darwin.close(existing) }
            try requireRegularFile(existing)
            return
        }
        guard errno == ENOENT else { throw posixError() }
    }

    private static func posixError() -> POSIXError {
        POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
    }

    private static func syncDirectory(_ url: URL) throws {
        let descriptor = Darwin.open(url.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard descriptor >= 0 else { throw posixError() }
        defer { Darwin.close(descriptor) }
        guard Darwin.fsync(descriptor) == 0 else { throw posixError() }
    }

    private static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func iso8601(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}
