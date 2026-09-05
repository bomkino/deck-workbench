import AppKit
import SwiftUI

struct NativeCanvas: NSViewRepresentable {
  @ObservedObject var controller: NativeWorkbenchController
  func makeNSView(context: Context) -> PrototypeCanvasView {
    let view = PrototypeCanvasView()
    view.controller = controller
    return view
  }
  func updateNSView(_ view: PrototypeCanvasView, context: Context) { view.update(controller) }
}

@MainActor
final class PrototypeCanvasView: NSView {
  weak var controller: NativeWorkbenchController?
  private var slide: DeckSlide?
  private var canvas: DeckCanvas?
  private var scene: ResolvedPrototype?
  private var images: [String: CGImage] = [:]
  private var imageKeys: [String: String] = [:]
  private var imageTasks: [String: Task<Void, Never>] = [:]
  private var sceneKey = ""
  private var viewportRevision = -1
  private var currentDeckID: String?
  private var artboard = CGRect.zero
  private var pan = CGPoint.zero
  private var spaceHeld = false
  private var gesture:
    (
      slideID: String, deckID: String, target: String, mode: String, start: CGPoint, frame: CGRect,
      crop: PrototypeCrop, gradient: PrototypeGradient
    )?
  private var previewFrame: CGRect?
  private var previewCrop: PrototypeCrop?
  private var previewGradient: PrototypeGradient?
  override var acceptsFirstResponder: Bool { true }
  override init(frame: NSRect) {
    super.init(frame: frame)
    setAccessibilityElement(true)
    setAccessibilityRole(.group)
    setAccessibilityLabel("Prototype canvas")
    setAccessibilityHelp(
      "Use the inspector or arrow keys to adjust the selected element. Drag text to move. Drag an image to pan its crop; Command-drag moves its frame. Space-drag pans the view. Escape cancels a drag."
    )
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
  func update(_ controller: NativeWorkbenchController) {
    self.controller = controller
    let deckID = controller.document?.deck.deckId
    if viewportRevision != controller.viewportRevision || currentDeckID != deckID {
      viewportRevision = controller.viewportRevision; currentDeckID = deckID
      pan = .zero; spaceHeld = false; cancelGesture()
    }
    guard let slide = controller.selectedSlide, let canvas = controller.document?.deck.canvasPreset
    else {
      self.slide = nil
      scene = nil
      sceneKey = ""
      for task in imageTasks.values { task.cancel() }
      imageTasks = [:]; imageKeys = [:]; images = [:]
      needsDisplay = true
      return
    }
    var hasher = Hasher()
    hasher.combine(slide.id)
    hasher.combine(try? nativeJSON(slide.settings.layout))
    hasher.combine(try? nativeJSON(slide.copyBlocks))
    hasher.combine(try? nativeJSON(slide.mediaAssignments))
    hasher.combine(canvas.width)
    hasher.combine(canvas.height)
    let key = String(hasher.finalize())
    if key != sceneKey {
      sceneKey = key
      self.slide = slide
      self.canvas = canvas
      scene = controller.resolvedScene
      if gesture?.slideID != slide.id { cancelGesture() }
    }
    for id in slide.chosenIDs {
      guard let source = controller.sources[id] else {
        imageTasks.removeValue(forKey: id)?.cancel(); imageKeys[id] = nil; images[id] = nil
        continue
      }
      guard imageKeys[id] != source.cacheKey else { continue }
      images[id] = nil
      imageKeys[id] = source.cacheKey
      imageTasks[id]?.cancel()
      imageTasks[id] = Task { [weak self] in
        let data = await NativeThumbnailService.shared.data(for: source, longestSide: 2048)
        guard !Task.isCancelled, let self, self.imageKeys[id] == source.cacheKey else { return }
        self.images[id] = data.flatMap(NativeSlideRenderer.decodedImage)
        self.imageTasks[id] = nil
        self.needsDisplay = true
      }
    }
    for id in Set(imageKeys.keys).subtracting(slide.chosenIDs) {
      imageTasks.removeValue(forKey: id)?.cancel()
      images[id] = nil
      imageKeys[id] = nil
    }
    needsDisplay = true
  }
  override func draw(_ dirtyRect: NSRect) {
    NSColor.windowBackgroundColor.setFill()
    bounds.fill()
    guard var scene, let context = NSGraphicsContext.current?.cgContext, let controller else {
      return
    }
    let scale =
      max(
        0.02,
        min((bounds.width - 64) / scene.canvas.width, (bounds.height - 64) / scene.canvas.height))
      * controller.zoom
    artboard = CGRect(
      x: (bounds.width - scene.canvas.width * scale) / 2 + pan.x,
      y: (bounds.height - scene.canvas.height * scale) / 2 + pan.y,
      width: scene.canvas.width * scale, height: scene.canvas.height * scale)
    if let frame = previewFrame, let gesture, let slide, let canvas {
      if gesture.target == "text" {
        var copy = slide
        copy.native?.layout.textFrame = PrototypeFrame(frame)
        if gesture.mode == "move" {
          // Position changes do not require typesetting again for every pointer event.
          let dx = frame.minX - scene.textRegion.minX, dy = frame.minY - scene.textRegion.minY
          scene.textRegion = frame
          scene.texts = scene.texts.map { PrototypeTextPlacement(frame: $0.frame.offsetBy(dx: dx, dy: dy), content: $0.content, textFrame: $0.textFrame, visible: $0.visible) }
        } else { scene = NativeSlideRenderer.resolve(slide: copy, canvas: canvas) }
      } else {
        scene.imageLayers = scene.imageLayers.map {
          $0.role == gesture.target
            ? PrototypeImageLayer(
              role: $0.role, assetID: $0.assetID, frame: frame, crop: $0.crop, fit: $0.fit) : $0
        }
      }
    }
    if let crop = previewCrop, let target = gesture?.target {
      scene.imageLayers = scene.imageLayers.map {
        $0.role == target
          ? PrototypeImageLayer(
            role: $0.role, assetID: $0.assetID, frame: $0.frame, crop: crop, fit: $0.fit) : $0
      }
    }
    if let gradient = previewGradient { scene.gradient = gradient }
    NativeSlideRenderer.draw(scene, in: context, rect: artboard, images: images)
    context.saveGState()
    defer { context.restoreGState() }
    context.clip(to: bounds)
    if controller.cleanPreview { return }
    if controller.showGuides {
      context.setStrokeColor(NSColor.secondaryLabelColor.withAlphaComponent(0.22).cgColor)
      context.setLineWidth(0.5)
      let sx = scene.canvas.width / 2576
      let sy = scene.canvas.height / 1080
      for col in 0...24 {
        let x = 96 + Double(col) * 100 - (col == 24 ? 16 : 0)
        line(
          from: CGPoint(x: x * sx, y: 64 * sy), to: CGPoint(x: x * sx, y: 1016 * sy),
          context: context)
      }
      for row in 0...12 {
        let y = 64 + Double(row) * 80 - (row == 12 ? 8 : 0)
        line(
          from: CGPoint(x: 96 * sx, y: y * sy), to: CGPoint(x: 2480 * sx, y: y * sy),
          context: context)
      }
    }
    context.setStrokeColor(NSColor.controlAccentColor.cgColor)
    context.setLineWidth(2)
    if controller.selectionTarget == "gradient", let gradient = scene.gradient {
      let f = scene.gradientFrame
      let points = [
        CGPoint(x: f.minX + gradient.start.x * f.width, y: f.minY + gradient.start.y * f.height),
        CGPoint(x: f.minX + gradient.end.x * f.width, y: f.minY + gradient.end.y * f.height),
      ]
      line(from: points[0], to: points[1], context: context)
      for p in points + [
        CGPoint(x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2)
      ] { drawHandle(viewPoint(p), context: context) }
    } else {
      let selected =
        controller.selectionTarget == "text"
        ? scene.textRegion
        : scene.imageLayers.first { $0.role == controller.selectionTarget }?.frame
      if let selected {
        context.stroke(viewRect(selected))
        drawHandle(viewPoint(CGPoint(x: selected.maxX, y: selected.maxY)), context: context)
      }
    }
  }
  private func viewPoint(_ p: CGPoint) -> CGPoint {
    guard let canvas else { return .zero }
    return CGPoint(
      x: artboard.minX + p.x / canvas.width * artboard.width,
      y: artboard.maxY - p.y / canvas.height * artboard.height)
  }
  private func canvasPoint(_ event: NSEvent) -> CGPoint {
    let p = convert(event.locationInWindow, from: nil)
    guard let canvas else { return .zero }
    return CGPoint(
      x: (p.x - artboard.minX) / artboard.width * canvas.width,
      y: (artboard.maxY - p.y) / artboard.height * canvas.height)
  }
  private func viewRect(_ r: CGRect) -> CGRect {
    let p = viewPoint(CGPoint(x: r.minX, y: r.maxY))
    guard let canvas else { return .zero }
    return CGRect(
      x: p.x, y: p.y, width: r.width / canvas.width * artboard.width,
      height: r.height / canvas.height * artboard.height)
  }
  private func line(from: CGPoint, to: CGPoint, context: CGContext) {
    context.move(to: viewPoint(from))
    context.addLine(to: viewPoint(to))
    context.strokePath()
  }
  private func drawHandle(_ p: CGPoint, context: CGContext) {
    context.setFillColor(NSColor.controlAccentColor.cgColor)
    context.fillEllipse(in: CGRect(x: p.x - 5, y: p.y - 5, width: 10, height: 10))
  }
  override func mouseDown(with event: NSEvent) {
    window?.makeFirstResponder(self)
    guard let controller, let scene, let slide, let deckID = controller.document?.deck.deckId else {
      return
    }
    guard !controller.cleanPreview else { return }
    let point = canvasPoint(event)
    let view = convert(event.locationInWindow, from: nil)
    if spaceHeld || event.buttonNumber == 2 {
      gesture = (
        slide.id, deckID, "view", "pan", view, CGRect(origin: pan, size: .zero), .full,
        PrototypeGradient()
      )
      return
    }
    if controller.selectionTarget == "gradient", let gradient = scene.gradient {
      let f = scene.gradientFrame
      let start = CGPoint(
        x: f.minX + gradient.start.x * f.width, y: f.minY + gradient.start.y * f.height)
      let end = CGPoint(x: f.minX + gradient.end.x * f.width, y: f.minY + gradient.end.y * f.height)
      let vs = viewPoint(start)
      let ve = viewPoint(end)
      let mode =
        hypot(view.x - vs.x, view.y - vs.y) < 16
        ? "gradient-start"
        : hypot(view.x - ve.x, view.y - ve.y) < 16 ? "gradient-end" : "gradient-both"
      gesture = (slide.id, deckID, "gradient", mode, point, f, .full, gradient)
      return
    }
    let target: String
    if controller.selectionTarget == "text"
      && scene.textRegion.insetBy(dx: -8, dy: -8).contains(point)
    {
      target = "text"
    } else if scene.textRegion.contains(point) && !event.modifierFlags.contains(.option)
      && !event.modifierFlags.contains(.command)
    {
      target = "text"
    } else if let layer = scene.imageLayers.reversed().first(where: { $0.frame.contains(point) }) {
      target = layer.role
    } else {
      return
    }
    controller.selectionTarget = target
    let layer = scene.imageLayers.first { $0.role == target }
    let frame = target == "text" ? scene.textRegion : layer!.frame
    if target == "text" && scene.legacy { controller.status = "Convert this preserved layout before changing its text region."; return }
    let handle = viewPoint(CGPoint(x: frame.maxX, y: frame.maxY))
    let resize = hypot(view.x - handle.x, view.y - handle.y) < 16
    let mode =
      resize
      ? "resize" : target == "text" || event.modifierFlags.contains(.command) ? "move" : "crop"
    var crop = layer?.crop ?? .full
    if mode == "crop", let id = layer?.assetID, let image = images[id] {
      let placement = NativeSlideRenderer.imageRect(
        sourceWidth: Double(image.width), sourceHeight: Double(image.height), frame: frame,
        crop: crop, fit: "fill")
      crop = PrototypeCrop(
        x: (frame.minX - placement.minX) / placement.width,
        y: (frame.minY - placement.minY) / placement.height, width: frame.width / placement.width,
        height: frame.height / placement.height)
    }
    gesture = (
      slide.id, deckID, target, mode, point, frame, crop, scene.gradient ?? PrototypeGradient()
    )
  }
  override func mouseDragged(with event: NSEvent) {
    guard let gesture, let canvas else { return }
    if gesture.mode == "pan" {
      let current = convert(event.locationInWindow, from: nil)
      pan = CGPoint(
        x: gesture.frame.origin.x + current.x - gesture.start.x,
        y: gesture.frame.origin.y + current.y - gesture.start.y)
      needsDisplay = true
      return
    }
    let p = canvasPoint(event)
    let dx = p.x - gesture.start.x
    let dy = p.y - gesture.start.y
    if gesture.mode == "crop" {
      var crop = gesture.crop
      crop.x = min(1 - crop.width, max(0, crop.x - dx / gesture.frame.width * crop.width))
      crop.y = min(1 - crop.height, max(0, crop.y - dy / gesture.frame.height * crop.height))
      previewCrop = crop
    } else if gesture.mode.hasPrefix("gradient") {
      var g = gesture.gradient
      let nx = dx / gesture.frame.width
      let ny = dy / gesture.frame.height
      if gesture.mode == "gradient-start" {
        g.start.x = min(1, max(0, g.start.x + nx))
        g.start.y = min(1, max(0, g.start.y + ny))
      } else if gesture.mode == "gradient-end" {
        g.end.x = min(1, max(0, g.end.x + nx))
        g.end.y = min(1, max(0, g.end.y + ny))
      } else {
        let x = min(1 - max(g.start.x, g.end.x), max(-min(g.start.x, g.end.x), nx))
        let y = min(1 - max(g.start.y, g.end.y), max(-min(g.start.y, g.end.y), ny))
        g.start.x += x
        g.end.x += x
        g.start.y += y
        g.end.y += y
      }
      previewGradient = g
    } else {
      var f = gesture.frame
      if gesture.mode == "resize" {
        f.size.width = max(64, min(canvas.width - f.minX, f.width + dx))
        f.size.height = max(64, min(canvas.height - f.minY, f.height + dy))
      } else {
        f.origin.x = min(canvas.width - f.width, max(0, f.minX + dx))
        f.origin.y = min(canvas.height - f.height, max(0, f.minY + dy))
      }
      if controller?.showGuides == true && !event.modifierFlags.contains(.option) {
        let xs = (0..<24).map { (96 + Double($0) * 100) * canvas.width / 2576 }
        let ys = (0..<12).map { (64 + Double($0) * 80) * canvas.height / 1080 }
        let tolerance = 6 * canvas.width / max(artboard.width, 1)
        let edgeX = gesture.mode == "resize" ? f.maxX : f.minX
        let edgeY = gesture.mode == "resize" ? f.maxY : f.minY
        if let x = xs.min(by: { abs($0 - edgeX) < abs($1 - edgeX) }), abs(x - edgeX) < tolerance {
          if gesture.mode == "resize" { f.size.width = max(64, x - f.minX) } else { f.origin.x = x }
        }
        if let y = ys.min(by: { abs($0 - edgeY) < abs($1 - edgeY) }), abs(y - edgeY) < tolerance {
          if gesture.mode == "resize" { f.size.height = max(64, y - f.minY) } else { f.origin.y = y }
        }
      }
      f.origin.x = max(0, min(canvas.width - f.width, f.minX))
      f.origin.y = max(0, min(canvas.height - f.height, f.minY))
      f.size.width = min(canvas.width - f.minX, f.width)
      f.size.height = min(canvas.height - f.minY, f.height)
      previewFrame = f
    }
    needsDisplay = true
  }
  override func mouseUp(with event: NSEvent) {
    guard let gesture, let controller, controller.document?.deck.deckId == gesture.deckID else {
      cancelGesture()
      return
    }
    do {
      if let crop = previewCrop, crop != gesture.crop {
        controller.patchLayout(
          ["crops": [gesture.target: try nativeObject(crop)]], id: gesture.slideID)
      }
      if let gradient = previewGradient, gradient != gesture.gradient {
        controller.patchLayout(["gradient": try nativeObject(gradient)], id: gesture.slideID)
      }
      if let frame = previewFrame, frame != gesture.frame {
        controller.patchLayout(
          gesture.target == "text"
            ? ["textFrame": try nativeObject(PrototypeFrame(frame))]
            : ["frames": [gesture.target: try nativeObject(PrototypeFrame(frame))]],
          id: gesture.slideID)
      }
    } catch { controller.failure = error.localizedDescription }
    cancelGesture()
  }
  private func cancelGesture() {
    gesture = nil
    previewFrame = nil
    previewCrop = nil
    previewGradient = nil
    needsDisplay = true
  }
  override func resignFirstResponder() -> Bool {
    spaceHeld = false
    cancelGesture()
    NSCursor.arrow.set()
    return super.resignFirstResponder()
  }
  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    if window == nil {
      spaceHeld = false; cancelGesture()
      for task in imageTasks.values { task.cancel() }
      imageTasks = [:]; imageKeys = [:]; images = [:]
    }
  }
  override func keyDown(with event: NSEvent) {
    if event.keyCode == 53 {
      if gesture?.mode == "pan", let origin = gesture?.frame.origin { pan = origin }
      spaceHeld = false
      NSCursor.arrow.set()
      cancelGesture()
    } else if event.keyCode == 49 {
      spaceHeld = true
      NSCursor.openHand.set()
    } else {
      super.keyDown(with: event)
    }
  }
  override func keyUp(with event: NSEvent) {
    if event.keyCode == 49 {
      spaceHeld = false
      NSCursor.arrow.set()
    } else {
      super.keyUp(with: event)
    }
  }
  override func scrollWheel(with event: NSEvent) {
    if event.modifierFlags.contains(.command) {
      controller?.zoom = min(
        3, max(0.25, (controller?.zoom ?? 1) * (1 + event.scrollingDeltaY / 150)))
    } else {
      pan.x -= event.scrollingDeltaX
      pan.y += event.scrollingDeltaY
      needsDisplay = true
    }
  }
  override func magnify(with event: NSEvent) {
    controller?.zoom = min(3, max(0.25, (controller?.zoom ?? 1) * (1 + event.magnification)))
  }
  override func resetCursorRects() {
    super.resetCursorRects()
    addCursorRect(bounds, cursor: spaceHeld ? .openHand : .arrow)
  }
}
