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
  static func hasText(_ scene: ResolvedPrototype) -> Bool {
    scene.texts.contains { $0.visible.length > 0 }
  }
}
