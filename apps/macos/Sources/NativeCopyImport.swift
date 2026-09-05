import Foundation

struct ImportedCopySlide: Identifiable, Sendable {
  let id: String
  var title: String
  var style: String = "full-bleed-overlay"
  var blocks: [DeckCopyBlock] = []
  var notes: String = ""
}
struct ImportedCopyPart: Identifiable, Sendable {
  let id: String
  var title: String
  var slides: [ImportedCopySlide]
}
struct ImportedCopyDocument: Sendable {
  var title: String
  var canvasID = "cinemascope-2576x1080"
  var parts: [ImportedCopyPart]
  var slides: [ImportedCopySlide] { parts.flatMap(\.slides) }
  func checkpoint() throws -> Data {
    let canvases: [String: (Double, Double)] = [
      "cinemascope-2576x1080": (2576, 1080), "widescreen-1920x1080": (1920, 1080),
      "square-2160x2160": (2160, 2160), "standard-1920x1440": (1920, 1440),
      "a4-portrait": (2480, 3508), "letter-portrait": (2550, 3300),
    ]
    guard let size = canvases[canvasID] else {
      throw WorkbenchFailure(name: "ImportFormat", message: "Unsupported canvas: \(canvasID)")
    }
    let sections: [[String: Any]] = try parts.map { part in
      let slides: [[String: Any]] = try part.slides.map { slide in
        var settings = NativeSlideSettings.initial
        settings.notes = slide.notes
        if slide.style == "text-only" { settings.layout.preset = "text-only" }
        if slide.style == "diptych" { settings.layout.preset = "two-images" }
        if slide.style == "triptych" { settings.layout.preset = "three-images" }
        return [
          "id": slide.id, "internalTitle": slide.title, "intent": slide.style,
          "contentBlocks": try nativeObject(slide.blocks), "native": try nativeObject(settings),
        ]
      }
      return ["id": part.id, "title": part.title, "slides": slides]
    }
    let object: [String: Any] = [
      "format": "pitchdog.deck-checkpoint", "schemaVersion": 1, "revision": 0,
      "deck": [
        "schemaVersion": 1, "deckId": UUID().uuidString.lowercased(), "title": title,
        "canvasPreset": ["id": canvasID, "width": size.0, "height": size.1], "sections": sections,
      ],
      "undoStack": [], "redoStack": [], "processedCommands": [:],
    ]
    return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  }
}

