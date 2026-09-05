import AVFoundation
import AppKit
import CoreGraphics
import CoreText
import CryptoKit
import Foundation
import PDFKit

struct HandoffOptions: Codable, Sendable {
  var prototypePDF = true
  var notesPDF = true
  var copy = true
  var approved = true
  var shortlisted = true
  var acceptChangedSources = false
  var selectedSlideIDs: Set<String>?
}
struct HandoffProgress: Sendable {
  let completed: Int
  let total: Int
  let message: String
}
struct HandoffResult: Sendable {
  let url: URL
  let slideCount: Int
  let originalCopies: Int
  let issues: [String]
  var produced: [String] = []
}

enum NativeHandoffExporter {
  static func exportSlides(snapshot: DeckDocumentSnapshot, options: HandoffOptions) -> [DeckSlide] {
    snapshot.deck.includedSlides.filter { options.selectedSlideIDs == nil || options.selectedSlideIDs!.contains($0.id) }
  }
  static func requiredAssetIDs(snapshot: DeckDocumentSnapshot, options: HandoffOptions) -> Set<String> {
    var ids = Set<String>()
    for slide in exportSlides(snapshot: snapshot, options: options) {
      if options.prototypePDF || options.notesPDF || options.approved { ids.formUnion(slide.chosenIDs) }
      if options.shortlisted { ids.formUnion(slide.settings.shortlist) }
    }
    return ids
  }
  static func export(
    snapshot: DeckDocumentSnapshot, sources: [String: NativeMediaSource], to parent: URL,
    options: HandoffOptions, progress: @Sendable (HandoffProgress) -> Void
  ) throws -> HandoffResult {
    let slides = exportSlides(snapshot: snapshot, options: options)
    guard !slides.isEmpty else { throw WorkbenchFailure(name: "ExportEmpty", message: "Choose at least one included slide to export.") }
    guard options.prototypePDF || options.notesPDF || options.copy || options.approved || options.shortlisted else {
      throw WorkbenchFailure(name: "ExportEmpty", message: "Choose at least one handoff component.")
    }
    let manager = FileManager.default
    let name = safeName(snapshot.deck.title, maximumBytes: 120)
    var ordinal = 1
    var final = parent.appendingPathComponent("\(name) — Handoff \(String(format: "%03d", ordinal))", isDirectory: true)
    while manager.fileExists(atPath: final.path) {
      ordinal += 1
      final = parent.appendingPathComponent("\(name) — Handoff \(String(format: "%03d", ordinal))", isDirectory: true)
    }
    let staging = parent.appendingPathComponent(".\(name)-handoff-\(UUID().uuidString)", isDirectory: true)
    try manager.createDirectory(at: staging, withIntermediateDirectories: false)
    var finished = false
    defer { if !finished { try? manager.removeItem(at: staging) } }
    try Data("pitchdog.handoff/1\nrevision=\(snapshot.revision)\n".utf8).write(to: staging.appendingPathComponent(".workbench-handoff"), options: .atomic)
    var issues: [String] = []
    var produced: [String] = []
    var failed: [String] = []
    let wanted = requiredAssetIDs(snapshot: snapshot, options: options)
    let total = max(1, wanted.count + (options.copy ? 1 : 0) + (options.approved ? slides.count : 0)
      + (options.shortlisted ? slides.count : 0) + (options.prototypePDF ? slides.count : 0) + (options.notesPDF ? slides.count : 0))
    var completed = 0
    func advance(_ message: String, by units: Int = 1) {
      completed += units
      progress(HandoffProgress(completed: min(completed, total), total: total, message: message))
    }
    // A failed component cannot erase an independently completed one. A partial
    // destination is removed before it can be listed as a delivered component.
    func component(_ name: String, _ operation: () throws -> Void) throws {
      try Task.checkCancellation()
      do { try operation(); produced.append(name) }
      catch is CancellationError { throw CancellationError() }
      catch {
        try? manager.removeItem(at: staging.appendingPathComponent(name))
        failed.append(name)
        issues.append("\(name) was not produced: \(error.localizedDescription)")
      }
    }
    if options.copy {
      try component("Copy.md") {
        var copy = "# \(heading(snapshot.deck.title))\n\n"
        for (index, slide) in slides.enumerated() {
          copy += "## \(String(format: "%03d", index + 1)) — \(heading(slide.title))\n\n"
          for block in slide.copyBlocks { copy += "### \(heading(block.role))\n\n" + literalBlock(block.text) + "\n" }
          if !slide.settings.notes.isEmpty { copy += "### Designer notes\n\n" + literalBlock(slide.settings.notes) + "\n" }
        }
        try Data(copy.utf8).write(to: staging.appendingPathComponent("Copy.md"), options: .atomic)
      }
      advance("Writing complete copy")
    }
    let originals = staging.appendingPathComponent(".verified-originals", isDirectory: true)
    var staged: [String: URL] = [:]
    var hashes: [String: String] = [:]
    var unavailable: [String: String] = [:]
    var expectations: [String: Set<String>] = [:]
    let labels = Dictionary(uniqueKeysWithValues: (snapshot.deck.assetReferences ?? []).map { ($0.id, $0.label) })
    for slide in slides {
      for id in slide.chosenIDs.union(slide.settings.shortlist).intersection(wanted) {
        if let fingerprint = slide.settings.sourceFingerprints[id] { expectations[id, default: []].insert(fingerprint) }
      }
    }
    var preparationFailed = false
    if !wanted.isEmpty {
      do { try manager.createDirectory(at: originals, withIntermediateDirectories: false) }
      catch { preparationFailed = true; issues.append("Media preparation failed: \(error.localizedDescription)") }
    }
    if !preparationFailed {
      for id in wanted.sorted() {
        try Task.checkCancellation()
        defer { advance("Preparing originals") }
        guard let source = sources[id] else {
          unavailable[id] = "Original unavailable; reconnect its media folder."
          continue
        }
        let expected = expectations[id] ?? []
        if expected.count > 1 && !options.acceptChangedSources {
          unavailable[id] = "Slides refer to different saved source revisions."
          continue
        }
        let url = originals.appendingPathComponent(safeFilename(source.filename, suffix: shortID(id)))
        do {
          hashes[id] = try NativeMediaIO.stageOriginal(source, to: url, expectedFingerprint: expected.first, acceptChanged: options.acceptChangedSources)
          staged[id] = url
        } catch is CancellationError { throw CancellationError() }
        catch {
          let failure = WorkbenchFailure.unexpected(error)
          let code = (error as? POSIXError)?.code
          if ["SourceChanged", "MediaRootNeedsPermission", "UnsafeMediaLocation", "MediaUnavailable", "MediaRootUnavailable", "MissingMedia"].contains(failure.name)
            || code == .ENOENT || code == .EACCES || code == .EPERM {
            unavailable[id] = failure.message
          } else {
            preparationFailed = true
            issues.append("Media preparation could not finish: \(error.localizedDescription)")
            break
          }
        }
      }
    }
    for (index, slide) in slides.enumerated() {
      for id in slide.chosenIDs.union(slide.settings.shortlist).intersection(wanted) {
        if let problem = unavailable[id] { issues.append("Slide \(index + 1) — \(slide.title): \(sources[id]?.filename ?? labels[id] ?? id): \(problem)") }
      }
    }
    var rows = [["page", "slide_id", "title", "collection", "role", "asset_id", "file", "sha256", "status", "original_filename", "source_note"]]
    var copies = 0
    for (collection, enabled) in [("Approved Media", options.approved), ("Shortlisted Media", options.shortlisted)] where enabled {
      let rowStart = rows.count, copyStart = copies
      try component(collection) {
        if preparationFailed { throw WorkbenchFailure(name: "MediaPreparationFailed", message: "Original preparation failed; completed text outputs are retained.") }
        let target = staging.appendingPathComponent(collection, isDirectory: true)
        try manager.createDirectory(at: target, withIntermediateDirectories: false)
        for (index, slide) in slides.enumerated() {
          try Task.checkCancellation()
          let folder = "\(String(format: "%03d", index + 1)) — \(safeName(slide.title, maximumBytes: 120))"
          let directory = target.appendingPathComponent(folder, isDirectory: true)
          try manager.createDirectory(at: directory, withIntermediateDirectories: false)
          let ids = collection == "Approved Media" ? Array(slide.chosenIDs).sorted() : slide.settings.shortlist
          var used = Set<String>()
          for id in ids {
            let originalName = sources[id]?.filename ?? labels[id] ?? "media"
            let role = (slide.mediaAssignments ?? []).filter { $0.assetReferenceId == id }.map(\.role).joined(separator: "; ")
            guard let original = staged[id] else {
              rows.append([String(index + 1), slide.id, slide.title, collection, role, id, "", "", unavailable[id] ?? "Original unavailable", originalName, sources[id]?.note ?? ""])
              continue
            }
            var filename = safeFilename(originalName)
            if !used.insert(collisionKey(filename)).inserted {
              filename = safeFilename(originalName, suffix: shortID(id))
              guard used.insert(collisionKey(filename)).inserted else { throw WorkbenchFailure(name: "ExportCollision", message: "Two output names still collide; originals were not changed.") }
            }
            let output = directory.appendingPathComponent(filename)
            try manager.copyItem(at: original, to: output)
            guard try checksum(output) == hashes[id] else { throw WorkbenchFailure(name: "ExportCopyFailed", message: "Copied bytes did not match \(originalName).") }
            copies += 1
            rows.append([String(index + 1), slide.id, slide.title, collection, role, id, "\(collection)/\(folder)/\(filename)", hashes[id] ?? "", "Copied", originalName, sources[id]?.note ?? ""])
          }
          advance("Copying \(collection) · slide \(index + 1)")
        }
      }
      if failed.contains(collection) { rows.removeSubrange(rowStart..<rows.count); copies = copyStart }
    }
    if options.approved || options.shortlisted {
      try component("Media index.csv") {
        let csv = rows.map { $0.map(csvField).joined(separator: ",") }.joined(separator: "\r\n") + "\r\n"
        try Data(csv.utf8).write(to: staging.appendingPathComponent("Media index.csv"), options: .atomic)
      }
    }
    if options.prototypePDF {
      try component("Prototype.pdf") {
        if preparationFailed { throw WorkbenchFailure(name: "MediaPreparationFailed", message: "Original preparation failed; completed components are retained.") }
        try writePrototypePDF(slides: slides, canvas: snapshot.deck.canvasPreset, staged: staged, sources: sources,
          url: staging.appendingPathComponent("Prototype.pdf"), issues: &issues,
          progress: { index in advance("Rendering prototype · slide \(index)") })
      }
    }
    if options.notesPDF {
      try component("Prototype with notes.pdf") {
        if preparationFailed { throw WorkbenchFailure(name: "MediaPreparationFailed", message: "Original preparation failed; completed components are retained.") }
        try writeNotesPDF(slides: slides, canvas: snapshot.deck.canvasPreset, staged: staged, sources: sources,
          labels: labels, url: staging.appendingPathComponent("Prototype with notes.pdf"), issues: &issues)
      }
      advance("Writing notes companion", by: slides.count)
    }
    if manager.fileExists(atPath: originals.path) { try manager.removeItem(at: originals) }
    guard !produced.isEmpty else { throw WorkbenchFailure(name: "ExportFailed", message: issues.joined(separator: "\n")) }
    if !issues.isEmpty {
      let companions = produced.filter { $0 == "Copy.md" || $0 == "Prototype with notes.pdf" }
      let copyMessage = companions.isEmpty ? "No full-copy companion was requested or produced. The deck retains the complete writing."
        : "Complete copy is in: " + companions.joined(separator: ", ") + "."
      let report = (failed.isEmpty ? "Handoff exported with exceptions" : "Partial handoff — some requested components failed")
        + "\nDocument revision: \(snapshot.revision)\nProduced: " + produced.joined(separator: ", ")
        + "\n\n" + Array(Set(issues)).sorted().joined(separator: "\n") + "\n\n" + copyMessage
        + "\nOriginal source files were not changed. Approved Media means selected for this prototype, not rights clearance.\n"
      try Data(report.utf8).write(to: staging.appendingPathComponent("Export issues.txt"), options: .atomic)
      produced.append("Export issues.txt")
    }
    try Task.checkCancellation()
    try manager.moveItem(at: staging, to: final)
    finished = true
    progress(HandoffProgress(completed: total, total: total, message: failed.isEmpty ? "Handoff complete" : "Partial handoff saved"))
    return HandoffResult(url: final, slideCount: slides.count, originalCopies: copies, issues: Array(Set(issues)).sorted(), produced: produced)
  }

