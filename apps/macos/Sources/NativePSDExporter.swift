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
  static let maximumWorkingBytes = 768 * 1024 * 1024
  /// Single-image sources of these types are embedded byte for byte.
  private static let embeddedTypes = [UTType.jpeg.identifier: "JPEG", UTType.png.identifier: "PNGf", UTType.tiff.identifier: "TIFF"]

  static func supports(_ canvas: DeckCanvas) -> Bool {
    [1920.0, 2576.0].contains(canvas.width) && canvas.height == 1080
  }

  /// `scene` is the slide already resolved by the caller on this thread, and
  /// `sides` its decode plan (see `artworkSides`); `filenames` are the
  /// originals' names for layers and Smart Objects, by asset ID. A handoff
  /// passes its shared `artwork` cache so PDFs and PSDs decode each asset once.
  static func write(slide: DeckSlide, canvas: DeckCanvas, staged: [String: URL], cropToFrames: Bool = true, to output: URL,
    scene: ResolvedPrototype? = nil, sides: [String: Int]? = nil, filenames: [String: String] = [:],
    artwork: NativeHandoffArtwork? = nil)
    throws -> [String]
  {
    try Task.checkCancellation()
    lock.lock()
    defer { lock.unlock() }
    return try autoreleasepool {
      try writeSlide(slide: slide, canvas: canvas, staged: staged, cropToFrames: cropToFrames, to: output,
        scene: scene, sides: sides, filenames: filenames, cache: artwork ?? NativeHandoffArtwork(staged: staged))
    }
  }

  /// Whether this original is embedded unchanged (otherwise a PNG still is).
  static func embedsOriginal(_ original: NativeHandoffArtwork.Original) -> Bool {
    embeddedTypes[original.type] != nil && original.count == 1
  }

  /// Bytes the PSD working budget leaves for this slide's decoded artwork.
  static func artworkBudget(scene: ResolvedPrototype, staged: [String: URL]) -> Int {
    var embedded = 0
    var seen = Set<String>()
    for layer in scene.imageLayers {
      guard let id = layer.assetID, seen.insert(id).inserted, let url = staged[id] else { continue }
      embedded += (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
    }
    return maximumWorkingBytes - workingBytes(scene: scene, embeddedBytes: embedded)
  }

  /// Decode sizes for a slide's artwork: each placement's own pixels × `scale`
  /// (the embedded JPEG/PNG/TIFF original stays complete regardless). A still
  /// (PDF page, video frame, other format) is itself the embedded source, so it
  /// keeps the 3072 px earlier exports embedded, and the PSD keeps its size.
  static func artworkSides(scene: ResolvedPrototype, artwork: NativeHandoffArtwork, scale: Double = 1, budget: Int)
    -> (sides: [String: Int], reduced: Bool)
  {
    var sides = artwork.plan(scene, scale: scale)
    for id in sides.keys where !embedsOriginal(artwork.original(id)) {
      sides[id] = artwork.effectiveSide(id, NativeHandoffArtwork.minimumStillSide)
    }
    return artwork.fit(sides, budget: budget)
  }

  /// The slide's working set apart from decoded artwork.
  private static func workingBytes(scene: ResolvedPrototype, embeddedBytes: Int) -> Int {
    Int(scene.canvas.width) * Int(scene.canvas.height) * 4
      * (scene.imageLayers.count * 2 + (textGuideFrame(scene: scene) == nil ? 8 : 12)) + embeddedBytes * 4
  }

  private static func writeSlide(slide: DeckSlide, canvas: DeckCanvas, staged: [String: URL], cropToFrames: Bool, to output: URL,
    scene resolved: ResolvedPrototype?, sides planned: [String: Int]?, filenames: [String: String], cache: NativeHandoffArtwork)
    throws -> [String]
  {
    guard supports(canvas) else {
      throw failure("PSD export supports 1920 × 1080 and 2576 × 1080 slides.")
    }
    guard !FileManager.default.fileExists(atPath: output.path) else {
      throw failure("The PSD already exists. Choose a new handoff folder; existing artwork was not replaced.")
    }
    let width = Int(canvas.width), height = Int(canvas.height)
    let scene = resolved ?? NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
    let textGuide = textGuideFrame(scene: scene)
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
        throw failure("\(filenames[id] ?? url.lastPathComponent) is not a regular image within the 128 MB PSD source budget.")
      }
      embeddedBytes += size
    }
    // Decoded artwork counts too: each asset at the size it is decoded for.
    let base = workingBytes(scene: scene, embeddedBytes: embeddedBytes)
    let sides = planned ?? artworkSides(scene: scene, artwork: cache, budget: maximumWorkingBytes - base).sides
    func side(_ id: String) -> Int { sides[id] ?? NativeHandoffArtwork.minimumStillSide }
    let estimated = base + seen.reduce(0) { $0 + cache.estimatedBytes($1, side: side($1)) }
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
    var configuration: [String: Any] = [
      "width": width, "height": height, "guides": guides, "cropToFrames": cropToFrames,
      "sharedID": uuid(), "instanceIDs": [uuid(), uuid()],
    ]
    var startArguments: [Any] = []
    if let frame = textGuide {
      let guide = try textGuidePixels(scene: scene, region: frame, canvas: CGRect(x: 0, y: 0, width: width, height: height), colorSpace: colorSpace)
      configuration["textGuideRect"] = [Int(guide.rect.minX), Int(guide.rect.minY), Int(guide.rect.width), Int(guide.rect.height)]
      startArguments = [try host.bytes(guide.boxes), try host.bytes(guide.copy)]
    }
    let startPrefix: [Any] = [try json(configuration), try host.bytes(profile as Data)]
    _ = try host.call("start", arguments: startPrefix + startArguments)
    let composite = try Bitmap(width: width, height: height, colorSpace: colorSpace)
    var sourceIDs: [String: String] = [:]
    var prepared: [String: Artwork] = [:]
    var issues: [String] = []
    for (index, layer) in scene.imageLayers.enumerated() {
      try Task.checkCancellation()
      guard let assetID = layer.assetID else {
        issues.append("\(slide.title): \(layer.role) is empty; the shared artwork remains editable.")
        continue
      }
      guard let url = staged[assetID] else { throw failure("Chosen artwork for \(layer.role) is unavailable.") }
      try autoreleasepool {
        // Each asset is prepared once per slide; its decode comes from the
        // export's shared cache, at the size this slide's placements need.
        let source: Artwork
        if let ready = prepared[assetID] { source = ready } else {
          source = try loadArtwork(id: assetID, url: url, side: side(assetID),
            filename: filenames[assetID] ?? url.lastPathComponent, cache: cache)
          prepared[assetID] = source
        }
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
        // The full original remains embedded in both modes. Only the optional
        // framing mask and visible composite change; placement stays identical.
        composite.draw(source.image, placement: placement, clip: cropToFrames ? layer.frame : nil)
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

  /// The guide follows the text region, but exists only if rendered copy uses it.
  /// Empty fields, image-only slides and entirely overset text get no placeholder.
  static func textGuideFrame(scene: ResolvedPrototype) -> CGRect? {
    let canvas = CGRect(x: 0, y: 0, width: scene.canvas.width, height: scene.canvas.height)
    let region = scene.textRegion
    guard [region.minX, region.minY, region.width, region.height].allSatisfy({ $0.isFinite }),
      region.width > 0, region.height > 0, region.intersects(canvas),
      scene.texts.contains(where: { placement in
        guard placement.frame.intersects(canvas), placement.visible.location >= 0,
          placement.visible.length > 0, placement.visible.location < placement.content.length else { return false }
        let range = NSRange(location: placement.visible.location,
          length: min(placement.visible.length, placement.content.length - placement.visible.location))
        return !(placement.content.string as NSString).substring(with: range)
          .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      }) else { return nil }
    return region
  }

  /// Inside Shared Artwork, a hidden guide shows the slide's writing exactly as
  /// Workbench sets it, over its text boxes, so artwork can be extended and
  /// placed around the real copy. Both layers share one rectangle.
  private static func textGuidePixels(scene: ResolvedPrototype, region: CGRect, canvas: CGRect, colorSpace: CGColorSpace)
    throws -> (rect: CGRect, boxes: Data, copy: Data)
  {
    let frames = scene.texts.map(\.frame).filter { $0.intersects(canvas) }
    let covered = frames.reduce(region) { $0.union($1) }.insetBy(dx: -3, dy: -3).intersection(canvas).integral
    guard !covered.isNull, covered.width >= 1, covered.height >= 1 else { throw failure("The text guide has no area on the canvas.") }
    let boxes = try Bitmap(width: Int(covered.width), height: Int(covered.height), colorSpace: colorSpace)
    boxes.context.translateBy(x: -covered.minX, y: -covered.minY)
    drawTextBoxes(region: region, frames: frames, in: boxes.context)
    let copy = try Bitmap(width: Int(covered.width), height: Int(covered.height), colorSpace: colorSpace)
    copy.context.translateBy(x: -covered.minX, y: -covered.minY)
    NativeSlideRenderer.drawCopy(scene, in: copy.context)
    return (covered, boxes.straightRGBA(), copy.straightRGBA())
  }
  /// Each text box outlined and lightly filled; the whole text region dashed.
  private static func drawTextBoxes(region: CGRect, frames: [CGRect], in context: CGContext) {
    let cyan = CGColor(srgbRed: 64 / 255, green: 184 / 255, blue: 1, alpha: 1)
    context.saveGState()
    defer { context.restoreGState() }
    context.setStrokeColor(cyan.copy(alpha: 0.85) ?? cyan)
    context.setLineWidth(1.5)
    context.setLineDash(phase: 0, lengths: [8, 6])
    context.stroke(region.insetBy(dx: 0.75, dy: 0.75))
    context.setLineDash(phase: 0, lengths: [])
    for frame in frames {
      context.setFillColor(cyan.copy(alpha: 0.14) ?? cyan)
      context.fill(frame)
      context.setStrokeColor(cyan)
      context.setLineWidth(2)
      context.stroke(frame.insetBy(dx: 1, dy: 1))
    }
  }
  /// The guide group as it looks with its eye on, over a grey stand-in for
  /// the artwork, for proof receipts. Nil when the slide has no guide.
  static func textGuidePreview(scene: ResolvedPrototype) throws -> Data? {
    guard let region = textGuideFrame(scene: scene), let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
    let canvas = CGRect(x: 0, y: 0, width: scene.canvas.width, height: scene.canvas.height)
    let bitmap = try Bitmap(width: Int(canvas.width), height: Int(canvas.height), colorSpace: colorSpace)
    bitmap.context.setFillColor(CGColor(gray: 0.32, alpha: 1))
    bitmap.context.fill(canvas)
    drawTextBoxes(region: region, frames: scene.texts.map(\.frame).filter { $0.intersects(canvas) }, in: bitmap.context)
    NativeSlideRenderer.drawCopy(scene, in: bitmap.context)
    guard let image = bitmap.context.makeImage() else { return nil }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(destination, image, nil)
    return CGImageDestinationFinalize(destination) ? data as Data : nil
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

  /// `filename` is the original's own name (not its staged, hash-suffixed one),
  /// as the layer, Smart Object and warnings show it.
  private static func loadArtwork(id: String, url: URL, side: Int, filename: String, cache: NativeHandoffArtwork) throws -> Artwork {
    try Task.checkCancellation()
    guard let decoded = try cache.image(id, side: side) else {
      throw failure("\(filename) could not be rendered as artwork. No substitute image was invented.")
    }
    let image = decoded.image
    switch decoded.kind {
    case .raster:
      let original = cache.original(id)
      if let fileType = embeddedTypes[original.type], original.count == 1 {
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard data.count <= maximumEmbeddedBytes else { throw failure("The source changed or exceeded its PSD byte budget.") }
        // The placement uses the original's upright pixels, never the decode's.
        let size = original.size ?? CGSize(width: image.width, height: image.height)
        return Artwork(image: image, bytes: data, width: Double(size.width), height: Double(size.height),
          filename: filename, fileType: fileType, warning: nil)
      }
      return try still(image: image, filename: filename,
        warning: "\(filename) uses a PNG of its first image in the PSD. Export Approved Media to retain its original file.")
    case .pdf:
      return try still(image: image, filename: filename,
        warning: "\(filename) uses a PNG of page 1 in the PSD. Export Approved Media to retain the PDF.")
    case .video:
      return try still(image: image, filename: filename,
        warning: "\(filename) uses its opening video frame in the PSD. Export Approved Media to retain the video.")
    }
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
