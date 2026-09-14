import AppKit
import CoreText
import Foundation

enum NativeStarterStyleChecks {
  static func run() throws {
    func require(_ value: Bool, _ message: String) throws {
      if !value { throw WorkbenchFailure(name: "StarterStyleProof", message: message) }
    }
    for role in NativeUIRole.allCases {
      let font = role.nativeFont()
      try require(abs(role.nativeFont(scale: 1.25).pointSize - font.pointSize * 1.25) < 0.01,
        "Interface size did not scale a UI role")
      if let name = role.fontName {
        try require(font.fontName == name, "Bundled UI font silently fell back: \(name)")
        let fontURL = CTFontCopyAttribute(font, kCTFontURLAttribute) as? URL
        try require(fontURL?.deletingLastPathComponent().standardizedFileURL == Bundle.main.resourceURL?.appendingPathComponent("Fonts").standardizedFileURL,
          "UI font resolved outside the app bundle: \(name)")
      }
    }
    var sizes: [Double] = []
    for width in [2576.0, 1920.0] {
      let canvas = DeckCanvas(id: width == 1920 ? "widescreen-1920x1080" : "cinemascope-2576x1080", width: width, height: 1080)
      let grid = NativeSlideGrid(canvas: canvas)
      try require(grid.verticalGuides.count == 48 && grid.horizontalGuides.count == 24, "Guide count changed")
      try require(grid.cellWidth == (width == 1920 ? 62.5 : 84) && grid.cellHeight == 72, "Grid introduced rounding or horizontal drift")
      try require(grid.verticalGuides.last == width - grid.marginX && grid.horizontalGuides.last == 1016, "Guide edges no longer fit the canvas exactly")
      var settings = NativeSlideSettings.initial
      settings.layout.preset = "text-only"; settings.layout.starterType = .standard; settings.layout.fitCopy = false
      let slide = DeckSlide(id: "style-proof", intent: "text-only", contentBlocks: [DeckCopyBlock(id: "body", semanticKey: "body", role: "body", value: RichCopy("A brief paragraph for comparing the two slide widths."))], native: settings)
      let scene = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
      sizes.append(scene.effectiveBodySize)
      guard let text = scene.texts.first?.content, let font = text.attribute(.font, at: 0, effectiveRange: nil) as? NSFont,
        let paragraph = text.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle else {
        throw WorkbenchFailure(name: "StarterStyleProof", message: "Starter text did not resolve")
      }
      try require(font.pointSize == 32 && paragraph.minimumLineHeight == 48 && paragraph.alignment == .justified, "Starter size, leading or justification changed")
      var board = slide
      board.native!.layout.preset = "moodboard"; board.native!.layout.imageCount = 12
      let artwork = NativeSlideRenderer.resolve(slide: board, canvas: canvas)
      try require(artwork.imageLayers.count == 12, "Moodboard lost an image slot")
      for frame in artwork.imageLayers.map(\.frame) {
        try require(grid.usable.contains(frame) && frame.width == grid.span(6), "Moodboard frames escape the starter grid")
      }
    }
    try require(sizes == [32, 32], "Widescreen silently reduced the starter type size")
    var type = NativeStarterType.standard
    type.body.step = -2
    type.sub.alignment = "center"
    type.head.colorRole = "accent2"
    type.useFonts(head: "System Serif", sub: "System", body: "System")
    try require(type.unavailableFonts.isEmpty && type.head.resolvedFont(size: 48)?.fontName != type.body.resolvedFont(size: 48)?.fontName,
      "Apple font pair failed to resolve distinct serif and sans faces")
    try require(type.body.step == -2 && type.sub.alignment == "center" && type.head.colorRole == "accent2",
      "Choosing a font pair changed size, alignment or colour")
    try require(type.head.stepLabel == "Step +5" && type.body.stepLabel == "Step -2" && NativeStarterType.standard.body.stepLabel == "Step 0",
      "Visible size step does not match the stored role")
    let savedType = try JSONDecoder().decode(NativeStarterType.self, from: JSONEncoder().encode(type))
    try require(savedType == type, "Font pair or visible step did not survive saving")
    type.head.fontName = "WorkbenchProof-No-Such-Font-8764"
    try require(type.unavailableFonts == [type.head.fontName], "Missing project fonts were not surfaced")
  }
}
