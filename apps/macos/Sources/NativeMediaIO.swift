import AVFoundation
import AppKit
import CryptoKit
import Darwin
import Foundation
import ImageIO

/// Immutable native services receive a granted source, never a user-controlled
/// arbitrary path from a renderer. Source pixels are never modified in place.
enum NativeMediaIO {
  /// Previews pass `mounting: false`: an unmounted network volume reads as
  /// unavailable instead of being mounted (or prompting) for a thumbnail.
  static func withSource<T>(
    _ source: NativeMediaSource, mounting: Bool = true, operation: (String, URL) throws -> T
  ) throws -> T {
    let cached = source.bookmark.flatMap(NativeBookmarkCache.shared.url)
    var root = cached ?? resolvedRoot(source, mounting: mounting)
    var access = root.startAccessingSecurityScopedResource()
    defer { if access { root.stopAccessingSecurityScopedResource() } }
    var authorized: AuthorizedMediaRoot
    do { authorized = try authorize(source, root: root) } catch {
      guard cached != nil, let bookmark = source.bookmark else { throw error }
      // The folder moved or was renamed since it was resolved; resolve again.
      if access { root.stopAccessingSecurityScopedResource() }
      NativeBookmarkCache.shared.store(nil, for: bookmark)
      root = resolvedRoot(source, mounting: mounting)
      access = root.startAccessingSecurityScopedResource()
      authorized = try authorize(source, root: root)
    }
    let segments = try MediaFilesystem.safeSegments(source.relativePath)
    // Compare canonical paths, not Foundation's display-standardized aliases
    // (for example /private/var versus /var). Each child must remain no-follow.
    let expectedPath = (authorized.path == "/" ? "" : authorized.path) + "/" + segments.joined(separator: "/")
    let url = URL(fileURLWithPath: expectedPath)
    let canonical = try MediaFilesystem.canonicalPath(expectedPath)
    guard MediaFilesystem.isContained(rootPath: authorized.path, candidatePath: canonical),
      canonical == expectedPath
    else {
      throw WorkbenchFailure(
        name: "UnsafeMediaLocation", message: "The media file is linked outside its chosen folder.")
    }
    return try operation(authorized.path, url)
  }

  /// A bookmark that no longer resolves (a renamed volume, a copied Mac)
  /// falls back to the saved path; the folder identity check decides.
  private static func resolvedRoot(_ source: NativeMediaSource, mounting: Bool) -> URL {
    let saved = URL(fileURLWithPath: source.rootPath, isDirectory: true)
    guard let bookmark = source.bookmark else { return saved }
    var options: URL.BookmarkResolutionOptions = [.withSecurityScope, .withoutUI]
    if !mounting { options.insert(.withoutMounting) }
    var stale = false
    guard
      let resolved = try? URL(
        resolvingBookmarkData: bookmark, options: options, relativeTo: nil, bookmarkDataIsStale: &stale)
    else { return saved }
    NativeBookmarkCache.shared.store(resolved, for: bookmark)
    return resolved
  }

  private static func authorize(_ source: NativeMediaSource, root: URL) throws -> AuthorizedMediaRoot {
    let authorized = try MediaFilesystem.authorizeDirectory(root)
    guard authorized.device == source.rootDevice, authorized.inode == source.rootInode else {
      throw WorkbenchFailure(
        name: "MediaRootNeedsPermission",
        message: "Reconnect \(root.lastPathComponent); the saved folder identity changed.")
    }
    return authorized
  }

  /// A decoded, display-ready preview: drawing it never decodes on the main thread.
  static func thumbnail(_ source: NativeMediaSource, longestSide: Int) throws -> CGImage {
    try Task.checkCancellation()
    return try withSource(source, mounting: false) { root, url in
      let image: CGImage
      if source.mediaKind == "video" {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: longestSide, height: longestSide)
        do { image = try generator.copyCGImage(at: .zero, actualTime: nil) } catch let error as NSError
        where error.domain == AVFoundationErrorDomain {
          // Formats AVFoundation cannot read (WebM, for example) still hand off.
          throw WorkbenchFailure(
            name: "PreviewUnsupported",
            message: "No preview is available. The original can still be copied for the designer.")
        }
      } else {
        // Bounded compressed input + ImageIO downsampling, not full-size decode.
        let data = try MediaFilesystem.readContainedFile(
          rootPath: root, relativePath: source.relativePath, maximumBytes: 64 * 1024 * 1024)
        guard
          let input = CGImageSourceCreateWithData(
            data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
          withinDecodeLimit(input),
          let thumb = CGImageSourceCreateThumbnailAtIndex(
            input, 0,
            [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceThumbnailMaxPixelSize: longestSide,
              kCGImageSourceShouldCacheImmediately: true,
            ] as CFDictionary)
        else {
          throw WorkbenchFailure(
            name: "PreviewUnsupported",
            message: "No preview is available. The original can still be copied for the designer.")
        }
        image = thumb
      }
      try Task.checkCancellation()
      return image
    }
  }

