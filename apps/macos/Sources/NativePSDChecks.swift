import CoreGraphics
import CryptoKit
import Darwin
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Small synthetic export artifacts for the actual packaged encoder and a
/// subsequent Photoshop inspection. These contain no client files or fonts.
enum NativePSDChecks {
  static func run(output: URL) throws {
    let manager = FileManager.default
    try manager.createDirectory(at: output, withIntermediateDirectories: true)
    let names = ["Slide 01.psd", "Slide 02.psd", "Slide 03.psd", "Slide 04.psd", "PSD proof.json"]
    for name in names where manager.fileExists(atPath: output.appendingPathComponent(name).path) {
      throw failure("Choose a fresh PSD proof directory; \(name) already exists.")
    }
    let temporary = manager.temporaryDirectory.appendingPathComponent("Workbench-PSD-sources-\(UUID().uuidString)", isDirectory: true)
    try manager.createDirectory(at: temporary, withIntermediateDirectories: false)
    defer { try? manager.removeItem(at: temporary) }
    let start = Date()
    let initialRSS = peakRSS()
    var records: [[String: Any]] = []
    var hashes: [String: String] = [:]
    var staged: [String: URL] = [:]
    var orientationFixture: [String: Any] = [:]
    var outputProtected = false
    var sourcesRemoved = false
    func removeSources() {
      try? manager.removeItem(at: temporary)
      sourcesRemoved = !manager.fileExists(atPath: temporary.path)
    }
    func receipt(status: String, problem: String? = nil) throws {
      var value: [String: Any] = [
        "format": "pitchdog.native-psd-proof/1",
        "commit": Bundle.main.object(forInfoDictionaryKey: "DeckWorkbenchCommit") ?? "unknown",
        "status": status, "elapsedSeconds": Date().timeIntervalSince(start), "exports": records,
        "fixtureSourceSHA256": hashes, "sourceFilesRemovedAfterRun": sourcesRemoved,
        "orientationFixture": orientationFixture,
        "embeddedOriginalVerification": "Encoder reads back and compares every embedded source byte.",
        "existingOutputProtected": outputProtected,
        "processLifetimePeakRSSBytesAtStart": initialRSS, "processLifetimePeakRSSBytesAtEnd": peakRSS(),
        "photoshopVisualInspection": "Pending: inspect cropping, colour, shared-content updates and guide visibility.",
      ]
      if let problem { value["error"] = problem }
      let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
      try data.write(to: output.appendingPathComponent("PSD proof.json"), options: .withoutOverwriting)
    }
    do {
      for index in 1...12 {
        try Task.checkCancellation()
        let id = "synthetic-\(index)"
        let url = temporary.appendingPathComponent(String(format: "Artwork %02d.png", index))
        try fixture(index: index, transparent: index == 2, to: url)
        staged[id] = url
        hashes[id] = try sha256(url)
      }
      let jpeg = temporary.appendingPathComponent("Artwork 13 - EXIF 6.jpg")
      try fixture(index: 13, transparent: false, to: jpeg, jpegOrientation: 6)
      guard let jpegSource = CGImageSourceCreateWithURL(jpeg as CFURL, nil),
        let jpegProperties = CGImageSourceCopyPropertiesAtIndex(jpegSource, 0, nil) as? [CFString: Any],
        (jpegProperties[kCGImagePropertyOrientation] as? NSNumber)?.intValue == 6,
        (jpegProperties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue == 320,
        (jpegProperties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue == 200,
        let oriented = NativeSlideRenderer.imageFromStagedURL(jpeg), oriented.width == 200, oriented.height == 320 else {
        throw failure("The JPEG orientation fixture did not retain raw 320 × 200 pixels, EXIF 6 and an upright 200 × 320 preview.")
      }
      staged["synthetic-exif"] = jpeg
      hashes["synthetic-exif"] = try sha256(jpeg)
      orientationFixture = [
        "source": jpeg.lastPathComponent, "rawWidth": 320, "rawHeight": 200, "exifOrientation": 6,
        "displayedWidth": oriented.width, "displayedHeight": oriented.height,
        "sha256": hashes["synthetic-exif"]!,
        "redrawCheck": "Slide 04: open Shared Artwork, then Edit Contents of its nested JPEG. Force a reversible edit, save the JPEG, then save Shared Artwork. Compare both outer roles: fit and cropped placements must retain orientation and position. Saving an unchanged Shared Artwork alone may reuse cached pixels.",
      ]
      let scope = DeckCanvas(id: "cinemascope", width: 2576, height: 1080)
      let wide = DeckCanvas(id: "widescreen", width: 1920, height: 1080)
      var cropped = slide(id: "cropped", title: "Cropped image and transparent artwork", count: 2, preset: "two-images")
      cropped.native!.layout.frames = [
        "primary": PrototypeFrame(x: 96, y: 64, width: 1184, height: 952),
        "primary:2": PrototypeFrame(x: 1296, y: 64, width: 1184, height: 952),
      ]
      cropped.native!.layout.crops["primary"] = PrototypeCrop(x: 0.18, y: 0.1, width: 0.46, height: 0.7)
      cropped.native!.layout.imageFits["primary:2"] = "fit"
      let blank = slide(id: "blank", title: "Empty editable shared artwork", count: 0, preset: "text-only")
      var moodboard = slide(id: "moodboard", title: "Twelve numbered images", count: 12, preset: "moodboard")
      moodboard.native!.layout.imageCount = 12
      for index in 0..<12 {
        let role = index == 0 ? "primary" : "primary:\(index + 1)"
        moodboard.native!.layout.frames[role] = PrototypeFrame(
          x: 72 + Double(index % 4) * 447, y: 64 + Double(index / 4) * 320, width: 435, height: 312)
      }
      var exif = slide(id: "exif", title: "Rotated JPEG: fit and crop", count: 2, preset: "two-images")
      exif.mediaAssignments = [
        DeckMediaAssignment(id: "exif-fit", role: "primary", assetReferenceId: "synthetic-exif"),
        DeckMediaAssignment(id: "exif-crop", role: "primary:2", assetReferenceId: "synthetic-exif"),
      ]
      exif.native!.layout.frames = [
        "primary": PrototypeFrame(x: 72, y: 64, width: 882, height: 952),
        "primary:2": PrototypeFrame(x: 966, y: 64, width: 882, height: 952),
      ]
      exif.native!.layout.imageFits["primary"] = "fit"
      exif.native!.layout.crops["primary:2"] = PrototypeCrop(x: 0.1, y: 0.25, width: 0.55, height: 0.65)
      let cases: [(DeckSlide, DeckCanvas, String, Int)] = [
        (cropped, scope, names[0], 2), (blank, wide, names[1], 0),
        (moodboard, wide, names[2], 12), (exif, wide, names[3], 2),
      ]
      for (slide, canvas, filename, expected) in cases {
        try Task.checkCancellation()
        let scene = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
        guard scene.imageLayers.count == expected else { throw failure("The proof scene did not resolve \(expected) image placements.") }
        let url = output.appendingPathComponent(filename)
        let warnings = try NativePSDExporter.write(slide: slide, canvas: canvas, staged: staged, to: url)
        var record: [String: Any] = [
          "file": filename, "width": canvas.width, "height": canvas.height,
          "chosenPlacements": expected, "sha256": try sha256(url),
          "bytes": try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0,
          "layout": try nativeObject(slide.settings.layout), "warnings": warnings,
          "innerGuides": 72, "outerGuides": 72,
        ]
        if filename == names[3] {
          record["expectedImageRects"] = scene.imageLayers.map { layer in
            let rect = NativeSlideRenderer.imageRect(sourceWidth: 200, sourceHeight: 320,
              frame: layer.frame, crop: layer.crop, fit: layer.fit)
            return ["role": layer.role, "x": rect.minX, "y": rect.minY,
              "width": rect.width, "height": rect.height] as [String: Any]
          }
        }
        records.append(record)
      }
      for (id, url) in staged {
        guard try sha256(url) == hashes[id] else { throw failure("A source fixture changed during export.") }
      }
      let first = output.appendingPathComponent(names[0])
      let before = try sha256(first)
      do {
        _ = try NativePSDExporter.write(slide: cropped, canvas: scope, staged: staged, to: first)
        throw failure("The existing-output guard allowed a second write.")
      } catch let error as WorkbenchFailure where error.name == "PSDExportFailed" && error.message.contains("already exists") {
        guard try sha256(first) == before else { throw failure("The existing PSD changed during the refusal check.") }
        outputProtected = true
      }
      removeSources()
      try receipt(status: "native-encoding-passed")
    } catch {
      removeSources()
      try? receipt(status: "failed", problem: String(describing: error))
      throw error
    }
  }

  private static func slide(id: String, title: String, count: Int, preset: String) -> DeckSlide {
    var settings = NativeSlideSettings.initial
    settings.layout.preset = preset
    return DeckSlide(id: id, intent: count == 0 ? "text-only" : "image-led", internalTitle: title,
      contentBlocks: [], mediaAssignments: (0..<count).map { index in
        DeckMediaAssignment(id: "\(id)-assignment-\(index)", role: index == 0 ? "primary" : "primary:\(index + 1)",
          assetReferenceId: "synthetic-\(index + 1)")
      }, designOptions: nil, activeDesignOptionId: nil, native: settings)
  }

  private static func fixture(index: Int, transparent: Bool, to output: URL, jpegOrientation: Int? = nil) throws {
    let width = 320, height = 200
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    for y in 0..<height {
      for x in 0..<width {
        let offset = (y * width + x) * 4
        let quadrant = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)
        let colors: [(Int, Int, Int)] = [(220, 45, 70), (50, 185, 100), (40, 110, 225), (220, 115, 40)]
        let color = colors[(quadrant + index - 1) % colors.count]
        let stripe = (x / 16 + index) % 3 == 0 ? 35 : 0
        pixels[offset] = UInt8(max(0, color.0 - stripe))
        pixels[offset + 1] = UInt8(max(0, color.1 - stripe))
        pixels[offset + 2] = UInt8(max(0, color.2 - stripe))
        let outside = (x - width / 2) * (x - width / 2) + (y - height / 2) * (y - height / 2) > 88 * 88
        pixels[offset + 3] = transparent ? (outside ? 0 : (x < width / 2 ? 128 : 255)) : 255
      }
    }
    // Seven-segment numerals avoid font availability or text rasterization
    // affecting the visual placement fixtures.
    let segments = [0: "abcedf", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd",
      6: "afgecd", 7: "abc", 8: "abcdefg", 9: "abfgcd"]
    let boxes: [Character: CGRect] = [
      "a": CGRect(x: 8, y: 0, width: 34, height: 8), "b": CGRect(x: 42, y: 8, width: 8, height: 34),
      "c": CGRect(x: 42, y: 50, width: 8, height: 34), "d": CGRect(x: 8, y: 84, width: 34, height: 8),
      "e": CGRect(x: 0, y: 50, width: 8, height: 34), "f": CGRect(x: 0, y: 8, width: 8, height: 34),
      "g": CGRect(x: 8, y: 42, width: 34, height: 8),
    ]
    let digits = Array(String(index))
    for (position, character) in digits.enumerated() {
      guard let digit = character.wholeNumberValue else { continue }
      for segment in segments[digit] ?? "" {
        guard let box = boxes[segment] else { continue }
        let originX = (width - digits.count * 64) / 2 + position * 64, originY = 54
        for y in Int(box.minY)..<Int(box.maxY) {
          for x in Int(box.minX)..<Int(box.maxX) {
            let offset = ((originY + y) * width + originX + x) * 4
            pixels[offset] = 255; pixels[offset + 1] = 255; pixels[offset + 2] = 255; pixels[offset + 3] = 255
          }
        }
      }
    }
    guard let space = CGColorSpace(name: CGColorSpace.sRGB),
      let provider = CGDataProvider(data: Data(pixels) as CFData),
      let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
        bytesPerRow: width * 4, space: space,
        bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.last.rawValue),
        provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent),
      let destination = CGImageDestinationCreateWithURL(output as CFURL,
        (jpegOrientation == nil ? UTType.png.identifier : UTType.jpeg.identifier) as CFString, 1, nil) else {
      throw failure("The synthetic artwork could not be prepared.")
    }
    let properties = jpegOrientation.map { orientation in
      let values: [CFString: Any] = [kCGImagePropertyOrientation: orientation, kCGImagePropertyDPIWidth: 72,
        kCGImagePropertyDPIHeight: 72, kCGImageDestinationLossyCompressionQuality: 0.96]
      return values as CFDictionary
    }
    CGImageDestinationAddImage(destination, image, properties)
    guard CGImageDestinationFinalize(destination) else { throw failure("The synthetic image could not be saved.") }
  }

  private static func sha256(_ url: URL) throws -> String {
    SHA256.hash(data: try Data(contentsOf: url, options: .mappedIfSafe)).map { String(format: "%02x", $0) }.joined()
  }
  private static func peakRSS() -> Int64 {
    var usage = rusage()
    return getrusage(RUSAGE_SELF, &usage) == 0 ? Int64(usage.ru_maxrss) : 0
  }
  private static func failure(_ message: String) -> WorkbenchFailure {
    WorkbenchFailure(name: "PSDProofFailed", message: message)
  }
}
