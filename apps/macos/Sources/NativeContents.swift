import Foundation

/// A view/export projection. It never writes derived contents into source copy.
enum NativeContents {
  static func resolve(slides: [DeckSlide]) -> [DeckSlide] {
    let included = slides.filter { $0.settings.included }
    let copy = included.enumerated().compactMap { index, slide -> String? in
      guard slide.settings.layout.contents != true else { return nil }
      return slide.title + "\t" + String(format: "%02d", index + 1)
    }.joined(separator: "\n")
    return slides.map { slide in
      guard slide.settings.layout.contents == true else { return slide }
      var result = slide
      let firstBody = slide.contentBlocks.firstIndex { $0.role == "body" }
      var blocks = slide.contentBlocks.filter { $0.role != "body" }
      let insertion: Int
      if let firstBody { insertion = slide.contentBlocks[..<firstBody].filter { $0.role != "body" }.count }
      else { insertion = blocks.lastIndex { ["headline", "subheadline"].contains($0.role) }.map { $0 + 1 } ?? blocks.count }
      let body = DeckCopyBlock(id: slide.id + ":contents", semanticKey: "contents.body", role: "body",
        value: RichCopy(copy), state: copy.isEmpty ? "intentionally-blank" : "present")
      blocks.insert(body, at: insertion)
      result.contentBlocks = blocks
      return result
    }
  }

  static func resolve(document: DeckDocument) -> DeckDocument {
    let resolved = Dictionary(uniqueKeysWithValues: resolve(slides: document.slides).map { ($0.id, $0) })
    var result = document
    result.sections = document.sections.map { section in
      var copy = section
      copy.slides = section.slides.map { resolved[$0.id] ?? $0 }
      return copy
    }
    return result
  }
}
