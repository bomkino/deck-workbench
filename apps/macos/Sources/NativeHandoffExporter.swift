import AVFoundation
import AppKit
import CoreGraphics
import CoreText
import CryptoKit
import Darwin
import Foundation
import ImageIO
import PDFKit
import UniformTypeIdentifiers

struct HandoffOptions: Codable, Sendable {
  var prototypePDF = true
  var notesPDF = true
  var copy = true
  var approved = true
  var shortlisted = true
  var productionCopy = false
  var psd = false
  var inDesign = false
  var psdCropToFrames = true
  var acceptChangedSources = false
  var selectedSlideIDs: Set<String>?

  var resolved: HandoffOptions {
    var value = self
    if value.inDesign { value.psd = true }
    if value.psd { value.productionCopy = true }
    return value
  }
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
  /// Workbench's own Markdown intake limit (NativeCopyImport).
  private static let importLimit = 1_048_576
  /// A hidden staging folder is a crashed or force-quit export's leftover only
  /// when no running export holds its lock and it is at least this old.
  private static let staleUnlockedStaging: TimeInterval = 2 * 3600
  /// On a volume without advisory locks, or one shared over a network, age
  /// alone decides, conservatively.
  private static let staleUnlockableStaging: TimeInterval = 24 * 3600
  private static let notesPage = (width: 842.0, height: 1191.0, margin: 48.0)

