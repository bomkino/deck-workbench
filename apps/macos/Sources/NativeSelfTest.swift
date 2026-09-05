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
    await Task.yield()
    // Post a burst into AppKit's real event loop. Each Right event changes the
    // focused asset before the following S is dispatched by the installed monitor.
    controller.focusAsset(controller.filteredAssets[0].id)
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
      "AppKit did not dispatch all curation/navigation events")
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
      "savedCopyRecovery": true, "uiIndependentPDF": true, "nativeKeyEvents": true,
      "layoutPicker": true, "perImageEdits": true, "notesUndo": true, "validationDoesNotFence": true,
      "copyOnlyIndependent": true, "literalCopy": true, "safeFilenames": true, "thumbnailCache": true,
      "nativeBurstAndSaveSeconds": inputAndSaveSeconds,
      "manualAccessibility": "not performed", "targetMachinePerformance": "not measured",
      "issues": exported.issues,
    ]
    try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
      .write(to: output.appendingPathComponent("native-acceptance.json"), options: .atomic)
    print(
      "Native acceptance: 20-slide handoff, copy, media, keyboard decisions, undo, reopen, saved-copy recovery, UI-independent PDF."
    )
    window.orderOut(nil)
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
