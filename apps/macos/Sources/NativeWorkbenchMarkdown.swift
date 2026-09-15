import CryptoKit
import Foundation

struct WorkbenchProductionPSD: Codable, Sendable {
  var path: String
  var sha256: String
  var width: Int
  var height: Int
  var depth = 8
  var colorMode = "RGB"
  var framing: String? = nil
}
struct WorkbenchProductionBlock: Codable, Sendable {
  var blockID: String
  var semanticKey: String
  var role: String
  var text: String
  var state: String?
  var resolvedState: String
}
struct WorkbenchCopyProjection: Codable, Sendable {
  var role: String
  var state: String
  var text: String
  var sourceBlockIDs: [String]
}
struct WorkbenchProductionSlide: Codable, Sendable {
  var slideID: String
  var sectionID: String
  var sourceOrdinal: Int
  var exportOrdinal: Int
  var title: String
  var intent: String
  var appearance: String? = nil
  var palette: NativeStarterPalette? = nil
  var colourRoles: [String: String]? = nil
  var notes: String
  var blocks: [WorkbenchProductionBlock]
  var projection: [WorkbenchCopyProjection]
  var psd: WorkbenchProductionPSD? = nil
}
struct WorkbenchProductionManifest: Codable, Sendable {
  var format = "pitchdog-workbench-production/1"
  var deckID: String
  var revision: Int
  var title: String
  var canvas: DeckCanvas
  var copyFile = "workbench.md"
  var copySHA256: String
  var slides: [WorkbenchProductionSlide]
  var warnings: [String]
}
struct WorkbenchProductionCopy: Sendable {
  var markdown: String
  var manifest: WorkbenchProductionManifest
  var warnings: [String] { manifest.warnings }
}

/// The production importers accept exactly three copy roles. The manifest keeps
/// the original ordered blocks; the Markdown is an explicitly recorded projection.
enum NativeWorkbenchMarkdown {
  static let roles = ["headline", "subheadline", "body"]
  static let states = ["present", "intentionally-blank", "unreviewed"]
  static let canvases = ["cinemascope-2576x1080", "widescreen-1920x1080", "square-2160x2160",
    "standard-1920x1440", "a4-portrait", "letter-portrait"]
  static let reserved = ["# Deck", "Format:", "Title:", "Canvas:", "## Part:", "Purpose:",
    "### Slide:", "Style:", "Content pattern:", "#### Headline", "#### Subheadline", "#### Body", "State:"]

