import AppKit
import CoreGraphics
import Foundation
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// Window screenshots for visual review. The compositor capture includes
/// native List and material layers that NSView caching omits.
enum NativeWindowCapture {
  /// Returns how the image was made: "WindowServer", or a partial fallback.
  @MainActor @discardableResult
  static func capture(_ window: NSWindow, to url: URL, settle: Duration = .milliseconds(350)) async throws -> String {
    try await Task.sleep(for: settle)
    guard let view = window.contentView else { throw WorkbenchFailure(name: "CaptureFailure", message: "No native window content") }
    view.layoutSubtreeIfNeeded(); view.displayIfNeeded()
    let number = window.windowNumber
    let captured = await Task.detached(priority: .utility) {
      let process = Process()
      process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
      process.arguments = ["-x", "-o", "-l", String(number), url.path]
      process.standardOutput = FileHandle.nullDevice
      process.standardError = FileHandle.nullDevice
      do { try process.run(); process.waitUntilExit(); return process.terminationStatus == 0 }
      catch { return false }
    }.value
    if captured, CGImageSourceCreateWithURL(url as CFURL, nil) != nil { return "WindowServer" }
    guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
      throw WorkbenchFailure(name: "CaptureFailure", message: "Native window capture failed")
    }
    view.cacheDisplay(in: view.bounds, to: bitmap)
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
      throw WorkbenchFailure(name: "CaptureFailure", message: "Native window image could not be written")
    }
    let partial = url.deletingLastPathComponent().appendingPathComponent(url.deletingPathExtension().lastPathComponent + "-partial.png")
    try data.write(to: partial)
    return "partial NSView fallback"
  }
}

@MainActor
final class NativeUIGalleryDelegate: NSObject, NSApplicationDelegate {
  let output: URL
  init(output: URL) { self.output = output }
  func applicationDidFinishLaunching(_ notification: Notification) {
    Task {
      do {
        try await NativeUIGallery.run(output: output)
        print("NATIVE_UI_GALLERY_DONE")
        fflush(stdout)
        exit(0)
      } catch {
        fputs("NATIVE_UI_GALLERY_FAILED: \(error)\n", stderr)
        fflush(stderr)
        exit(1)
      }
    }
  }
}

/// Every main screen and sheet of the real app, with a realistic deck and
/// photo-like media, for visual review in CI artifacts. It drives the same
/// controller and views as the app; nothing here is a mockup.
@MainActor
enum NativeUIGallery {
  private static var captured: [String: String] = [:]

  static let deckMarkdown = """
    # The Lighthouse Keeper

    Canvas: cinemascope-2576x1080

    ## The Lighthouse Keeper

    ### Headline

    The Lighthouse Keeper

    ### Subheadline

    A feature film in three tides

    ## Logline

    ### Headline

    Every light she keeps burning brings a stranger home.

    ### Body

    On a storm-cut island, a reclusive keeper discovers that each ship she guides to shore carries someone she lost.

    ## The World

    ### Headline

    An island at the edge of the map

    ### Body

    Salt, granite and a lamp that has not gone dark in ninety years. The village below remembers everything; the sea remembers more.

    ### Caption

    Reference: North Atlantic light stations, 1950s.

    ## Mara

    ### Headline

    Mara Quill, 54

    ### Subheadline

    Keeper. Cartographer. Unwilling host.

    ### Body

    She has measured every rock on the island and none of her grief. The lamp is the only promise she still keeps.

    ## Tone

    ### Headline

    Quiet, luminous, unafraid of the dark

    ### Body

    Long takes, natural light, a score of wind and brass. Tender before it is frightening.

    ## Visual Language

    ### Headline

    Light as memory

    ### Body

    Every flashback is lit by the lamp's rotation: two seconds of gold, eight seconds of night.

    ## Story

    ### Headline

    Three tides

    ### Body

    Arrival. Return. Release. Each tide brings one ship and one truth Mara has avoided.

    ## Why Now

    ### Headline

    Grief, guided home

    ### Body

    A story for anyone who has kept a light on for someone who is not coming back.

    ## Team

    ### Headline

    Made by people who grew up by the sea

    ### Body

    Writer-director, producer and cinematographer from three coastal towns, with two features and a festival short between them.

    ## Thank you

    ### Headline

    Thank you

    ### Subheadline

    hello@example.com
    """