  /// A thumbnail decodes the whole image first, so a small file can still
  /// claim more pixels than memory allows. The catalogue applies the same cap.
  private static func withinDecodeLimit(_ input: CGImageSource) -> Bool {
    guard let properties = CGImageSourceCopyPropertiesAtIndex(input, 0, nil) as? [CFString: Any],
      let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
      let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue
    else { return false }
    return width > 0 && height > 0 && width <= 32_768 && height <= 32_768 && width * height <= 64_000_000
  }

  /// Copy via no-follow file descriptors and calculate the checksum in the same
  /// streaming pass. A changed original is never silently mixed into a handoff.
  static func stageOriginal(
    _ source: NativeMediaSource, to destination: URL, expectedFingerprint: String?,
    acceptChanged: Bool = false
  ) throws -> String {
    try withSource(source) { rootPath, _ in
      let segments = try MediaFilesystem.safeSegments(source.relativePath)
      var fd = Darwin.open(rootPath, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
      guard fd >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
      defer { Darwin.close(fd) }
      for segment in segments.dropLast() {
        let next = Darwin.openat(fd, segment, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard next >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        Darwin.close(fd)
        fd = next
      }
      let inputFD = Darwin.openat(fd, segments.last!, O_RDONLY | O_NOFOLLOW)
      guard inputFD >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .ENOENT) }
      let input = FileHandle(fileDescriptor: inputFD, closeOnDealloc: true)
      defer { try? input.close() }
      var before = stat()
      guard fstat(inputFD, &before) == 0, before.st_mode & S_IFMT == S_IFREG else {
        throw WorkbenchFailure(
          name: "MediaUnavailable", message: "The original is not a regular file.")
      }
      let outputFD = Darwin.open(
        destination.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, S_IRUSR | S_IWUSR)
      guard outputFD >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
      let output = FileHandle(fileDescriptor: outputFD, closeOnDealloc: true)
      var succeeded = false
      defer {
        try? output.close()
        if !succeeded { try? FileManager.default.removeItem(at: destination) }
      }
      var hash = SHA256()
      var count = 0
      while let chunk = try input.read(upToCount: 1_048_576), !chunk.isEmpty {
        try Task.checkCancellation()
        try output.write(contentsOf: chunk)
        hash.update(data: chunk)
        count += chunk.count
      }
      try output.synchronize()
      let fingerprint = hash.finalize().map { String(format: "%02x", $0) }.joined()
      var after = stat()
      guard fstat(inputFD, &after) == 0, before.st_size == after.st_size,
        before.st_mtimespec.tv_sec == after.st_mtimespec.tv_sec,
        before.st_mtimespec.tv_nsec == after.st_mtimespec.tv_nsec,
        count == Int(after.st_size)
      else {
        throw WorkbenchFailure(
          name: "SourceChanged",
          message:
            "\(source.filename) changed while being copied. Retry after the source has finished saving."
        )
      }
      let expected = expectedFingerprint ?? source.fingerprint
      // Originals too large to fingerprint when catalogued are identified by
      // size and modification time instead; a change to either is a change.
      let observed: String
      if expected.hasPrefix("unavailable:") {
        let modified = Int64(after.st_mtimespec.tv_sec) * 1_000 + Int64(after.st_mtimespec.tv_nsec) / 1_000_000
        observed = "unavailable:\(after.st_size):\(modified)"
      } else {
        observed = fingerprint
      }
      if !acceptChanged, expected != observed {
        throw WorkbenchFailure(
          name: "SourceChanged",
          message:
            "\(source.filename) changed after it was selected. Rescan and choose its current version, or explicitly accept changed sources."
        )
      }
      succeeded = true
      return fingerprint
    }
  }
}

/// Resolved media folders, reused by every preview of the same folder.
final class NativeBookmarkCache: @unchecked Sendable {
  static let shared = NativeBookmarkCache()
  private let lock = NSLock()
  private var urls: [Data: URL] = [:]
  func url(_ bookmark: Data) -> URL? { lock.withLock { urls[bookmark] } }
  func store(_ url: URL?, for bookmark: Data) { lock.withLock { urls[bookmark] = url } }
}

/// Decoded previews, sized by their pixels. NSCache is thread-safe, so a view
/// can show a warm image synchronously instead of a spinner for one frame.
final class NativeImageCache: @unchecked Sendable {
  private let cache = NSCache<NSString, CGImage>()
  init() {
    let memory = ProcessInfo.processInfo.physicalMemory
    cache.totalCostLimit = Int(min(768 << 20, max(192 << 20, memory / 16)))
    cache.countLimit = 1024
  }
  func image(_ key: String) -> CGImage? { cache.object(forKey: key as NSString) }
  func store(_ image: CGImage, _ key: String) {
    cache.setObject(image, forKey: key as NSString, cost: max(1, image.bytesPerRow * image.height))
  }
}

