import AVFoundation
import AppKit
import CryptoKit
import Darwin
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Immutable native services receive a granted source, never a user-controlled
/// arbitrary path from a renderer. Source pixels are never modified in place.
enum NativeMediaIO {
  static func withSource<T>(_ source: NativeMediaSource, operation: (String, URL) throws -> T)
    throws -> T
  {
    var root = URL(fileURLWithPath: source.rootPath, isDirectory: true)
    if let bookmark = source.bookmark {
      var stale = false
      root = try URL(
        resolvingBookmarkData: bookmark, options: [.withSecurityScope, .withoutUI], relativeTo: nil,
        bookmarkDataIsStale: &stale)
    }
    let access = root.startAccessingSecurityScopedResource()
    defer { if access { root.stopAccessingSecurityScopedResource() } }
    let authorized = try MediaFilesystem.authorizeDirectory(root)
    guard authorized.device == source.rootDevice, authorized.inode == source.rootInode else {
      throw WorkbenchFailure(
        name: "MediaRootNeedsPermission",
        message: "Reconnect \(root.lastPathComponent); the saved folder identity changed.")
    }
    _ = try MediaFilesystem.safeSegments(source.relativePath)
    let url = URL(fileURLWithPath: authorized.path, isDirectory: true).appendingPathComponent(
      source.relativePath)
    let canonical = try MediaFilesystem.canonicalPath(url.path)
    guard MediaFilesystem.isContained(rootPath: authorized.path, candidatePath: canonical),
      canonical == url.standardizedFileURL.path
    else {
      throw WorkbenchFailure(
        name: "UnsafeMediaLocation", message: "The media file is linked outside its chosen folder.")
    }
    return try operation(authorized.path, url)
  }

  static func thumbnail(_ source: NativeMediaSource, longestSide: Int) throws -> Data {
    try Task.checkCancellation()
    return try withSource(source) { root, url in
      let image: CGImage
      if source.mediaKind == "video" {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: longestSide, height: longestSide)
        image = try generator.copyCGImage(at: .zero, actualTime: nil)
      } else {
        // Bounded compressed input + ImageIO downsampling, not full-size decode.
        let data = try MediaFilesystem.readContainedFile(
          rootPath: root, relativePath: source.relativePath, maximumBytes: 64 * 1024 * 1024)
        guard
          let input = CGImageSourceCreateWithData(
            data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
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
      let output = NSMutableData()
      guard
        let destination = CGImageDestinationCreateWithData(
          output, UTType.png.identifier as CFString, 1, nil)
      else {
        throw WorkbenchFailure(
          name: "PreviewUnsupported", message: "The preview encoder could not start.")
      }
      CGImageDestinationAddImage(destination, image, nil)
      guard CGImageDestinationFinalize(destination) else {
        throw WorkbenchFailure(
          name: "PreviewUnsupported", message: "The image could not be previewed.")
      }
      return output as Data
    }
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
      if !acceptChanged, !expected.hasPrefix("unavailable:"), expected != fingerprint {
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

private actor ImageWorkLimiter {
  private var active = 0
  private var waiting: [(UUID, CheckedContinuation<Bool, Never>)] = []
  func acquire(_ id: UUID) async -> Bool {
    if Task.isCancelled { return false }
    if active < 2 {
      active += 1
      return true
    }
    return await withTaskCancellationHandler(
      operation: {
        await withCheckedContinuation { continuation in
          if Task.isCancelled {
            continuation.resume(returning: false)
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

struct NativePreviewResult: Sendable {
  let data: Data?
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
    return NativePreviewResult(data: nil, message: message)
  }
}

actor NativeThumbnailService {
  static let shared = NativeThumbnailService()
  private let limiter = ImageWorkLimiter()
  private let cache = NSCache<NSString, NSData>()
  private var jobs: [String: Task<NativePreviewResult, Never>] = [:]
  private var consumers: [String: Set<UUID>] = [:]
  private(set) var cacheHits = 0
  private(set) var decodeCount = 0
  init() {
    cache.totalCostLimit = 96 * 1024 * 1024
    cache.countLimit = 512
  }
  func data(for source: NativeMediaSource, longestSide: Int = 512) async -> Data? {
    await preview(for: source, longestSide: longestSide).data
  }
  func preview(for source: NativeMediaSource, longestSide: Int = 512) async -> NativePreviewResult {
    guard !Task.isCancelled else { return NativePreviewResult(data: nil, message: nil) }
    let size = min(3072, max(64, longestSide))
    let key = "\(source.cacheKey):\(size)"
    if let cached = cache.object(forKey: key as NSString) {
      cacheHits += 1
      return NativePreviewResult(data: cached as Data, message: nil)
    }
    let consumer = UUID()
    consumers[key, default: []].insert(consumer)
    let work: Task<NativePreviewResult, Never>
    if let existing = jobs[key] { work = existing }
    else {
      decodeCount += 1
      let limiter = self.limiter
      work = Task {
        guard await limiter.acquire(UUID()) else { return NativePreviewResult(data: nil, message: nil) }
        let worker = Task.detached(priority: .userInitiated) {
          do { return NativePreviewResult(data: try NativeMediaIO.thumbnail(source, longestSide: size), message: nil) }
          catch is CancellationError { return NativePreviewResult(data: nil, message: nil) }
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
    if let data = result.data, !Task.isCancelled { cache.setObject(data as NSData, forKey: key as NSString, cost: data.count) }
    removeConsumer(consumer, key: key)
    return Task.isCancelled ? NativePreviewResult(data: nil, message: nil) : result
  }
  private func removeConsumer(_ consumer: UUID, key: String) {
    consumers[key]?.remove(consumer)
    if consumers[key]?.isEmpty == true {
      jobs.removeValue(forKey: key)?.cancel()
      consumers[key] = nil
    }
  }
}
