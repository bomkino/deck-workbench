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
  /// Read from Production `workbench.md`, whose three fields are projections
  /// of the original fields (see NativeWorkbenchMarkdown.projectedField).
  var projected = false
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
        settings.layout.starterType = .standard
        settings.layout.appearance = "dark"
        settings.layout.fitCopy = false
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

/// One rule for deck, part and slide names everywhere they are imported,
/// renamed or exported: a single line of 1–240 characters (and at most 500
/// UTF-16 units, the kernel's slide-name limit) without surrounding spaces.
enum NativeTitle {
  static let maximumCharacters = 240
  static let maximumUTF16 = 500
  /// Line breaks, tabs and other controls become spaces; ends are trimmed.
  static func clean(_ raw: String) -> String {
    String(String.UnicodeScalarView(raw.unicodeScalars.map { scalar in
      scalar.value < 32 || (127...159).contains(scalar.value) || scalar.value == 0x2028 || scalar.value == 0x2029 ? " " : scalar
    })).trimmingCharacters(in: .whitespacesAndNewlines)
  }
  static func isValid(_ title: String) -> Bool {
    !title.isEmpty && title.count <= maximumCharacters && title.utf16.count <= maximumUTF16 && title == clean(title)
  }
  /// `base` shortened, if needed, so that `base + suffix` is a valid title.
  static func withSuffix(_ base: String, _ suffix: String) -> String {
    var stem = clean(base)
    while !stem.isEmpty && !isValid(stem + suffix) { stem.removeLast() }
    return clean(stem + suffix)
  }
}

/// Copy.md: every original field with its exact role, state and text, for
/// people to read and for Workbench to import again unchanged. Fields are
/// literal fences; headings escape `\` and `#`.
enum NativeCopyMarkdown {
  static let marker = "<!-- Deck Workbench Copy.md v1 -->"
  static func heading(_ value: String) -> String {
    value.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\r", with: " ")
      .replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "#", with: "\\#")
  }
  static func unescapeHeading(_ value: String) -> String {
    var result = "", escaped = false
    for character in value {
      if escaped { result.append(character); escaped = false }
      else if character == "\\" { escaped = true }
      else { result.append(character) }
    }
    if escaped { result.append("\\") }
    return result
  }
  static func literalBlock(_ value: String) -> String {
    var longest = 0, run = 0
    for c in value { if c == "`" { run += 1; longest = max(longest, run) } else { run = 0 } }
    let fence = String(repeating: "`", count: max(3, longest + 1))
    return fence + "\n" + value + "\n" + fence + "\n"
  }
  static func write(title: String, canvasID: String, slides: [DeckSlide]) -> String {
    var copy = "\(marker)\n# \(heading(title))\n\nCanvas: \(canvasID)\n\n"
    for (index, slide) in slides.enumerated() {
      copy += "## \(String(format: "%02d", index + 1)) — \(heading(slide.title))\n\n"
      for block in slide.copyBlocks {
        copy += "### \(heading(block.role))\n\n"
        if let state = block.state, state != "present", block.text.isEmpty { copy += "State: \(state)\n\n" }
        copy += literalBlock(block.text) + "\n"
      }
      if !slide.settings.notes.isEmpty { copy += "### Designer notes\n\n" + literalBlock(slide.settings.notes) + "\n" }
    }
    return copy
  }
}