  static func run(output: URL) async throws {
    let manager = FileManager.default
    try manager.createDirectory(at: output, withIntermediateDirectories: true)
    let root = manager.temporaryDirectory.appendingPathComponent("Workbench-ui-gallery-\(UUID().uuidString)", isDirectory: true)
    try manager.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? manager.removeItem(at: root) }
    let mediaURL = root.appendingPathComponent("Lighthouse references", isDirectory: true)
    try manager.createDirectory(at: mediaURL, withIntermediateDirectories: false)
    for (index, scene) in NativeGalleryScene.all.enumerated() {
      try scene.write(to: mediaURL.appendingPathComponent(String(format: "%02d %@.jpg", index + 1, scene.name)))
    }

    let controller = try NativeWorkbenchController()
    let originalTheme = controller.theme, originalScale = controller.interfaceScale, originalWidth = controller.contextWidth
    defer {
      controller.theme = originalTheme; controller.interfaceScale = originalScale; controller.contextWidth = originalWidth
      NativeSheetMetrics.screenSize = nil
    }
    controller.theme = "light"; controller.interfaceScale = 1; controller.contextWidth = 320
    NativeSheetMetrics.screenSize = CGSize(width: 1680, height: 1050)
    let window = NativeGalleryWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
      styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView], backing: .buffered, defer: false)
    window.title = "Workbench"
    // CI displays are often 1024 × 768; keep the intended size off screen.
    window.setFrame(window.frameRect(forContentRect: NSRect(x: 0, y: 0, width: 1440, height: 900)), display: false)
    window.contentView = NSHostingView(rootView: NativeWorkbenchRoot(controller: controller))
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)

    func shot(_ name: String, settle: Duration = .milliseconds(700)) async throws {
      captured[name] = try await NativeWindowCapture.capture(window, to: output.appendingPathComponent(name + ".png"), settle: settle)
    }
    // Sheets are drawn in their own window at their designed size: a sheet
    // attached to a window larger than a small CI display captures clipped.
    func sheetShot<Sheet: View>(_ name: String, _ sheet: Sheet) async throws {
      let host = NSHostingView(rootView: sheet.workbenchText(.body).environment(\.workbenchInterfaceScale, controller.interfaceScale))
      let size = host.fittingSize
      let panel = NativeGalleryWindow(contentRect: NSRect(origin: .zero, size: size),
        styleMask: [.titled, .fullSizeContentView], backing: .buffered, defer: false)
      panel.titlebarAppearsTransparent = true
      panel.titleVisibility = .hidden
      panel.contentView = host
      panel.setFrame(panel.frameRect(forContentRect: NSRect(origin: .zero, size: size)), display: true)
      // Key, so controls draw as they do in an attached sheet.
      panel.makeKeyAndOrderFront(nil)
      defer { panel.orderOut(nil); window.makeKeyAndOrderFront(nil) }
      captured[name] = try await NativeWindowCapture.capture(panel, to: output.appendingPathComponent(name + ".png"), settle: .milliseconds(800))
    }
    func settle() async { await controller.flush(); try? await Task.sleep(for: .milliseconds(300)) }

    // Welcome, before any deck.
    try await shot("01-welcome")
    let imported = try NativeCopyImport.parse(Data(deckMarkdown.utf8), filename: "The Lighthouse Keeper.md")
    try await sheetShot("02-import-sheet", NativeImportSheet(controller: controller, imported: imported))

    // A deck with copy but no media yet.
    let deckURL = root.appendingPathComponent("The Lighthouse Keeper.pitchdeck", isDirectory: true)
    let initial = try await controller.session.create(at: deckURL, seed: imported.checkpoint())
    controller.document = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: initial)
    controller.selectSlide(controller.slides[1].id)
    controller.phase = "curate"
    try await shot("03-curate-no-media", settle: .milliseconds(1800))
    captured["03-thumbnails-rendered"] = "\(controller.thumbnails.images.count) of \(controller.slides.count)"
    if let thumb = controller.thumbnails.images[controller.slides[1].id], let data = thumb.tiffRepresentation,
      let png = NSBitmapImageRep(data: data)?.representation(using: .png, properties: [:]) {
      try png.write(to: output.appendingPathComponent("03-thumbnail-slide-02.png"))
      captured["03-thumbnail-size"] = "\(thumb.size.width)x\(thumb.size.height)"
    }

    let media = try await controller.session.mediaSession()
    _ = try await media.authorizeRootJSON(mediaURL)
    await controller.refreshCatalog()
    // Choose artwork for most slides, with shortlists, so the deck reads as in progress.
    let assets = controller.filteredAssets.map(\.id)
    let slides = controller.slides.map(\.id)
    for (index, slideID) in slides.enumerated() where index < slides.count - 2 {
      controller.selectSlide(slideID)
      let pick = assets[index % assets.count]
      controller.focusAsset(pick)
      controller.decide("use", assetID: pick)
      controller.decide("shortlist", assetID: assets[(index + 5) % assets.count])
    }
    await settle()
    // Variety in layouts and appearance, as a real deck has.
    let layouts: [(Int, String)] = [(2, "lower"), (3, "right"), (5, "wide"), (6, "two-images"), (8, "text-only")]
    for (index, preset) in layouts where index < slides.count { controller.chooseLayout(preset, id: slides[index]) }
    await settle()
    controller.selectSlide(slides[6])
    controller.decide("use", assetID: assets[9], role: "primary:2")
    await settle()
    controller.selectSlide(slides[0])
    controller.applyStarterStyle(["starterType": try nativeObject({ () -> NativeStarterType in
      var type = NativeStarterType.standard
      type.useFonts(head: "pd-head-Medium", sub: "pd-body-600", body: "pd-body-400")
      return type
    }())], allSlides: true)
    await settle()
    controller.selectSlide(slides[4])
    controller.patchLayout(["appearance": "light"], id: slides[4])
    await settle()

    controller.selectSlide(slides[1])
    controller.phase = "curate"
    if let first = controller.filteredAssets.first?.id { controller.focusAsset(first) }
    try await shot("04-curate")
    controller.preview(controller.filteredAssets.dropFirst(2).first?.id)
    try await shot("05-curate-preview")
    controller.previewOpen = false

    controller.phase = "assemble"
    controller.selectSlide(slides[1]); controller.selectionTarget = "text"; controller.fitCanvas()
    try await shot("06-assemble", settle: .milliseconds(1200))
    controller.selectSlide(slides[3]); controller.selectionTarget = "gradient"; controller.fitCanvas()
    try await shot("07-assemble-gradient")
    controller.selectSlide(slides[6]); controller.selectionTarget = "primary"; controller.fitCanvas()
    try await shot("08-assemble-two-images")
    controller.selectSlide(slides[1]); controller.selectionTarget = "text"
    controller.setNotes("Open on the lamp turning; hold two beats of dark before the line lands. Keep the sea out of focus.", slideID: slides[1])
    await settle()
    controller.startCleanPreview()
    try await shot("09-review")
    controller.reviewNotes = true
    try await shot("09b-review-notes")
    controller.reviewNotes = false
    controller.endCleanPreview()

    try await sheetShot("10-export-sheet", NativeExportSheet(controller: controller))
    try await sheetShot("11-type-and-colours", NativeStarterStyleSheet(controller: controller))
    if let slide = controller.slides.first(where: { $0.id == slides[1] }) {
      try await sheetShot("12-copy-editor", NativeCopyEditor(controller: controller, slide: slide))
    }
    try await sheetShot("13-settings", NativeSettingsView(controller: controller))
    try await sheetShot("19-shortcuts", NativeShortcutSheet(controller: controller))
    try await sheetShot("20-apply-arrangement", NativeApplyLayoutSheet(controller: controller))
    try await sheetShot("21-moodboard", NativeMoodboardSheet(controller: controller))
    // One sheet presented for real, to check the attached-sheet path renders.
    controller.showExport = true
    try await Task.sleep(for: .milliseconds(900))
    captured["10b-export-attached"] = window.attachedSheet == nil ? "no sheet presented" : "presented"
    controller.showExport = false
    try await Task.sleep(for: .milliseconds(400))
    controller.phase = "curate"
    controller.compareIDs = Array(controller.filteredAssets.prefix(3).map(\.id))
    controller.comparedAssetID = controller.compareIDs.first
    controller.compareOpen = true
    try await shot("22-compare")
    controller.compareOpen = false
    controller.compareIDs = []

    controller.theme = "dark"
    controller.phase = "curate"
    try await shot("14-curate-dark", settle: .milliseconds(900))
    controller.phase = "assemble"; controller.fitCanvas()
    try await shot("15-assemble-dark", settle: .milliseconds(1400))
    controller.theme = "light"

    window.setFrame(window.frameRect(forContentRect: NSRect(x: 0, y: 0, width: 1100, height: 720)), display: true)
    controller.fitCanvas()
    try await shot("16-assemble-compact", settle: .milliseconds(900))
    controller.phase = "curate"
    try await shot("17-curate-compact")
    window.setFrame(window.frameRect(forContentRect: NSRect(x: 0, y: 0, width: 1440, height: 900)), display: true)
    controller.interfaceScale = 1.5
    controller.phase = "assemble"; controller.fitCanvas()
    try await shot("18-assemble-large-text", settle: .milliseconds(900))
    controller.interfaceScale = 1

    captured["end-thumbnails-rendered"] = "\(controller.thumbnails.images.count) of \(controller.slides.count)"
    try JSONSerialization.data(withJSONObject: captured, options: [.prettyPrinted, .sortedKeys])
      .write(to: output.appendingPathComponent("gallery.json"))
    try await controller.session.close()
    window.orderOut(nil)
  }
}

