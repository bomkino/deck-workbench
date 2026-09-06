import AppKit
import CoreGraphics
import CryptoKit
import Foundation
import ImageIO
import PDFKit
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class NativeSelfTestDelegate: NSObject, NSApplicationDelegate {
  let output: URL
  init(output: URL) { self.output = output }
  func applicationDidFinishLaunching(_ notification: Notification) {
    Task {
      do {
        try await NativeAcceptance.run(output: output)
        print("NATIVE_ACCEPTANCE_PASSED")
        fflush(stdout)
        exit(0)
      } catch {
        fputs("NATIVE_ACCEPTANCE_FAILED: \(error)\n", stderr)
        fflush(stderr)
        exit(1)
      }
    }
  }
}

@MainActor
enum NativeAcceptance {
  private static var captureMethods: [String: String] = [:]
  static func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw WorkbenchFailure(name: "AcceptanceFailure", message: message) }
  }
  static func run(output: URL) async throws {
    let manager = FileManager.default
    try manager.createDirectory(at: output, withIntermediateDirectories: true)
    let root = manager.temporaryDirectory.appendingPathComponent(
      "Workbench-native-acceptance-\(UUID().uuidString)", isDirectory: true)
    try manager.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? manager.removeItem(at: root) }
    let mediaURL = root.appendingPathComponent("Media", isDirectory: true)
    try manager.createDirectory(at: mediaURL, withIntermediateDirectories: false)
    for i in 0..<40 {
      let directory = mediaURL.appendingPathComponent("Set \(i)", isDirectory: true)
      try manager.createDirectory(at: directory, withIntermediateDirectories: false)
      let url = directory.appendingPathComponent(i < 2 ? "Frame.png" : "Frame-\(i).png")
      try syntheticImage(index: i, url: url)
    }
    let exact =
      "The complete copy includes an em dash — and ₹1,000.\n\nA second paragraph stays a second paragraph."
    let dense = Array(
      repeating:
        "The writer suggests a quiet image with room for the characters and their complicated choices.",
      count: 24
    ).joined(separator: " ")
    var markdown = "# Native Acceptance Deck\n\n"
    for i in 1...20 {
      markdown +=
        "## Slide \(i)\n\n### Headline\n\nHeadline \(i)\n\n### Body\n\n\(i==2 ? dense : exact)\n\n### Body\n\nSecond body block \(i).\n\n### Caption\n\nCAPTION-\(i)-MUST-SURVIVE\n\n### Notes\n\nNOTES-\(i)-MUST-SURVIVE. Keep the prototype provisional.\n\n"
    }
    let literal = "# Literal deck\n## One slide\n### Body\n````\n### Slide: not a new slide\n# Literal heading\n\\not-a-command\n```\n````\n"
    let parsedLiteral = try NativeCopyImport.parse(Data(literal.utf8), filename: "literal.md")
    try require(parsedLiteral.slides.count == 1 && parsedLiteral.slides[0].blocks.last?.text.contains("### Slide: not a new slide") == true, "Fenced copy was mistaken for structure")
    let imported = try NativeCopyImport.parse(Data(markdown.utf8), filename: "acceptance.md")
    try require(imported.slides.count == 20, "Import lost slide boundaries")
    let controller = try NativeWorkbenchController()
    let deckURL = root.appendingPathComponent("Acceptance.pitchdeck", isDirectory: true)
    let initial = try await controller.session.create(at: deckURL, seed: imported.checkpoint())
    controller.document = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: initial)
    controller.selectedSlideID = controller.document!.deck.slides[0].id
    let media = try await controller.session.mediaSession()
    _ = try await media.authorizeRootJSON(mediaURL)
    await controller.refreshCatalog()
    try require(
      controller.assets.count == 40, "Native folder discovery did not return all originals")
    let window = NSWindow(
      contentRect: NSRect(x: 80, y: 80, width: 1440, height: 900),
      styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.contentView = NSHostingView(rootView: NativeWorkbenchRoot(controller: controller))
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    // Wait for the actual native input view, not a guessed startup delay.
    let readyDeadline = Date().addingTimeInterval(5)
    while (!window.isKeyWindow || !hasInputMonitor(window.contentView, window: window)) && Date() < readyDeadline {
      try await Task.sleep(for: .milliseconds(20))
    }
    try require(window.isKeyWindow && hasInputMonitor(window.contentView, window: window), "Native input view did not become ready")
    // Post a burst into AppKit's real event loop. Each Right event changes the
    // focused asset before the following S is dispatched by the installed monitor.
    controller.focusAsset(controller.filteredAssets[0].id)
    await Task.yield()
    let focusDeadline = Date().addingTimeInterval(3)
    while (window.firstResponder as? NSTextView)?.isEditable == true && Date() < focusDeadline {
      try await Task.sleep(for: .milliseconds(20))
    }
    try require((window.firstResponder as? NSTextView)?.isEditable != true, "Media focus remained in the search editor")
    let eventBaseline = NativeShortcuts.handledEventCount
    let inputStarted = ProcessInfo.processInfo.systemUptime
    for index in 0..<40 {
      guard
        let event = NSEvent.keyEvent(
          with: .keyDown, location: .zero, modifierFlags: [],
          timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
          context: nil, characters: "s", charactersIgnoringModifiers: "s", isARepeat: false,
          keyCode: 1)
      else {
        throw WorkbenchFailure(
          name: "AcceptanceFailure", message: "Could not create native key event")
      }
      NSApp.postEvent(event, atStart: false)
      if index < 39 {
        let right = String(UnicodeScalar(NSRightArrowFunctionKey)!)
        guard
          let event = NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
            context: nil, characters: right, charactersIgnoringModifiers: right, isARepeat: false,
            keyCode: 124)
        else {
          throw WorkbenchFailure(
            name: "AcceptanceFailure", message: "Could not create navigation key event")
        }
        NSApp.postEvent(event, atStart: false)
      }
    }
    let inputDeadline = Date().addingTimeInterval(20)
    while NativeShortcuts.handledEventCount - eventBaseline < 79 && Date() < inputDeadline {
      try await Task.sleep(for: .milliseconds(20))
    }
    try require(
      NativeShortcuts.handledEventCount - eventBaseline >= 79,
      "AppKit dispatched \(NativeShortcuts.handledEventCount - eventBaseline)/79 curation events; responder=\(String(describing: window.firstResponder)); query=\(controller.query)")
    await controller.flush()
    try require(
      controller.failedCommands.isEmpty,
      "Rapid decisions failed: \(controller.failure ?? "unknown")")
    try require(
      controller.selectedSlide?.settings.shortlist.count == 40, "Rapid native decisions were lost")
    let inputAndSaveSeconds = ProcessInfo.processInfo.systemUptime - inputStarted
    let first = controller.assets[0]
    let second = controller.assets[1]
    controller.decide("use", assetID: first.id)
    await controller.flush()
    controller.decide("remove-shortlist", assetID: first.id)
    await controller.flush()
    try require(
      controller.selectedSlide!.chosenIDs.contains(first.id),
      "Removing shortlist membership unassigned the chosen image")
    controller.decide("use", assetID: second.id)
    await controller.flush()
    controller.undo()
    await controller.flush()
    try require(
      controller.selectedSlide!.chosenIDs.contains(first.id),
      "Undo did not restore the chosen image")
    controller.decide("shortlist", assetID: first.id)
    await controller.flush()
    let ids = controller.document!.deck.slides.map(\.id)
    for (index, id) in ids.enumerated() {
      controller.selectSlide(id)
      controller.decide("use", assetID: controller.assets[index % 40].id)
    }
    await controller.flush()
    try require(controller.failedCommands.isEmpty, "Assignment queue rejected a valid action")
    controller.selectSlide(ids[0])
    controller.collection = "shortlist"
    controller.query = first.filename
    controller.preview(first.id)
    try require(
      controller.previewIDs == controller.filteredAssets.map(\.id),
      "Preview escaped the originating filter")
    controller.previewOpen = false
    controller.query = ""
    controller.collection = "all"
    let frame = PrototypeFrame(x: 96, y: 64, width: 1184, height: 952)
    for _ in 0..<5 { controller.nudge(dx: 1, dy: 0, frame: frame) }
    await controller.flush()
    try require(
      controller.selectedSlide!.settings.layout.textFrame?.x == 101,
      "Relative native nudges did not accumulate")
    for preset in ["left", "right", "lower"] { controller.chooseLayout(preset) }
    await controller.flush()
    try require(controller.selectedSlide?.settings.layout.preset == "lower" && controller.failedCommands.isEmpty, "Layout picker failed or fenced later writes")
    controller.chooseLayout("three-images")
    await controller.flush()
    controller.decide("use", assetID: first.id, role: "primary")
    controller.decide("use", assetID: second.id, role: "primary:2")
    controller.patchLayout(["crops": ["primary": ["x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8]], "imageFits": ["primary": "fit"]])
    controller.patchLayout(["crops": ["primary:2": ["x": 0.2, "y": 0.1, "width": 0.7, "height": 0.8]], "imageFits": ["primary:2": "fill"]])
    await controller.flush()
    try require(controller.selectedSlide?.settings.layout.crops.count == 2 && controller.selectedSlide?.settings.layout.imageFits["primary"] == "fit", "Editing image B lost A's crop or fit")
    controller.chooseLayout("left")
    await controller.flush()
    try require(controller.selectedSlide?.imageRoles == ["primary"] && controller.selectedSlide?.settings.shortlist.contains(second.id) == true, "Layout slot reconciliation lost a candidate")
    controller.setNotes("Acknowledged note")
    await controller.flush()
    controller.setNotes("Later typing")
    await controller.flush()
    try require(controller.notesDrafts.isEmpty, "Acknowledged notes remained dirty")
    controller.undo(documentOnly: true)
    await controller.flush()
    try require(controller.notes == "Acknowledged note" && controller.selectedSlide?.settings.notes == "Acknowledged note", "Notes undo was overwritten by a retained draft")
    controller.enqueue(type: "native.slide.patch", payload: ["slideId": ids[0], "patch": ["layout": ["columns": 0]]], label: "Deliberate invalid layout")
    controller.setNotes("Valid action after rejected layout")
    await controller.flush()
    try require(controller.failedCommands.isEmpty && controller.notes == "Valid action after rejected layout", "A validation rejection blocked later valid actions")
    controller.failure = nil
    try await exerciseLayoutFinishing(controller)
    try await exerciseSlideEditing(controller)
    try await exerciseFinalPolish(controller, media: media, root: root, window: window)
    controller.setNotes("A final pending note — flushed before handoff.")
    await controller.flush()
    try await controller.session.save()
    let before = try await controller.session.snapshot()
    try await controller.session.close()
    let reopened = try await controller.session.open(at: deckURL)
    let snapshot = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: reopened)
    let old = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: before)
    try require(snapshot.revision == old.revision, "Reopen changed the durable revision")
    try require(
      snapshot.deck.slides[0].settings.notes.contains("final pending note"),
      "Notes were not flushed before reopening")
    let reopenedMedia = try await controller.session.mediaSession()
    let sources = try await reopenedMedia.nativeSources(assetIds: controller.assets.map(\.id))
    let exports = output.appendingPathComponent("handoffs", isDirectory: true)
    try manager.createDirectory(at: exports, withIntermediateDirectories: true)
    var copyOnly = HandoffOptions()
    copyOnly.prototypePDF = false; copyOnly.notesPDF = false; copyOnly.approved = false; copyOnly.shortlisted = false
    let copyOptions = copyOnly
    try require(NativeHandoffExporter.requiredAssetIDs(snapshot: snapshot, options: copyOptions).isEmpty, "Copy-only depends on images")
    let textExport = try await Task.detached {
      try NativeHandoffExporter.export(snapshot: snapshot, sources: [:], to: exports, options: copyOptions, progress: { _ in })
    }.value
    try require(textExport.produced == ["Copy.md"] && textExport.issues.isEmpty, "Copy-only export touched media or reported unrequested outputs")
    try require(NativeHandoffExporter.safeFilename(String(repeating: "x", count: 230) + ".jpeg").hasSuffix(".jpeg"), "Filename truncation discarded the extension")
    try require(NativeHandoffExporter.csvField("=1+1").hasPrefix("\"'"), "CSV text can execute as a formula")
    if let source = sources[first.id] {
      let warm = await NativeThumbnailService.shared.data(for: source, longestSide: 512)
      let hits = await NativeThumbnailService.shared.cacheHits
      let cached = await NativeThumbnailService.shared.data(for: source, longestSide: 512)
      let afterHits = await NativeThumbnailService.shared.cacheHits
      try require(warm != nil && warm == cached && afterHits > hits, "Warm thumbnails are not reused")
    }
    let exported = try await Task.detached {
      try NativeHandoffExporter.export(
        snapshot: snapshot, sources: sources, to: exports, options: HandoffOptions(),
        progress: { _ in })
    }.value
    guard let pdf = PDFDocument(url: exported.url.appendingPathComponent("Prototype.pdf")),
      let notes = PDFDocument(url: exported.url.appendingPathComponent("Prototype with notes.pdf"))
    else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "The generated PDFs did not parse")
    }
    try require(pdf.pageCount == 20, "Prototype has wrong page count")
    try require(notes.pageCount >= 20, "Notes lost a slide")
    for i in 0..<20 {
      guard let page = pdf.page(at: i) else {
        throw WorkbenchFailure(name: "AcceptanceFailure", message: "Missing prototype page")
      }
      try require(
        page.bounds(for: .mediaBox).size == CGSize(width: 2576, height: 1080),
        "Canvas ratio or page size changed")
      try require(
        page.string?.contains("Headline \(i+1)") == true,
        "Page order or selectable headline is wrong")
      try require(
        page.string?.contains("Export Handoff") == false, "Editor controls contaminated the PDF")
      try require(try hasVisibleSourceImage(page), "The PDF gradient obscured the assigned image")
    }
    let fullCopy = try String(
      contentsOf: exported.url.appendingPathComponent("Copy.md"), encoding: .utf8)
    for slide in snapshot.deck.slides {
      for block in slide.copyBlocks {
        try require(fullCopy.contains(block.text), "Editable copy omitted \(block.role)")
      }
    }
    let notesText = notes.string ?? ""
    for i in 1...20 {
      try require(
        notesText.contains("CAPTION-\(i)-MUST-SURVIVE"), "Notes companion omitted caption \(i)")
    }
    let approved = exported.url.appendingPathComponent("Approved Media")
    try require(
      (try manager.contentsOfDirectory(at: approved, includingPropertiesForKeys: nil)).count == 20,
      "Approved media is not grouped per slide")
    try require(
      exported.originalCopies >= 60, "Chosen and shortlisted originals were not both copied")
    // Export again with changed UI state; the snapshot—not the UI—owns output.
    controller.phase = "assemble"
    controller.zoom = 2.4
    controller.showGuides = true
    controller.selectionTarget = "gradient"
    var cleanOnly = HandoffOptions()
    cleanOnly.notesPDF = false
    cleanOnly.copy = false
    cleanOnly.approved = false
    cleanOnly.shortlisted = false
    let options = cleanOnly
    let repeated = try await Task.detached {
      try NativeHandoffExporter.export(
        snapshot: snapshot, sources: sources, to: exports, options: options, progress: { _ in })
    }.value
    let repeatedPDF = PDFDocument(url: repeated.url.appendingPathComponent("Prototype.pdf"))!
    try require(pdf.string == repeatedPDF.string, "Changing UI state altered PDF text")
    try require(
      try renderedPage(pdf.page(at: 0)!) == renderedPage(repeatedPDF.page(at: 0)!),
      "Changing UI state altered exported pixels")
    let preview = try renderedPagePNG(pdf.page(at: 0)!)
    try preview.write(to: output.appendingPathComponent("prototype-page-1.png"))
    // These are the real working views, not separate UI mockups.
    controller.failure = nil
    controller.phase = "assemble"; controller.showContext = true
    controller.selectSlide(controller.slides[0].id); controller.fitCanvas()
    await Task.yield()
    try await captureWindow(window, to: output.appendingPathComponent("ui-assemble.png"))
    controller.startCleanPreview()
    try await captureWindow(window, to: output.appendingPathComponent("ui-review.png"))
    controller.endCleanPreview(); controller.phase = "curate"
    window.setContentSize(NSSize(width: 1060, height: 740))
    try await captureWindow(window, to: output.appendingPathComponent("ui-curate-compact.png"))
    // A crash-left lock is resolved only by making a saved-state copy.
    try await controller.session.close()
    let lock = deckURL.appendingPathComponent(".deck-workbench-writer.lock")
    try Data("crash-left acceptance lock".utf8).write(to: lock)
    let recoveredURL = root.appendingPathComponent("Recovered.pitchdeck", isDirectory: true)
    _ = try PitchDeckDocumentStore.recoverCopy(from: deckURL, to: recoveredURL)
    try require(manager.fileExists(atPath: lock.path), "Recovery modified the original writer lock")
    let recovery = try await controller.session.open(at: recoveredURL)
    let recoveryState = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: recovery)
    try require(
      recoveryState.revision == snapshot.revision, "Recovered copy lost durable decisions")
    try await controller.session.close()
    let receipt: [String: Any] = [
      "format": "pitchdog.native-acceptance/1",
      "commit": Bundle.main.object(forInfoDictionaryKey: "DeckWorkbenchCommit") ?? "unknown",
      "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
        ?? "unknown", "slides": 20, "rapidDecisions": 40, "prototypePages": pdf.pageCount,
      "notesPages": notes.pageCount, "originalCopies": exported.originalCopies,
      "copyComplete": true, "previewScope": true, "shortlistIndependent": true, "reopen": true,
      "savedCopyRecovery": true, "uiIndependentPDF": true, "imageVisibleInPDF": true, "nativeKeyEvents": true,
      "slideManagement": true, "copyEditorTarget": true, "editedCopyHandoff": true,
      "layoutFrameCopy": true, "layoutResetUndo": true, "textLayoutReused": true,
      "gradientScreenExportParity": true, "visibleLayoutTargets": true,
      "layoutPicker": true, "perImageEdits": true, "notesUndo": true, "validationDoesNotFence": true,
      "reviewNavigation": true, "cropZoomUndo": true, "notesTargetIdentity": true,
      "catalogRevisionReuse": true, "boundedImport": true, "lifecycleSerialization": true,
      "copyOnlyIndependent": true, "literalCopy": true, "safeFilenames": true, "thumbnailCache": true,
      "nativeBurstAndSaveSeconds": inputAndSaveSeconds,
      "manualAccessibility": "not performed", "targetMachinePerformance": "not measured",
      "windowCaptures": captureMethods,
      "issues": exported.issues,
    ]
    try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
      .write(to: output.appendingPathComponent("native-acceptance.json"), options: .atomic)
    print(
      "Native acceptance: 20-slide handoff, copy, media, keyboard decisions, undo, reopen, saved-copy recovery, UI-independent PDF."
    )
    window.orderOut(nil)
  }
  private static func hasInputMonitor(_ view: NSView?, window: NSWindow) -> Bool {
    guard let view else { return false }
    if view is NativeKeyMonitorView && view.window === window { return true }
    return view.subviews.contains { hasInputMonitor($0, window: window) }
  }
  private static func captureWindow(_ window: NSWindow, to url: URL) async throws {
    // Let SwiftUI layout and asynchronous thumbnails settle once for capture.
    try await Task.sleep(for: .milliseconds(350))
    guard let view = window.contentView else { throw WorkbenchFailure(name: "AcceptanceFailure", message: "No native window content") }
    view.layoutSubtreeIfNeeded(); view.displayIfNeeded()
    // Capture the compositor when available; NSView caching omits some native
    // List/vibrancy layers. Never label a partial fallback as a full screenshot.
    let number = window.windowNumber
    let captured = await Task.detached(priority: .utility) {
      let process = Process()
      process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
      process.arguments = ["-x", "-o", "-l", String(number), url.path]
      process.standardOutput = FileHandle.nullDevice
      process.standardError = FileHandle.nullDevice
      do { try process.run(); process.waitUntilExit(); return process.terminationStatus == 0 }
      catch { return false }
    }.value
    if captured, CGImageSourceCreateWithURL(url as CFURL, nil) != nil {
      captureMethods[url.lastPathComponent] = "WindowServer"
      return
    }
    captureMethods[url.lastPathComponent] = "partial NSView fallback"
    guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Native window capture failed")
    }
    view.cacheDisplay(in: view.bounds, to: bitmap)
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Native window image could not be written")
    }
    let partial = url.deletingLastPathComponent().appendingPathComponent(url.deletingPathExtension().lastPathComponent + "-partial.png")
    try data.write(to: partial)
  }
  private static func exerciseFinalPolish(_ controller: NativeWorkbenchController,
    media: MediaCatalogSession, root: URL, window: NSWindow) async throws {
    let ids = controller.slides.map(\.id)
    controller.selectSlide(ids[0]); controller.phase = "assemble"
    let before = controller.document!.revision
    controller.chooseLayout("image-only"); await controller.flush()
    controller.selectSlide(ids[1]); controller.selectSlide(ids[0])
    try require(controller.selectionTarget == "primary", "Image-only selection still targets invisible text")
    guard let layer = controller.resolvedScene?.imageLayers.first, let assetID = layer.assetID,
      let asset = controller.assetIndex[assetID], let width = asset.width, let height = asset.height else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Crop exercise has no source image")
    }
    // Fit must remain whole-image; zoom only applies after the user selects Fill / crop.
    let fitRevision = controller.document!.revision
    controller.zoomCrop(2, role: "primary", slideID: ids[0]); await controller.flush()
    try require(layer.fit == "fit" && controller.cropZoom(for: "primary") == nil && controller.document!.revision == fitRevision, "Zoom changed an image in whole-image Fit mode")
    controller.patchLayout(["imageFits": ["primary": "fill"]]); await controller.flush()
    controller.zoomCrop(2, role: "primary", slideID: ids[0]); await controller.flush()
    try require(abs((controller.cropZoom(for: "primary") ?? 0) - 2) < 0.001, "Crop zoom does not resolve at the requested scale")
    let zoomed = controller.selectedSlide!.settings.layout.crops["primary"]!
    try require(zoomed.x >= 0 && zoomed.y >= 0 && zoomed.x + zoomed.width <= 1.000001 && zoomed.y + zoomed.height <= 1.000001, "Crop zoom escaped the image")
    let framed = NativeLayoutGeometry.zoomedCrop(layer, width: Double(width), height: Double(height), zoom: 4)
    try require(framed.width > 0 && framed.height > 0, "Crop zoom made an empty frame")
    controller.centerCrop(role: "primary", slideID: ids[0]); await controller.flush()
    let changes = controller.document!.revision - before
    for _ in 0..<changes { controller.undo(documentOnly: true); await controller.flush() }
    try require(controller.selectedSlide?.settings.layout.preset != "image-only", "Crop/layout Undo did not restore the starting slide")

    // A late TextEditor binding update retains its captured slide destination.
    let firstNotes = controller.slideIndex[ids[0]]!.settings.notes
    let secondNotes = controller.slideIndex[ids[1]]!.settings.notes
    controller.selectSlide(ids[1])
    controller.setNotes("Captured slide note", slideID: ids[0]); await controller.flush()
    try require(controller.slideIndex[ids[0]]?.settings.notes == "Captured slide note" && controller.slideIndex[ids[1]]?.settings.notes == secondNotes, "A note crossed slide identities")
    controller.undo(documentOnly: true); await controller.flush()
    try require(controller.slideIndex[ids[0]]?.settings.notes == firstNotes, "Captured note Undo failed")

    // Dispatch through AppKit, not a duplicated keyboard implementation.
    controller.selectSlide(ids[0]); controller.startCleanPreview()
    let reviewRevision = controller.document!.revision
    let baseline = NativeShortcuts.handledEventCount
    let arrow = String(UnicodeScalar(NSRightArrowFunctionKey)!)
    let next = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [],
      timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
      context: nil, characters: arrow, charactersIgnoringModifiers: arrow, isARepeat: false, keyCode: 124)!
    NSApp.postEvent(next, atStart: false)
    let deadline = Date().addingTimeInterval(3)
    while NativeShortcuts.handledEventCount == baseline && Date() < deadline { try await Task.sleep(for: .milliseconds(10)) }
    try require(controller.selectedSlideID == ids[1] && controller.document!.revision == reviewRevision, "Review arrows edited the deck or failed to navigate")
    let escape = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [],
      timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
      context: nil, characters: "\u{1b}", charactersIgnoringModifiers: "\u{1b}", isARepeat: false, keyCode: 53)!
    NSApp.postEvent(escape, atStart: false)
    let escapeDeadline = Date().addingTimeInterval(3)
    while controller.cleanPreview && Date() < escapeDeadline { try await Task.sleep(for: .milliseconds(10)) }
    try require(!controller.cleanPreview, "Escape did not leave deck review")
    controller.previewOpen = true; controller.compareOpen = true; controller.searchMedia()
    try require(controller.phase == "curate" && !controller.previewOpen && !controller.compareOpen, "Search stayed hidden behind preview")
    let searchDeadline = Date().addingTimeInterval(3)
    while (window.firstResponder as? NSTextView)?.isEditable != true && Date() < searchDeadline {
      try await Task.sleep(for: .milliseconds(20))
    }
    try require((window.firstResponder as? NSTextView)?.isEditable == true, "Command-F did not focus search")
    controller.focusAsset(controller.filteredAssets[0].id)
    await Task.yield()
    let gridDeadline = Date().addingTimeInterval(3)
    while (window.firstResponder as? NSTextView)?.isEditable == true && Date() < gridDeadline {
      try await Task.sleep(for: .milliseconds(20))
    }
    try require((window.firstResponder as? NSTextView)?.isEditable != true, "Selecting media did not leave search")
    controller.selectSlide(ids[0])

    let update = try await media.nativeCatalogUpdate(after: -1)
    try require(update?.catalog.assets.count == controller.assets.count, "Atomic catalog projection lost assets")
    let unchanged = try await media.nativeCatalogUpdate(after: update!.catalog.revision)
    try require(unchanged == nil, "Unchanged catalog rebuilt its projection")
    try require(Set(update!.sources.keys).isSubset(of: Set(update!.catalog.assets.map(\.id))), "Catalog and source snapshots disagree")

    let oversized = root.appendingPathComponent("too-large.md")
    try Data(repeating: 65, count: 1_048_577).write(to: oversized)
    do { _ = try NativeCopyImport.read(oversized); throw WorkbenchFailure(name: "AcceptanceFailure", message: "Oversized copy was accepted") }
    catch let failure as WorkbenchFailure { try require(failure.name == "ImportFormat", "Import size failure was not explicit") }
    let valid = root.appendingPathComponent("small.md")
    try Data("# Small deck\n## One slide\n### Body\nKept exactly.\n".utf8).write(to: valid)
    let parsed = try NativeCopyImport.read(valid)
    try require(parsed.slides.count == 1, "Bounded import lost valid copy")

    // Two simultaneous requests may not create/adopt two documents. This uses
    // the actual disk store and actor, not a synthetic queue replacement.
    let other = try NativeWorkbenchController()
    let a = root.appendingPathComponent("Lifecycle-A.pitchdeck", isDirectory: true)
    let b = root.appendingPathComponent("Lifecycle-B.pitchdeck", isDirectory: true)
    async let first: Void = other.createImported(parsed, at: a)
    async let second: Void = other.createImported(parsed, at: b)
    _ = await (first, second)
    let exists = [a, b].filter { FileManager.default.fileExists(atPath: $0.path) }
    try require(exists.count == 1 && other.document != nil && !other.lifecycleBusy, "Concurrent creation escaped the document transition lock")
    let deckID = other.document!.deck.deckId
    do { try await other.session.save(expectedDeckID: "different-deck"); throw WorkbenchFailure(name: "AcceptanceFailure", message: "Stale Save was accepted") }
    catch let failure as WorkbenchFailure { try require(failure.name == "DocumentChanged", "Stale Save was not rejected before writing") }
    let closed = await other.closeForSwitch()
    try require(closed && other.document == nil, "Guarded close failed")
    await other.open(exists[0])
    try require(other.document?.deck.deckId == deckID && !other.lifecycleBusy, "Closed document did not reopen")
    _ = await other.closeForSwitch()
  }
  private static func exerciseLayoutFinishing(_ controller: NativeWorkbenchController) async throws {
    let ids = controller.slides.map(\.id)
    guard ids.count > 1, let canvas = controller.document?.deck.canvasPreset else { return }
    controller.selectSlide(ids[0])
    let original = controller.selectedSlide!
    let destination = controller.slideIndex[ids[1]]!
    let startRevision = controller.document!.revision
    controller.chooseLayout("two-images")
    await controller.flush()
    let custom = PrototypeFrame(x: 96, y: 64, width: 940, height: 640)
    controller.patchLayout(["frames": ["primary": try nativeObject(custom)]])
    await controller.flush()
    controller.applyArrangement(to: [ids[1]])
    await controller.flush()
    try require(controller.slideIndex[ids[1]]?.settings.layout.frames["primary"] == custom, "Apply Arrangement lost custom image frames")
    try require(controller.slideIndex[ids[1]]?.settings.layout.crops == destination.settings.layout.crops, "Apply Arrangement changed destination crops")
    let mutations = controller.document!.revision - startRevision
    for _ in 0..<mutations { controller.undo(documentOnly: true); await controller.flush() }
    try require(try nativeJSON(controller.selectedSlide!.settings) == nativeJSON(original.settings), "Undo did not restore the original arrangement")
    let beforeReset = controller.document!.revision
    controller.chooseLayout("left"); await controller.flush()
    let resetCount = controller.document!.revision - beforeReset
    var gradient = PrototypeGradient(); gradient.opacity = 0.43
    controller.patchLayout(["gradient": try nativeObject(gradient)]); await controller.flush()
    controller.chooseLayout("right"); await controller.flush()
    try require(controller.resolvedScene?.gradient?.start.x == 1, "A new layout kept the previous gradient direction")
    controller.undo(documentOnly: true); await controller.flush()
    try require(controller.resolvedScene?.gradient?.opacity == 0.43, "Undo lost the authored gradient")
    controller.undo(documentOnly: true); await controller.flush()
    for _ in 0..<resetCount { controller.undo(documentOnly: true); await controller.flush() }
    try require(try nativeJSON(controller.selectedSlide!.settings) == nativeJSON(original.settings), "Layout reset changed unrelated saved settings")
    try require(NativeLayoutGeometry.xGuides(canvas).contains(2480) && NativeLayoutGeometry.yGuides(canvas).contains(1016), "Guides lost the right or bottom margin")
    var value = original
    value.native?.layout.preset = "left"
    value.native?.layout.textFrame = PrototypeFrame(x: 96, y: 64, width: 1184, height: 952)
    let before = NativeSlideRenderer.resolve(slide: value, canvas: canvas)
    value.native?.layout.textFrame?.x += 50
    value.native?.layout.gradient = gradient
    let shifted = NativeSlideRenderer.resolve(slide: value, canvas: canvas)
    try require(!before.texts.isEmpty && !shifted.texts.isEmpty, "Missing text for layout cache check")
    try require(before.texts[0].textFrame === shifted.texts[0].textFrame && shifted.texts[0].frame.minX == before.texts[0].frame.minX + 50,
      "Translation or gradient adjustment re-typeset unchanged copy")
    value.native?.layout.preset = "image-only"
    try require(!NativeLayoutGeometry.hasText(NativeSlideRenderer.resolve(slide: value, canvas: canvas)), "Image-only layout has an invisible text target")
    value.native?.layout.preset = "left"
    for i in value.contentBlocks.indices where !value.contentBlocks[i].isMetadata { value.contentBlocks[i].setText("") }
    try require(!NativeLayoutGeometry.hasText(NativeSlideRenderer.resolve(slide: value, canvas: canvas)), "Blank copy has an invisible text target")
    try compareScreenAndExportGradient(before)
  }
  private static func compareScreenAndExportGradient(_ scene: ResolvedPrototype) throws {
    let width = 644, height = 270
    func draw(_ raster: Bool) throws -> Data {
      guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else { throw WorkbenchFailure(name: "AcceptanceFailure", message: "Gradient comparison could not allocate bitmap") }
      guard let source = CGContext(data: nil, width: 16, height: 16, bitsPerComponent: 8,
        bytesPerRow: 64, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw WorkbenchFailure(name: "AcceptanceFailure", message: "Missing gradient reference image")
      }
      source.setFillColor(CGColor(red: 0.85, green: 0.4, blue: 0.15, alpha: 1))
      source.fill(CGRect(x: 0, y: 0, width: 16, height: 16))
      let image = source.makeImage()!
      let images = Dictionary(uniqueKeysWithValues: scene.imageLayers.compactMap { layer -> (String, CGImage)? in
        guard let id = layer.assetID else { return nil }; return (id, image)
      })
      NativeSlideRenderer.draw(scene, in: context, rect: CGRect(x: 0, y: 0, width: width, height: height), images: images, rasterizeGradient: raster)
      guard let pixels = context.makeImage()?.dataProvider?.data else {
        throw WorkbenchFailure(name: "AcceptanceFailure", message: "Gradient comparison has no pixels")
      }
      return pixels as Data
    }
    let screen = try draw(false), exported = try draw(true)
    let total = zip(screen, exported).reduce(0) { $0 + abs(Int($1.0) - Int($1.1)) }
    try require(Double(total) / Double(screen.count) < 2, "Interactive and exported gradients disagree")
  }
  private static func exerciseSlideEditing(_ controller: NativeWorkbenchController) async throws {
    let originalIDs = controller.slides.map(\.id)
    let originalID = originalIDs[0]
    controller.selectSlide(originalID)
    let original = controller.selectedSlide!
    controller.addSlide()
    await controller.flush()
    guard let added = controller.selectedSlide, added.id != originalID else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Add Slide did not select its new slide")
    }
    try require(controller.slides.count == originalIDs.count + 1 && controller.copyEditorOpen, "Add Slide did not open its editor")
    try require(added.copyBlocks.map(\.role) == ["headline", "subheadline", "body"], "New slide lacks normal copy fields")
    var writing = added.copyBlocks
    writing[0].setText("A newly authored slide")
    writing[2].setText("New body — with paragraph spacing.\n\nSecond paragraph.")
    // Simulate selection moving during an open edit: saving must still target
    // the captured slide, not whichever slide is currently highlighted.
    controller.selectSlide(originalID)
    controller.editCopy(writing, title: "New slide edited")
    await controller.flush()
    try require(!controller.copyEditorOpen && controller.slideIndex[added.id]?.title == "New slide edited", "Copy editor did not acknowledge its saved title")
    try require(controller.slideIndex[added.id]?.copyBlocks.last?.text == writing[2].text, "Copy edit targeted the wrong slide")
    try require(controller.slideIndex[originalID]?.copyBlocks.map(\.text) == original.copyBlocks.map(\.text), "Editing another slide changed original copy")
    controller.selectSlide(originalID)
    controller.duplicateSlide()
    await controller.flush()
    guard let duplicated = controller.selectedSlide, duplicated.id != originalID else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Duplicate Slide did not select its new copy")
    }
    try require(duplicated.chosenIDs == original.chosenIDs && duplicated.settings.shortlist == original.settings.shortlist && duplicated.settings.notes == original.settings.notes, "Duplicate lost choices, candidates or notes")
    try require(duplicated.contentBlocks[0].id != original.contentBlocks[0].id, "Duplicate reused content identity")
    controller.reorderSlide(-1)
    await controller.flush()
    try require(controller.slides.first?.id == duplicated.id, "Move Earlier failed")
    controller.reorderSlide(1)
    await controller.flush()
    try require(controller.slides[1].id == duplicated.id, "Move Later failed")
    controller.renameSlide(duplicated.id, to: "Renamed duplicate")
    await controller.flush()
    controller.deleteSlideConfirmed(duplicated.id)
    await controller.flush()
    try require(controller.slideIndex[duplicated.id] == nil, "Delete Slide did not remove the slide")
    controller.undo(documentOnly: true)
    await controller.flush()
    try require(controller.slideIndex[duplicated.id]?.title == "Renamed duplicate" && controller.slideIndex[duplicated.id]?.chosenIDs == original.chosenIDs, "Undo Delete did not restore the complete slide")
    controller.undo(redo: true, documentOnly: true)
    await controller.flush()
    controller.deleteSlideConfirmed(added.id)
    await controller.flush()
    try require(controller.slides.map(\.id) == originalIDs && controller.failedCommands.isEmpty, "Slide management changed unrelated slide order or blocked saving")
    // The normal handoff below must also contain writing authored in the editor.
    controller.selectSlide(originalID)
    controller.beginEditCopy()
    var finalCopy = controller.selectedSlide!.copyBlocks
    finalCopy.append(DeckCopyBlock(id: UUID().uuidString.lowercased(), semanticKey: "edited.credit", role: "credit", value: RichCopy("EDITED-COPY-MUST-REACH-HANDOFF")))
    controller.editCopy(finalCopy)
    await controller.flush()
    try require(controller.selectedSlide?.copyBlocks.last?.text == "EDITED-COPY-MUST-REACH-HANDOFF" && !controller.copyEditorOpen, "Edited copy was not committed")
  }
  private static func syntheticImage(index: Int, url: URL) throws {
    let width = index % 3 == 0 ? 900 : 1600
    let height = index % 3 == 0 ? 1600 : 900
    guard
      let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Could not create synthetic media")
    }
    context.setFillColor(
      CGColor(
        red: Double((index * 43) % 255) / 255, green: Double((index * 79 + 60) % 255) / 255,
        blue: Double((index * 107 + 80) % 255) / 255, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.setFillColor(CGColor(gray: 1, alpha: 0.5))
    context.fill(CGRect(x: width * 2 / 3, y: height / 8, width: width / 5, height: height / 3))
    guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(
        url as CFURL, UTType.png.identifier as CFString, 1, nil)
    else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Could not encode synthetic media")
    }
    CGImageDestinationAddImage(destination, image, nil)
    try require(CGImageDestinationFinalize(destination), "Could not save synthetic image")
  }
  private static func renderedPage(_ page: PDFPage) throws -> Data {
    let image = try pageImage(page)
    guard let provider = image.dataProvider, let data = provider.data else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Could not read PDF pixels")
    }
    return data as Data
  }
  private static func hasVisibleSourceImage(_ page: PDFPage) throws -> Bool {
    let image = try pageImage(page)
    guard let data = image.dataProvider?.data else { return false }
    let pixels = CFDataGetBytePtr(data)!
    var colored = 0
    // Fixtures contain colored source images; text/background alone are gray.
    // Detect actual exported image pixels, not merely embedded image objects.
    for y in stride(from: 0, to: image.height, by: 4) {
      for x in stride(from: 0, to: image.width, by: 4) {
        let offset = y * image.bytesPerRow + x * 4
        let red = Int(pixels[offset]), green = Int(pixels[offset + 1]), blue = Int(pixels[offset + 2])
        if max(red, max(green, blue)) - min(red, min(green, blue)) > 15 { colored += 1 }
      }
    }
    return colored > image.width * image.height / 320
  }
  private static func pageImage(_ page: PDFPage) throws -> CGImage {
    let width = 1288
    let height = 540
    guard
      let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { throw WorkbenchFailure(name: "AcceptanceFailure", message: "Could not render PDF") }
    context.scaleBy(x: 0.5, y: 0.5)
    page.draw(with: .mediaBox, to: context)
    guard let image = context.makeImage() else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "PDF had no rendered pixels")
    }
    return image
  }
  private static func renderedPagePNG(_ page: PDFPage) throws -> Data {
    let image = try pageImage(page)
    let data = NSMutableData()
    guard
      let destination = CGImageDestinationCreateWithData(
        data, UTType.png.identifier as CFString, 1, nil)
    else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Could not encode PDF preview")
    }
    CGImageDestinationAddImage(destination, image, nil)
    try require(CGImageDestinationFinalize(destination), "Preview encoding failed")
    return data as Data
  }
}