/// Conflict check for copy edits. It must match nativeCopyDigest in
/// packages/deck-kernel/src/native-kernel.ts: two 32-bit FNV-1a variants over
/// UTF-16 code units plus the unit count. Sending it instead of the editor's
/// original blocks keeps large slides within the kernel's command limit.
enum NativeCopyDigest {
  static func digest(_ blocks: [DeckCopyBlock]) -> String {
    var a: UInt32 = 0x811c_9dc5, b: UInt32 = 0x050c_5d1f, length = 0
    func feed(_ text: String) {
      for unit in text.utf16 {
        a = (a ^ UInt32(unit)) &* 0x0100_0193
        b = (b ^ UInt32(unit)) &* 0x0100_0193
        b ^= b >> 13
        length += 1
      }
    }
    for block in blocks {
      for part in [block.id, block.semanticKey, block.role, block.text, block.state ?? ""] { feed(part); feed("\u{0}") }
      feed("\u{1}")
    }
    return "v1:\(length):" + String(format: "%08x", a) + ":" + String(format: "%08x", b)
  }
}

/// Replacement uses stored copy; generated contents is a view/export projection.
enum NativeCopyReplacement {
  static func destinations(in deck: DeckDocument) -> [DeckSlide] {
    deck.slides.filter { $0.settings.layout.contents != true }
  }
  static func matches(_ incoming: ImportedCopyDocument, in deck: DeckDocument) -> [String: String] {
    let old = destinations(in: deck)
    var matches: [String: String] = [:]
    for slide in old where old.filter({ $0.title == slide.title }).count == 1 {
      let candidates = incoming.slides.filter { $0.title == slide.title }
      if candidates.count == 1 { matches[slide.id] = candidates[0].id }
    }
    return matches
  }
  static func payload(_ incoming: ImportedCopyDocument, in deck: DeckDocument,
    matches: [String: String]) throws -> Data
  {
    if deck.slides.contains(where: { $0.settings.layout.contents == true && matches[$0.id] != nil }) {
      throw WorkbenchFailure(name: "CopyReplacement", message: "Contents updates automatically and cannot be replaced. Map the incoming writing to other slides.")
    }
    let available = destinations(in: deck)
    let old = available.filter { matches[$0.id] != nil }
    guard !old.isEmpty, Set(matches.values).count == matches.count,
      matches.allSatisfy({ pair in available.contains { $0.id == pair.key }
        && incoming.slides.contains { $0.id == pair.value } }) else {
      throw WorkbenchFailure(name: "CopyReplacement", message: "Map each incoming slide to one existing slide. Nothing was changed.")
    }
    let replacements: [[String: Any]] = try old.map { slide in
      let new = incoming.slides.first { $0.id == matches[slide.id] }!
      let blocks = incoming.projected ? projectedBlocks(new, onto: slide) : roleMatchedBlocks(new, onto: slide)
      return ["slideId": slide.id, "blocks": try nativeObject(uniqueKeys(blocks, keeping: Set(slide.copyBlocks.map(\.id)))),
        "expectedCopyDigest": NativeCopyDigest.digest(slide.copyBlocks)]
    }
    return try JSONSerialization.data(withJSONObject: ["slides": replacements], options: .sortedKeys)
  }
}

