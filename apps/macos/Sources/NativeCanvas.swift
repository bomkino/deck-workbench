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
  private var reloadKeys: [String: String] = [:]
  private var drawKey = 0
  private var imageTasks: [String: Task<Void, Never>] = [:]
  private var sceneKey = -1
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
  private var gestureStartInView = CGPoint.zero
  private var dragStarted = false
  /// After a drag is released, its preview stays on screen until the saved
  /// scene arrives (or the save queue settles), so the element does not jump
  /// back; a new drag waits, so it never starts from stale geometry.
  private var committing = false
  private var lastCropPoint: CGPoint?
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
      sceneKey = -1
      for task in imageTasks.values { task.cancel() }
      imageTasks = [:]; imageKeys = [:]; reloadKeys = [:]; images = [:]
      drawKey = 0; needsDisplay = true
      return
    }
    let resolved = controller.resolvedScene
    if committing && (sceneKey != controller.sceneGeneration || controller.pendingCount == 0) { cancelGesture() }
    if sceneKey != controller.sceneGeneration {
      sceneKey = controller.sceneGeneration
      self.slide = slide
      self.canvas = canvas
      scene = resolved
      if gesture?.slideID != slide.id { cancelGesture() }
    }
    for id in slide.chosenIDs {
      guard let source = controller.sources[id] else {
        imageTasks.removeValue(forKey: id)?.cancel(); imageKeys[id] = nil; reloadKeys[id] = nil; images[id] = nil
        continue
      }
      let sameOriginal = imageKeys[id] == source.cacheKey
      // Renewed folder access changes nothing for an image already shown;
      // it retries one that failed.
      if sameOriginal && (images[id] != nil || reloadKeys[id] == source.reloadKey) { continue }
      imageKeys[id] = source.cacheKey
      reloadKeys[id] = source.reloadKey
      imageTasks[id]?.cancel()
      if let warm = NativeThumbnailService.shared.cached(source, longestSide: 2048) {
        images[id] = warm; imageTasks[id] = nil; needsDisplay = true
        continue
      }
      images[id] = nil
      imageTasks[id] = Task { [weak self] in
        let image = await NativeThumbnailService.shared.image(for: source, longestSide: 2048)
        guard !Task.isCancelled, let self, self.reloadKeys[id] == source.reloadKey else { return }
        self.images[id] = image
        self.imageTasks[id] = nil
        self.needsDisplay = true
      }
    }
    for id in Set(imageKeys.keys).subtracting(slide.chosenIDs) {
      imageTasks.removeValue(forKey: id)?.cancel()
      images[id] = nil
      imageKeys[id] = nil
      reloadKeys[id] = nil
    }
    // Most controller changes (notes typing, status, progress) leave the
    // slide as it was; redraw only for what the canvas shows.
    var drawn = Hasher()
    drawn.combine(sceneKey); drawn.combine(slide.id); drawn.combine(controller.zoom)
    drawn.combine(controller.cleanPreview); drawn.combine(controller.showGuides)
    drawn.combine(controller.selectionTarget); drawn.combine(Set(images.keys))
    let key = drawn.finalize()
    if key != drawKey { drawKey = key; needsDisplay = true }
  }
  /// Catalogue sizes of the originals on this slide (upright, as previews are).
  private func sourceSizes(_ scene: ResolvedPrototype) -> [String: CGSize] {
    var sizes: [String: CGSize] = [:]
    for layer in scene.imageLayers {
      guard let id = layer.assetID, let asset = controller?.assetIndex[id], let width = asset.width, let height = asset.height else { continue }
      sizes[id] = CGSize(width: width, height: height)
    }
    return sizes
  }
  override func draw(_ dirtyRect: NSRect) {
    let clean = controller?.cleanPreview == true
    (clean ? NSColor.black : NativeDesign.pasteboardNS).setFill()
    bounds.fill()
    guard var scene, let context = NSGraphicsContext.current?.cgContext, let controller else {
      return
    }
    // Room for the hint above and the floating controls below the slide.
    let inset = clean
      ? NSEdgeInsets(top: 24, left: 24, bottom: 84, right: 24)
      : NSEdgeInsets(top: 40, left: 40, bottom: 76, right: 40)
    let available = CGRect(x: inset.left, y: inset.bottom, width: max(1, bounds.width - inset.left - inset.right),
      height: max(1, bounds.height - inset.top - inset.bottom))
    let scale =
      max(0.02, min(available.width / scene.canvas.width, available.height / scene.canvas.height))
      * controller.zoom
    artboard = CGRect(
      x: available.midX - scene.canvas.width * scale / 2 + pan.x,
      y: available.midY - scene.canvas.height * scale / 2 + pan.y,
      width: scene.canvas.width * scale, height: scene.canvas.height * scale)
    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: -8), blur: clean ? 0 : 28, color: NSColor.black.withAlphaComponent(0.32).cgColor)
    context.setFillColor(NSColor.black.cgColor)
    context.fill(artboard)
    context.restoreGState()
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
    NativeSlideRenderer.draw(scene, in: context, rect: artboard, images: images, sourceSizes: sourceSizes(scene), rasterizeGradient: false)
    context.saveGState()
    defer { context.restoreGState() }
    context.clip(to: bounds)
    if controller.cleanPreview { return }
    if controller.showGuides {
      context.setStrokeColor(NSColor(white: 0.6, alpha: 0.16).cgColor)
      context.setLineWidth(0.5)
      let grid = NativeSlideGrid(canvas: scene.canvas)
      for x in grid.verticalGuides {
        line(from: CGPoint(x: x, y: grid.usable.minY), to: CGPoint(x: x, y: grid.usable.maxY), context: context)
      }
      for y in grid.horizontalGuides {
        line(from: CGPoint(x: grid.usable.minX, y: y), to: CGPoint(x: grid.usable.maxX, y: y), context: context)
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
      if let selected, controller.selectionTarget != "text" || NativeLayoutGeometry.hasText(scene) {
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
    guard !committing else { return }
    cancelGesture()
    guard let controller, let scene, let slide, let deckID = controller.document?.deck.deckId else {
      return
    }
    guard !controller.cleanPreview else { return }
    let point = canvasPoint(event)
    let view = convert(event.locationInWindow, from: nil)
    gestureStartInView = view
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
      let midpoint = CGPoint(x: (vs.x + ve.x) / 2, y: (vs.y + ve.y) / 2)
      let lineX = ve.x - vs.x, lineY = ve.y - vs.y
      let lengthSquared = lineX * lineX + lineY * lineY
      let fraction = lengthSquared > 0
        ? min(1, max(0, ((view.x - vs.x) * lineX + (view.y - vs.y) * lineY) / lengthSquared)) : 0
      let lineDistance = hypot(view.x - (vs.x + fraction * lineX), view.y - (vs.y + fraction * lineY))
      let mode: String?
      if hypot(view.x - vs.x, view.y - vs.y) < 16 { mode = "gradient-start" }
      else if hypot(view.x - ve.x, view.y - ve.y) < 16 { mode = "gradient-end" }
      else if hypot(view.x - midpoint.x, view.y - midpoint.y) < 16 || lineDistance < 6 {
        mode = "gradient-both"
      } else { mode = nil }
      if let mode {
        gesture = (slide.id, deckID, "gradient", mode, point, f, .full, gradient)
        return
      }
    }
    let hasText = NativeLayoutGeometry.hasText(scene)
    let selectedFrame = controller.selectionTarget == "text"
      ? (hasText ? scene.textRegion : nil)
      : scene.imageLayers.first { $0.role == controller.selectionTarget }?.frame
    // Handles have a fixed screen-space hit area even when zoomed out.
    let selectedHandleHit = selectedFrame.map {
      let handle = viewPoint(CGPoint(x: $0.maxX, y: $0.maxY))
      return hypot(view.x - handle.x, view.y - handle.y) < 16
    } ?? false
    let target: String
    if selectedHandleHit { target = controller.selectionTarget }
    else if hasText && controller.selectionTarget == "text"
      && scene.textRegion.contains(point) && !event.modifierFlags.contains(.option)
      && !event.modifierFlags.contains(.command)
    {
      target = "text"
    } else if hasText && scene.textRegion.contains(point) && !event.modifierFlags.contains(.option)
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
    if mode == "crop" && layer?.fit == "fit" {
      controller.status = "The whole image is fitted. Choose Fill / crop to pan it, or Command-drag to move its frame."
      return
    }
    var crop = layer?.crop ?? .full
    if mode == "crop", let id = layer?.assetID, let image = images[id] {
      let size = NativeSlideRenderer.sourceSize(image, original: sourceSizes(scene)[id])
      let placement = NativeSlideRenderer.imageRect(
        sourceWidth: size.width, sourceHeight: size.height, frame: frame,
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
    guard !committing, let gesture, let canvas else { return }
    let current = convert(event.locationInWindow, from: nil)
    if !dragStarted {
      // A click can contain small pointer movements; do not snap or save those as edits.
      guard hypot(current.x - gestureStartInView.x, current.y - gestureStartInView.y) >= 3 else { return }
      dragStarted = true
    }
    if gesture.mode == "pan" {
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
      // Consume each delta at the edge, so reversing does not have to undo the overshoot.
      let previous = lastCropPoint ?? gesture.start
      var crop = previewCrop ?? gesture.crop
      crop.x = min(1 - crop.width, max(0, crop.x - (p.x - previous.x) / gesture.frame.width * crop.width))
      crop.y = min(1 - crop.height, max(0, crop.y - (p.y - previous.y) / gesture.frame.height * crop.height))
      lastCropPoint = p
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
      // Keep endpoints distinct; collapsing them would create an invalid saved gradient.
      guard hypot((g.end.x - g.start.x) * gesture.frame.width, (g.end.y - g.start.y) * gesture.frame.height) >= 1 else { return }
      previewGradient = g
    } else {
      let snap = controller?.showGuides == true && !event.modifierFlags.contains(.option)
      let f = NativeLayoutGeometry.draggedFrame(gesture.frame, dx: dx, dy: dy, resize: gesture.mode == "resize",
        canvas: canvas, snapTolerance: snap ? 6 * canvas.width / max(artboard.width, 1) : nil)
      previewFrame = f
    }
    needsDisplay = true
  }
  override func mouseUp(with event: NSEvent) {
    guard !committing else { return }
    guard let gesture, let controller, controller.document?.deck.deckId == gesture.deckID else {
      cancelGesture()
      return
    }
    let pendingBefore = controller.pendingCount
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
    if controller.pendingCount > pendingBefore { committing = true; dragStarted = false; lastCropPoint = nil }
    else { cancelGesture() }
  }
  private func cancelGesture() {
    committing = false
    gesture = nil
    dragStarted = false
    lastCropPoint = nil
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
  override func viewDidChangeEffectiveAppearance() {
    super.viewDidChangeEffectiveAppearance()
    needsDisplay = true
  }
  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    if window == nil {
      spaceHeld = false; cancelGesture()
      for task in imageTasks.values { task.cancel() }
      imageTasks = [:]; imageKeys = [:]; reloadKeys = [:]; images = [:]; drawKey = 0
    } else if let controller {
      // Back in a window without a SwiftUI update: reload what was released.
      update(controller)
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