  static func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
  static func escapeCopy(_ value: String) -> String {
    value.components(separatedBy: "\n").map { line in
      let tail = String(line.drop { $0 == "\\" })
      return reserved.contains(where: { tail.hasPrefix($0) }) ? "\\" + line : line
    }.joined(separator: "\n")
  }
  static func decodeCopyLine(_ line: String) -> String {
    let tail = String(line.drop { $0 == "\\" })
    return line.hasPrefix("\\") && reserved.contains(where: { tail.hasPrefix($0) })
      ? String(line.dropFirst()) : line
  }
  private static func nonblank(_ value: String) -> Bool {
    value.unicodeScalars.contains { !CharacterSet.whitespacesAndNewlines.contains($0) && $0.value != 0xFEFF }
  }
  private static func metadata(_ value: String, _ label: String) throws -> String {
    guard !value.isEmpty, value == value.trimmingCharacters(in: .whitespacesAndNewlines),
      !value.unicodeScalars.contains(where: { $0.value < 32 || (127...159).contains($0.value) || $0.value == 0x2028 || $0.value == 0x2029 }) else {
      throw WorkbenchFailure(name: "ProductionCopy", message: "\(label) must be a nonblank single line without surrounding spaces. Full copy remains available in Copy.md.")
    }
    return value
  }
  private static func legacyStates(_ slide: DeckSlide) -> [String: String] {
    guard let block = slide.contentBlocks.first(where: { $0.isMetadata }),
      let data = block.text.data(using: .utf8),
      let plan = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      plan["format"] as? String == "pitchdog.workbench-plan",
      let values = plan["copyFieldStates"] as? [String: String] else { return [:] }
    return values.filter { states.contains($0.value) }
  }
  static func project(snapshot: DeckDocumentSnapshot, slides: [DeckSlide]) throws -> WorkbenchProductionCopy {
    guard !slides.isEmpty, slides.count <= 1000, Set(slides.map(\.id)).count == slides.count,
      canvases.contains(snapshot.deck.canvasPreset.id) else {
      throw WorkbenchFailure(name: "ProductionCopy", message: "Production copy needs a supported canvas and 1–1000 unique slides.")
    }
    let title = try metadata(snapshot.deck.title, "Deck title")
    var chunks = ["# Deck", "Format: workbench-markdown/1\nTitle: \(title)\nCanvas: \(snapshot.deck.canvasPreset.id)"]
    var entries: [WorkbenchProductionSlide] = [], warnings: [String] = [], previousSection: String?
    let all = snapshot.deck.slides
    for (index, slide) in slides.enumerated() {
      guard let ordinal = all.firstIndex(where: { $0.id == slide.id }),
        let section = snapshot.deck.sections.first(where: { $0.slides.contains(where: { $0.id == slide.id }) }) else {
        throw WorkbenchFailure(name: "ProductionCopy", message: "An exported slide does not belong to the frozen document.")
      }
      if previousSection != section.id {
        chunks.append("## Part: \(try metadata(section.title, "Part title"))")
        chunks.append("Purpose: Production handoff")
        previousSection = section.id
      }
      let legacy = legacyStates(slide)
      if ["moodboard", "contents"].contains(slide.intent) {
        warnings.append("Slide \(index + 1): \(slide.intent) transfers its writing as v1 simple-copy. Layout and artwork are carried by the production PSD and manifest.")
      }
      var blocks: [WorkbenchProductionBlock] = []
      for block in slide.copyBlocks {
        if let state = block.state, !states.contains(state) || (state != "present" && !block.text.isEmpty) {
          throw WorkbenchFailure(name: "ProductionCopy", message: "Slide \(index + 1) has contradictory copy state in \(block.role). Correct it before production export; Copy.md retains its text.")
        }
        // Existing authored text takes priority over stale legacy plan metadata.
        let state = !block.text.isEmpty ? "present" : block.state ?? legacy[block.role] ?? "unreviewed"
        if !block.text.isEmpty && !nonblank(block.text) {
          throw WorkbenchFailure(name: "ProductionCopy", message: "Slide \(index + 1) contains whitespace-only \(block.role) copy that v1 cannot represent. Copy.md retains it unchanged.")
        }
        if block.text.contains("\0") || block.text.contains("\r") {
          throw WorkbenchFailure(name: "ProductionCopy", message: "Slide \(index + 1) contains an unsupported copy control character. Copy.md retains it unchanged.")
        }
        blocks.append(WorkbenchProductionBlock(blockID: block.id, semanticKey: block.semanticKey,
          role: block.role, text: block.text, state: block.state, resolvedState: state))
      }
      var projection: [WorkbenchCopyProjection] = []
      for role in roles {
        let group = blocks.filter { role == "body" ? !["headline", "subheadline"].contains($0.role) : $0.role == role }
        let text = group.filter { !$0.text.isEmpty }.map(\.text).joined(separator: "\n\n")
        let state: String
        if !text.isEmpty { state = "present" }
        else if !group.isEmpty { state = group.allSatisfy { $0.resolvedState == "intentionally-blank" } ? "intentionally-blank" : "unreviewed" }
        else { state = legacy[role] == "intentionally-blank" ? "intentionally-blank" : "unreviewed" }
        projection.append(WorkbenchCopyProjection(role: role, state: state, text: text, sourceBlockIDs: group.map(\.blockID)))
        if group.count > 1 || group.contains(where: { $0.role != role }) {
          warnings.append("Slide \(index + 1): \(group.map(\.role).joined(separator: ", ")) projected into \(role), separated by paragraph breaks. Original fields remain in Copy.md and the manifest.")
        }
        if state == "unreviewed" { warnings.append("Slide \(index + 1): \(role) is unreviewed. Existing production importers may display a dash.") }
      }
      let pattern = projection.allSatisfy { $0.state == "intentionally-blank" } ? "no-on-slide-text" : "simple-copy"
      chunks.append("### Slide: \(try metadata(slide.title, "Slide title"))")
      chunks.append("Purpose: Production handoff\nStyle: undecided\nContent pattern: \(pattern)")
      for field in projection {
        chunks.append("#### \(field.role.capitalized)\n\nState: \(field.state)" + (field.state == "present" ? "\n" + escapeCopy(field.text) : ""))
      }
      let layout = slide.settings.layout
      let carriesColours = layout.palette != nil || layout.appearance != nil || layout.starterType != nil
      let type = layout.starterType ?? .standard
      entries.append(WorkbenchProductionSlide(slideID: slide.id, sectionID: section.id,
        sourceOrdinal: ordinal + 1, exportOrdinal: index + 1, title: slide.title,
        intent: slide.intent, appearance: layout.appearance,
        palette: carriesColours ? layout.palette ?? .standard : nil,
        colourRoles: carriesColours ? ["head": type.head.colorRole, "sub": type.sub.colorRole, "body": type.body.colorRole] : nil,
        notes: slide.settings.notes, blocks: blocks, projection: projection))
    }
    let markdown = chunks.joined(separator: "\n\n") + "\n"
    guard markdown.utf8.count <= 1_048_576 else {
      throw WorkbenchFailure(name: "ProductionCopy", message: "Production writing exceeds Workbench’s 1 MiB import limit. Export a smaller slide selection so the new workbench.md can be imported again.")
    }
    // Grouped fields can exceed intake limits even when each source field fits.
    // Validate the actual payload before delivering a file an importer rejects.
    do { _ = try parse(markdown) }
    catch {
      throw WorkbenchFailure(name: "ProductionCopy", message: "Production writing cannot be imported: \(error.localizedDescription) Split long combined fields or shorten the affected title. Select Copy.md to export the original fields.")
    }
    return WorkbenchProductionCopy(markdown: markdown, manifest: WorkbenchProductionManifest(
      deckID: snapshot.deck.deckId, revision: snapshot.revision, title: snapshot.deck.title,
      canvas: snapshot.deck.canvasPreset, copySHA256: sha256(Data(markdown.utf8)), slides: entries, warnings: warnings))
  }