extension NativeCopyReplacement {
  /// Ordinary Markdown and Copy.md: the nth incoming field of a role takes the
  /// identity of the slide's nth field of that role.
  static func roleMatchedBlocks(_ new: ImportedCopySlide, onto slide: DeckSlide) -> [DeckCopyBlock] {
    var roleCounts: [String: Int] = [:]
    return new.blocks.map { block -> DeckCopyBlock in
      let index = roleCounts[block.role, default: 0]
      roleCounts[block.role] = index + 1
      let existing = slide.copyBlocks.filter { $0.role == block.role }
      if index < existing.count {
        // Text alone already means "present"; an older field that never
        // stored the state keeps it unstored rather than counting as changed.
        let state = block.state == "present" && existing[index].state == nil ? nil : block.state
        return DeckCopyBlock(id: existing[index].id, semanticKey: existing[index].semanticKey,
          role: block.role, value: block.value, state: state)
      }
      return block
    }
  }
  /// `workbench.md` carries three projected fields. A field whose text and
  /// state are what this slide would export keeps its original fields
  /// untouched (Body can stand for body, caption and credit together); a
  /// changed field replaces its group in place, and a field the slide never
  /// had is added only when the file gives it text or marks it blank.
  static func projectedBlocks(_ new: ImportedCopySlide, onto slide: DeckSlide) -> [DeckCopyBlock] {
    let roles = NativeWorkbenchMarkdown.roles
    func group(_ role: String) -> String { role == "headline" || role == "subheadline" ? role : "body" }
    var incoming: [String: DeckCopyBlock] = [:]
    for block in new.blocks where incoming[block.role] == nil { incoming[block.role] = block }
    var kept: [String: Bool] = [:]
    for role in roles {
      let current = NativeWorkbenchMarkdown.projectedField(role, of: slide)
      let field = incoming[role]
      kept[role] = field == nil || (field!.text == current.text && (field!.state ?? "present") == current.state)
    }
    func replacement(_ role: String) -> DeckCopyBlock {
      let field = incoming[role]!
      if let reuse = slide.copyBlocks.first(where: { $0.role == role }) {
        return DeckCopyBlock(id: reuse.id, semanticKey: reuse.semanticKey, role: role, value: field.value, state: field.state)
      }
      return DeckCopyBlock(id: UUID().uuidString.lowercased(), semanticKey: "\(role).1", role: role, value: field.value, state: field.state)
    }
    var result: [DeckCopyBlock] = [], emitted = Set<String>()
    for block in slide.copyBlocks {
      let role = group(block.role)
      if kept[role] == true { result.append(block); continue }
      if emitted.insert(role).inserted { result.append(replacement(role)) }
    }
    for role in roles where kept[role] != true && !emitted.contains(role) {
      guard let field = incoming[role], !field.text.isEmpty || field.state == "intentionally-blank" else { continue }
      let block = replacement(role)
      switch role {
      case "headline": result.insert(block, at: 0)
      case "subheadline": result.insert(block, at: (result.lastIndex { $0.role == "headline" }).map { $0 + 1 } ?? 0)
      default: result.append(block)
      }
    }
    return result
  }
  /// Kept identities keep their semantic keys; any other field whose key is
  /// already taken gets the next free `role.n`, as the kernel requires.
  static func uniqueKeys(_ blocks: [DeckCopyBlock], keeping existing: Set<String>) -> [DeckCopyBlock] {
    var used = Set(blocks.filter { existing.contains($0.id) }.map(\.semanticKey))
    return blocks.map { block in
      guard !existing.contains(block.id) else { return block }
      var result = block
      if used.contains(result.semanticKey) {
        var n = 1
        while used.contains("\(block.role).\(n)") { n += 1 }
        result.semanticKey = "\(block.role).\(n)"
      }
      used.insert(result.semanticKey)
      return result
    }
  }
}