  private static func images(
    slide: DeckSlide, staged: [String: URL], sources: [String: NativeMediaSource],
    issues: inout [String]
  ) -> [String: CGImage] {
    var result: [String: CGImage] = [:]
    for id in slide.chosenIDs {
      guard let url = staged[id] else { continue }
      if let image = NativeSlideRenderer.imageFromStagedURL(url) {
        result[id] = image
      } else if sources[id]?.mediaKind == "video" {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 3072, height: 3072)
        result[id] = try? generator.copyCGImage(at: .zero, actualTime: nil)
        issues.append(
          "\(slide.title): video is represented by its opening poster frame; the original video is preserved."
        )
      }
      if result[id] == nil {
        issues.append(
          "\(slide.title): \(sources[id]?.filename ?? id) has no static preview; its original is still included where requested."
        )
      }
      if sources[id]?.mediaKind == "gif" {
        issues.append(
          "\(slide.title): animated GIF uses its first frame in PDFs; the original animation is preserved."
        )
      }
    }
    return result
  }
  private static func makePDF(_ url: URL, title: String) throws -> CGContext {
    guard let consumer = CGDataConsumer(url: url as CFURL),
      let context = CGContext(
        consumer: consumer, mediaBox: nil,
        [kCGPDFContextTitle: title, kCGPDFContextCreator: "Workbench native prototype handoff"]
          as CFDictionary)
    else {
      throw WorkbenchFailure(
        name: "ExportDestinationDenied", message: "The PDF destination could not be opened.")
    }
    return context
  }
  private static func beginPage(_ context: CGContext, width: Double, height: Double) {
    var box = CGRect(x: 0, y: 0, width: width, height: height)
    let data = NSData(bytes: &box, length: MemoryLayout<CGRect>.size)
    context.beginPDFPage([kCGPDFContextMediaBox: data] as CFDictionary)
  }
  private static func writePrototypePDF(
    slides: [DeckSlide], canvas: DeckCanvas, staged: [String: URL],
    sources: [String: NativeMediaSource], url: URL, issues: inout [String], progress: (Int) -> Void
  ) throws {
    let context = try makePDF(url, title: "Prototype")
    var closed = false
    defer { if !closed { context.closePDF() } }
    for (index, slide) in slides.enumerated() {
      try Task.checkCancellation()
      let scene = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
      if scene.overflowCharacters > 0 {
        issues.append(
          "Slide \(index+1) — \(slide.title): \(scene.overflowCharacters) characters do not fit the selected prototype layout. The saved deck retains the full copy; see the delivered-companion list in the export report."
        )
      }
      if scene.legacy, let old = slide.legacyComposition,
        old.elements.contains(where: { !["text", "image"].contains($0.kind) && $0.gradient == nil }) {
        issues.append("Slide \(index+1) — \(slide.title): legacy shapes/lines are not rendered; convert to a native prototype layout to revise the suggestion.")
      }
      if scene.imageLayers.contains(where: { $0.assetID == nil }) {
        issues.append(
          "Slide \(index+1) — \(slide.title): an image slot is intentionally or currently empty.")
      }
      let loaded = images(slide: slide, staged: staged, sources: sources, issues: &issues)
      beginPage(context, width: canvas.width, height: canvas.height)
      NativeSlideRenderer.draw(
        scene, in: context, rect: CGRect(x: 0, y: 0, width: canvas.width, height: canvas.height),
        images: loaded)
      context.endPDFPage()
      progress(index + 1)
    }
    context.closePDF()
    closed = true
    guard let pdf = PDFDocument(url: url), pdf.pageCount == slides.count else {
      throw WorkbenchFailure(
        name: "ExportPDFInvalid", message: "The prototype PDF did not contain every included slide."
      )
    }
  }
  private static func writeNotesPDF(
    slides: [DeckSlide], canvas: DeckCanvas, staged: [String: URL],
    sources: [String: NativeMediaSource], labels: [String: String], url: URL, issues: inout [String]
  ) throws {
    let context = try makePDF(url, title: "Prototype with notes")
    var closed = false
    defer { if !closed { context.closePDF() } }
    let width = 842.0
    let height = 1191.0
    let margin = 48.0
    for (index, slide) in slides.enumerated() {
      let scene = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
      let loaded = images(slide: slide, staged: staged, sources: sources, issues: &issues)
      var content =
        "Slide title\n\(slide.title)\n\nDesigner direction\n\(slide.settings.notes.isEmpty ? "No additional direction." : slide.settings.notes)\n\n"
      for block in slide.copyBlocks { content += "\(block.role.capitalized)\n\(block.text)\n\n" }
      content +=
        "Chosen media\n"
        + (slide.mediaAssignments ?? []).map {
          "\($0.role): \(sources[$0.assetReferenceId]?.filename ?? labels[$0.assetReferenceId] ?? $0.assetReferenceId)"
        }.joined(separator: "\n")
      if scene.overflowCharacters > 0 {
        content +=
          "\n\nPrototype overflow: \(scene.overflowCharacters) characters. The complete copy is printed above."
      }
      let paragraph = NSMutableParagraphStyle()
      paragraph.lineSpacing = 3
      paragraph.paragraphSpacing = 7
      let text = NSAttributedString(
        string: content,
        attributes: [
          .font: NSFont.systemFont(ofSize: 15), .foregroundColor: NSColor.black,
          .paragraphStyle: paragraph,
        ])
      var offset = 0
      var continuation = 0
      while offset < text.length {
        try Task.checkCancellation()
        beginPage(context, width: width, height: height)
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let title =
          "\(String(format:"%03d",index+1)) — \(slide.title.replacingOccurrences(of: "\n", with: " ").prefix(120))\(slide.title.count > 120 ? "…" : "")\(continuation>0 ? " · continued" : "")"
        context.saveGState()
        context.translateBy(x: 0, y: height)
        context.scaleBy(x: 1, y: -1)
        let heading = NSAttributedString(
          string: title,
          attributes: [
            .font: NSFont.systemFont(ofSize: 20, weight: .semibold),
            .foregroundColor: NSColor.black,
          ])
        NativeSlideRenderer.drawText(
          NativeSlideRenderer.textPlacement(
            heading, range: CFRange(location: 0, length: 0),
            rect: CGRect(x: margin, y: 28, width: width - 2 * margin, height: 64)), context: context
        )
        context.restoreGState()
        var textY = 108.0
        if continuation == 0 {
          let previewWidth = width - 2 * margin
          let previewHeight = min(420, previewWidth * canvas.height / canvas.width)
          let actualWidth = previewHeight * canvas.width / canvas.height
          NativeSlideRenderer.draw(
            scene, in: context,
            rect: CGRect(
              x: margin, y: height - textY - previewHeight, width: actualWidth,
              height: previewHeight), images: loaded)
          textY += previewHeight + 28
        }
        let placement = NativeSlideRenderer.textPlacement(
          text, range: CFRange(location: offset, length: 0),
          rect: CGRect(
            x: margin, y: textY, width: width - 2 * margin, height: height - textY - margin))
        guard placement.visible.length > 0 else {
          throw WorkbenchFailure(
            name: "NotesLayoutFailed",
            message:
              "The notes page could not fit any text. The previous handoff remains untouched.")
        }
        context.saveGState()
        context.translateBy(x: 0, y: height)
        context.scaleBy(x: 1, y: -1)
        NativeSlideRenderer.drawText(placement, context: context)
        context.restoreGState()
        context.endPDFPage()
        offset += placement.visible.length
        continuation += 1
      }
    }
    context.closePDF()
    closed = true
    guard let pdf = PDFDocument(url: url), pdf.pageCount >= slides.count else {
      throw WorkbenchFailure(name: "ExportPDFInvalid", message: "The notes PDF is incomplete.")
    }
  }
  static func safeName(_ name: String, maximumBytes: Int = 180) -> String {
    var value = name.precomposedStringWithCanonicalMapping.components(
      separatedBy: CharacterSet(charactersIn: "/\\:\0\n\r")
    ).joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
    while value.utf8.count > maximumBytes { value.removeLast() }
    if value.isEmpty || value == "." || value == ".." { return "Untitled" }
    return value
  }
  private static func collisionKey(_ name: String) -> String {
    name.precomposedStringWithCanonicalMapping.folding(
      options: [.caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
  }
  private static func shortID(_ id: String) -> String {
    SHA256.hash(data: Data(id.utf8)).prefix(6).map { String(format: "%02x", $0) }.joined()
  }
  static func safeFilename(_ name: String, suffix: String? = nil) -> String {
    let cleaned = safeName(name, maximumBytes: 8192)
    let url = URL(fileURLWithPath: cleaned)
    let ext = url.pathExtension
    let ending = ext.isEmpty ? "" : "." + ext
    let extra = suffix.map { "-" + $0 } ?? ""
    let budget = max(1, 180 - ending.utf8.count - extra.utf8.count)
    let stem = safeName(url.deletingPathExtension().lastPathComponent, maximumBytes: budget)
    return stem + extra + ending
  }
  private static func heading(_ value: String) -> String {
    value.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\r", with: " ")
      .replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "#", with: "\\#")
  }
  private static func literalBlock(_ value: String) -> String {
    var longest = 0, run = 0
    for c in value { if c == "`" { run += 1; longest = max(longest, run) } else { run = 0 } }
    let fence = String(repeating: "`", count: max(3, longest + 1))
    return fence + "\n" + value + "\n" + fence + "\n"
  }
  static func csvField(_ value: String) -> String {
    let first = value.trimmingCharacters(in: .whitespacesAndNewlines).first
    let dangerous = first.map { "=+-@".contains($0) } ?? false
    let safe = dangerous || value.hasPrefix("\t") || value.hasPrefix("\r") ? "'" + value : value
    return "\"" + safe.replacingOccurrences(of: "\"", with: "\"\"") + "\""
  }
  private static func checksum(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var digest = SHA256()
    while let data = try handle.read(upToCount: 1_048_576), !data.isEmpty {
      try Task.checkCancellation()
      digest.update(data: data)
    }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }
}
