import Foundation

/// Canvas-space guide edges shared by interaction and the package diagnostics.
enum NativeLayoutGeometry {
  static func xGuides(_ canvas: DeckCanvas) -> [Double] {
    var values = [0.0, canvas.width]
    for column in 0..<24 {
      let start = 96 + Double(column) * 100
      values += [start * canvas.width / 2576, (start + 84) * canvas.width / 2576]
    }
    return values.sorted()
  }
  static func yGuides(_ canvas: DeckCanvas) -> [Double] {
    var values = [0.0, canvas.height]
    for row in 0..<12 {
      let start = 64 + Double(row) * 80
      values += [start * canvas.height / 1080, (start + 72) * canvas.height / 1080]
    }
    return values.sorted()
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