  static func exportSlides(snapshot: DeckDocumentSnapshot, options: HandoffOptions) -> [DeckSlide] {
    NativeContents.resolve(slides: snapshot.deck.includedSlides.filter { options.selectedSlideIDs == nil || options.selectedSlideIDs!.contains($0.id) })
  }
  static func requiredAssetIDs(snapshot: DeckDocumentSnapshot, options: HandoffOptions) -> Set<String> {
    let options = options.resolved
    var ids = Set<String>()
    for slide in exportSlides(snapshot: snapshot, options: options) {
      if options.prototypePDF || options.notesPDF || options.psd { ids.formUnion(slide.chosenIDs) }
      if options.approved { ids.formUnion(assignedIDs(slide)) }
      if options.shortlisted { ids.formUnion(slide.settings.shortlist) }
    }
    return ids
  }
  static func export(
    snapshot: DeckDocumentSnapshot, sources: [String: NativeMediaSource], to parent: URL,
    options: HandoffOptions, progress: @Sendable (HandoffProgress) -> Void
  ) throws -> HandoffResult {
    let options = options.resolved
    let slides = exportSlides(snapshot: snapshot, options: options)
    guard !slides.isEmpty else { throw WorkbenchFailure(name: "ExportEmpty", message: "Choose at least one included slide to export.") }
    guard options.prototypePDF || options.notesPDF || options.copy || options.approved || options.shortlisted || options.productionCopy || options.psd else {
      throw WorkbenchFailure(name: "ExportEmpty", message: "Choose at least one handoff component.")
    }
    let manager = FileManager.default
    let name = safeName(snapshot.deck.title, maximumBytes: 120)
    sweepStaleStaging(in: parent)
    let staging = parent.appendingPathComponent(".\(name)-handoff-\(UUID().uuidString)", isDirectory: true)
    try manager.createDirectory(at: staging, withIntermediateDirectories: false)
    var finished = false
    defer { if !finished { try? manager.removeItem(at: staging) } }
    let marker = staging.appendingPathComponent(".workbench-handoff")
    try Data("pitchdog.handoff/1\nrevision=\(snapshot.revision)\n".utf8).write(to: marker, options: .atomic)
    // Held until the folder is published, so another export's sweep never
    // mistakes this live staging folder for an abandoned one.
    let lock = lockStaging(marker)
    defer { if lock >= 0 { Darwin.close(lock) } }
    var issues: [String] = []
    var produced: [String] = []
    var failed: [String] = []
    let wanted = requiredAssetIDs(snapshot: snapshot, options: options)
    let total = max(1, wanted.count + (options.copy ? 1 : 0) + (options.approved ? slides.count : 0)
      + (options.shortlisted ? slides.count : 0) + (options.prototypePDF ? slides.count : 0) + (options.notesPDF ? slides.count : 0) + ((options.productionCopy || options.psd) ? 1 : 0) + (options.psd ? slides.count : 0))
    var completed = 0
    func advance(_ message: String, by units: Int = 1) {
      completed += units
      progress(HandoffProgress(completed: min(completed, total), total: total, message: message))
    }
    // A failed component cannot erase an independently completed one. A partial
    // destination is removed before it can be listed as a delivered component.
    func record(_ name: String, _ error: Error) throws {
      if error is CancellationError { throw CancellationError() }
      try? manager.removeItem(at: staging.appendingPathComponent(name))
      failed.append(name)
      issues.append("\(name) was not produced: \(error.localizedDescription)")
    }
    func component(_ name: String, _ operation: () throws -> Void) throws {
      try Task.checkCancellation()
      do { try operation(); produced.append(name) }
      catch { try record(name, error) }
    }
    if options.copy {
      try component("Copy.md") {
        let copy = Data(NativeCopyMarkdown.write(title: snapshot.deck.title, canvasID: snapshot.deck.canvasPreset.id, slides: slides).utf8)
        try copy.write(to: staging.appendingPathComponent("Copy.md"), options: .atomic)
        if copy.count > importLimit {
          issues.append("Copy.md is larger than Workbench’s 1 MiB import limit. It holds the complete copy, but importing it again needs a smaller slide selection.")
        }
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
      for id in assignedIDs(slide).union(slide.settings.shortlist).intersection(wanted) {
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
      for id in assignedIDs(slide).union(slide.settings.shortlist).intersection(wanted) {
        if let problem = unavailable[id] { issues.append("Slide \(index + 1) — \(slide.title): \(sources[id]?.filename ?? labels[id] ?? id): \(problem)") }
      }
    }
    let canvas = snapshot.deck.canvasPreset
    // One decode per asset and size for the whole export, shared by the PSDs
    // and both PDFs, and trimmed to a memory budget between slides.
    let artwork = NativeHandoffArtwork(staged: staged, videos: Set(sources.filter { $0.value.mediaKind == "video" }.keys))
    // Layers and Smart Objects carry the originals' own names, not staged ones.
    let filenames = sources.mapValues { safeFilename($0.filename) }
    var production: WorkbenchProductionCopy?
    var productionDirectory: URL?
    var psdFailure: Error?
    if options.productionCopy || options.psd {
      try component("Starter Kit") {
        try NativeStarterKit.copy(to: staging.appendingPathComponent("Starter Kit", isDirectory: true))
      }
      // Production is listed once its writing, manifest and every PSD exist.
      do {
        try Task.checkCancellation()
        let projected = try NativeWorkbenchMarkdown.project(snapshot: snapshot, slides: slides)
        let directory = staging.appendingPathComponent("Production", isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: false)
        if options.psd {
          if preparationFailed { throw WorkbenchFailure(name: "MediaPreparationFailed", message: "Original preparation failed; production artwork was not created.") }
          try manager.createDirectory(at: directory.appendingPathComponent("PSD", isDirectory: true), withIntermediateDirectories: false)
        }
        production = projected
        productionDirectory = directory
      } catch { try record("Production", error) }
    }
    let prototypeURL = staging.appendingPathComponent("Prototype.pdf")
    let notesURL = staging.appendingPathComponent("Prototype with notes.pdf")
    var prototype: CGContext?
    var notes: CGContext?
    var prototypeFailure: Error?
    var notesFailure: Error?
    defer { prototype?.closePDF(); notes?.closePDF() }
    let mediaFailure = WorkbenchFailure(name: "MediaPreparationFailed", message: "Original preparation failed; completed components are retained.")
    if options.prototypePDF {
      if preparationFailed { prototypeFailure = mediaFailure }
      else { do { prototype = try makePDF(prototypeURL, title: "Prototype") } catch { prototypeFailure = error } }
    }
    if options.notesPDF {
      if preparationFailed { notesFailure = mediaFailure }
      else { do { notes = try makePDF(notesURL, title: "Prototype with notes") } catch { notesFailure = error } }
    }
    // One pass resolves each slide once and draws it into every requested
    // output; each output still succeeds or fails on its own.
    let psdDirectory = options.psd ? productionDirectory : nil
    if prototype != nil || notes != nil || psdDirectory != nil {
      let notesScale = 2 * notesPreviewScale(canvas)
      for (index, slide) in slides.enumerated() {
        try Task.checkCancellation()
        try autoreleasepool {
          let scene = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
          let renderPSD = psdDirectory != nil && psdFailure == nil
          // The prototype page is the canvas in points; a little headroom keeps
          // its images sharp when zoomed. A PSD needs exactly its placements.
          var sides: [String: Int] = [:]
          if renderPSD || prototype != nil {
            let scale = prototype != nil ? 1.25 : 1
            let plan = renderPSD
              ? NativePSDExporter.artworkSides(scene: scene, artwork: artwork, scale: scale,
                budget: min(artwork.slideBudget, NativePSDExporter.artworkBudget(scene: scene, staged: staged)))
              : artwork.fit(artwork.plan(scene, scale: scale), budget: artwork.slideBudget)
            sides = plan.sides
            if plan.reduced {
              issues.append("Slide \(index + 1) — \(slide.title): artwork was decoded below its placed size to stay within the export memory budget. Originals are unchanged.")
            }
          }
          if renderPSD, let directory = productionDirectory {
            let path = "PSD/Slide \(String(format: "%02d", index + 1)).psd"
            let output = directory.appendingPathComponent(path)
            do {
              let warnings = try NativePSDExporter.write(slide: slide, canvas: canvas, staged: staged,
                cropToFrames: options.psdCropToFrames, to: output, scene: scene, sides: sides,
                filenames: filenames, artwork: artwork)
              let digest = try checksum(output)
              production?.manifest.warnings += warnings.map { "Slide \(index + 1): \($0)" }
              production?.manifest.slides[index].psd = WorkbenchProductionPSD(path: path, sha256: digest, width: Int(canvas.width), height: Int(canvas.height))
              production?.manifest.slides[index].psd?.framing = options.psdCropToFrames ? "workbench-masks" : "full-images"
            } catch is CancellationError { throw CancellationError() }
            catch { psdFailure = error }
          }
          if psdDirectory != nil { advance("Preparing Photoshop slide \(index + 1) of \(slides.count)") }
          var sizes: [String: CGSize] = [:]
          for layer in scene.imageLayers {
            if let id = layer.assetID, let size = artwork.original(id).size { sizes[id] = size }
          }
          if let context = prototype {
            if let type = slide.settings.layout.starterType, !type.unavailableFonts.isEmpty {
              issues.append("Slide \(index + 1) — \(slide.title): missing fonts (\(type.unavailableFonts.joined(separator: ", "))); System was used for this prototype.")
            }
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
            let loaded = try images(slide: slide, scene: scene, sides: sides, preview: false,
              artwork: artwork, sources: sources, issues: &issues)
            beginPage(context, width: canvas.width, height: canvas.height)
            NativeSlideRenderer.draw(
              scene, in: context, rect: CGRect(x: 0, y: 0, width: canvas.width, height: canvas.height),
              images: loaded, sourceSizes: sizes)
            context.endPDFPage()
            advance("Rendering prototype · slide \(index + 1)")
          }
          if options.notesPDF {
            if notesFailure == nil, let context = notes {
              do {
                // Previews are drawn small: decoded at about twice their size,
                // from the decode the prototype already holds where there is one.
                let loaded = try images(slide: slide, scene: scene, sides: artwork.plan(scene, scale: notesScale),
                  preview: true, artwork: artwork, sources: sources, issues: &issues)
                try drawNotes(slide: slide, index: index, scene: scene, canvas: canvas, images: loaded,
                  sourceSizes: sizes, sources: sources, labels: labels, context: context)
              } catch is CancellationError { throw CancellationError() }
              catch { notesFailure = error }
            }
            advance("Writing notes companion")
          }
          artwork.trim()
        }
      }
    }
    if let directory = productionDirectory, let production {
      try component("Production") {
        if let psdFailure { throw psdFailure }
        try Data(production.markdown.utf8).write(to: directory.appendingPathComponent("workbench.md"), options: .atomic)
        try nativeJSON(production.manifest).write(to: directory.appendingPathComponent("workbench-production.json"), options: .atomic)
        issues += production.warnings
        advance("Writing production copy and manifest")
      }
    }
    var rows = [["page", "slide_id", "title", "collection", "role", "asset_id", "file", "sha256", "status", "original_filename", "source_note"]]
    var copies = 0
    // On a volume that clones files (APFS), each copy shares the staged file's
    // blocks, whose fingerprint staging already took; elsewhere it is read back.
    let clones = (try? staging.resourceValues(forKeys: [.volumeSupportsFileCloningKey]))?.volumeSupportsFileCloning == true
    for (collection, enabled) in [("Approved Media", options.approved), ("Shortlisted Media", options.shortlisted)] where enabled {
      let rowStart = rows.count, copyStart = copies
      try component(collection) {
        if preparationFailed { throw WorkbenchFailure(name: "MediaPreparationFailed", message: "Original preparation failed; completed text outputs are retained.") }
        let target = staging.appendingPathComponent(collection, isDirectory: true)
        try manager.createDirectory(at: target, withIntermediateDirectories: false)
        for (index, slide) in slides.enumerated() {
          try Task.checkCancellation()
          let folder = "\(String(format: "%02d", index + 1)) — \(safeName(slide.title, maximumBytes: 120))"
          let directory = target.appendingPathComponent(folder, isDirectory: true)
          try manager.createDirectory(at: directory, withIntermediateDirectories: false)
          let ids = collection == "Approved Media" ? Array(assignedIDs(slide)).sorted() : slide.settings.shortlist
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
            guard try verifiedCopy(output, of: original, sha256: hashes[id], cloned: clones) else { throw WorkbenchFailure(name: "ExportCopyFailed", message: "Copied bytes did not match \(originalName).") }
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
        if let context = prototype { context.closePDF(); prototype = nil }
        if let prototypeFailure { throw prototypeFailure }
        guard let pdf = PDFDocument(url: prototypeURL), pdf.pageCount == slides.count else {
          throw WorkbenchFailure(
            name: "ExportPDFInvalid", message: "The prototype PDF did not contain every included slide."
          )
        }
      }
    }
    if options.notesPDF {
      try component("Prototype with notes.pdf") {
        if let context = notes { context.closePDF(); notes = nil }
        if let notesFailure { throw notesFailure }
        guard let pdf = PDFDocument(url: notesURL), pdf.pageCount >= slides.count else {
          throw WorkbenchFailure(name: "ExportPDFInvalid", message: "The notes PDF is incomplete.")
        }
      }
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
    if produced.contains("Production") {
      let guide = """
      YOUR DECK HANDOFF

      InDesign: \(options.inDesign ? "Workbench will build InDesign/Deck.indd after this folder is saved. Check the export result for success or exceptions." : "Automatic building was not selected. Use Starter Kit/Start Here - Deck Production.md to build manually.")

      Figma: import Production/workbench.md with your existing Workbench importer. Edit Production/PSD, then run Starter Kit/Automation/Photoshop/Export Slide PNGs.jsx to make the background and transparent-character PNGs.

      InDesign artwork: once Deck.indd exists, edit or share InDesign/Links/PSD. These are the files linked to the document. Production/PSD remains the original export; the two folders do not sync each other.

      Returned artwork: keep PSD names such as Slide 01.psd. Open Deck.indd and run Starter Kit/Automation/InDesign/Refresh PSD Links.jsx; it backs up old artwork and restores layer visibility and links. Use the same helper after moving this entire folder to another computer.

      Starter Kit contains both sizes, layout kits, colour/type controls, text scrambling, Photoshop templates and the PNG exporter. Originals are in Approved Media and Shortlisted Media when those components were selected. Media index.csv records the copies.

      Keep this whole folder together. Your editable .pitchdeck is separate: copy it too if the next person needs to change the Workbench assembly. A handoff does not replace that document.

      Text-area guides inside PSD Smart Objects are hidden by default. Switch them on while expanding artwork, then hide them before saving finished artwork. The bundled PNG exporter excludes these guides.

      Review Export issues.txt when present. Any incomplete InDesign folder must not be treated as a finished deck.
      """
      try Data(guide.utf8).write(to: staging.appendingPathComponent("START HERE.txt"), options: .atomic)
      produced.append("START HERE.txt")
    }
    try Task.checkCancellation()
    let final = try publish(staging, in: parent, name: name)
    finished = true
    progress(HandoffProgress(completed: total, total: total, message: failed.isEmpty ? "Handoff complete" : "Partial handoff saved"))
    return HandoffResult(url: final, slideCount: slides.count, originalCopies: copies, issues: Array(Set(issues)).sorted(), produced: produced)
  }

  /// Moves the finished staging folder to the first free "— Handoff NNN" name,
  /// chosen now rather than when the export began. The rename is exclusive, so
  /// it never replaces another export's folder; a taken name moves on to the
  /// next number, and the finished handoff is never discarded for a collision.
  private static func publish(_ staging: URL, in parent: URL, name: String) throws -> URL {
    let manager = FileManager.default
    for ordinal in 1...100_000 {
      let final = parent.appendingPathComponent("\(name) — Handoff \(String(format: "%03d", ordinal))", isDirectory: true)
      if manager.fileExists(atPath: final.path) { continue }
      let code: Int32 = staging.path.withCString { source in
        final.path.withCString { destination in
          renamex_np(source, destination, UInt32(RENAME_EXCL)) == 0 ? 0 : errno
        }
      }
      if code == 0 { return final }
      if code == EEXIST || code == ENOTEMPTY { continue }
      guard code == ENOTSUP || code == EINVAL else { throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO) }
      // This volume has no exclusive rename. A move refuses an existing
      // destination, so a name taken meanwhile still moves on.
      do {
        try manager.moveItem(at: staging, to: final)
        return final
      } catch {
        if manager.fileExists(atPath: final.path) && manager.fileExists(atPath: staging.path) { continue }
        throw error
      }
    }
    throw WorkbenchFailure(name: "ExportDestinationFull", message: "No free handoff folder name remains in this folder. Choose another destination.")
  }

  /// An exclusive advisory lock on a staging marker, or -1 where none can be held.
  private static func lockStaging(_ marker: URL) -> Int32 {
    let descriptor = Darwin.open(marker.path, O_RDONLY | O_NOFOLLOW)
    guard descriptor >= 0 else { return -1 }
    guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
      Darwin.close(descriptor)
      return -1
    }
    return descriptor
  }

  /// Removes hidden staging folders (with their verified original copies) that
  /// a crashed or force-quit export left in `parent`. Only a folder named like
  /// this exporter's staging, holding its marker, locked by no running export
  /// and old enough is removed; anything else is never touched.
  private static func sweepStaleStaging(in parent: URL) {
    let manager = FileManager.default
    guard let entries = try? manager.contentsOfDirectory(atPath: parent.path) else { return }
    // Another Mac's export on a shared volume may not see this Mac's locks.
    let local = (try? parent.resourceValues(forKeys: [.volumeIsLocalKey]))?.volumeIsLocal == true
    for entry in entries where entry.hasPrefix(".") {
      guard let range = entry.range(of: "-handoff-", options: .backwards),
        UUID(uuidString: String(entry[range.upperBound...])) != nil else { continue }
      let folder = parent.appendingPathComponent(entry, isDirectory: true)
      let marker = folder.appendingPathComponent(".workbench-handoff")
      guard let folderValues = try? folder.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]),
        folderValues.isDirectory == true, folderValues.isSymbolicLink != true,
        let markerValues = try? marker.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .contentModificationDateKey]),
        markerValues.isRegularFile == true, markerValues.isSymbolicLink != true,
        let modified = markerValues.contentModificationDate,
        let contents = try? Data(contentsOf: marker), contents.count < 4096,
        String(decoding: contents, as: UTF8.self).hasPrefix("pitchdog.handoff/1\n")
      else { continue }
      let descriptor = Darwin.open(marker.path, O_RDONLY | O_NOFOLLOW)
      guard descriptor >= 0 else { continue }
      defer { Darwin.close(descriptor) }
      let minimumAge: TimeInterval
      if flock(descriptor, LOCK_EX | LOCK_NB) == 0 { minimumAge = local ? staleUnlockedStaging : staleUnlockableStaging }
      else if errno == EAGAIN { continue }  // EWOULDBLOCK: a running export holds it.
      else { minimumAge = staleUnlockableStaging }
      guard Date().timeIntervalSince(modified) >= minimumAge else { continue }
      try? manager.removeItem(at: folder)
    }
  }

  private static func assignedIDs(_ slide: DeckSlide) -> Set<String> {
    Set((slide.mediaAssignments ?? []).map(\.assetReferenceId))
  }

  /// The slide's drawn images for a PDF, from the export's shared decodes.
  /// `preview` makes small copies (the notes pages) from a held decode.
  private static func images(
    slide: DeckSlide, scene: ResolvedPrototype, sides: [String: Int], preview: Bool,
    artwork: NativeHandoffArtwork, sources: [String: NativeMediaSource], issues: inout [String]
  ) throws -> [String: CGImage] {
    var result: [String: CGImage] = [:]
    for id in Set(scene.imageLayers.compactMap(\.assetID)) where artwork.staged[id] != nil {
      let side = sides[id] ?? NativeHandoffArtwork.minimumStillSide
      let decoded = try preview ? artwork.preview(id, side: side) : artwork.image(id, side: side)
      result[id] = decoded?.image
      if decoded?.kind == .video || (decoded == nil && sources[id]?.mediaKind == "video") {
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
  /// A notes page draws the slide at this fraction of its canvas size.
  private static func notesPreviewScale(_ canvas: DeckCanvas) -> Double {
    let previewWidth = notesPage.width - 2 * notesPage.margin
    return min(420, previewWidth * canvas.height / canvas.width) / canvas.height
  }
  private static func drawNotes(
    slide: DeckSlide, index: Int, scene: ResolvedPrototype, canvas: DeckCanvas, images: [String: CGImage],
    sourceSizes: [String: CGSize], sources: [String: NativeMediaSource], labels: [String: String], context: CGContext
  ) throws {
    let width = notesPage.width
    let height = notesPage.height
    let margin = notesPage.margin
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
    // One layout of the text per slide; each page continues where the last ended.
    let setter = CTFramesetterCreateWithAttributedString(text)
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
            height: previewHeight), images: images, sourceSizes: sourceSizes)
        textY += previewHeight + 28
      }
      let placement = NativeSlideRenderer.textPlacement(
        text, setter: setter, range: CFRange(location: offset, length: 0),
        rect: CGRect(
          x: margin, y: textY, width: width - 2 * margin, height: height - textY - margin))
      guard placement.visible.length > 0 else {
        context.endPDFPage()
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
  static func safeName(_ name: String, maximumBytes: Int = 180) -> String {
    var value = name.precomposedStringWithCanonicalMapping.components(
      separatedBy: CharacterSet(charactersIn: "/\\:\0\n\r")
    ).joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
    // A leading dot would hide the folder or file in Finder.
    while value.hasPrefix(".") { value.removeFirst() }
    value = value.trimmingCharacters(in: .whitespacesAndNewlines)
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
    // An implausibly long "extension" stays part of the name, so the result
    // always fits the 255-byte file name limit.
    let ext = url.pathExtension
    let keepsExtension = !ext.isEmpty && ext.utf8.count <= 32
    let ending = keepsExtension ? "." + ext : ""
    let extra = suffix.map { "-" + $0 } ?? ""
    let budget = max(1, 180 - ending.utf8.count - extra.utf8.count)
    let stem = safeName(keepsExtension ? url.deletingPathExtension().lastPathComponent : cleaned, maximumBytes: budget)
    return stem + extra + ending
  }
  static func csvField(_ value: String) -> String {
    let first = value.trimmingCharacters(in: .whitespacesAndNewlines).first
    let dangerous = first.map { "=+-@".contains($0) } ?? false
    let safe = dangerous || value.hasPrefix("\t") || value.hasPrefix("\r") ? "'" + value : value
    return "\"" + safe.replacingOccurrences(of: "\"", with: "\"\"") + "\""
  }
  /// A delivered media copy matches its staged original. On a cloning volume
  /// the copy shares the staged blocks that staging fingerprinted, so a whole
  /// size confirms it without reading every byte again; elsewhere it is hashed.
  private static func verifiedCopy(_ output: URL, of original: URL, sha256: String?, cloned: Bool) throws -> Bool {
    guard let sha256 else { return false }
    if cloned {
      let copied = try output.resourceValues(forKeys: [.fileSizeKey]).fileSize
      let staged = try original.resourceValues(forKeys: [.fileSizeKey]).fileSize
      return copied != nil && copied == staged
    }
    return try checksum(output) == sha256
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

/// Decoded artwork for one export. The PSDs and both PDFs share each decode;
/// a decode is only as large as its placements need (never above the original
/// or 8192 px), and least recently used decodes are released between slides
/// once the cache exceeds a budget scaled to the Mac's memory. Not thread-safe:
/// one export uses it on its own thread.
final class NativeHandoffArtwork {
  enum Kind { case raster, pdf, video }
  struct Decoded {
    let image: CGImage
    let kind: Kind
  }
  /// What a staged original is, read without decoding it.
  struct Original {
    /// Upright pixels for an image, points for a PDF page; nil when unknown (video).
    let size: CGSize?
    /// ImageIO's type identifier and image count, when ImageIO reads the file.
    let type: String
    let count: Int
  }
  static let maximumSide = 8192
  /// Embedded stills, and placements of unknown size, keep the earlier 3072 px.
  static let minimumStillSide = 3072
  let staged: [String: URL]
  private let videos: Set<String>
  private let budget: Int
  private var originals: [String: Original] = [:]
  private var failures = Set<String>()
  private struct Entry {
    let id: String
    let side: Int
    let decoded: Decoded
    let cost: Int
    var use: Int
  }
  private var entries: [String: Entry] = [:]
  private var clock = 0
  private var held = 0

  init(staged: [String: URL], videos: Set<String> = []) {
    self.staged = staged
    self.videos = videos
    let memory = ProcessInfo.processInfo.physicalMemory
    budget = Int(min(UInt64(320) << 20, max(UInt64(96) << 20, memory / 32)))
  }
  /// Everything one slide draws stays decoded together.
  var slideBudget: Int { max(budget, 256 << 20) }

  func original(_ id: String) -> Original {
    if let known = originals[id] { return known }
    var value = Original(size: nil, type: "", count: 0)
    if let url = staged[id] {
      if let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
        CGImageSourceGetCount(source) > 0
      {
        var size: CGSize?
        if let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
          let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
          width > 0, height > 0
        {
          let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
          size = orientation >= 5 ? CGSize(width: height, height: width) : CGSize(width: width, height: height)
        }
        value = Original(size: size, type: (CGImageSourceGetType(source) as String?) ?? "", count: CGImageSourceGetCount(source))
      } else if let document = CGPDFDocument(url as CFURL), let page = document.page(at: 1) {
        let bounds = page.getBoxRect(.cropBox)
        if bounds.width > 0, bounds.height > 0 { value = Original(size: bounds.size, type: "", count: 0) }
      }
    }
    originals[id] = value
    return value
  }

  /// A requested longest side rounded up to 256 px (so nearby needs share a
  /// decode), never above 8192 px or the original.
  func effectiveSide(_ id: String, _ requested: Int) -> Int {
    var side = min(Self.maximumSide, max(256, (min(requested, Self.maximumSide) + 255) / 256 * 256))
    if let size = original(id).size {
      side = min(side, max(1, Int(Double(max(size.width, size.height)).rounded(.up))))
    }
    return side
  }

  /// The longest side each drawn asset needs: its largest placement on this
  /// slide, in canvas units, × `scale`.
  func plan(_ scene: ResolvedPrototype, scale: Double) -> [String: Int] {
    var sides: [String: Int] = [:]
    for layer in scene.imageLayers {
      guard let id = layer.assetID, staged[id] != nil else { continue }
      let longest: Double
      if let size = original(id).size {
        let rect = NativeSlideRenderer.imageRect(sourceWidth: Double(size.width), sourceHeight: Double(size.height),
          frame: layer.frame, crop: layer.crop, fit: layer.fit)
        longest = Double(max(rect.width, rect.height))
      } else {
        // Unknown proportions: the frame at its crop's zoom.
        let zoom = layer.fit == "fit" ? 1 : max(0.25, min(layer.crop.width, layer.crop.height))
        longest = Double(max(layer.frame.width, layer.frame.height)) / zoom
      }
      guard longest.isFinite, longest > 0 else { continue }
      let side = effectiveSide(id, Int(min(Double(Self.maximumSide), (longest * scale).rounded(.up))))
      sides[id] = max(sides[id] ?? 0, side)
    }
    return sides
  }

  /// Approximate bytes of one decode.
  func estimatedBytes(_ id: String, side requested: Int) -> Int {
    let side = effectiveSide(id, requested)
    guard let size = original(id).size, size.width > 0, size.height > 0 else { return side * side * 4 }
    let long = Double(max(size.width, size.height)), short = Double(min(size.width, size.height))
    return side * max(1, Int((Double(side) * short / long).rounded(.up))) * 4
  }

  /// Scales a plan down when its decodes together exceed `budget` bytes. No
  /// side drops below 1024 px (or its planned size, when smaller).
  func fit(_ sides: [String: Int], budget: Int) -> (sides: [String: Int], reduced: Bool) {
    let total = sides.reduce(0) { $0 + estimatedBytes($1.key, side: $1.value) }
    guard total > budget, total > 0 else { return (sides, false) }
    let factor = (Double(max(0, budget)) / Double(total)).squareRoot()
    var fitted: [String: Int] = [:]
    for (id, side) in sides {
      let scaled = Int(Double(side) * factor) / 256 * 256
      fitted[id] = effectiveSide(id, max(min(side, 1024), scaled))
    }
    return (fitted, fitted != sides)
  }

  /// The asset decoded with its longest side at `side` (rounded as
  /// `effectiveSide` does), or nil when it has no still image.
  func image(_ id: String, side requested: Int) throws -> Decoded? {
    try Task.checkCancellation()
    let side = effectiveSide(id, requested)
    if let hit = lookup(id, side) { return hit }
    guard !failures.contains(id), let url = staged[id] else { return nil }
    guard let decoded = decode(id, url: url, side: side) else {
      failures.insert(id)
      return nil
    }
    insert(id, side, decoded)
    return decoded
  }

  /// A small copy (a notes preview), scaled from the smallest larger decode
  /// already held, so the original is not decoded again.
  func preview(_ id: String, side requested: Int) throws -> Decoded? {
    try Task.checkCancellation()
    let side = effectiveSide(id, requested)
    if let hit = lookup(id, side) { return hit }
    if let larger = entries.values.filter({ $0.id == id && $0.side > side }).min(by: { $0.side < $1.side }) {
      let decoded = Decoded(image: Self.downsampled(larger.decoded.image, longestSide: side), kind: larger.decoded.kind)
      insert(id, side, decoded)
      return decoded
    }
    return try self.image(id, side: side)
  }

  /// Between slides: least recently used decodes go first.
  func trim() {
    guard held > budget else { return }
    for entry in entries.values.sorted(by: { $0.use < $1.use }) {
      guard held > budget else { break }
      entries[key(entry.id, entry.side)] = nil
      held -= entry.cost
    }
  }

  private func key(_ id: String, _ side: Int) -> String { "\(side):\(id)" }
  private func lookup(_ id: String, _ side: Int) -> Decoded? {
    let slot = key(id, side)
    guard var entry = entries[slot] else { return nil }
    clock += 1
    entry.use = clock
    entries[slot] = entry
    return entry.decoded
  }
  private func insert(_ id: String, _ side: Int, _ decoded: Decoded) {
    clock += 1
    let cost = max(1, decoded.image.bytesPerRow * decoded.image.height)
    if let old = entries.updateValue(Entry(id: id, side: side, decoded: decoded, cost: cost, use: clock), forKey: key(id, side)) {
      held -= old.cost
    }
    held += cost
  }

  private func decode(_ id: String, url: URL, side: Int) -> Decoded? {
    if let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: side,
        kCGImageSourceShouldCacheImmediately: true,
      ] as CFDictionary)
    {
      return Decoded(image: image, kind: .raster)
    }
    if let document = CGPDFDocument(url as CFURL), let page = document.page(at: 1) {
      // A page renders at its own point size at most.
      let bounds = page.getBoxRect(.cropBox)
      guard bounds.width > 0, bounds.height > 0 else { return nil }
      let factor = min(1, Double(side) / Double(max(bounds.width, bounds.height)))
      let width = max(1, Int((Double(bounds.width) * factor).rounded()))
      let height = max(1, Int((Double(bounds.height) * factor).rounded()))
      guard let space = CGColorSpace(name: CGColorSpace.sRGB),
        let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
          bytesPerRow: width * 4, space: space,
          bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)
      else { return nil }
      let area = CGRect(x: 0, y: 0, width: width, height: height)
      context.clear(area)
      context.concatenate(page.getDrawingTransform(.cropBox, rect: area, rotate: 0, preserveAspectRatio: true))
      context.drawPDFPage(page)
      return context.makeImage().map { Decoded(image: $0, kind: .pdf) }
    }
    if videos.contains(id) || UTType(filenameExtension: url.pathExtension)?.conforms(to: .movie) == true {
      let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
      generator.appliesPreferredTrackTransform = true
      generator.maximumSize = CGSize(width: side, height: side)
      if let image = try? generator.copyCGImage(at: .zero, actualTime: nil) { return Decoded(image: image, kind: .video) }
    }
    return nil
  }

  static func downsampled(_ image: CGImage, longestSide: Int) -> CGImage {
    let longest = max(image.width, image.height)
    guard longestSide > 0, longestSide < longest else { return image }
    let scale = Double(longestSide) / Double(longest)
    let width = max(1, Int((Double(image.width) * scale).rounded()))
    let height = max(1, Int((Double(image.height) * scale).rounded()))
    var space = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
    if let own = image.colorSpace, own.model == .rgb, own.supportsOutput { space = own }
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
      space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return image }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return context.makeImage() ?? image
  }
}
