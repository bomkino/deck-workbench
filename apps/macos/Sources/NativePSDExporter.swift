import AVFoundation
import CoreGraphics
import Darwin
import Foundation
import ImageIO
import JavaScriptCore
import UniformTypeIdentifiers

/// One fresh JavaScriptCore context per slide. Only staged originals cross this
/// boundary; neither Photoshop nor a browser/Node runtime is required.
enum NativePSDExporter {
  private static let lock = NSLock()
  private static let maximumEmbeddedBytes = 128 * 1024 * 1024
  private static let maximumWorkingBytes = 768 * 1024 * 1024

  static func write(slide: DeckSlide, canvas: DeckCanvas, staged: [String: URL], to output: URL)
    throws -> [String]
  {
    try Task.checkCancellation()
    lock.lock()
    defer { lock.unlock() }
    return try autoreleasepool {
      try writeSlide(slide: slide, canvas: canvas, staged: staged, to: output)
    }
  }

  private static func writeSlide(slide: DeckSlide, canvas: DeckCanvas, staged: [String: URL], to output: URL)
    throws -> [String]
  {
    guard [1920.0, 2576.0].contains(canvas.width), canvas.height == 1080 else {
      throw failure("PSD export supports 1920 × 1080 and 2576 × 1080 slides.")
    }
    guard !FileManager.default.fileExists(atPath: output.path) else {
      throw failure("The PSD already exists. Choose a new handoff folder; existing artwork was not replaced.")
    }
    let width = Int(canvas.width), height = Int(canvas.height)
    let scene = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
    guard scene.imageLayers.count <= 12 else {
      throw failure("This slide has more than twelve image placements. Its originals remain available for manual assembly.")
    }
    var embeddedBytes = 0
    var seen = Set<String>()
    for layer in scene.imageLayers {
      guard let id = layer.assetID, seen.insert(id).inserted else { continue }
      guard let url = staged[id] else { throw failure("\(slide.title): chosen artwork for \(layer.role) is unavailable.") }
      let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey])
      guard values.isRegularFile == true, values.isSymbolicLink != true, let size = values.fileSize,
        size > 0, size <= maximumEmbeddedBytes else {
        throw failure("\(url.lastPathComponent) is not a regular image within the 128 MB PSD source budget.")
      }
      embeddedBytes += size
    }
    let estimated = width * height * 4 * (scene.imageLayers.count * 2 + 8) + embeddedBytes * 4
    guard embeddedBytes <= maximumEmbeddedBytes, estimated <= maximumWorkingBytes else {
      throw failure("This slide exceeds the PSD export memory budget. Export its originals and assemble this slide manually.")
    }
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB), let profile = colorSpace.copyICCData() else {
      throw failure("The native sRGB colour profile could not be loaded.")
    }
    let host = try EncoderHost()
    let grid = NativeSlideGrid(canvas: canvas)
    let guides = grid.verticalGuides.map { ["location": $0, "direction": "vertical"] as [String: Any] }
      + grid.horizontalGuides.map { ["location": $0, "direction": "horizontal"] as [String: Any] }
    _ = try host.call("start", arguments: [try json([
      "width": width, "height": height, "guides": guides,
      "sharedID": uuid(), "instanceIDs": [uuid(), uuid()],
    ]), try host.bytes(profile as Data)])
    let composite = try Bitmap(width: width, height: height, colorSpace: colorSpace)
    var sourceIDs: [String: String] = [:]
    var issues: [String] = []
    for (index, layer) in scene.imageLayers.enumerated() {
      try Task.checkCancellation()
      guard let assetID = layer.assetID else {
        issues.append("\(slide.title): \(layer.role) is empty; the shared artwork remains editable.")
        continue
      }
      guard let url = staged[assetID] else { throw failure("Chosen artwork for \(layer.role) is unavailable.") }
      try autoreleasepool {
        // Decode one role at a time; the encoder deduplicates embedded bytes by
        // asset ID without retaining twelve large native decoded images.
        let source = try artwork(url: url, colorSpace: colorSpace)
        let sourceID = sourceIDs[assetID] ?? uuid()
        sourceIDs[assetID] = sourceID
        if let warning = source.warning { issues.append("\(slide.title): \(warning)") }
        let placement = NativeSlideRenderer.imageRect(sourceWidth: source.width, sourceHeight: source.height,
          frame: layer.frame, crop: layer.crop, fit: layer.fit)
        guard [placement.minX, placement.minY, placement.width, placement.height,
          layer.frame.minX, layer.frame.minY, layer.frame.width, layer.frame.height].allSatisfy({ $0.isFinite }),
          placement.width > 0, placement.height > 0, layer.frame.width > 0, layer.frame.height > 0 else {
          throw failure("\(slide.title): \(layer.role) has an invalid artwork frame.")
        }
        let canvasRect = CGRect(x: 0, y: 0, width: width, height: height)
        let pixelRect = cacheBounds(placement, canvas: canvasRect)
        let maskRect = cacheBounds(layer.frame, canvas: canvasRect)
        let pixels = try Bitmap(width: Int(pixelRect.width), height: Int(pixelRect.height), colorSpace: colorSpace)
        pixels.draw(source.image, placement: placement.offsetBy(dx: -pixelRect.minX, dy: -pixelRect.minY))
        let mask = try Bitmap(width: Int(maskRect.width), height: Int(maskRect.height), colorSpace: colorSpace)
        mask.context.setFillColor(CGColor(gray: 0, alpha: 1))
        mask.context.fill(CGRect(origin: .zero, size: maskRect.size))
        mask.context.setFillColor(CGColor(gray: 1, alpha: 1))
        mask.context.fill(layer.frame.offsetBy(dx: -maskRect.minX, dy: -maskRect.minY))
        composite.draw(source.image, placement: placement, clip: layer.frame)
        let transform = [placement.minX, placement.minY, placement.maxX, placement.minY,
          placement.maxX, placement.maxY, placement.minX, placement.maxY]
        _ = try host.call("addLayer", arguments: [try json([
          "id": sourceID, "placed": uuid(), "name": "Chosen \(index + 1) — \(source.filename)",
          "filename": source.filename, "fileType": source.fileType,
          "sourceWidth": source.width, "sourceHeight": source.height, "transform": transform,
          "pixelRect": [Int(pixelRect.minX), Int(pixelRect.minY), Int(pixelRect.width), Int(pixelRect.height)],
          "maskRect": [Int(maskRect.minX), Int(maskRect.minY), Int(maskRect.width), Int(maskRect.height)],
        ]), try host.bytes(source.bytes), try host.bytes(pixels.straightRGBA()), try host.bytes(mask.straightRGBA())])
      }
    }
    try Task.checkCancellation()
    // The two visible outer roles initially overlap. Cache their actual alpha
    // stacking rather than incorrectly using only one translucent instance.
    guard let innerImage = composite.context.makeImage() else { throw failure("The artwork composite could not be rendered.") }
    let outer = try Bitmap(width: width, height: height, colorSpace: colorSpace)
    let full = CGRect(x: 0, y: 0, width: width, height: height)
    outer.draw(innerImage, placement: full)
    outer.draw(innerImage, placement: full)
    let result = try host.call("finish", arguments: [try host.bytes(composite.straightRGBA()), try host.bytes(outer.straightRGBA())])
    try Task.checkCancellation()
    try host.write(result, to: output)
    return issues
  }

  private struct Artwork {
    let image: CGImage
    let bytes: Data
    let width: Double
    let height: Double
    let filename: String
    let fileType: String
    let warning: String?
  }

  private static func artwork(url: URL, colorSpace: CGColorSpace) throws -> Artwork {
    try Task.checkCancellation()
    if let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 3072,
        kCGImageSourceShouldCacheImmediately: true,
      ] as CFDictionary) {
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
      let rawWidth = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue ?? Double(image.width)
      let rawHeight = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue ?? Double(image.height)
      let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
      let width = orientation >= 5 ? rawHeight : rawWidth
      let height = orientation >= 5 ? rawWidth : rawHeight
      let type = (CGImageSourceGetType(source) as String?) ?? ""
      let types = [UTType.jpeg.identifier: "JPEG", UTType.png.identifier: "PNGf", UTType.tiff.identifier: "TIFF"]
      if let fileType = types[type], CGImageSourceGetCount(source) == 1 {
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard data.count <= maximumEmbeddedBytes else { throw failure("The source changed or exceeded its PSD byte budget.") }
        return Artwork(image: image, bytes: data, width: width, height: height,
          filename: url.lastPathComponent, fileType: fileType, warning: nil)
      }
      return try still(image: image, filename: url.lastPathComponent,
        warning: "\(url.lastPathComponent) uses a PNG of its first image in the PSD. Export Approved Media to retain its original file.")
    }
    if let document = CGPDFDocument(url as CFURL), let page = document.page(at: 1) {
      let bounds = page.getBoxRect(.cropBox)
      guard bounds.width > 0, bounds.height > 0 else { throw failure("The PDF page has invalid dimensions.") }
      let factor = min(1, 3072 / max(bounds.width, bounds.height))
      let width = max(1, Int((bounds.width * factor).rounded())), height = max(1, Int((bounds.height * factor).rounded()))
      let bitmap = try Bitmap(width: width, height: height, colorSpace: colorSpace)
      bitmap.context.saveGState()
      bitmap.context.translateBy(x: 0, y: CGFloat(height))
      bitmap.context.scaleBy(x: 1, y: -1)
      bitmap.context.concatenate(page.getDrawingTransform(.cropBox,
        rect: CGRect(x: 0, y: 0, width: width, height: height), rotate: 0, preserveAspectRatio: true))
      bitmap.context.drawPDFPage(page)
      bitmap.context.restoreGState()
      guard let image = bitmap.context.makeImage() else { throw failure("The PDF page could not be rendered.") }
      return try still(image: image, filename: url.lastPathComponent,
        warning: "\(url.lastPathComponent) uses a PNG of page 1 in the PSD. Export Approved Media to retain the PDF.")
    }
    if let type = UTType(filenameExtension: url.pathExtension), type.conforms(to: .movie) {
      let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
      generator.appliesPreferredTrackTransform = true
      generator.maximumSize = CGSize(width: 3072, height: 3072)
      let image = try generator.copyCGImage(at: .zero, actualTime: nil)
      return try still(image: image, filename: url.lastPathComponent,
        warning: "\(url.lastPathComponent) uses its opening video frame in the PSD. Export Approved Media to retain the video.")
    }
    throw failure("\(url.lastPathComponent) could not be rendered as artwork. No substitute image was invented.")
  }

  private static func still(image: CGImage, filename: String, warning: String) throws -> Artwork {
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
      throw failure("The still-image encoder could not start.")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw failure("The still-image PNG could not be written.") }
    return Artwork(image: image, bytes: data as Data, width: Double(image.width), height: Double(image.height),
      filename: filename + " — Still.png", fileType: "PNGf", warning: warning)
  }

  private final class Bitmap {
    let context: CGContext
    private let storage: UnsafeMutableRawPointer
    private let count: Int

    init(width: Int, height: Int, colorSpace: CGColorSpace) throws {
      count = width * height * 4
      guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: width * 4, space: colorSpace,
        bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue),
        let storage = context.data else {
        throw failure("The PSD bitmap could not be allocated.")
      }
      self.context = context
      self.storage = storage
      context.clear(CGRect(x: 0, y: 0, width: width, height: height))
      context.translateBy(x: 0, y: CGFloat(height))
      context.scaleBy(x: 1, y: -1)
      context.interpolationQuality = .high
    }

    func draw(_ image: CGImage, placement: CGRect, clip: CGRect? = nil) {
      context.saveGState()
      defer { context.restoreGState() }
      if let clip { context.clip(to: clip) }
      context.translateBy(x: placement.minX, y: placement.maxY)
      context.scaleBy(x: 1, y: -1)
      context.draw(image, in: CGRect(origin: .zero, size: placement.size))
    }

    func straightRGBA() -> Data {
      var data = Data(bytes: storage, count: count)
      data.withUnsafeMutableBytes { buffer in
        let pixels = buffer.bindMemory(to: UInt8.self)
        for offset in stride(from: 0, to: count, by: 4) {
          let alpha = Int(pixels[offset + 3])
          if alpha == 255 { continue }
          for channel in 0..<3 {
            pixels[offset + channel] = alpha == 0 ? 0 : UInt8(min(255, (Int(pixels[offset + channel]) * 255 + alpha / 2) / alpha))
          }
        }
      }
      return data
    }
  }

  private final class EncoderHost {
    private let context: JSContext
    private let adapter: JSValue

    init() throws {
      guard let context = JSContext(),
        let url = Bundle.main.url(forResource: "psd-encoder", withExtension: "js", subdirectory: "Kernel") else {
        throw failure("The bundled PSD encoder is unavailable. Reinstall the complete application.")
      }
      self.context = context
      context.evaluateScript(try String(contentsOf: url, encoding: .utf8), withSourceURL: url)
      if let exception = context.exception { throw failure(exception.toString() ?? "The PSD encoder failed to load.") }
      guard let adapter = context.objectForKeyedSubscript("PitchdogPSD"), !adapter.isUndefined else {
        throw failure("The bundled PSD encoder did not expose its interface.")
      }
      self.adapter = adapter
    }

    func bytes(_ data: Data) throws -> JSValue {
      // NSData remains alive until JSC releases its read-only backing store.
      // This avoids base64 strings and arrays of individually boxed numbers.
      let retained = Unmanaged.passRetained(data as NSData)
      let value = retained.takeUnretainedValue()
      var exception: JSValueRef?
      guard let object = JSObjectMakeTypedArrayWithBytesNoCopy(context.jsGlobalContextRef,
        kJSTypedArrayTypeUint8Array, UnsafeMutableRawPointer(mutating: value.bytes), value.length,
        { _, owner in
          if let owner { Unmanaged<NSData>.fromOpaque(owner).release() }
        }, retained.toOpaque(), &exception), exception == nil,
        let result = JSValue(jsValueRef: object, in: context) else {
        throw failure("A PSD byte buffer could not cross the native encoder boundary.")
      }
      return result
    }

    func call(_ name: String, arguments: [Any]) throws -> JSValue {
      context.exception = nil
      guard let function = adapter.objectForKeyedSubscript(name), !function.isUndefined,
        let result = function.call(withArguments: arguments), context.exception == nil, !result.isUndefined else {
        throw failure(context.exception?.toString() ?? "The PSD encoder failed during \(name).")
      }
      return result
    }

    func write(_ value: JSValue, to output: URL) throws {
      var exception: JSValueRef?
      guard let object = JSValueToObject(context.jsGlobalContextRef, value.jsValueRef, &exception), exception == nil else {
        throw failure("The PSD encoder did not return binary data.")
      }
      let length = JSObjectGetTypedArrayByteLength(context.jsGlobalContextRef, object, &exception)
      let offset = JSObjectGetTypedArrayByteOffset(context.jsGlobalContextRef, object, &exception)
      guard length > 26, length <= 256 * 1024 * 1024, exception == nil,
        let buffer = JSObjectGetTypedArrayBuffer(context.jsGlobalContextRef, object, &exception), exception == nil else {
        throw failure("The PSD result is empty or exceeds the 256 MB output budget.")
      }
      // Fetch the pointer last: JSC explicitly invalidates temporary pointers
      // across subsequent API calls. Hold the JSValue until writing completes.
      guard let pointer = JSObjectGetArrayBufferBytesPtr(context.jsGlobalContextRef, buffer, &exception), exception == nil else {
        throw failure("The PSD result bytes are unavailable.")
      }
      let data = Data(bytesNoCopy: pointer.advanced(by: offset), count: length, deallocator: .none)
      let temporary = output.deletingLastPathComponent().appendingPathComponent(".psd-\(UUID().uuidString).partial")
      defer { try? FileManager.default.removeItem(at: temporary) }
      try data.write(to: temporary, options: .withoutOverwriting)
      try Task.checkCancellation()
      // RENAME_EXCL is atomic and refuses to overwrite another writer's file.
      let result = temporary.path.withCString { source in
        output.path.withCString { destination in renamex_np(source, destination, UInt32(RENAME_EXCL)) }
      }
      guard result == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
      withExtendedLifetime(value) {}
    }
  }

  private static func uuid() -> String { UUID().uuidString.lowercased() }
  private static func cacheBounds(_ rect: CGRect, canvas: CGRect) -> CGRect {
    let clipped = rect.intersection(canvas)
    return clipped.isNull || clipped.isEmpty ? CGRect(x: 0, y: 0, width: 1, height: 1) : clipped.integral
  }
  private static func json(_ value: [String: Any]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard let result = String(data: data, encoding: .utf8) else { throw failure("PSD metadata could not be encoded.") }
    return result
  }
  private static func failure(_ message: String) -> WorkbenchFailure {
    WorkbenchFailure(name: "PSDExportFailed", message: message)
  }
}
