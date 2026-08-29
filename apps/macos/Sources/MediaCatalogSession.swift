import CryptoKit
import Darwin
import Foundation

private let mediaCatalogFormat = "pitchdog.media-catalog"
private let mediaCatalogVersion = 1
private let mediaGrantFormat = "pitchdog.workbench-media-grants"
private let mediaGrantVersion = 1
private let maximumCatalogBytes = 64 * 1024 * 1024
private let maximumControlFrameBytes = 1_048_576
private let maximumCatalogRevision = 9_007_199_254_740_991
private let maximumFingerprintBytes = 256 * 1024 * 1024
private let maximumReconnectFileBytes = 128 * 1024 * 1024
private let maximumResourceBytes = 32 * 1024 * 1024
private let maximumMetadataBytes = 4 * 1024 * 1024
private let maximumDecodedPixels = 64_000_000
private let maximumDimension = 32_768
private let maximumDiscoveredFiles = 12_000

private struct PortableMediaRoot: Codable, Sendable {
    let id: String
    let label: String
}

private struct PortableMediaAsset: Codable, Sendable {
    let id: String
    let sourceId: String
    var sourceRevisionId: String
    let locationId: String
    let rootId: String
    var relativePath: String
    var filename: String
    var folder: String
    var title: String
    var note: String
    var mediaKind: String
    var orientation: String?
    var availability: String
    var previewCapability: String
    var width: Int?
    var height: Int?
    var byteSize: Int
    var fingerprint: String
    var platformIdentity: String?
    var platformIdentityKind: String?
    var linkCount: Int
    var previewReason: String?
}

private struct PortableSourceRevision: Codable, Sendable {
    let id: String
    let sourceId: String
    let byteSize: Int
    let fingerprint: String
    let mediaKind: String
}

private struct PortableMediaCatalog: Codable, Sendable {
    let format: String
    let version: Int
    let catalogId: String
    let deckId: String
    var revision: Int
    var roots: [PortableMediaRoot]
    var sourceRevisions: [PortableSourceRevision]
    var assets: [PortableMediaAsset]
}

private struct MediaFileIdentity: Codable, Sendable {
    let device: String
    let inode: String
}

private struct MediaGrant: Codable, Sendable {
    let deckId: String
    let rootId: String
    let authorizedPath: String
    let rootDevice: String
    let rootInode: String
    var fileIdentities: [String: MediaFileIdentity]
}

private struct MediaGrantDocument: Codable {
    let format: String
    let schemaVersion: Int
    var records: [MediaGrant]
}

private struct MediaObservation: Sendable {
    let relativePath: String
    let filename: String
    let mediaKind: String
    let width: Int?
    let height: Int?
    let byteSize: Int
    let modifiedAt: Int64
    let availability: String
    let previewCapability: String
    let previewReason: String?
    let fingerprint: String?
    let identity: MediaFileIdentity
    let linkCount: Int

    var orientation: String? {
        guard let width, let height else { return nil }
        if width == height { return "square" }
        return width > height ? "landscape" : "portrait"
    }

    var platformIdentity: String? {
        guard fingerprint != nil, linkCount == 1 else { return nil }
        return "\(identity.device):\(identity.inode)"
    }
}

private struct AuthorizedMediaRoot: Sendable {
    let path: String
    let displayName: String
    let device: String
    let inode: String
}

private struct NativeScanResult: Sendable {
    let observations: [MediaObservation]
    let complete: Bool
    let warningCount: Int
}

private final class MediaSessionLease: @unchecked Sendable {
    private let lock = NSLock()
    private var nonce: String? = UUID().uuidString.lowercased()

    func current() -> String? {
        lock.lock()
        defer { lock.unlock() }
        return nonce
    }

    func matches(_ candidate: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return nonce == candidate
    }

    func revoke() {
        lock.lock()
        nonce = nil
        lock.unlock()
    }
}

private struct FileMetadata {
    let mode: mode_t
    let device: String
    let inode: String
    let linkCount: Int
    let byteSize: Int
    let modifiedAt: Int64

    var isDirectory: Bool { (mode & S_IFMT) == S_IFDIR }
    var isRegular: Bool { (mode & S_IFMT) == S_IFREG }
    var isSymbolicLink: Bool { (mode & S_IFMT) == S_IFLNK }
}

private enum MediaFilesystem {
    static func metadata(_ path: String, follow: Bool = false) throws -> FileMetadata {
        var value = stat()
        let result = path.withCString { pointer -> Int32 in
            if follow { return Darwin.stat(pointer, &value) }
            return Darwin.lstat(pointer, &value)
        }
        guard result == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        let milliseconds = Int64(value.st_mtimespec.tv_sec) * 1_000
            + Int64(value.st_mtimespec.tv_nsec) / 1_000_000
        return FileMetadata(
            mode: value.st_mode,
            device: String(value.st_dev),
            inode: String(value.st_ino),
            linkCount: Int(value.st_nlink),
            byteSize: max(0, Int(value.st_size)),
            modifiedAt: milliseconds
        )
    }

    static func authorizeDirectory(_ url: URL) throws -> AuthorizedMediaRoot {
        let requested = url.standardizedFileURL.path
        let requestedMetadata = try metadata(requested)
        guard requestedMetadata.isDirectory, !requestedMetadata.isSymbolicLink else {
            throw WorkbenchFailure(name: "MediaRootUnavailable", message: "The selected media Root is unavailable or unsafe")
        }
        guard let pointer = requested.withCString({ Darwin.realpath($0, nil) }) else {
            throw WorkbenchFailure(name: "MediaRootUnavailable", message: "The selected media Root is unavailable or unsafe")
        }
        defer { free(pointer) }
        let canonicalPath = String(cString: pointer)
        let canonicalMetadata = try metadata(canonicalPath, follow: true)
        guard canonicalMetadata.isDirectory else {
            throw WorkbenchFailure(name: "MediaRootUnavailable", message: "The selected media Root is unavailable or unsafe")
        }
        return AuthorizedMediaRoot(
            path: canonicalPath,
            displayName: URL(fileURLWithPath: canonicalPath).lastPathComponent.isEmpty
                ? "Media Root"
                : URL(fileURLWithPath: canonicalPath).lastPathComponent,
            device: canonicalMetadata.device,
            inode: canonicalMetadata.inode
        )
    }

