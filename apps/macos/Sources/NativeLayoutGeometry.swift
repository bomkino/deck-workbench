import Foundation

/// The two slide starters share vertical rhythm, with exact horizontal spacing.
struct NativeSlideGrid {
  let canvas: DeckCanvas
  var marginX: Double { (canvas.width == 1920 && canvas.height == 1080) ? 72 : 96 * canvas.width / 2576 }
  var marginY: Double { 64 * canvas.height / 1080 }
  var columnGutter: Double { (canvas.width == 1920 && canvas.height == 1080) ? 12 : 16 * canvas.width / 2576 }
  var rowGutter: Double { 8 * canvas.height / 1080 }
  var cellWidth: Double { (canvas.width - 2 * marginX - 23 * columnGutter) / 24 }
  var cellHeight: Double { (canvas.height - 2 * marginY - 11 * rowGutter) / 12 }
  var usable: CGRect { CGRect(x: marginX, y: marginY, width: canvas.width - 2 * marginX, height: canvas.height - 2 * marginY) }
  var verticalGuides: [Double] { (0..<24).flatMap { i in let x = columnStart(i); return [x, x + cellWidth] } }
  var horizontalGuides: [Double] { (0..<12).flatMap { i in let y = rowStart(i); return [y, y + cellHeight] } }
  func columnStart(_ index: Int) -> Double { marginX + Double(index) * (cellWidth + columnGutter) }
  func rowStart(_ index: Int) -> Double { marginY + Double(index) * (cellHeight + rowGutter) }
  func span(_ columns: Int) -> Double { Double(columns) * cellWidth + Double(max(0, columns - 1)) * columnGutter }
}

/// Canvas-space guide edges shared by interaction and the package diagnostics.
enum NativeLayoutGeometry {
  static func xGuides(_ canvas: DeckCanvas) -> [Double] {
    [0] + NativeSlideGrid(canvas: canvas).verticalGuides + [canvas.width]
  }
  static func yGuides(_ canvas: DeckCanvas) -> [Double] {
    [0] + NativeSlideGrid(canvas: canvas).horizontalGuides + [canvas.height]
  }
  static func visibleCrop(_ layer: PrototypeImageLayer, width: Double, height: Double) -> PrototypeCrop {
    let rect = NativeSlideRenderer.imageRect(sourceWidth: width, sourceHeight: height,
      frame: layer.frame, crop: layer.crop, fit: "fill")
    return PrototypeCrop(x: max(0, (layer.frame.minX - rect.minX) / rect.width),
      y: max(0, (layer.frame.minY - rect.minY) / rect.height),
      width: min(1, layer.frame.width / rect.width), height: min(1, layer.frame.height / rect.height))
  }
  static func cropZoom(_ layer: PrototypeImageLayer, width: Double, height: Double) -> Double {
    let base = PrototypeImageLayer(role: layer.role, assetID: layer.assetID, frame: layer.frame, crop: .full, fit: "fill")
    return visibleCrop(base, width: width, height: height).width / max(0.000001, visibleCrop(layer, width: width, height: height).width)
  }
  static func zoomedCrop(_ layer: PrototypeImageLayer, width: Double, height: Double, zoom: Double) -> PrototypeCrop {
    let current = visibleCrop(layer, width: width, height: height)
    let base = PrototypeImageLayer(role: layer.role, assetID: layer.assetID, frame: layer.frame, crop: .full, fit: "fill")
    let fill = visibleCrop(base, width: width, height: height), zoom = max(1, min(4, zoom))
    let w = fill.width / zoom, h = fill.height / zoom
    return PrototypeCrop(x: max(0, min(1 - w, current.x + current.width / 2 - w / 2)),
      y: max(0, min(1 - h, current.y + current.height / 2 - h / 2)), width: w, height: h)
  }
  static func hasText(_ scene: ResolvedPrototype) -> Bool {
    scene.texts.contains { $0.visible.length > 0 }
  }
}