/// A window that keeps its requested size on a small display; the
/// WindowServer capture includes the part beyond the screen edge.
final class NativeGalleryWindow: NSWindow {
  override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

/// Procedural landscape "photographs": sky, sun, layered hills and a light,
/// so media grids and slides are judged with photo-like content.
struct NativeGalleryScene {
  let name: String
  let sky: (CGColor, CGColor)
  let land: [CGColor]
  let sun: CGColor?
  let sunPosition: CGPoint
  let portrait: Bool
  var beam = false
  var stars = false

  static func rgb(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
  }
  static let all: [NativeGalleryScene] = [
    .init(name: "Storm light", sky: (rgb(0x2B3A55), rgb(0xC9B79C)), land: [rgb(0x3D4A5C), rgb(0x232B36), rgb(0x12161C)], sun: rgb(0xFFE7B0), sunPosition: CGPoint(x: 0.72, y: 0.62), portrait: false, beam: true),
    .init(name: "Harbour dawn", sky: (rgb(0xF6B48F), rgb(0xFCE3C4)), land: [rgb(0x8C6B73), rgb(0x5C4352), rgb(0x2E2230)], sun: rgb(0xFFF4D6), sunPosition: CGPoint(x: 0.3, y: 0.55), portrait: false),
    .init(name: "Night lamp", sky: (rgb(0x0B1026), rgb(0x2A3560)), land: [rgb(0x1C2340), rgb(0x10142A), rgb(0x05070F)], sun: rgb(0xFFF8E1), sunPosition: CGPoint(x: 0.62, y: 0.7), portrait: false, beam: true, stars: true),
    .init(name: "Granite cliffs", sky: (rgb(0x7FA6C4), rgb(0xE4EEF3)), land: [rgb(0x8D969B), rgb(0x5D666C), rgb(0x343A3E)], sun: nil, sunPosition: .zero, portrait: false),
    .init(name: "Keeper portrait", sky: (rgb(0x3A2E39), rgb(0xA77B6A)), land: [rgb(0x4A3A42), rgb(0x2B2128)], sun: rgb(0xFFD9A8), sunPosition: CGPoint(x: 0.5, y: 0.6), portrait: true),
    .init(name: "Fog bank", sky: (rgb(0xB7C2C7), rgb(0xE9EDEE)), land: [rgb(0xA3B0B4), rgb(0x7E8D92), rgb(0x56666C)], sun: rgb(0xF4F6F6), sunPosition: CGPoint(x: 0.8, y: 0.65), portrait: false),
    .init(name: "Golden tide", sky: (rgb(0xE07A3F), rgb(0xF9C979)), land: [rgb(0xB0563A), rgb(0x6E2F2A), rgb(0x2E1416)], sun: rgb(0xFFF1C1), sunPosition: CGPoint(x: 0.5, y: 0.5), portrait: false),
    .init(name: "Village roofs", sky: (rgb(0x5B7A8C), rgb(0xD8C3A5)), land: [rgb(0x7A5C4F), rgb(0x4E3B35), rgb(0x2A201D)], sun: nil, sunPosition: .zero, portrait: false),
    .init(name: "Ship lights", sky: (rgb(0x141A33), rgb(0x3E4A7A)), land: [rgb(0x232B52), rgb(0x0E1226)], sun: rgb(0xFFE3A3), sunPosition: CGPoint(x: 0.25, y: 0.42), portrait: false, stars: true),
    .init(name: "Brass and wind", sky: (rgb(0x6B4E2E), rgb(0xD9B26F)), land: [rgb(0x8C6A3B), rgb(0x5A4122), rgb(0x2B1E10)], sun: rgb(0xFFF0C8), sunPosition: CGPoint(x: 0.65, y: 0.58), portrait: true),
    .init(name: "Sea glass", sky: (rgb(0x3F8C8C), rgb(0xBFE3DD)), land: [rgb(0x2F7373), rgb(0x1E5050), rgb(0x0F2E2E)], sun: rgb(0xF2FFF8), sunPosition: CGPoint(x: 0.4, y: 0.66), portrait: false),
    .init(name: "Last ferry", sky: (rgb(0x5A3D66), rgb(0xF0A27A)), land: [rgb(0x6E4462), rgb(0x3F2640), rgb(0x1C1020)], sun: rgb(0xFFD7A0), sunPosition: CGPoint(x: 0.82, y: 0.52), portrait: false),
  ]