    static func safeSegments(_ relativePath: String) throws -> [String] {
        guard !relativePath.isEmpty,
              relativePath.count <= 8_192,
              !relativePath.hasPrefix("/"),
              !relativePath.contains("\\"),
              !relativePath.contains("\0")
        else {
            throw WorkbenchFailure(name: "UnsafeMediaLocation", message: "Media location identity is invalid")
        }
        let segments = relativePath.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard segments.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
            throw WorkbenchFailure(name: "UnsafeMediaLocation", message: "Media location identity is invalid")
        }
        return segments
    }

    static func readContainedFile(rootPath: String, relativePath: String, maximumBytes: Int) throws -> Data {
        let segments = try safeSegments(relativePath)
        let rootDescriptor = Darwin.open(rootPath, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard rootDescriptor >= 0 else {
            throw WorkbenchFailure(name: "MediaRootUnavailable", message: "The media Root is unavailable")
        }
        defer { Darwin.close(rootDescriptor) }

        var parentDescriptor = rootDescriptor
        for segment in segments.dropLast() {
            let nextDescriptor = Darwin.openat(parentDescriptor, segment, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
            guard nextDescriptor >= 0 else {
                if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) }
                throw WorkbenchFailure(name: "MissingMedia", message: "Media resource is unavailable or unsafe")
            }
            if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) }
            parentDescriptor = nextDescriptor
        }
        defer {
            if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) }
        }

        let descriptor = Darwin.openat(parentDescriptor, segments.last!, O_RDONLY | O_NOFOLLOW)
        guard descriptor >= 0 else {
            throw WorkbenchFailure(name: "MissingMedia", message: "Media resource is unavailable or unsafe")
        }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? handle.close() }
        var value = stat()
        guard Darwin.fstat(descriptor, &value) == 0,
              (value.st_mode & S_IFMT) == S_IFREG,
              value.st_size > 0
        else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Media is outside bounded preview limits")
        }
        let openedByteSize = Int(value.st_size)
        guard openedByteSize <= maximumBytes else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Media is outside bounded preview limits")
        }
        let data = try handle.readToEnd() ?? Data()
        guard data.count == openedByteSize, data.count <= maximumBytes else {
            throw WorkbenchFailure(name: "MissingMedia", message: "Media resource changed while it was read")
        }
        return data
    }

    static func readPrefix(_ path: String, maximumBytes: Int = maximumMetadataBytes) throws -> Data {
        let descriptor = Darwin.open(path, O_RDONLY | O_NOFOLLOW)
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? handle.close() }
        return try handle.read(upToCount: maximumBytes) ?? Data()
    }

    static func fingerprint(_ path: String, byteSize: Int) throws -> String? {
        guard byteSize <= maximumFingerprintBytes else { return nil }
        let descriptor = Darwin.open(path, O_RDONLY | O_NOFOLLOW)
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? handle.close() }
        var hash = SHA256()
        while true {
            let chunk = try handle.read(upToCount: 1024 * 1024) ?? Data()
            if chunk.isEmpty { break }
            hash.update(data: chunk)
        }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }

    static func writeAtomically(_ data: Data, rootPath: String, relativePath: String) throws {
        let segments = try safeSegments(relativePath)
        let rootDescriptor = Darwin.open(rootPath, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard rootDescriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        defer { Darwin.close(rootDescriptor) }
        var parentDescriptor = rootDescriptor
        for segment in segments.dropLast() {
            let next = Darwin.openat(parentDescriptor, segment, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
            guard next >= 0 else {
                if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) }
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
            if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) }
            parentDescriptor = next
        }
        defer { if parentDescriptor != rootDescriptor { Darwin.close(parentDescriptor) } }
        let name = segments.last!
        let existing = Darwin.openat(parentDescriptor, name, O_RDONLY | O_NOFOLLOW)
        if existing >= 0 {
            defer { Darwin.close(existing) }
            var existingMetadata = stat()
            guard Darwin.fstat(existing, &existingMetadata) == 0,
                  (existingMetadata.st_mode & S_IFMT) == S_IFREG
            else { throw POSIXError(.EINVAL) }
        } else if errno != ENOENT {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        let temporary = ".\(name).tmp-\(UUID().uuidString.lowercased())"
        let descriptor = Darwin.openat(
            parentDescriptor,
            temporary,
            O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW,
            S_IRUSR | S_IWUSR
        )
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        do {
            try handle.write(contentsOf: data)
            try handle.synchronize()
            guard Darwin.fsync(descriptor) == 0 else { throw POSIXError(.EIO) }
            try handle.close()
            guard Darwin.renameat(parentDescriptor, temporary, parentDescriptor, name) == 0,
                  Darwin.fsync(parentDescriptor) == 0
            else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        } catch {
            try? handle.close()
            _ = Darwin.unlinkat(parentDescriptor, temporary, 0)
            throw error
        }
    }

    static func isContained(rootPath: String, candidatePath: String) -> Bool {
        candidatePath == rootPath || candidatePath.hasPrefix(rootPath + "/")
    }
}

private final class MacMediaGrantStore {
    private let rootURL: URL
    private let fileURL: URL
    private var records: [MediaGrant]

    init(fileURL injectedURL: URL? = nil) throws {
        if let injectedURL {
            fileURL = injectedURL
            rootURL = injectedURL.deletingLastPathComponent()
        } else {
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            rootURL = support.appendingPathComponent("Deck Workbench", isDirectory: true)
            fileURL = rootURL.appendingPathComponent("media-grants.json")
        }
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
        do {
            let data = try MediaFilesystem.readContainedFile(
                rootPath: rootURL.path,
                relativePath: fileURL.lastPathComponent,
                maximumBytes: 16 * 1024 * 1024
            )
            let document = try JSONDecoder().decode(MediaGrantDocument.self, from: data)
            guard document.format == mediaGrantFormat, document.schemaVersion == mediaGrantVersion else {
                throw WorkbenchFailure(name: "InvalidMediaGrantStore", message: "Stored media Root locators use an unsupported schema")
            }
            records = document.records.filter {
                !$0.deckId.isEmpty && !$0.rootId.isEmpty && ($0.authorizedPath as NSString).isAbsolutePath
            }
        } catch let error as WorkbenchFailure where error.name == "MissingMedia" {
            records = []
        } catch let error as POSIXError where error.code == .ENOENT {
            records = []
        } catch {
            let quarantine = rootURL.appendingPathComponent("media-grants.invalid-\(UUID().uuidString.lowercased()).json")
            try? FileManager.default.moveItem(at: fileURL, to: quarantine)
            records = []
        }
    }

    func get(deckId: String, rootId: String) -> MediaGrant? {
        records.first { $0.deckId == deckId && $0.rootId == rootId }
    }

    func list(deckId: String) -> [MediaGrant] {
        records.filter { $0.deckId == deckId }
    }

    func set(_ grant: MediaGrant) throws {
        let previous = records
        records.removeAll { $0.deckId == grant.deckId && $0.rootId == grant.rootId }
        records.append(grant)
        do {
            let document = MediaGrantDocument(
                format: mediaGrantFormat,
                schemaVersion: mediaGrantVersion,
                records: records.sorted { ($0.deckId, $0.rootId) < ($1.deckId, $1.rootId) }
            )
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            try MediaFilesystem.writeAtomically(
                try encoder.encode(document),
                rootPath: rootURL.path,
                relativePath: fileURL.lastPathComponent
            )
        } catch {
            records = previous
            throw WorkbenchFailure(name: "MediaGrantWriteFailure", message: "Media Root authorization could not be saved")
        }
    }
}

