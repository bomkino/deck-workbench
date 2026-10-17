import CoreGraphics
import Foundation

/// Layout and edit behaviour shared by the canvas, PDF and PSD, checked with
/// the packaged kernel.
enum NativeRenderingChecks {
  private static func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw WorkbenchFailure(name: "AcceptanceFailure", message: message) }
  }
  static func run() throws {
    guard let kernelURL = Bundle.main.url(forResource: "deck-kernel", withExtension: "js", subdirectory: "Kernel") else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Rendering checks need the packaged kernel.")
    }
    let kernel = try DeckKernelHost(kernelURL: kernelURL)
    try kernel.open(checkpoint: kernel.createInitialCheckpoint(seed: [
      "deckId": "rendering-deck", "sectionId": "part", "slideId": "first", "blockId": "head",
      "title": "Rendering", "initialHeadline": "Rendering"]))
    func snapshot() throws -> DeckDocumentSnapshot {
      try JSONDecoder().decode(DeckDocumentSnapshot.self, from: JSONSerialization.data(withJSONObject: kernel.query("native.document")))
    }
    func send(_ type: String, _ payload: [String: Any]) throws {
      _ = try kernel.commit(kernel.prepare(command: ["commandId": UUID().uuidString.lowercased(),
        "expectedRevision": try snapshot().revision, "type": type, "payload": payload,
        "source": ["kind": "ui"], "issuedAt": "2026-10-17T12:00:00Z"]))
    }
    // A slide from Add Slide has starter type and palette colours. Its own
    // gradient (palette background, uppercase in the palette) must be editable.
    try send("native.slide.add", ["slideId": "styled", "sectionId": "part", "afterSlideId": "first", "title": "Styled"])
    try send("native.slide.patch", ["slideId": "styled", "patch": ["layout": ["appearance": "light"]]])
    let styled = try snapshot().deck.slides.first { $0.id == "styled" }!
    let canvas = try snapshot().deck.canvasPreset
    guard var gradient = NativeSlideRenderer.resolve(slide: styled, canvas: canvas).gradient else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "A styled slide had no gradient to edit")
    }
    gradient.colors = PrototypeColors(start: "#FFF8EE", end: "#FFF8EE")
    gradient.opacity = 0.5
    try send("native.slide.patch", ["slideId": "styled", "patch": ["layout": ["gradient": try nativeObject(gradient)]]])
    let saved = try snapshot().deck.slides.first { $0.id == "styled" }!.settings.layout.gradient
    try require(saved?.opacity == 0.5 && saved?.colors?.start == "#fff8ee", "A gradient edit on a styled slide was refused or not stored canonically")

    // Square and portrait canvases keep copy clear of the image band and
    // under the gradient's darkened side.
    for (id, width, height) in [("square-2160x2160", 2160.0, 2160.0), ("a4-portrait", 2480.0, 3508.0)] {
      let narrow = DeckCanvas(id: id, width: width, height: height)
      for preset in ["two-images", "three-images", "left", "right", "lower"] {
        var slide = styled
        slide.native?.layout.preset = preset
        slide.native?.layout.textFrame = nil
        slide.native?.layout.gradient = nil
        let scene = NativeSlideRenderer.resolve(slide: slide, canvas: narrow)
        if preset.hasSuffix("images") {
          let imagesEnd = scene.imageLayers.map(\.frame.maxY).max() ?? 0
          try require(scene.textRegion.minY >= imagesEnd, "\(preset) copy overlaps its images on \(id)")
        } else {
          try require(scene.textRegion.minY > height / 3 && scene.gradient?.start.y == 1, "\(preset) copy is not over the darkened area on \(id)")
        }
      }
    }

    // Moving snaps either edge to a guide; a bleed keeps its size.
    let grid = NativeSlideGrid(canvas: canvas)
    let lastGuide = NativeLayoutGeometry.xGuides(canvas).filter { $0 < canvas.width }.max()!
    let frame = CGRect(x: 1000, y: 200, width: 530, height: 400)
    let moved = NativeLayoutGeometry.draggedFrame(frame, dx: lastGuide - 3 - frame.maxX, dy: 0, resize: false, canvas: canvas, snapTolerance: 12)
    try require(abs(moved.maxX - lastGuide) < 0.001 && moved.width == frame.width, "Moving did not snap the right edge to the margin guide")
    let bleed = CGRect(x: -400, y: -100, width: canvas.width + 800, height: canvas.height + 200)
    let shifted = NativeLayoutGeometry.draggedFrame(bleed, dx: 30, dy: 0, resize: false, canvas: canvas, snapTolerance: nil)
    try require(shifted.size == bleed.size && shifted.minX == -370, "Moving an oversized frame shrank it")
    let resized = NativeLayoutGeometry.draggedFrame(frame, dx: 4000, dy: 0, resize: true, canvas: canvas, snapTolerance: nil)
    try require(resized.maxX <= canvas.width && grid.usable.width > 0, "A resize grew past the canvas")

    // A downscaled preview never changes the crop shape of its original.
    let preview = CGContext(data: nil, width: 2048, height: 102, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!.makeImage()!
    try require(NativeSlideRenderer.sourceSize(preview, original: CGSize(width: 20000, height: 1000)) == CGSize(width: 20000, height: 1000),
      "A preview's rounded size replaced the original's")
    try require(NativeSlideRenderer.sourceSize(preview, original: CGSize(width: 1000, height: 1000)) == CGSize(width: 2048, height: 102),
      "A mismatched catalogue size distorted an image")
    let tiny = NativeSlideRenderer.imageRect(sourceWidth: 4000, sourceHeight: 3000, frame: CGRect(x: 0, y: 0, width: 800, height: 600),
      crop: PrototypeCrop(x: 0, y: 0, width: 1e-9, height: 1e-9), fit: "fill")
    try require(tiny.width.isFinite && tiny.width < 1e8, "A near-zero crop produced an unbounded placement")
  }
}