enum NativeCopyImport {
  static func read(_ url: URL) throws -> ImportedCopyDocument {
    let access = url.startAccessingSecurityScopedResource()
    defer { if access { url.stopAccessingSecurityScopedResource() } }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    let data = try handle.read(upToCount: 1_048_577) ?? Data()
    try Task.checkCancellation()
    return try parse(data, filename: url.lastPathComponent)
  }
  /// A fence opener: three or more backticks or tildes, then an optional info
  /// string that does not repeat the fence character (as in CommonMark, so
  /// "```js``` is code" stays text).
  private static func fenceOpener(_ trimmed: String) -> String? {
    guard let first = trimmed.first, first == "`" || first == "~" else { return nil }
    let fence = String(trimmed.prefix { $0 == first })
    guard fence.count >= 3, !trimmed.dropFirst(fence.count).contains(first) else { return nil }
    return fence
  }
  private static func closesFence(_ trimmed: String, _ fence: String) -> Bool {
    trimmed.hasPrefix(fence) && trimmed.allSatisfy { $0 == fence.first! }
  }
  /// A deliberately bounded, local parser. Workbench Markdown v1 is supported;
  /// ordinary Markdown uses ## Slide title with optional ### Headline/Body/Notes.
  /// Copy.md v1 (marked on its first line) imports every field exactly.
  static func parse(_ data: Data, filename: String) throws -> ImportedCopyDocument {
    guard data.count <= 1_048_576, let input = String(data: data, encoding: .utf8) else {
      throw WorkbenchFailure(
        name: "ImportFormat", message: "Choose a UTF-8 Markdown or text file no larger than 1 MiB.")
    }
    var source = input
    if source.hasPrefix("\u{FEFF}") { source.removeFirst() }
    // Copy.md fields are literal and may themselves contain CR. Its lines are
    // split on LF alone (as UTF-8 bytes, so CRLF is never one character), and
    // one transport CR per line is removed only when the marker line shows the
    // file was saved with CRLF line endings.
    func withoutCR(_ line: String) -> String { line.utf8.last == 13 ? String(line.dropLast()) : line }
    var sourceLines = Array(source.utf8).split(separator: 10, omittingEmptySubsequences: false)
      .map { String(decoding: $0, as: UTF8.self) }
    let crlf = sourceLines.first?.utf8.last == 13
    var copyMarkdown = sourceLines.first.map { withoutCR($0).trimmingCharacters(in: .whitespaces) } == NativeCopyMarkdown.marker
    if copyMarkdown {
      if crlf { sourceLines = sourceLines.map(withoutCR) }
    } else {
      source = source.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(
        of: "\r", with: "\n")
      sourceLines = source.components(separatedBy: "\n")
      // A Copy.md whose line breaks were all converted to CR imports as before.
      copyMarkdown = sourceLines.first?.trimmingCharacters(in: .whitespaces) == NativeCopyMarkdown.marker
    }
    if copyMarkdown { sourceLines.removeFirst() }
    // Production files declare their format in the header, before any slide.
    // Fence contents and later copy are never document structure.
    var detectingFence: String?
    var structured = false
    for line in sourceLines where !copyMarkdown {
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      if let fence = detectingFence {
        if closesFence(trimmed, fence) { detectingFence = nil }
        continue
      }
      if let fence = fenceOpener(trimmed) { detectingFence = fence; continue }
      if line.hasPrefix("Format: workbench-markdown/") { structured = true; break }
      if line.hasPrefix("## ") || line.hasPrefix("### ") || (!trimmed.isEmpty && !line.hasPrefix("# ") && !line.hasPrefix("Title:") && !line.hasPrefix("Canvas:")) { break }
    }
    if structured { return try NativeWorkbenchMarkdown.parse(source) }
    var result = ImportedCopyDocument(
      title: NativeTitle.clean(URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent), parts: [])
    var part = ImportedCopyPart(id: UUID().uuidString.lowercased(), title: "Deck", slides: [])
    var slide: ImportedCopySlide?
    var role: String?
    var lines: [String] = []
    var literalLineIndices: Set<Int> = []
    var usedLiteralFence = false
    var blockState = "present"
    var explicitRole = false
    // The ordinary-Markdown headline made from a slide title, replaced by an
    // explicit Headline field. Tracked by identity, never by matching text.
    var convenienceHeadlineID: String?
    // In Copy.md a field may itself have the role "notes"; the slide's notes
    // have their own heading, held under a role no heading can produce.
    let designerNotes = copyMarkdown ? "\u{0}designer-notes" : "notes"
    func finishBlock() {
      guard slide != nil else {
        lines = []
        return
      }
      var start = 0, end = lines.count
      // Fenced lines are literal even when blank. Only separators outside the
      // fence are discarded; authored leading/trailing LFs survive a round trip.
      if usedLiteralFence {
        while start < end && lines[start] == "" && !literalLineIndices.contains(start) { start += 1 }
        while end > start && lines[end - 1] == "" && !literalLineIndices.contains(end - 1) { end -= 1 }
      } else {
        if start < end && lines[start] == "" { start += 1 }
        if end > start && lines[end - 1] == "" { end -= 1 }
      }
      let contents = Array(lines[start..<end])
      let value = contents.joined(separator: "\n")
      let currentRole = role ?? "body"
      if currentRole == designerNotes {
        if !value.isEmpty { slide!.notes += (slide!.notes.isEmpty ? "" : "\n\n") + value }
      } else if !value.isEmpty || explicitRole {
        let n = slide!.blocks.filter { $0.role == currentRole }.count + 1
        let state: String? = !value.isEmpty ? "present"
          : (copyMarkdown && ["intentionally-blank", "unreviewed"].contains(blockState) ? blockState : nil)
        slide!.blocks.append(
          DeckCopyBlock(
            id: UUID().uuidString.lowercased(), semanticKey: "\(currentRole).\(n)",
            role: currentRole, value: RichCopy(value), state: state))
      }
      lines = []
      literalLineIndices = []; usedLiteralFence = false
      role = nil
      blockState = "present"
      explicitRole = false
    }
    func startPlainSlide() {
      // A plain text file is one slide. No guessed paragraph-to-slide splitting.
      slide = ImportedCopySlide(id: UUID().uuidString.lowercased(), title: result.title)
      role = "body"
    }
    func finishSlide() {
      finishBlock()
      if let current = slide { part.slides.append(current) }
      slide = nil
      convenienceHeadlineID = nil
    }
    func finishPart() {
      finishSlide()
      if !part.slides.isEmpty { result.parts.append(part) }
    }
    let knownRoles = [
      "headline", "subheadline", "body", "caption", "credit", "notes", "designer notes",
      "direction",
    ]
    let canvases = Set(NativeWorkbenchMarkdown.canvases)
    var literalFence: String?
    for (index, line) in sourceLines.enumerated() {
      let number = index + (copyMarkdown ? 2 : 1)
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      if let fence = literalFence {
        if closesFence(trimmed, fence) { literalFence = nil }
        else { literalLineIndices.insert(lines.count); lines.append(line) }
        continue
      }
      if let fence = fenceOpener(trimmed) {
        if slide == nil { startPlainSlide() }
        usedLiteralFence = true
        literalFence = fence
        continue
      }
      if line.hasPrefix("\\#") || line.hasPrefix("\\State:") || line.hasPrefix("\\\\")
        || line.hasPrefix("\\Title:") || line.hasPrefix("\\Canvas:") || line.hasPrefix("\\Format:")
      {
        if slide == nil { startPlainSlide() }
        lines.append(String(line.dropFirst()))
        continue
      }
      if line.hasPrefix("Format: workbench-markdown/") && slide == nil {
        guard trimmed == "Format: workbench-markdown/1" else {
          throw WorkbenchFailure(
            name: "ImportFormat",
            message: "Line \(number): unsupported Workbench Markdown version.")
        }
        continue
      }
      if slide == nil && line.hasPrefix("Title:") && !copyMarkdown {
        result.title = NativeTitle.clean(String(line.dropFirst(6)))
        continue
      }
      // Only a supported canvas is a directive; "Canvas: oil on linen" is copy.
      if slide == nil && line.hasPrefix("Canvas:"),
        canvases.contains(String(line.dropFirst(7)).trimmingCharacters(in: .whitespaces))
      {
        result.canvasID = String(line.dropFirst(7)).trimmingCharacters(in: .whitespaces)
        continue
      }
      if line.hasPrefix("## Part:") && !copyMarkdown {
        finishPart()
        let title = NativeTitle.clean(String(line.dropFirst(8)))
        guard !title.isEmpty else {
          throw WorkbenchFailure(name: "ImportFormat", message: "Line \(number): this part needs a title.")
        }
        part = ImportedCopyPart(id: UUID().uuidString.lowercased(), title: title, slides: [])
        continue
      }
      if line.hasPrefix("### Slide:") || (line.hasPrefix("## ") && !line.hasPrefix("###")) {
        finishSlide()
        let prefix = line.hasPrefix("### Slide:") ? 10 : 3
        var heading = String(line.dropFirst(prefix))
        if copyMarkdown {
          // "## 07 — Title": the number is Copy.md's reading order, not the name.
          if let dash = heading.range(of: " — "), !heading[..<dash.lowerBound].isEmpty,
            heading[..<dash.lowerBound].allSatisfy(\.isNumber)
          {
            heading = String(heading[dash.upperBound...])
          }
          heading = NativeCopyMarkdown.unescapeHeading(heading)
        }
        let title = NativeTitle.clean(heading)
        guard !title.isEmpty else {
          throw WorkbenchFailure(
            name: "ImportFormat", message: "Line \(number): this slide needs a title.")
        }
        slide = ImportedCopySlide(id: UUID().uuidString.lowercased(), title: title)
        if !copyMarkdown {
          let id = UUID().uuidString.lowercased()
          convenienceHeadlineID = id
          slide!.blocks = [DeckCopyBlock(id: id, semanticKey: "headline.1", role: "headline", value: RichCopy(title))]
        }
        continue
      }
      if line.hasPrefix("# ") && !line.hasPrefix("##") && slide == nil {
        let title = NativeTitle.clean(copyMarkdown ? NativeCopyMarkdown.unescapeHeading(String(line.dropFirst(2))) : String(line.dropFirst(2)))
        if copyMarkdown || title != "Deck" { result.title = title }
        continue
      }
      if line.hasPrefix("### ") {
        let raw = String(line.dropFirst(4))
        let name = raw.lowercased().trimmingCharacters(in: .whitespaces)
        if slide == nil && (copyMarkdown || knownRoles.contains(name)) { startPlainSlide() }
        if copyMarkdown {
          // Every heading is a field with its own role; only the exact
          // "Designer notes" heading is the slide's notes.
          finishBlock()
          explicitRole = true
          role = raw.trimmingCharacters(in: .whitespaces) == "Designer notes" ? designerNotes
            : NativeCopyMarkdown.unescapeHeading(raw).trimmingCharacters(in: .whitespaces).lowercased()
          continue
        }
        if knownRoles.contains(name) {
          finishBlock()
          role = ["notes", "designer notes", "direction"].contains(name) ? "notes" : name
          explicitRole = true
          // An explicit Headline replaces the ordinary Markdown title convenience.
          if name == "headline", let id = convenienceHeadlineID {
            slide?.blocks.removeAll { $0.id == id }
            convenienceHeadlineID = nil
          }
          continue
        }
      }
      if copyMarkdown && role != nil && line.hasPrefix("State:") && lines.allSatisfy({ $0.isEmpty }) {
        let state = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        if ["intentionally-blank", "unreviewed"].contains(state) { blockState = state; continue }
      }
      if slide != nil {
        lines.append(line)
      } else if !trimmed.isEmpty {
        startPlainSlide()
        lines.append(line)
      }
    }
    if literalFence != nil { throw WorkbenchFailure(name: "ImportFormat", message: "Close the literal-copy fence before importing. The source file was not changed.") }
    finishPart()
    guard !result.slides.isEmpty, result.slides.count <= 1000 else {
      throw WorkbenchFailure(
        name: "ImportFormat",
        message: "The file needs between 1 and 1000 slides. Use ## Slide title headings.")
    }
    if result.title.isEmpty { result.title = "Untitled Deck" }
    guard NativeTitle.isValid(result.title), result.parts.allSatisfy({ NativeTitle.isValid($0.title) }),
      result.slides.allSatisfy({
        NativeTitle.isValid($0.title) && $0.notes.utf16.count <= 262144 && $0.blocks.allSatisfy { $0.text.utf16.count <= 262144 }
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
