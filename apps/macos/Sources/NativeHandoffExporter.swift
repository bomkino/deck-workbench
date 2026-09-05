import AVFoundation
import AppKit
import CoreGraphics
import CoreText
import CryptoKit
import Foundation
import PDFKit

struct HandoffOptions: Sendable {
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
}

enum NativeHandoffExporter {
  static func export(
    snapshot: DeckDocumentSnapshot, sources: [String: NativeMediaSource], to parent: URL,
    options: HandoffOptions, progress: @Sendable (HandoffProgress) -> Void
  ) throws -> HandoffResult {
    let slides = snapshot.deck.includedSlides.filter {
      options.selectedSlideIDs == nil || options.selectedSlideIDs!.contains($0.id)
    }
    guard !slides.isEmpty else {
      throw WorkbenchFailure(
        name: "ExportEmpty", message: "Choose at least one included slide to export.")
    }
    guard
      options.prototypePDF || options.notesPDF || options.copy || options.approved
        || options.shortlisted
    else {
      throw WorkbenchFailure(name: "ExportEmpty", message: "Choose at least one handoff component.")
    }
    let manager = FileManager.default
    let name = safeName(snapshot.deck.title, maximumBytes: 120)
    var ordinal = 1
    var final = parent.appendingPathComponent(
      "\(name) — Handoff \(String(format:"%03d",ordinal))", isDirectory: true)
    while manager.fileExists(atPath: final.path) {
      ordinal += 1
      final = parent.appendingPathComponent(
        "\(name) — Handoff \(String(format:"%03d",ordinal))", isDirectory: true)
    }
    let staging = parent.appendingPathComponent(
      ".\(name)-handoff-\(UUID().uuidString)", isDirectory: true)
    try manager.createDirectory(at: staging, withIntermediateDirectories: false)
    var finished = false
    defer { if !finished { try? manager.removeItem(at: staging) } }
    try Data("pitchdog.handoff/1\nrevision=\(snapshot.revision)\n".utf8).write(
      to: staging.appendingPathComponent(".workbench-handoff"), options: .atomic)
    let originals = staging.appendingPathComponent(".verified-originals", isDirectory: true)
    try manager.createDirectory(at: originals, withIntermediateDirectories: false)
    var wanted = Set<String>()
    var expectations: [String: Set<String>] = [:]
    for slide in slides {
      var ids = slide.chosenIDs
      if options.shortlisted { ids.formUnion(slide.settings.shortlist) }
      wanted.formUnion(ids)
      for id in ids {
        if let fingerprint = slide.settings.sourceFingerprints[id] {
          expectations[id, default: []].insert(fingerprint)
        }
      }
    }
    var staged: [String: URL] = [:]
    var hashes: [String: String] = [:]
    var issues: [String] = []
    let labels = Dictionary(
      uniqueKeysWithValues: (snapshot.deck.assetReferences ?? []).map { ($0.id, $0.label) })
    var completed = 0
    for id in wanted.sorted() {
      try Task.checkCancellation()
      defer {
        completed += 1
        progress(
          HandoffProgress(
            completed: completed, total: wanted.count + slides.count, message: "Preparing originals"
          ))
      }
      guard let source = sources[id] else {
        issues.append("\(labels[id] ?? id): original unavailable; reconnect its media folder.")
        continue
      }
      let expected = expectations[id] ?? []
      if expected.count > 1 && !options.acceptChangedSources {
        issues.append(
          "\(source.filename): slides refer to different saved source revisions; this original was omitted."
        )
        continue
      }
      let url = originals.appendingPathComponent(
        "\(shortID(id)).\(URL(fileURLWithPath:source.filename).pathExtension)")
      do {
        hashes[id] = try NativeMediaIO.stageOriginal(
          source, to: url, expectedFingerprint: expected.first,
          acceptChanged: options.acceptChangedSources)
        staged[id] = url
      } catch is CancellationError { throw CancellationError() } catch {
        let failure = WorkbenchFailure.unexpected(error)
        // Source problems are creative handoff exceptions; destination failures are not.
        if [
          "SourceChanged", "MediaRootNeedsPermission", "UnsafeMediaLocation", "MediaUnavailable",
          "MediaRootUnavailable", "MissingMedia",
        ].contains(failure.name) || (error as? POSIXError)?.code == .ENOENT {
          issues.append("\(source.filename): \(failure.message)")
        } else {
          throw error
        }
      }
    }
    if options.approved {
      try manager.createDirectory(
        at: staging.appendingPathComponent("Approved Media"), withIntermediateDirectories: false)
    }
    if options.shortlisted {
      try manager.createDirectory(
        at: staging.appendingPathComponent("Shortlisted Media"), withIntermediateDirectories: false)
    }
    var rows = [["slide", "slide_id", "title", "collection", "role", "asset_id", "file", "sha256"]]
    var copies = 0
    for (index, slide) in slides.enumerated() {
      try Task.checkCancellation()
      let folder = "\(String(format:"%03d",index+1)) — \(safeName(slide.title,maximumBytes:120))"
      for (collection, enabled, ids) in [
        ("Approved Media", options.approved, Array(slide.chosenIDs).sorted()),
        ("Shortlisted Media", options.shortlisted, slide.settings.shortlist),
      ] where enabled {
        let directory = staging.appendingPathComponent(collection).appendingPathComponent(
          folder, isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: false)
        var used = Set<String>()
        for id in ids {
          guard let original = staged[id] else { continue }
          let originalName = sources[id]?.filename ?? labels[id] ?? "media"
          var filename = safeName(originalName, maximumBytes: 180)
          if !used.insert(collisionKey(filename)).inserted {
            let ext = URL(fileURLWithPath: filename).pathExtension
            let stem = URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent
            filename = "\(stem)-\(shortID(id))\(ext.isEmpty ? "" : "."+ext)"
            guard used.insert(collisionKey(filename)).inserted else {
              throw WorkbenchFailure(
                name: "ExportCollision",
                message: "Two output names still collide; originals were not changed.")
            }
          }
          let output = directory.appendingPathComponent(filename)
          try manager.copyItem(at: original, to: output)
          guard try checksum(output) == hashes[id] else {
            throw WorkbenchFailure(
              name: "ExportCopyFailed", message: "The copied bytes did not match \(originalName).")
          }
          copies += 1
          let role = (slide.mediaAssignments ?? []).filter { $0.assetReferenceId == id }.map(\.role)
            .joined(separator: "; ")
          rows.append([
            String(index + 1), slide.id, slide.title, collection, role, id,
            "\(collection)/\(folder)/\(filename)", hashes[id] ?? "",
          ])
        }
      }
    }
    if options.copy {
      var copy = "# \(snapshot.deck.title)\n\n"
      for (index, slide) in slides.enumerated() {
        copy += "## \(String(format:"%03d",index+1)) — \(slide.title)\n\n"
        for block in slide.copyBlocks { copy += "### \(block.role)\n\n\(block.text)\n\n" }
        if !slide.settings.notes.isEmpty {
          copy += "### Designer notes\n\n\(slide.settings.notes)\n\n"
        }
      }
      try Data(copy.utf8).write(to: staging.appendingPathComponent("Copy.md"), options: .atomic)
    }
    if options.approved || options.shortlisted {
      let csv =
        rows.map { $0.map(csvField).joined(separator: ",") }.joined(separator: "\r\n") + "\r\n"
      try Data(csv.utf8).write(
        to: staging.appendingPathComponent("Media index.csv"), options: .atomic)
    }
    if options.prototypePDF {
      try writePrototypePDF(
        slides: slides, canvas: snapshot.deck.canvasPreset, staged: staged, sources: sources,
        url: staging.appendingPathComponent("Prototype.pdf"), issues: &issues,
        progress: { index in
          progress(
            HandoffProgress(
              completed: wanted.count + index, total: wanted.count + slides.count,
              message: "Rendering slide \(index) of \(slides.count)"))
        })
    }
    if options.notesPDF {
      try writeNotesPDF(
        slides: slides, canvas: snapshot.deck.canvasPreset, staged: staged, sources: sources,
        labels: labels, url: staging.appendingPathComponent("Prototype with notes.pdf"),
        issues: &issues)
    }
    try manager.removeItem(at: originals)
    if !issues.isEmpty {
      let report =
        "Handoff exported with exceptions\nDocument revision: \(snapshot.revision)\n\n"
        + Array(Set(issues)).sorted().joined(separator: "\n")
        + "\n\nCopy.md and the notes PDF contain all copy even when the selected prototype layout overflows. Original source files were not changed.\n"
      try Data(report.utf8).write(
        to: staging.appendingPathComponent("Export issues.txt"), options: .atomic)
    }
    try Task.checkCancellation()
    try manager.moveItem(at: staging, to: final)
    finished = true
    return HandoffResult(
      url: final, slideCount: slides.count, originalCopies: copies,
      issues: Array(Set(issues)).sorted())
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
    for (index, slide) in slides.enumerated() {
      try Task.checkCancellation()
      let scene = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
      if scene.overflowCharacters > 0 {
        issues.append(
          "Slide \(index+1) — \(slide.title): \(scene.overflowCharacters) characters do not fit the selected prototype layout. Full copy remains in the companion outputs."
        )
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
    let width = 842.0
    let height = 1191.0
    let margin = 48.0
    for (index, slide) in slides.enumerated() {
      let scene = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
      let loaded = images(slide: slide, staged: staged, sources: sources, issues: &issues)
      var content =
        "Designer direction\n\(slide.settings.notes.isEmpty ? "No additional direction." : slide.settings.notes)\n\n"
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
          "\(String(format:"%03d",index+1)) — \(slide.title)\(continuation>0 ? " · continued" : "")"
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
            rect: CGRect(x: margin, y: 32, width: width - 2 * margin, height: 52)), context: context
        )
        context.restoreGState()
        var textY = 96.0
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
  private static func csvField(_ value: String) -> String {
    "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\""
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
