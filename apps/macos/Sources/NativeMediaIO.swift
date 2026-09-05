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
  private var cancelled: Set<UUID> = []
  func acquire(_ id: UUID) async -> Bool {
    if Task.isCancelled { return false }
    if active < 2 {
      active += 1
      return true
    }
    return await withTaskCancellationHandler(
      operation: {
        await withCheckedContinuation { continuation in
          if cancelled.remove(id) != nil || Task.isCancelled {
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
    } else {
      cancelled.insert(id)
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

actor NativeThumbnailService {
  static let shared = NativeThumbnailService()
  private let limiter = ImageWorkLimiter()
  private let cache = NSCache<NSString, NSData>()
  private var jobs: [String: Task<Data?, Never>] = [:]
  private var consumers: [String: Set<UUID>] = [:]
  init() {
    cache.totalCostLimit = 96 * 1024 * 1024
    cache.countLimit = 512
  }
  func data(for source: NativeMediaSource, longestSide: Int = 512) async -> Data? {
    let key = "\(source.cacheKey):\(longestSide)"
    if let cached = cache.object(forKey: key as NSString) { return cached as Data }
    let consumer = UUID()
    consumers[key, default: []].insert(consumer)
    let work: Task<Data?, Never>
    if let existing = jobs[key] {
      work = existing
    } else {
      let limiter = self.limiter
      work = Task {
        guard await limiter.acquire(UUID()) else { return nil }
        let worker = Task.detached(priority: .userInitiated) {
          try? NativeMediaIO.thumbnail(source, longestSide: longestSide)
        }
        let data = await withTaskCancellationHandler(
          operation: { await worker.value }, onCancel: { worker.cancel() })
        await limiter.release()
        return data
      }
      jobs[key] = work
    }
    let value = await withTaskCancellationHandler(
      operation: { await work.value },
      onCancel: { Task { await self.removeConsumer(consumer, key: key) } })
    if let value, !Task.isCancelled {
      cache.setObject(value as NSData, forKey: key as NSString, cost: value.count)
    }
    removeConsumer(consumer, key: key)
    return Task.isCancelled ? nil : value
  }
  private func removeConsumer(_ consumer: UUID, key: String) {
    consumers[key]?.remove(consumer)
    if consumers[key]?.isEmpty == true {
      jobs.removeValue(forKey: key)?.cancel()
      consumers[key] = nil
    }
  }
}