actor MediaCatalogSession {
    private let packageURL: URL
    private let deckId: String
    private let grants: MacMediaGrantStore
    private let lease = MediaSessionLease()
    private var catalog: PortableMediaCatalog

    init(packageURL: URL, deckId: String, grantStoreURL: URL? = nil) throws {
        let packageMetadata = try MediaFilesystem.metadata(packageURL.path)
        guard packageURL.pathExtension.lowercased() == "pitchdeck",
              packageMetadata.isDirectory,
              !packageMetadata.isSymbolicLink
        else {
            throw WorkbenchFailure(name: "UnsupportedSchema", message: "Media catalogues belong to an open .pitchdeck package")
        }
        let canonicalPackageURL = packageURL.resolvingSymlinksInPath().standardizedFileURL
        let mediaURL = canonicalPackageURL.appendingPathComponent("media", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: mediaURL, withIntermediateDirectories: false)
        } catch let error as CocoaError where error.code == .fileWriteFileExists {
            // Existing media directories are validated below.
        }
        let mediaMetadata = try MediaFilesystem.metadata(mediaURL.path)
        guard mediaMetadata.isDirectory, !mediaMetadata.isSymbolicLink,
              mediaURL.resolvingSymlinksInPath().standardizedFileURL == mediaURL
        else {
            throw WorkbenchFailure(name: "PermissionDenied", message: "The Deck media directory is not a contained real directory")
        }
        self.packageURL = canonicalPackageURL
        self.deckId = deckId
        grants = try MacMediaGrantStore(fileURL: grantStoreURL)

        do {
            let data = try MediaFilesystem.readContainedFile(
                rootPath: canonicalPackageURL.path,
                relativePath: "media/catalog.json",
                maximumBytes: maximumCatalogBytes
            )
            catalog = try JSONDecoder().decode(PortableMediaCatalog.self, from: data)
            guard catalog.deckId == deckId else {
                throw WorkbenchFailure(name: "CatalogDeckMismatch", message: "Media catalogue belongs to a different Deck")
            }
            try Self.validate(catalog, expectedDeckId: deckId)
        } catch let error as WorkbenchFailure where error.name == "MissingMedia" {
            catalog = Self.emptyCatalog(deckId: deckId)
            try Self.persist(catalog, packageURL: canonicalPackageURL)
        } catch let error as POSIXError where error.code == .ENOENT {
            catalog = Self.emptyCatalog(deckId: deckId)
            try Self.persist(catalog, packageURL: canonicalPackageURL)
        } catch let failure as WorkbenchFailure {
            throw failure
        } catch {
            throw WorkbenchFailure(name: "UnsupportedSchema", message: "The Deck media catalogue is invalid or unsupported")
        }
    }

    nonisolated func revoke() {
        lease.revoke()
    }

    func catalogRevisionValue() throws -> Int {
        try requireOpen()
        return catalog.revision
    }

    func queryJSON(name: String, paramsJSON: Data) throws -> Data {
        try requireOpen()
        let params = (try JSONSerialization.jsonObject(with: paramsJSON) as? [String: Any]) ?? [:]
        if name == "media.roots" { return try queryRoots(params) }
        if name == "media.assets" { return try queryAssets(params) }
        throw WorkbenchFailure(name: "InvalidCommand", message: "Unknown media query: \(name)")
    }

    func authorizeRootJSON(_ url: URL) throws -> Data {
        try requireOpen()
        let authorized = try MediaFilesystem.authorizeDirectory(url)
        guard !grants.list(deckId: deckId).contains(where: {
            $0.rootDevice == authorized.device && $0.rootInode == authorized.inode
        }) else {
            throw WorkbenchFailure(name: "RootAlreadyAuthorized", message: "That folder is already attached to this Deck")
        }
        let previousCatalog = catalog
        let rootId = Self.makeId("root")
        let revision = try Self.nextCatalogRevision(catalog.revision)
        catalog.roots.append(PortableMediaRoot(id: rootId, label: Self.safeDisplay(authorized.displayName)))
        catalog.revision = revision
        do {
            try persistCatalog()
        } catch {
            catalog = previousCatalog
            throw error
        }
        try grants.set(MediaGrant(
            deckId: deckId,
            rootId: rootId,
            authorizedPath: authorized.path,
            rootDevice: authorized.device,
            rootInode: authorized.inode,
            fileIdentities: [:]
        ))
        let scan = try scanAuthorized(rootId: rootId, root: authorized)
        return try encodeResult([
            "root": try publicRoot(rootId),
            "scan": scan,
        ])
    }

    func reconnectRootJSON(rootId: String, url: URL) throws -> Data {
        try requireOpen()
        _ = try requireRoot(rootId)
        let previous = grants.get(deckId: deckId, rootId: rootId)
        let authorized = try verifyReconnect(url: url, previous: previous, rootId: rootId)
        try grants.set(MediaGrant(
            deckId: deckId,
            rootId: rootId,
            authorizedPath: authorized.path,
            rootDevice: authorized.device,
            rootInode: authorized.inode,
            fileIdentities: previous?.fileIdentities ?? [:]
        ))
        let scan = try scanAuthorized(rootId: rootId, root: authorized)
        return try encodeResult([
            "root": try publicRoot(rootId),
            "scan": scan,
        ])
    }

    func scanRootJSON(rootId: String) throws -> Data {
        try requireOpen()
        _ = try requireRoot(rootId)
        guard let grant = grants.get(deckId: deckId, rootId: rootId) else {
            throw WorkbenchFailure(name: "MediaRootNeedsPermission", message: "This media Root needs permission")
        }
        let authorized = try MediaFilesystem.authorizeDirectory(URL(fileURLWithPath: grant.authorizedPath))
        guard authorized.device == grant.rootDevice, authorized.inode == grant.rootInode else {
            throw WorkbenchFailure(name: "MediaRootNeedsPermission", message: "The stored media Root no longer identifies the authorised folder")
        }
        return try encodeResult([
            "root": try publicRoot(rootId),
            "scan": try scanAuthorized(rootId: rootId, root: authorized),
        ])
    }

    func resourceData(nonce: String, assetId: String, profile: String) throws -> Data {
        try requireOpen()
        guard lease.matches(nonce) else {
            throw WorkbenchFailure(name: "StaleMediaSession", message: "This media resource session is no longer active")
        }
        guard profile == "grid_standard" else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Unknown media preview profile")
        }
        guard let asset = catalog.assets.first(where: { $0.id == assetId }) else {
            throw WorkbenchFailure(name: "MissingMedia", message: "Media Asset does not exist")
        }
        guard asset.availability == "available",
              ["still-image", "animated-image"].contains(asset.previewCapability)
        else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "This Media Asset has no safe grid preview")
        }
        guard let grant = grants.get(deckId: deckId, rootId: asset.rootId) else {
            throw WorkbenchFailure(name: "MediaRootNeedsPermission", message: "This media Root needs permission")
        }
        let authorized = try MediaFilesystem.authorizeDirectory(URL(fileURLWithPath: grant.authorizedPath))
        guard authorized.device == grant.rootDevice, authorized.inode == grant.rootInode else {
            throw WorkbenchFailure(name: "MediaRootNeedsPermission", message: "This media Root must be reconnected")
        }
        let ext = URL(fileURLWithPath: asset.relativePath).pathExtension.lowercased()
        guard ["jpg", "jpeg", "png", "webp", "gif"].contains(ext) else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "This media type is catalogue-only")
        }
        let data = try MediaFilesystem.readContainedFile(
            rootPath: authorized.path,
            relativePath: asset.relativePath,
            maximumBytes: maximumResourceBytes
        )
        guard let dimensions = Self.imageDimensions(data, extension: ext),
              Self.safeDimensions(dimensions)
        else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Image dimensions are invalid or outside preview limits")
        }
        try requireOpen()
        guard lease.matches(nonce) else {
            throw WorkbenchFailure(name: "StaleMediaSession", message: "This media resource session is no longer active")
        }
        return data
    }

    private func scanAuthorized(rootId: String, root: AuthorizedMediaRoot) throws -> [String: Any] {
        let discovery = try discover(root)
        let previousCatalog = catalog
        let summary = try reconcile(
            rootId: rootId,
            observations: discovery.observations,
            completed: discovery.complete
        )
        if summary.changed {
            do {
                try persistCatalog()
            } catch {
                catalog = previousCatalog
                throw error
            }
        }
        var grant = grants.get(deckId: deckId, rootId: rootId) ?? MediaGrant(
            deckId: deckId,
            rootId: rootId,
            authorizedPath: root.path,
            rootDevice: root.device,
            rootInode: root.inode,
            fileIdentities: [:]
        )
        let byPath = Dictionary(uniqueKeysWithValues: discovery.observations.map { ($0.relativePath, $0.identity) })
        for asset in catalog.assets where asset.rootId == rootId {
            if let identity = byPath[asset.relativePath] { grant.fileIdentities[asset.id] = identity }
        }
        try grants.set(grant)
        return [
            "status": discovery.complete ? "completed" : "incomplete",
            "changed": summary.changed,
            "created": summary.created,
            "refreshed": summary.refreshed,
            "moved": summary.moved,
            "missing": summary.missing,
            "deferred": summary.deferred,
            "discovered": discovery.observations.count,
            "warningCount": discovery.warningCount,
        ]
    }

    private func discover(_ root: AuthorizedMediaRoot) throws -> NativeScanResult {
        let manager = FileManager.default
        var complete = true
        var warningCount = 0
        var observations: [MediaObservation] = []
        let rootURL = URL(fileURLWithPath: root.path, isDirectory: true)
        guard let enumerator = manager.enumerator(
            at: rootURL,
            includingPropertiesForKeys: [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey],
            options: [],
            errorHandler: { _, _ in
                complete = false
                warningCount += 1
                return true
            }
        ) else {
            throw WorkbenchFailure(name: "MediaRootUnavailable", message: "The media Root could not be scanned")
        }
        let supported: [String: String] = [
            "jpg": "image", "jpeg": "image", "png": "image", "webp": "image", "gif": "gif",
            "mp4": "video", "mov": "video", "m4v": "video", "webm": "video",
        ]
        while let candidate = enumerator.nextObject() as? URL {
            if Task.isCancelled || lease.current() == nil {
                complete = false
                break
            }
            if observations.count >= maximumDiscoveredFiles {
                complete = false
                warningCount += 1
                break
            }
            do {
                let path = candidate.standardizedFileURL.path
                guard MediaFilesystem.isContained(rootPath: root.path, candidatePath: path) else {
                    complete = false
                    warningCount += 1
                    enumerator.skipDescendants()
                    continue
                }
                let relativePath = String(path.dropFirst(root.path.count + 1))
                let depth = relativePath.split(separator: "/").count
                let metadata = try MediaFilesystem.metadata(path)
                if metadata.isSymbolicLink {
                    enumerator.skipDescendants()
                    continue
                }
                if metadata.isDirectory {
                    if depth > 64 {
                        complete = false
                        warningCount += 1
                        enumerator.skipDescendants()
                    }
                    continue
                }
                guard metadata.isRegular,
                      let kind = supported[candidate.pathExtension.lowercased()]
                else { continue }
                let canonical = candidate.resolvingSymlinksInPath().standardizedFileURL.path
                guard MediaFilesystem.isContained(rootPath: root.path, candidatePath: canonical) else {
                    complete = false
                    warningCount += 1
                    continue
                }
                let ext = candidate.pathExtension.lowercased()
                let dimensions = ["jpg", "jpeg", "png", "webp", "gif"].contains(ext)
                    ? Self.imageDimensions(try MediaFilesystem.readPrefix(canonical), extension: ext)
                    : nil
                let validImage = dimensions.map(Self.safeDimensions) == true
                let safePreview = validImage
                    && metadata.byteSize > 0
                    && metadata.byteSize <= maximumResourceBytes
                let previewReason: String?
                if safePreview { previewReason = nil }
                else if kind == "video" { previewReason = "video_catalogue_only" }
                else if validImage { previewReason = "source_outside_preview_bounds" }
                else { previewReason = "unreadable_image" }
                observations.append(MediaObservation(
                    relativePath: relativePath,
                    filename: candidate.lastPathComponent,
                    mediaKind: kind,
                    width: validImage ? dimensions?.width : nil,
                    height: validImage ? dimensions?.height : nil,
                    byteSize: metadata.byteSize,
                    modifiedAt: metadata.modifiedAt,
                    availability: ["jpg", "jpeg", "png", "webp", "gif"].contains(ext) && !validImage
                        ? "unreadable" : "available",
                    previewCapability: safePreview ? (kind == "gif" ? "animated-image" : "still-image") : "unsupported",
                    previewReason: previewReason,
                    fingerprint: try MediaFilesystem.fingerprint(canonical, byteSize: metadata.byteSize),
                    identity: MediaFileIdentity(device: metadata.device, inode: metadata.inode),
                    linkCount: max(1, metadata.linkCount)
                ))
            } catch {
                complete = false
                warningCount += 1
            }
        }
        return NativeScanResult(observations: observations, complete: complete, warningCount: warningCount)
    }

    private struct ReconcileSummary {
        var changed = false
        var created = 0
        var refreshed = 0
        var moved = 0
        var missing = 0
        var deferred = 0
    }

    private func reconcile(rootId: String, observations: [MediaObservation], completed: Bool) throws -> ReconcileSummary {
        var summary = ReconcileSummary()
        let existingRootAssets = catalog.assets.filter { $0.rootId == rootId }
        let existingByPath = Dictionary(uniqueKeysWithValues: existingRootAssets.map { ($0.relativePath, $0) })
        var existingByIdentity: [String: [PortableMediaAsset]] = [:]
        for asset in existingRootAssets {
            if let key = Self.identityKey(asset) { existingByIdentity[key, default: []].append(asset) }
        }
        let incomingPaths = Set(observations.map(\.relativePath))
        var incomingIdentityCounts: [String: Int] = [:]
        for observation in observations {
            if let key = Self.identityKey(observation) { incomingIdentityCounts[key, default: 0] += 1 }
        }
        var seen = Set<String>()
        var nextCatalog = catalog

        for observation in observations {
            if let existing = existingByPath[observation.relativePath],
               let index = nextCatalog.assets.firstIndex(where: { $0.id == existing.id }) {
                let refreshed = Self.refreshed(existing, with: observation)
                seen.insert(existing.id)
                summary.refreshed += 1
                if refreshed != nextCatalog.assets[index] {
                    nextCatalog.assets[index] = refreshed
                    if refreshed.sourceRevisionId != existing.sourceRevisionId {
                        nextCatalog.sourceRevisions.append(Self.sourceRevision(for: refreshed))
                    }
                    summary.changed = true
                }
                continue
            }
            let key = Self.identityKey(observation)
            let matches = key.flatMap { existingByIdentity[$0] } ?? []
            let candidate = matches.count == 1
                && incomingIdentityCounts[key ?? ""] == 1
                && !incomingPaths.contains(matches[0].relativePath)
                && !seen.contains(matches[0].id)
                && matches[0].linkCount == 1
                && observation.linkCount == 1
                && matches[0].mediaKind == observation.mediaKind
                && matches[0].byteSize == observation.byteSize
                && matches[0].fingerprint == Self.fingerprint(observation)
                ? matches[0]
                : nil
            if let candidate, completed,
               let index = nextCatalog.assets.firstIndex(where: { $0.id == candidate.id }) {
                nextCatalog.assets[index] = Self.refreshed(candidate, with: observation)
                seen.insert(candidate.id)
                summary.changed = true
                summary.moved += 1
            } else if candidate != nil, !completed {
                summary.deferred += 1
            } else {
                let asset = Self.newAsset(rootId: rootId, observation: observation)
                nextCatalog.assets.append(asset)
                nextCatalog.sourceRevisions.append(Self.sourceRevision(for: asset))
                summary.changed = true
                summary.created += 1
            }
        }
        if completed {
            for existing in existingRootAssets where !seen.contains(existing.id) {
                guard let index = nextCatalog.assets.firstIndex(where: { $0.id == existing.id }) else { continue }
                if nextCatalog.assets[index].availability != "missing" {
                    nextCatalog.assets[index].availability = "missing"
                    summary.changed = true
                    summary.missing += 1
                }
            }
        }
        if summary.changed {
            nextCatalog.revision = try Self.nextCatalogRevision(catalog.revision)
            catalog = nextCatalog
        }
        return summary
    }

    private func verifyReconnect(url: URL, previous: MediaGrant?, rootId: String) throws -> AuthorizedMediaRoot {
        let candidate = try MediaFilesystem.authorizeDirectory(url)
        if let previous,
           previous.rootDevice == candidate.device,
           previous.rootInode == candidate.inode { return candidate }
        let evidence = catalog.assets
            .filter {
                $0.rootId == rootId
                    && $0.availability != "missing"
                    && $0.byteSize <= maximumReconnectFileBytes
                    && !$0.fingerprint.hasPrefix("unavailable:")
            }
            .sorted { $0.relativePath < $1.relativePath }
            .prefix(8)
        let required = min(2, evidence.count)
        if required == 0 { return candidate }
        let started = Date()
        var inspectedBytes = 0
        var matched = 0
        for asset in evidence {
            if Date().timeIntervalSince(started) > 10 || inspectedBytes >= maximumFingerprintBytes { break }
            guard asset.byteSize <= maximumReconnectFileBytes,
                  inspectedBytes + asset.byteSize <= maximumFingerprintBytes
            else { continue }
            do {
                let data = try MediaFilesystem.readContainedFile(
                    rootPath: candidate.path,
                    relativePath: asset.relativePath,
                    maximumBytes: maximumReconnectFileBytes
                )
                guard data.count == asset.byteSize else { continue }
                inspectedBytes += data.count
                let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
                if digest == asset.fingerprint { matched += 1 }
                if matched >= required { return candidate }
            } catch {
                continue
            }
        }
        throw WorkbenchFailure(name: "MediaRootMismatch", message: "The selected folder does not match this media Root")
    }

    private func queryRoots(_ params: [String: Any]) throws -> Data {
        let allowed = Set([
            "offset",
            "limit",
            "expectedCatalogRevision",
            "expectedAvailabilityRevision",
        ])
        guard params.keys.allSatisfy({ allowed.contains($0) }) else {
            throw WorkbenchFailure(
                name: "InvalidCommand",
                message: "media.roots accepts only bounded pagination and generation parameters"
            )
        }
        try requireExpectedRevision(params)
        let (offset, limit) = try pageRequest(params)
        if offset > 0 && params["expectedCatalogRevision"] as? Int == nil {
            throw WorkbenchFailure(name: "InvalidCommand", message: "expectedCatalogRevision is required after the first media page")
        }
        let availability = try rootAvailabilitySnapshot()
        let availabilityRevision = Self.rootAvailabilityRevision(availability)
        try requireAvailabilityRevision(params, offset: offset, current: availabilityRevision)
        let end = min(catalog.roots.count, offset + limit)
        let page = offset < catalog.roots.count ? Array(catalog.roots[offset..<end]) : []
        var items = try page.map { try publicRoot($0.id, availability: availability[$0.id]) }
        while true {
            let deliveredEnd = offset + items.count
            let nextOffset: Any
            if deliveredEnd < catalog.roots.count { nextOffset = deliveredEnd }
            else { nextOffset = NSNull() }
            let result: [String: Any] = [
                "catalogRevision": catalog.revision,
                "availabilityRevision": availabilityRevision,
                "offset": offset,
                "limit": limit,
                "total": catalog.roots.count,
                "nextOffset": nextOffset,
                "items": items,
            ]
            let encoded = try encodeResult(result)
            if encoded.count <= maximumControlFrameBytes { return encoded }
            guard items.count > 1 else {
                throw WorkbenchFailure(name: "ResultTooLarge", message: "One media Root summary exceeds the 1 MiB control-frame limit")
            }
            items.removeLast()
        }
    }

    private func queryAssets(_ params: [String: Any]) throws -> Data {
        try requireExpectedRevision(params)
        let (offset, limit) = try pageRequest(params)
        if offset > 0 && params["expectedCatalogRevision"] as? Int == nil {
            throw WorkbenchFailure(name: "InvalidCommand", message: "expectedCatalogRevision is required after the first media page")
        }
        let rootAvailability = try rootAvailabilitySnapshot()
        let availabilityRevision = Self.rootAvailabilityRevision(rootAvailability)
        try requireAvailabilityRevision(params, offset: offset, current: availabilityRevision)
        let search = (params["search"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let oneRoot = params["rootId"] as? String
        let rootIds = Set((params["rootIds"] as? [String]) ?? (oneRoot.map { [$0] } ?? []))
        var matched = catalog.assets.filter { asset in
            if !rootIds.isEmpty && !rootIds.contains(asset.rootId) { return false }
            if search.isEmpty { return true }
            return "\(asset.filename)\n\(asset.folder)\n\(asset.relativePath)\n\(asset.title)\n\(asset.note)"
                .lowercased().contains(search)
        }
        matched.sort {
            let filenameOrder = Self.compareUTF16($0.filename, $1.filename)
            return filenameOrder == 0
                ? Self.compareUTF16($0.id, $1.id) < 0
                : filenameOrder < 0
        }
        let end = min(matched.count, offset + limit)
        let page = offset < matched.count ? Array(matched[offset..<end]) : []
        let nonce = lease.current()
        var items = try page.map { asset -> [String: Any] in
            let availability = effectiveAvailability(asset, rootAvailability: rootAvailability)
            let grid = ["still-image", "animated-image"].contains(asset.previewCapability)
            let rendition: Any
            if grid && availability == "available", let nonce {
                rendition = "pitchdog-asset://\(nonce)/\(asset.id)/grid_standard"
            } else {
                rendition = NSNull()
            }
            return [
                "id": asset.id,
                "locationId": asset.locationId,
                "rootId": asset.rootId,
                "filename": Self.safeDisplay(asset.filename),
                "label": Self.safeDisplay(asset.filename),
                "folder": Self.safeDisplay(asset.folder),
                "displayPath": Self.safeDisplay(asset.relativePath),
                "relativeDisplayPath": Self.safeDisplay(asset.relativePath),
                "title": Self.safeDisplay(asset.title),
                "note": Self.safeDisplay(asset.note),
                "mediaKind": asset.mediaKind,
                "orientation": Self.jsonValue(asset.orientation),
                "width": Self.jsonValue(asset.width),
                "height": Self.jsonValue(asset.height),
                "byteSize": asset.byteSize,
                "availability": availability,
                "previewCapability": grid ? "grid" : "catalog_only",
                "previewReason": Self.jsonValue(asset.previewReason),
                "renditions": ["gridStandard": rendition],
            ]
        }
        while true {
            let deliveredEnd = offset + items.count
            let nextOffset: Any
            if deliveredEnd < matched.count { nextOffset = deliveredEnd }
            else { nextOffset = NSNull() }
            let result: [String: Any] = [
                "catalogRevision": catalog.revision,
                "availabilityRevision": availabilityRevision,
                "offset": offset,
                "limit": limit,
                "total": matched.count,
                "nextOffset": nextOffset,
                "items": items,
            ]
            let encoded = try encodeResult(result)
            if encoded.count <= maximumControlFrameBytes { return encoded }
            guard items.count > 1 else {
                throw WorkbenchFailure(name: "ResultTooLarge", message: "One media Asset summary exceeds the 1 MiB control-frame limit")
            }
            items.removeLast()
        }
    }

    private func publicRoot(_ rootId: String, availability: String? = nil) throws -> [String: Any] {
        let root = try requireRoot(rootId)
        let assets = catalog.assets.filter { $0.rootId == rootId }
        let rootState: String
        if let availability { rootState = availability }
        else { rootState = try rootAvailability(rootId) }
        return [
            "id": root.id,
            "label": Self.safeDisplay(root.label),
            "availability": rootState,
            "assetCount": assets.count,
            "missingCount": assets.filter { $0.availability == "missing" }.count,
        ]
    }

    private func rootAvailability(_ rootId: String) throws -> String {
        guard let grant = grants.get(deckId: deckId, rootId: rootId) else { return "needs_permission" }
        do {
            let authorized = try MediaFilesystem.authorizeDirectory(URL(fileURLWithPath: grant.authorizedPath))
            return authorized.device == grant.rootDevice && authorized.inode == grant.rootInode
                ? "available" : "needs_permission"
        } catch let error as POSIXError where error.code == .ENOENT || error.code == .ENOTDIR {
            return "offline_volume"
        } catch {
            return "needs_permission"
        }
    }

    private func effectiveAvailability(
        _ asset: PortableMediaAsset,
        rootAvailability: [String: String]
    ) -> String {
        let rootState = rootAvailability[asset.rootId] ?? "available"
        return rootState == "available" ? asset.availability : rootState
    }

    private func rootAvailabilitySnapshot() throws -> [String: String] {
        Dictionary(uniqueKeysWithValues: try catalog.roots.map { root in
            (root.id, try rootAvailability(root.id))
        })
    }

    private static func rootAvailabilityRevision(_ availability: [String: String]) -> String {
        let snapshot = availability.map { rootId, state in
            "\(rootId)\0\(state)"
        }.sorted().joined(separator: "\u{1}")
        var hash: UInt32 = 0x811c9dc5
        for codeUnit in snapshot.utf16 {
            hash ^= UInt32(codeUnit)
            hash = hash &* 0x01000193
        }
        return String(format: "root-availability-%08x", hash)
    }

    private func requireExpectedRevision(_ params: [String: Any]) throws {
        guard let raw = params["expectedCatalogRevision"] else { return }
        guard let expected = raw as? Int, expected >= 0, expected <= maximumCatalogRevision else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "expectedCatalogRevision must be a non-negative integer")
        }
        if expected != catalog.revision {
            throw WorkbenchFailure(
                name: "QuerySnapshotChanged",
                message: "Expected media catalogue revision \(expected); current revision is \(catalog.revision)"
            )
        }
    }

    private func pageRequest(_ params: [String: Any]) throws -> (offset: Int, limit: Int) {
        let offset: Int
        if let raw = params["offset"] {
            guard let value = raw as? Int else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Media query offset must be an integer")
            }
            offset = value
        } else { offset = 0 }
        let limit: Int
        if let raw = params["limit"] {
            guard let value = raw as? Int else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Media query limit must be an integer")
            }
            limit = value
        } else { limit = 100 }
        guard offset >= 0,
              offset <= maximumCatalogRevision,
              limit > 0,
              limit <= 250 else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Media query pagination is invalid or exceeds 250")
        }
        return (offset, limit)
    }

    private func requireAvailabilityRevision(
        _ params: [String: Any],
        offset: Int,
        current: String
    ) throws {
        guard let raw = params["expectedAvailabilityRevision"] else {
            if offset > 0 {
                throw WorkbenchFailure(
                    name: "InvalidCommand",
                    message: "expectedAvailabilityRevision is required after the first media page"
                )
            }
            return
        }
        guard let expected = raw as? String, !expected.isEmpty, expected.count <= 100 else {
            throw WorkbenchFailure(
                name: "InvalidCommand",
                message: "expectedAvailabilityRevision must be a bounded generation identity"
            )
        }
        if expected != current {
            throw WorkbenchFailure(
                name: "QuerySnapshotChanged",
                message: "Live media Root availability changed during the paged query"
            )
        }
    }

    private func requireRoot(_ rootId: String) throws -> PortableMediaRoot {
        guard !rootId.isEmpty, let root = catalog.roots.first(where: { $0.id == rootId }) else {
            throw WorkbenchFailure(name: "UnknownRoot", message: "Root does not exist: \(rootId)")
        }
        return root
    }

    private func requireOpen() throws {
        guard lease.current() != nil else {
            throw WorkbenchFailure(name: "DocumentUnavailable", message: "The Deck media session is closed")
        }
    }

    private func persistCatalog() throws {
        try Self.validate(catalog, expectedDeckId: deckId)
        try Self.persist(catalog, packageURL: packageURL)
    }

    private func encodeResult(_ value: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
    }

    private static func persist(_ catalog: PortableMediaCatalog, packageURL: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        do {
            var data = try encoder.encode(catalog)
            if data.count > maximumCatalogBytes {
                encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
                data = try encoder.encode(catalog)
            }
            guard data.count <= maximumCatalogBytes else {
                throw WorkbenchFailure(
                    name: "MediaCatalogWriteFailure",
                    message: "The portable media catalogue exceeds its 64 MiB persistence bound"
                )
            }
            try MediaFilesystem.writeAtomically(
                data,
                rootPath: packageURL.path,
                relativePath: "media/catalog.json"
            )
        } catch {
            throw WorkbenchFailure(name: "MediaCatalogWriteFailure", message: "The portable media catalogue could not be saved")
        }
    }

    private static func emptyCatalog(deckId: String) -> PortableMediaCatalog {
        PortableMediaCatalog(
            format: mediaCatalogFormat,
            version: mediaCatalogVersion,
            catalogId: makeId("catalog"),
            deckId: deckId,
            revision: 0,
            roots: [],
            sourceRevisions: [],
            assets: []
        )
    }

    private static func validate(_ catalog: PortableMediaCatalog, expectedDeckId: String) throws {
        guard catalog.format == mediaCatalogFormat,
              catalog.version == mediaCatalogVersion,
              catalog.deckId == expectedDeckId,
              catalog.revision >= 0,
              catalog.revision <= maximumCatalogRevision
        else {
            throw WorkbenchFailure(name: "UnsupportedSchema", message: "Only pitchdog.media-catalog version 1 is supported")
        }
        try validateOpaqueId(catalog.deckId)
        try validateOpaqueId(catalog.catalogId)
        var rootIds = Set<String>()
        for root in catalog.roots {
            try validateOpaqueId(root.id)
            guard !root.label.isEmpty,
                  root.label.count <= 160,
                  !root.label.contains("\0"),
                  !root.label.contains("/"),
                  !root.label.contains("\\"),
                  root.label.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value != 0x7f }),
                  rootIds.insert(root.id).inserted else {
                throw WorkbenchFailure(name: "InvalidMediaCatalog", message: "Media Root identity or label is invalid")
            }
        }
        var assetIds = Set<String>()
        var locationIds = Set<String>()
        var sourceIds = Set<String>()
        var sourceRevisionIds = Set<String>()
        var sourceRevisionById: [String: PortableSourceRevision] = [:]
        for revision in catalog.sourceRevisions {
            try validateOpaqueId(revision.id)
            try validateOpaqueId(revision.sourceId)
            guard sourceRevisionIds.insert(revision.id).inserted,
                  revision.byteSize >= 0,
                  !revision.fingerprint.isEmpty,
                  revision.fingerprint.count <= 500,
                  ["image", "gif", "video"].contains(revision.mediaKind)
            else {
                throw WorkbenchFailure(name: "InvalidMediaCatalog", message: "A Source Revision is invalid")
            }
            sourceRevisionById[revision.id] = revision
        }
        var paths = Set<String>()
        for asset in catalog.assets {
            let parts = asset.relativePath.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
            let derivedFilename = parts.last ?? ""
            let derivedFolder = parts.dropLast().joined(separator: "/")
            try validateOpaqueId(asset.id)
            try validateOpaqueId(asset.sourceId)
            try validateOpaqueId(asset.sourceRevisionId)
            try validateOpaqueId(asset.locationId)
            guard rootIds.contains(asset.rootId),
                  assetIds.insert(asset.id).inserted,
                  locationIds.insert(asset.locationId).inserted,
                  sourceIds.insert(asset.sourceId).inserted,
                  paths.insert("\(asset.rootId)\0\(asset.relativePath)").inserted,
                  (try? MediaFilesystem.safeSegments(asset.relativePath)) != nil,
                  asset.filename == derivedFilename,
                  asset.folder == derivedFolder,
                  asset.relativePath.count <= 4_000,
                  asset.filename.count <= 500,
                  asset.folder.count <= 2_000,
                  asset.title.count <= 1_000,
                  asset.note.count <= 4_000,
                  ["image", "gif", "video"].contains(asset.mediaKind),
                  ["available", "missing", "unreadable"].contains(asset.availability),
                  ["still-image", "animated-image", "video-poster", "unsupported"].contains(asset.previewCapability),
                  asset.byteSize >= 0,
                  !asset.fingerprint.isEmpty,
                  asset.fingerprint.count <= 500,
                  asset.linkCount > 0,
                  (asset.platformIdentity == nil) == (asset.platformIdentityKind == nil),
                  (asset.width == nil) == (asset.height == nil),
                  asset.previewCapability != "unsupported" || asset.previewReason != nil
            else {
                throw WorkbenchFailure(name: "InvalidMediaCatalog", message: "A portable Media Asset is invalid")
            }
            if let width = asset.width, let height = asset.height {
                guard width > 0,
                      height > 0,
                      ["landscape", "portrait", "square"].contains(asset.orientation ?? "")
                else {
                    throw WorkbenchFailure(name: "InvalidMediaCatalog", message: "Media Asset dimensions are invalid")
                }
            } else if asset.orientation != nil || asset.previewCapability != "unsupported" {
                throw WorkbenchFailure(name: "InvalidMediaCatalog", message: "Unknown dimensions require catalogue-only preview")
            }
            guard let current = sourceRevisionById[asset.sourceRevisionId],
                  current.sourceId == asset.sourceId,
                  current.byteSize == asset.byteSize,
                  current.fingerprint == asset.fingerprint,
                  current.mediaKind == asset.mediaKind
            else {
                throw WorkbenchFailure(name: "InvalidMediaCatalog", message: "Asset Source Revision metadata is inconsistent")
            }
        }
        guard catalog.sourceRevisions.allSatisfy({ sourceIds.contains($0.sourceId) }) else {
            throw WorkbenchFailure(name: "InvalidMediaCatalog", message: "A Source Revision references an unknown Source")
        }
    }

    private static func validateOpaqueId(_ value: String) throws {
        guard !value.isEmpty, value.count <= 200,
              !value.contains("/"), !value.contains("\\"), !value.contains("\0")
        else { throw WorkbenchFailure(name: "InvalidMediaCatalog", message: "Media identity is invalid") }
    }

    private static func makeId(_ kind: String) -> String {
        "\(kind)-\(UUID().uuidString.lowercased())"
    }

    private static func nextCatalogRevision(_ revision: Int) throws -> Int {
        guard revision >= 0, revision < maximumCatalogRevision else {
            throw WorkbenchFailure(
                name: "RevisionExhausted",
                message: "Media catalogue revision space is exhausted; no changes were committed"
            )
        }
        return revision + 1
    }

    private static func safeDisplay(_ value: String) -> String {
        value.unicodeScalars.map { scalar in
            (scalar.value < 0x20 || scalar.value == 0x7f) ? "�" : String(scalar)
        }.joined()
    }

    private static func compareUTF16(_ left: String, _ right: String) -> Int {
        let leftUnits = Array(left.utf16)
        let rightUnits = Array(right.utf16)
        let shared = min(leftUnits.count, rightUnits.count)
        for index in 0..<shared {
            if leftUnits[index] != rightUnits[index] {
                return leftUnits[index] < rightUnits[index] ? -1 : 1
            }
        }
        if leftUnits.count == rightUnits.count { return 0 }
        return leftUnits.count < rightUnits.count ? -1 : 1
    }

    private static func jsonValue<T>(_ value: T?) -> Any {
        if let value { return value }
        return NSNull()
    }

    private static func fingerprint(_ observation: MediaObservation) -> String {
        observation.fingerprint ?? "unavailable:\(observation.byteSize):\(observation.modifiedAt)"
    }

    private static func identityKey(_ asset: PortableMediaAsset) -> String? {
        guard let kind = asset.platformIdentityKind, let identity = asset.platformIdentity else { return nil }
        return "\(kind)\0\(identity)"
    }

    private static func identityKey(_ observation: MediaObservation) -> String? {
        guard let identity = observation.platformIdentity else { return nil }
        return "macos-dev-inode\0\(identity)"
    }

    private static func newAsset(rootId: String, observation: MediaObservation) -> PortableMediaAsset {
        PortableMediaAsset(
            id: makeId("asset"),
            sourceId: makeId("source"),
            sourceRevisionId: makeId("source-revision"),
            locationId: makeId("location"),
            rootId: rootId,
            relativePath: observation.relativePath,
            filename: observation.filename,
            folder: observation.relativePath.split(separator: "/").dropLast().joined(separator: "/"),
            title: "",
            note: "",
            mediaKind: observation.mediaKind,
            orientation: observation.orientation,
            availability: observation.availability,
            previewCapability: observation.previewCapability,
            width: observation.width,
            height: observation.height,
            byteSize: observation.byteSize,
            fingerprint: fingerprint(observation),
            platformIdentity: observation.platformIdentity,
            platformIdentityKind: observation.platformIdentity == nil ? nil : "macos-dev-inode",
            linkCount: observation.linkCount,
            previewReason: observation.previewReason
        )
    }

    private static func refreshed(_ asset: PortableMediaAsset, with observation: MediaObservation) -> PortableMediaAsset {
        var result = asset
        let nextFingerprint = fingerprint(observation)
        if asset.byteSize != observation.byteSize
            || asset.fingerprint != nextFingerprint
            || asset.mediaKind != observation.mediaKind {
            result.sourceRevisionId = makeId("source-revision")
        }
        result.relativePath = observation.relativePath
        result.filename = observation.filename
        result.folder = observation.relativePath.split(separator: "/").dropLast().joined(separator: "/")
        result.mediaKind = observation.mediaKind
        result.orientation = observation.orientation
        result.availability = observation.availability
        result.previewCapability = observation.previewCapability
        result.width = observation.width
        result.height = observation.height
        result.byteSize = observation.byteSize
        result.fingerprint = nextFingerprint
        result.platformIdentity = observation.platformIdentity
        result.platformIdentityKind = observation.platformIdentity == nil ? nil : "macos-dev-inode"
        result.linkCount = observation.linkCount
        result.previewReason = observation.previewReason
        return result
    }

    private static func sourceRevision(for asset: PortableMediaAsset) -> PortableSourceRevision {
        PortableSourceRevision(
            id: asset.sourceRevisionId,
            sourceId: asset.sourceId,
            byteSize: asset.byteSize,
            fingerprint: asset.fingerprint,
            mediaKind: asset.mediaKind
        )
    }

    private static func safeDimensions(_ dimensions: (width: Int, height: Int)) -> Bool {
        dimensions.width > 0 && dimensions.height > 0
            && dimensions.width <= maximumDimension && dimensions.height <= maximumDimension
            && dimensions.width * dimensions.height <= maximumDecodedPixels
    }

    private static func imageDimensions(_ data: Data, extension ext: String) -> (width: Int, height: Int)? {
        let bytes = [UInt8](data)
        func u16BE(_ offset: Int) -> Int { Int(bytes[offset]) << 8 | Int(bytes[offset + 1]) }
        func u16LE(_ offset: Int) -> Int { Int(bytes[offset]) | Int(bytes[offset + 1]) << 8 }
        func u24LE(_ offset: Int) -> Int {
            Int(bytes[offset]) | Int(bytes[offset + 1]) << 8 | Int(bytes[offset + 2]) << 16
        }
        func ascii(_ range: Range<Int>) -> String { String(bytes: bytes[range], encoding: .ascii) ?? "" }
        if ext == "png", bytes.count >= 24, ascii(1..<4) == "PNG" {
            let width = bytes[16..<20].reduce(0) { ($0 << 8) | Int($1) }
            let height = bytes[20..<24].reduce(0) { ($0 << 8) | Int($1) }
            return (width, height)
        }
        if ext == "gif", bytes.count >= 10, ascii(0..<3) == "GIF" {
            return (u16LE(6), u16LE(8))
        }
        if ["jpg", "jpeg"].contains(ext), bytes.count >= 4, bytes[0] == 0xff, bytes[1] == 0xd8 {
            var offset = 2
            let startsOfFrame: Set<UInt8> = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
            while offset + 9 < bytes.count {
                if bytes[offset] != 0xff { offset += 1; continue }
                let marker = bytes[offset + 1]
                if startsOfFrame.contains(marker) { return (u16BE(offset + 7), u16BE(offset + 5)) }
                if marker == 0xd8 || marker == 0xd9 { offset += 2; continue }
                guard offset + 3 < bytes.count else { return nil }
                let length = u16BE(offset + 2)
                if length < 2 { return nil }
                offset += 2 + length
            }
        }
        if ext == "webp", bytes.count >= 30, ascii(0..<4) == "RIFF", ascii(8..<12) == "WEBP" {
            let kind = ascii(12..<16)
            if kind == "VP8X" { return (1 + u24LE(24), 1 + u24LE(27)) }
            if kind == "VP8L", bytes[20] == 0x2f {
                let packed = Int(bytes[21]) | Int(bytes[22]) << 8 | Int(bytes[23]) << 16 | Int(bytes[24]) << 24
                return (1 + (packed & 0x3fff), 1 + ((packed >> 14) & 0x3fff))
            }
            if kind == "VP8 ", bytes[23] == 0x9d, bytes[24] == 0x01, bytes[25] == 0x2a {
                return (u16LE(26) & 0x3fff, u16LE(28) & 0x3fff)
            }
        }
        return nil
    }
}

extension PortableMediaAsset: Equatable {}