enum NativeCopyImport {
  /// A deliberately bounded, local parser. Workbench Markdown v1 is supported;
  /// ordinary Markdown uses ## Slide title with optional ### Headline/Body/Notes.
  static func parse(_ data: Data, filename: String) throws -> ImportedCopyDocument {
    guard data.count <= 1_048_576, let input = String(data: data, encoding: .utf8) else {
      throw WorkbenchFailure(
        name: "ImportFormat", message: "Choose a UTF-8 Markdown or text file no larger than 1 MiB.")
    }
    let source = input.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(
      of: "\r", with: "\n")
    let structured = source.contains("Format: workbench-markdown/") || source.contains("### Slide:")
    var result = ImportedCopyDocument(
      title: URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent, parts: [])
    var part = ImportedCopyPart(id: UUID().uuidString.lowercased(), title: "Deck", slides: [])
    var slide: ImportedCopySlide?
    var role: String?
    var lines: [String] = []
    var blockState = "present"
    var explicitRole = false
    func finishBlock() {
      guard slide != nil else {
        lines = []
        return
      }
      var contents = lines
      // Structural blank separators are not paragraphs. Internal blank lines survive.
      if contents.first == "" { contents.removeFirst() }
      if contents.last == "" { contents.removeLast() }
      let value = contents.joined(separator: "\n")
      let currentRole = role ?? "body"
      if currentRole == "notes" {
        slide!.notes += (slide!.notes.isEmpty ? "" : "\n\n") + value
      } else if blockState != "intentionally-blank" || !value.isEmpty {
        if !value.isEmpty || explicitRole {
          let n = slide!.blocks.filter { $0.role == currentRole }.count + 1
          slide!.blocks.append(
            DeckCopyBlock(
              id: UUID().uuidString.lowercased(), semanticKey: "\(currentRole).\(n)",
              role: currentRole, value: RichCopy(value)))
        }
      }
      lines = []
      role = nil
      blockState = "present"
      explicitRole = false
    }
    func finishSlide() {
      finishBlock()
      if let current = slide { part.slides.append(current) }
      slide = nil
    }
    func finishPart() {
      finishSlide()
      if !part.slides.isEmpty { result.parts.append(part) }
    }
    let knownRoles = [
      "headline", "subheadline", "body", "caption", "credit", "notes", "designer notes",
      "direction",
    ]
    for (index, line) in source.components(separatedBy: "\n").enumerated() {
      if line.hasPrefix("\\") {
        lines.append(String(line.dropFirst()))
        continue
      }
      if line.hasPrefix("Format:") && slide == nil {
        guard line.trimmingCharacters(in: .whitespaces) == "Format: workbench-markdown/1" else {
          throw WorkbenchFailure(
            name: "ImportFormat",
            message: "Line \(index+1): unsupported Workbench Markdown version.")
        }
        continue
      }
      if slide == nil && line.hasPrefix("Title:") {
        result.title = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        continue
      }
      if slide == nil && line.hasPrefix("Canvas:") {
        result.canvasID = String(line.dropFirst(7)).trimmingCharacters(in: .whitespaces)
        continue
      }
      if line.hasPrefix("## Part:") {
        finishPart()
        part = ImportedCopyPart(
          id: UUID().uuidString.lowercased(),
          title: String(line.dropFirst(8)).trimmingCharacters(in: .whitespaces), slides: [])
        continue
      }
      if line.hasPrefix("### Slide:")
        || (!structured && line.hasPrefix("## ") && !line.hasPrefix("###"))
      {
        finishSlide()
        let prefix = line.hasPrefix("### Slide:") ? 10 : 3
        let title = String(line.dropFirst(prefix)).trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else {
          throw WorkbenchFailure(
            name: "ImportFormat", message: "Line \(index+1): this slide needs a title.")
        }
        slide = ImportedCopySlide(id: UUID().uuidString.lowercased(), title: title)
        if !structured {
          slide!.blocks = [
            DeckCopyBlock(
              id: UUID().uuidString.lowercased(), semanticKey: "headline.1", role: "headline",
              value: RichCopy(title))
          ]
        }
        continue
      }
      if line.hasPrefix("# ") && !line.hasPrefix("##") && slide == nil {
        let title = String(line.dropFirst(2))
        if title != "Deck" { result.title = title }
        continue
      }
      if line.hasPrefix(structured ? "#### " : "### ") {
        let name = String(line.dropFirst(structured ? 5 : 4)).lowercased().trimmingCharacters(
          in: .whitespaces)
        if knownRoles.contains(name) {
          finishBlock()
          role = ["notes", "designer notes", "direction"].contains(name) ? "notes" : name
          explicitRole = true
          // An explicit Headline replaces the ordinary Markdown title convenience.
          if !structured && name == "headline" && slide?.blocks.count == 1
            && slide?.blocks.first?.text == slide?.title
          {
            slide?.blocks = []
          }
          continue
        }
      }
      if structured && line.hasPrefix("State:") && role != nil && lines.allSatisfy({ $0.isEmpty }) {
        blockState = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        continue
      }
      if structured && role == nil && line.hasPrefix("Style:") {
        slide?.style = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        continue
      }
      if structured && role == nil
        && (line.hasPrefix("Purpose:") || line.hasPrefix("Content pattern:")
          || line.hasPrefix("State:"))
      {
        continue
      }
      if slide != nil {
        lines.append(line)
      } else if !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !structured {
        // A plain text file is one slide. No guessed paragraph-to-slide splitting.
        slide = ImportedCopySlide(id: UUID().uuidString.lowercased(), title: result.title)
        role = "body"
        lines.append(line)
      }
    }
    finishPart()
    guard !result.slides.isEmpty, result.slides.count <= 1000 else {
      throw WorkbenchFailure(
        name: "ImportFormat",
        message: "The file needs between 1 and 1000 slides. Use ## Slide title headings.")
    }
    if result.title.isEmpty { result.title = "Untitled Deck" }
    guard result.title.count <= 240,
      result.slides.allSatisfy({
        $0.title.count <= 240 && $0.blocks.allSatisfy { $0.text.utf16.count <= 262144 }
      })
    else {
      throw WorkbenchFailure(
        name: "ImportFormat",
        message:
          "A title or copy block is too long. Titles allow 240 characters; copy blocks allow 262144."
      )
    }
    return result
  }
}