  func write(to url: URL) throws {
    let (width, height) = portrait ? (1600, 2000) : (2400, 1500)
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
      let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [sky.0, sky.1] as CFArray, locations: [0, 1])
    else { throw WorkbenchFailure(name: "GalleryFailure", message: "Could not draw a gallery image") }
    let w = CGFloat(width), h = CGFloat(height)
    context.drawLinearGradient(gradient, start: CGPoint(x: 0, y: h), end: CGPoint(x: 0, y: h * 0.25), options: [.drawsAfterEndLocation])
    if stars {
      var seed: UInt32 = 7
      for _ in 0..<220 {
        seed = seed &* 1_664_525 &+ 1_013_904_223
        let x = CGFloat(seed % UInt32(width)); seed = seed &* 1_664_525 &+ 1_013_904_223
        let y = h * 0.45 + CGFloat(seed % UInt32(height / 2))
        context.setFillColor(CGColor(gray: 1, alpha: 0.35 + CGFloat(seed % 50) / 100))
        context.fillEllipse(in: CGRect(x: x, y: y, width: 3, height: 3))
      }
    }
    if let sun {
      let center = CGPoint(x: w * sunPosition.x, y: h * sunPosition.y)
      if let glow = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
        colors: [sun.copy(alpha: 0.75)!, sun.copy(alpha: 0)!] as CFArray, locations: [0, 1]) {
        context.drawRadialGradient(glow, startCenter: center, startRadius: 0, endCenter: center, endRadius: w * 0.28, options: [])
      }
      context.setFillColor(sun)
      context.fillEllipse(in: CGRect(x: center.x - w * 0.035, y: center.y - w * 0.035, width: w * 0.07, height: w * 0.07))
      if beam {
        context.saveGState()
        context.setFillColor(sun.copy(alpha: 0.22)!)
        context.move(to: center)
        context.addLine(to: CGPoint(x: 0, y: center.y + h * 0.18))
        context.addLine(to: CGPoint(x: 0, y: center.y - h * 0.06))
        context.closePath(); context.fillPath()
        context.restoreGState()
      }
    }
    for (layer, color) in land.enumerated() {
      let base = h * (0.42 - CGFloat(layer) * 0.12)
      let path = CGMutablePath()
      path.move(to: CGPoint(x: 0, y: 0))
      path.addLine(to: CGPoint(x: 0, y: base))
      let steps = 9
      for step in 1...steps {
        let x = w * CGFloat(step) / CGFloat(steps)
        let wave = sin(CGFloat(step) * (1.3 + CGFloat(layer) * 0.7) + CGFloat(name.count)) * h * (0.06 + CGFloat(layer) * 0.015)
        path.addQuadCurve(to: CGPoint(x: x, y: base + wave), control: CGPoint(x: x - w / CGFloat(steps * 2), y: base + wave * 1.6))
      }
      path.addLine(to: CGPoint(x: w, y: 0))
      path.closeSubpath()
      context.addPath(path)
      context.setFillColor(color)
      context.fillPath()
    }
    if beam {
      // A small lighthouse on the nearest ridge.
      let x = w * 0.72, y = h * 0.3
      context.setFillColor(CGColor(gray: 0.92, alpha: 1))
      context.fill(CGRect(x: x - w * 0.012, y: y, width: w * 0.024, height: h * 0.16))
      context.setFillColor(CGColor(srgbRed: 0.75, green: 0.18, blue: 0.16, alpha: 1))
      context.fill(CGRect(x: x - w * 0.012, y: y + h * 0.07, width: w * 0.024, height: h * 0.03))
    }
    guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
    else { throw WorkbenchFailure(name: "GalleryFailure", message: "Could not encode a gallery image") }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.88] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { throw WorkbenchFailure(name: "GalleryFailure", message: "Could not write a gallery image") }
  }
}