  /// Mirrors the installed v1 grammar; it does not interpret Markdown punctuation
  /// or fences inside a copy field. One separator and one transport LF are removed.
  static func parse(_ source: String) throws -> ImportedCopyDocument {
    var parser = Parser(source)
    return try parser.document()
  }
  private struct Parser {
    var lines: [String]
    var cursor = 0
    init(_ source: String) {
      var text = source.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
      if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
      lines = text.components(separatedBy: "\n")
      if text.hasSuffix("\n") { lines.removeLast() }
    }
    func error(_ message: String) -> WorkbenchFailure {
      WorkbenchFailure(name: "ImportFormat", message: "Workbench Markdown, line \(cursor + 1): \(message)")
    }
    mutating func exact(_ expected: String) throws {
      guard cursor < lines.count, lines[cursor] == expected else { throw error("Expected \(expected.isEmpty ? "one blank separator" : expected).") }
      cursor += 1
    }
    mutating func value(_ prefix: String) throws -> String {
      guard cursor < lines.count, lines[cursor].hasPrefix(prefix + " ") else { throw error("Expected \(prefix) followed by one space and a value.") }
      let value = String(lines[cursor].dropFirst(prefix.count + 1))
      do { _ = try metadata(value, prefix) } catch { throw self.error("\(prefix) requires nonblank single-line metadata without surrounding whitespace.") }
      cursor += 1
      return value
    }
    mutating func document() throws -> ImportedCopyDocument {
      guard !lines.contains(where: { $0.contains("\0") }) else { throw error("NUL is not supported in copy.") }
      try exact("# Deck"); try exact(""); try exact("Format: workbench-markdown/1")
      let title = try value("Title:"), canvas = try value("Canvas:")
      guard canvases.contains(canvas) else { throw error("Unsupported Canvas: \(canvas).") }
      if cursor < lines.count { try exact("") }
      var parts: [ImportedCopyPart] = []
      while cursor < lines.count {
        let name = try value("## Part:")
        try exact(""); _ = try value("Purpose:")
        if cursor < lines.count { try exact("") }
        var slides: [ImportedCopySlide] = []
        while cursor < lines.count, lines[cursor].hasPrefix("### Slide:") { slides.append(try slide()) }
        guard !slides.isEmpty else { throw error("Each Part needs at least one Slide.") }
        parts.append(ImportedCopyPart(id: UUID().uuidString.lowercased(), title: name, slides: slides))
      }
      guard !parts.isEmpty, parts.flatMap(\.slides).count <= 1000, title.count <= 240,
        parts.flatMap(\.slides).allSatisfy({ $0.title.count <= 240 && $0.blocks.allSatisfy { $0.text.utf16.count <= 262144 } }) else {
        throw error("Use 1–1000 slides, titles up to 240 characters and fields up to 262144 characters.")
      }
      return ImportedCopyDocument(title: title, canvasID: canvas, parts: parts)
    }
    mutating func slide() throws -> ImportedCopySlide {
      let title = try value("### Slide:")
      try exact(""); _ = try value("Purpose:"); try exact("Style: undecided")
      let pattern = try value("Content pattern:")
      guard ["simple-copy", "no-on-slide-text"].contains(pattern) else { throw error("Unsupported Content pattern.") }
      if cursor < lines.count { try exact("") }
      var fields: [String: DeckCopyBlock] = [:], last = -1
      while cursor < lines.count, let index = roles.firstIndex(where: { lines[cursor] == "#### \($0.capitalized)" }) {
        guard index > last else { throw error("Copy fields must appear once in Headline, Subheadline, Body order.") }
        last = index
        let role = roles[index]
        try exact("#### \(role.capitalized)"); try exact("")
        let state = try value("State:")
        guard states.contains(state) else { throw error("Unknown copy State: \(state).") }
        var raw: [String] = []
        while cursor < lines.count {
          let line = lines[cursor]
          if let prefix = reserved.first(where: { line.hasPrefix($0) }) {
            if roles.contains(where: { line == "#### \($0.capitalized)" }) || prefix == "### Slide:" || prefix == "## Part:" { break }
            throw error("Unexpected marker \(prefix); escape structural-looking copy.")
          }
          raw.append(line); cursor += 1
        }
        if cursor < lines.count {
          guard raw.last == "" else { throw error("Missing blank separator after \(role).") }
          raw.removeLast()
        }
        let text = raw.map(decodeCopyLine).joined(separator: "\n")
        guard state == "present" ? nonblank(text) : raw.isEmpty else { throw error("Copy does not match State: \(state).") }
        fields[role] = DeckCopyBlock(id: UUID().uuidString.lowercased(), semanticKey: "\(role).1", role: role, value: RichCopy(text), state: state)
      }
      if cursor < lines.count, !lines[cursor].hasPrefix("### Slide:"), !lines[cursor].hasPrefix("## Part:") { throw error("Unexpected content outside a copy field.") }
      if pattern == "no-on-slide-text", !roles.allSatisfy({ fields[$0]?.state == "intentionally-blank" }) { throw error("no-on-slide-text needs all three fields intentionally-blank.") }
      let blocks = roles.map { role in fields[role] ?? DeckCopyBlock(id: UUID().uuidString.lowercased(), semanticKey: "\(role).1", role: role, value: RichCopy(""), state: "unreviewed") }
      return ImportedCopySlide(id: UUID().uuidString.lowercased(), title: title, blocks: blocks)
    }
  }
}