private actor ImageWorkLimiter {
  private var active = 0
  private var waiting: [(UUID, CheckedContinuation<Bool, Never>)] = []
  private let slots = max(2, min(4, ProcessInfo.processInfo.activeProcessorCount / 2))
  /// Urgent work (the canvas, an open preview) goes ahead of queued tiles.
  func acquire(_ id: UUID, urgent: Bool = false) async -> Bool {
    if Task.isCancelled { return false }
    if active < slots {
      active += 1
      return true
    }
    return await withTaskCancellationHandler(
      operation: {
        await withCheckedContinuation { continuation in
          if Task.isCancelled {
            continuation.resume(returning: false)
          } else if urgent {
            waiting.insert((id, continuation), at: 0)
          } else {
            waiting.append((id, continuation))
          }
        }
      }, onCancel: { Task { await self.cancel(id) } })
  }
  private func cancel(_ id: UUID) {
    if let index = waiting.firstIndex(where: { $0.0 == id }) {
      waiting.remove(at: index).1.resume(returning: false)
    }
  }
  func release() {
    if !waiting.isEmpty {
      waiting.removeFirst().1.resume(returning: true)
    } else {
      active = max(0, active - 1)
    }
  }
}

struct NativePreviewResult: @unchecked Sendable {
  let image: CGImage?
  let message: String?
  static func failed(_ error: Error) -> NativePreviewResult {
    let failure = WorkbenchFailure.unexpected(error)
    if CommandLine.arguments.contains("--native-self-test") {
      fputs("NATIVE_PREVIEW_FAILED: \(failure.name): \(failure.message)\n", stderr)
    }
    let code = (error as? POSIXError)?.code
    let message: String
    if code == .ENOENT || failure.name == "MissingMedia" { message = "Original missing. Reconnect or rescan its folder." }
    else if code == .EACCES || code == .EPERM || failure.name == "MediaRootNeedsPermission" { message = "Folder access needed. Reconnect this media folder." }
    else if failure.name == "MediaRootUnavailable" { message = "Media folder unavailable. Reconnect its drive or folder." }
    else if ["PreviewUnsupported", "UnsupportedMediaPreview"].contains(failure.name) { message = "Preview unsupported. The original can still be included in handoff." }
    else { message = "Preview failed. Rescan or reconnect the media folder." }
    return NativePreviewResult(image: nil, message: message)
  }
}

actor NativeThumbnailService {
  static let shared = NativeThumbnailService()
  private let limiter = ImageWorkLimiter()
  private nonisolated let store = NativeImageCache()
  private var jobs: [String: Task<NativePreviewResult, Never>] = [:]
  private var consumers: [String: Set<UUID>] = [:]
  private(set) var cacheHits = 0
  private(set) var decodeCount = 0
  private static func size(_ longestSide: Int) -> Int { min(3072, max(64, longestSide)) }
  private static func key(_ source: NativeMediaSource, _ longestSide: Int) -> String {
    "\(source.cacheKey):\(size(longestSide))"
  }
  /// A preview that is already decoded, without waiting.
  nonisolated func cached(_ source: NativeMediaSource, longestSide: Int = 512) -> CGImage? {
    store.image(Self.key(source, longestSide))
  }
  func image(for source: NativeMediaSource, longestSide: Int = 512) async -> CGImage? {
    await preview(for: source, longestSide: longestSide).image
  }
  func preview(for source: NativeMediaSource, longestSide: Int = 512) async -> NativePreviewResult {
    guard !Task.isCancelled else { return NativePreviewResult(image: nil, message: nil) }
    let size = Self.size(longestSide)
    let key = Self.key(source, size)
    if let cached = store.image(key) {
      cacheHits += 1
      return NativePreviewResult(image: cached, message: nil)
    }
    let consumer = UUID()
    consumers[key, default: []].insert(consumer)
    let work: Task<NativePreviewResult, Never>
    if let existing = jobs[key] { work = existing }
    else {
      decodeCount += 1
      let limiter = self.limiter
      work = Task {
        guard await limiter.acquire(UUID(), urgent: size >= 1024) else { return NativePreviewResult(image: nil, message: nil) }
        let worker = Task.detached(priority: .userInitiated) {
          do { return NativePreviewResult(image: try NativeMediaIO.thumbnail(source, longestSide: size), message: nil) }
          catch is CancellationError { return NativePreviewResult(image: nil, message: nil) }
          catch { return NativePreviewResult.failed(error) }
        }
        let result = await withTaskCancellationHandler(operation: { await worker.value }, onCancel: { worker.cancel() })
        await limiter.release()
        return result
      }
      jobs[key] = work
    }
    let result = await withTaskCancellationHandler(operation: { await work.value },
      onCancel: { Task { await self.removeConsumer(consumer, key: key) } })
    if let image = result.image, !Task.isCancelled { store.store(image, key) }
    removeConsumer(consumer, key: key)
    return Task.isCancelled ? NativePreviewResult(image: nil, message: nil) : result
  }
  private func removeConsumer(_ consumer: UUID, key: String) {
    consumers[key]?.remove(consumer)
    if consumers[key]?.isEmpty == true {
      jobs.removeValue(forKey: key)?.cancel()
      consumers[key] = nil
    }
  }
}
