import AppKit
import Combine
import Foundation
import UniformTypeIdentifiers

struct NativePendingCommand: Codable, Sendable {
  let type: String
  let payload: Data
  let deckID: String
  let commandID: String
  let label: String
}

@MainActor
final class NativeWorkbenchController: ObservableObject {
  @Published var document: DeckDocumentSnapshot?
  @Published var selectedSlideID: String?
  @Published var focusedAssetID: String?
  @Published var phase = "curate"
  @Published var status = "Import final copy to begin."
  @Published var failure: String?
  @Published var assets: [NativeMediaAsset] = []
  @Published var roots: [NativeMediaRoot] = []
  @Published var sources: [String: NativeMediaSource] = [:]
  @Published var query = ""
  @Published var collection = "all"
  @Published var selectedRootID: String?
  @Published var previewIDs: [String] = []
  @Published var previewOpen = false
  @Published var compareOpen = false
  @Published var compareIDs: Set<String> = []
  @Published var gridColumns = 3
  @Published var curateRole = "primary"
  @Published var showShortcuts = false
  @Published var showExport = false
  @Published var showCopy = false
  @Published var copyEditorOpen = false
  @Published var showSettings = false
  @Published var imported: ImportedCopyDocument?
  @Published var pendingCount = 0
  @Published var scanRunning = false
  @Published var exportRunning = false
  @Published var exportProgress = 0.0
  @Published var exportResult: HandoffResult?
  @Published var notesDrafts: [String: String] = [:]
  @Published var zoom: Double = 1
  @Published var showGuides = true
  @Published var selectionTarget = "text"
  @Published var gridSize: Double = 160
  @Published var theme: String = UserDefaults.standard.string(forKey: "native.theme") ?? "system" {
    didSet {
      UserDefaults.standard.set(theme, forKey: "native.theme")
      applyTheme()
    }
  }
  @Published var interfaceScale: Double =
    UserDefaults.standard.object(forKey: "native.interfaceScale") as? Double ?? 1
  { didSet { UserDefaults.standard.set(interfaceScale, forKey: "native.interfaceScale") } }
  @Published private(set) var failedCommands: [NativePendingCommand] = []
  private(set) var documentURL: URL?
  let session: NativeDocumentSession
  private var writeTail: Task<Void, Never>?
  private var noteTasks: [String: Task<Void, Never>] = [:]
  private var scanTask: Task<Void, Never>?
  private var exportTask: Task<Void, Never>?
  private var lifecycleBusy = false
  private var catalogRevision: Int = -1
  private var catalogGeneration = 0

  init() throws {
    guard
      let url = Bundle.main.url(
        forResource: "deck-kernel", withExtension: "js", subdirectory: "Kernel")
    else {
      throw WorkbenchFailure(
        name: "KernelUnavailable", message: "The bundled document engine is missing.")
    }
    session = try NativeDocumentSession(kernelURL: url)
    applyTheme()
  }
  var selectedSlide: DeckSlide? { document?.deck.slides.first { $0.id == selectedSlideID } }
  var focusedAsset: NativeMediaAsset? { assets.first { $0.id == focusedAssetID } }
  var filteredAssets: [NativeMediaAsset] {
    let slide = selectedSlide
    return assets.filter { asset in
      if let root = selectedRootID, asset.rootId != root { return false }
      if !query.isEmpty
        && !"\(asset.filename) \(asset.folder) \(asset.title)".localizedCaseInsensitiveContains(
          query)
      {
        return false
      }
      switch collection {
      case "shortlist": return slide?.settings.shortlist.contains(asset.id) == true
      case "chosen": return slide?.chosenIDs.contains(asset.id) == true
      case "rejected": return slide?.settings.rejected.contains(asset.id) == true
      default: return slide?.settings.rejected.contains(asset.id) != true
      }
    }
  }
  var notes: String {
    guard let slide = selectedSlide else { return "" }
    return notesDrafts[slide.id] ?? slide.settings.notes
  }
  var recentDocuments: [URL] {
    (UserDefaults.standard.stringArray(forKey: "native.recentDocuments") ?? []).map {
      URL(fileURLWithPath: $0)
    }
  }
  func applyTheme() {
    NSApp?.appearance =
      theme == "dark"
      ? NSAppearance(named: .darkAqua) : theme == "light" ? NSAppearance(named: .aqua) : nil
  }
  private func apply(_ data: Data) throws {
    let snapshot = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: data)
    let newDeck = document?.deck.deckId != snapshot.deck.deckId
    document = snapshot
    if newDeck || !snapshot.deck.slides.contains(where: { $0.id == selectedSlideID }) {
      selectedSlideID = snapshot.deck.slides.first?.id
    }
    if newDeck {
      focusedAssetID = nil
      previewOpen = false
      notesDrafts = [:]
      query = ""
      collection = "all"
      selectedRootID = nil
    }
  }
  private func accept(_ receipt: NativeWriteReceipt) {
    if let snapshot = receipt.snapshot {
      do { try apply(snapshot) } catch {
        failure =
          "Saved revision \(receipt.revision), but the view could not refresh. Reopen to refresh; do not repeat the decision."
      }
    } else {
      failure =
        "Saved revision \(receipt.revision), but the view needs refreshing. \(receipt.viewError ?? "")"
    }
  }
  private func remember(_ url: URL) {
    var urls = recentDocuments.filter { $0 != url }
    urls.insert(url, at: 0)
    UserDefaults.standard.set(Array(urls.prefix(12)).map(\.path), forKey: "native.recentDocuments")
    NSDocumentController.shared.noteNewRecentDocumentURL(url)
  }
  func selectSlide(_ id: String) {
    selectedSlideID = id
    selectionTarget = "text"
  }
  func moveSlide(_ delta: Int) {
    guard let slides = document?.deck.slides, !slides.isEmpty else { return }
    let current = slides.firstIndex { $0.id == selectedSlideID } ?? 0
    selectedSlideID = slides[min(slides.count - 1, max(0, current + delta))].id
  }
  func focusAsset(_ id: String) {
    focusedAssetID = id
    NSApp.keyWindow?.makeFirstResponder(nil)
  }
  func focusNext(_ delta: Int) {
    let ids = previewOpen ? previewIDs : filteredAssets.map(\.id)
    guard !ids.isEmpty else { return }
    let index = ids.firstIndex(of: focusedAssetID ?? "") ?? 0
    focusedAssetID = ids[min(ids.count - 1, max(0, index + delta))]
  }
  func preview(_ id: String? = nil) {
    if let id { focusedAssetID = id }
    if focusedAssetID == nil { focusedAssetID = filteredAssets.first?.id }
    previewIDs = filteredAssets.map(\.id)
    previewOpen = focusedAssetID != nil
  }

  func enqueue(type: String, payload: [String: Any], label: String, slideID: String? = nil) {
    guard let deckID = document?.deck.deckId else { return }
    do {
      let data = try JSONSerialization.data(withJSONObject: payload, options: .sortedKeys)
      submit(
        NativePendingCommand(
          type: type, payload: data, deckID: deckID, commandID: UUID().uuidString.lowercased(),
          label: label))
    } catch { failure = error.localizedDescription }
  }
  private func submit(_ command: NativePendingCommand) {
    pendingCount += 1
    let prior = writeTail
    writeTail = Task { [weak self] in
      await prior?.value
      guard let self else { return }
      defer {
        self.pendingCount = max(0, self.pendingCount - 1)
        if self.pendingCount == 0 && self.failedCommands.isEmpty && self.failure == nil {
          self.status = "All changes saved"
        }
      }
      guard self.failedCommands.isEmpty else {
        self.failedCommands.append(command)
        return
      }
      do {
        let receipt = try await self.session.execute(
          type: command.type, payload: command.payload, deckID: command.deckID,
          commandID: command.commandID, label: command.label, source: "keyboard")
        self.accept(receipt)
      } catch {
        self.failedCommands.append(command)
        self.failure =
          "\(command.label) was not acknowledged as saved. \(error.localizedDescription) Your pending actions are retained; use Retry Pending Actions or Save Pending Actions before closing."
      }
    }
  }
  func setNotes(_ value: String) {
    guard let slide = selectedSlide else { return }
    notesDrafts[slide.id] = value
    noteTasks[slide.id]?.cancel()
    let id = slide.id
    let deckID = document?.deck.deckId
    noteTasks[id] = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(350))
      guard !Task.isCancelled, let self, self.document?.deck.deckId == deckID else { return }
      self.commitNote(id)
      self.noteTasks[id] = nil
    }
  }
  private func commitNote(_ id: String) {
    guard let text = notesDrafts[id] else { return }
    enqueue(
      type: "native.slide.patch", payload: ["slideId": id, "patch": ["notes": text]],
      label: "Save designer notes")
  }
  func flush() async {
    for task in noteTasks.values { task.cancel() }
    noteTasks = [:]
    for (id, text) in notesDrafts
    where document?.deck.slides.first(where: { $0.id == id })?.settings.notes != text {
      commitNote(id)
    }
    await writeTail?.value
  }
  func patchSlide(_ patch: [String: Any], id: String? = nil) {
    guard let id = id ?? selectedSlideID else { return }
    enqueue(
      type: "native.slide.patch", payload: ["slideId": id, "patch": patch],
      label: "Adjust prototype")
  }
  func patchLayout(_ patch: [String: Any], id: String? = nil) {
    patchSlide(["layout": patch], id: id)
  }
  func chooseLayout(_ preset: String) {
    patchLayout(["preset": preset, "textFrame": NSNull(), "frames": NSNull()])
  }
  func decide(_ action: String, assetID: String? = nil, role: String? = nil) {
    guard let slideID = selectedSlideID,
      let asset = assets.first(where: { $0.id == (assetID ?? focusedAssetID) })
    else { return }
    do {
      enqueue(
        type: "native.curate.set",
        payload: [
          "slideId": slideID, "asset": try nativeObject(asset.reference), "action": action,
          "role": role ?? curateRole, "assignmentId": UUID().uuidString.lowercased(),
          "fingerprint": asset.fingerprint,
        ], label: action == "use" ? "Choose image" : "Update shortlist")
    } catch { failure = error.localizedDescription }
  }
  func nudge(dx: Double, dy: Double, frame: PrototypeFrame) {
    guard let slideID = selectedSlideID else { return }
    do {
      enqueue(
        type: "native.nudge",
        payload: [
          "slideId": slideID, "target": selectionTarget, "frame": try nativeObject(frame), "dx": dx,
          "dy": dy,
        ], label: "Nudge prototype")
    } catch { failure = error.localizedDescription }
  }
  func undo(redo: Bool = false) {
    guard let deckID = document?.deck.deckId else { return }
    let prior = writeTail
    pendingCount += 1
    writeTail = Task { [weak self] in
      await prior?.value
      guard let self else { return }
      defer { self.pendingCount -= 1 }
      guard self.failedCommands.isEmpty else { return }
      do { self.accept(try await self.session.history(redo: redo, deckID: deckID)) } catch {
        self.failure = error.localizedDescription
      }
    }
  }
  func replaceCopy(with imported: ImportedCopyDocument) {
    guard let old = document?.deck.slides else { return }
    let titles = old.map(\.title)
    let incoming = imported.slides
    guard old.count == incoming.count, Set(titles).count == titles.count,
      Set(titles) == Set(incoming.map(\.title))
    else {
      failure =
        "Replacement requires the same uniquely named slides. Nothing was changed. Import as a new deck when boundaries or titles differ."
      return
    }
    do {
      let replacements: [[String: Any]] = try old.map { slide in
        let new = incoming.first { $0.title == slide.title }!
        var roleCounts: [String: Int] = [:]
        let blocks = new.blocks.map { block -> DeckCopyBlock in
          let index = roleCounts[block.role, default: 0]
          roleCounts[block.role] = index + 1
          let existing = slide.copyBlocks.filter { $0.role == block.role }
          if index < existing.count {
            return DeckCopyBlock(
              id: existing[index].id, semanticKey: existing[index].semanticKey, role: block.role,
              value: block.value)
          }
          return block
        }
        return ["slideId": slide.id, "blocks": try nativeObject(blocks)]
      }
      enqueue(
        type: "native.copy.replace", payload: ["slides": replacements],
        label: "Replace approved copy")
      self.imported = nil
    } catch { failure = error.localizedDescription }
  }
  func editCopy(_ blocks: [DeckCopyBlock]) {
    guard let id = selectedSlideID else { return }
    do {
      enqueue(
        type: "native.copy.replace",
        payload: ["slides": [["slideId": id, "blocks": try nativeObject(blocks)]]],
        label: "Update approved copy")
      copyEditorOpen = false
    } catch { failure = error.localizedDescription }
  }

  func importFile() {
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.plainText, UTType(filenameExtension: "md") ?? .plainText]
    panel.allowsMultipleSelection = false
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url else { return }
      Task { @MainActor in
        do {
          self?.imported = try NativeCopyImport.parse(
            Data(contentsOf: url), filename: url.lastPathComponent)
        } catch { self?.failure = error.localizedDescription }
      }
    }
  }
  func createImported() {
    guard let imported else { return }
    let panel = NSSavePanel()
    panel.allowedContentTypes = [UTType(exportedAs: "dog.pitch.deck", conformingTo: .package)]
    panel.nameFieldStringValue = "\(NativeHandoffExporter.safeName(imported.title)).pitchdeck"
    panel.canCreateDirectories = true
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url, let self else { return }
      Task { @MainActor in
        guard await self.closeForSwitch() else { return }
        do {
          try self.apply(await self.session.create(at: url, seed: imported.checkpoint()))
          self.documentURL = url
          self.remember(url)
          self.imported = nil
          self.phase = "curate"
          self.status = "Copy imported and locked"
          await self.refreshCatalog()
        } catch { self.failure = error.localizedDescription }
      }
    }
  }
  func openPanel() {
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [UTType(exportedAs: "dog.pitch.deck", conformingTo: .package)]
    panel.begin { [weak self] response in
      if response == .OK, let url = panel.url { Task { @MainActor in await self?.open(url) } }
    }
  }
  func open(_ url: URL) async {
    guard !lifecycleBusy else { return }
    lifecycleBusy = true
    defer { lifecycleBusy = false }
    guard await closeForSwitch() else { return }
    do {
      try apply(await session.open(at: url))
      documentURL = url
      remember(url)
      status = "Deck opened"
      await refreshCatalog()
    } catch {
      failure =
        "\(error.localizedDescription) Use Recover Saved Copy for a crash-left lock; the original will not be changed."
    }
  }
  @discardableResult func closeForSwitch() async -> Bool {
    await flush()
    guard failedCommands.isEmpty else {
      failure =
        "Some actions are not saved. Retry them or save the pending-actions file before closing."
      return false
    }
    if exportRunning {
      failure = "Cancel or finish the handoff before closing this deck."
      return false
    }
    scanTask?.cancel()
    catalogGeneration += 1
    if let media = try? await session.mediaSession() { await media.cancelNativeScans() }
    do {
      try await session.close()
      document = nil
      documentURL = nil
      selectedSlideID = nil
      assets = []
      roots = []
      sources = [:]
      catalogRevision = -1
      status = "Import final copy to begin."
      return true
    } catch {
      failure = error.localizedDescription
      return false
    }
  }
  func save() {
    Task {
      await flush()
      guard failedCommands.isEmpty else { return }
      do {
        try await session.save()
        status = "All changes saved"
      } catch { failure = error.localizedDescription }
    }
  }
  func retryPending() {
    Task {
      await writeTail?.value
      guard let url = documentURL else { return }
      let pending = failedCommands
      do {
        try await session.close()
        try apply(await session.open(at: url))
        failedCommands = []
        failure = nil
        for command in pending { submit(command) }
      } catch { failure = error.localizedDescription }
    }
  }
  func savePending() {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = "Workbench pending actions.json"
    panel.allowedContentTypes = [.json]
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url, let self else { return }
      do {
        try nativeJSON(self.failedCommands).write(to: url, options: .atomic)
        self.status = "Pending actions saved. The deck was not changed."
      } catch { self.failure = error.localizedDescription }
    }
  }
  func discardPending() {
    let alert = NSAlert()
    alert.messageText = "Discard unsaved actions?"
    alert.informativeText =
      "This removes only the queued actions that were not acknowledged. Your saved deck is not changed."
    alert.addButton(withTitle: "Keep actions")
    alert.addButton(withTitle: "Discard unsaved actions")
    if alert.runModal() == .alertSecondButtonReturn {
      failedCommands = []
      failure = nil
    }
  }
  func recoverCopy() {
    let open = NSOpenPanel()
    open.allowedContentTypes = [UTType(exportedAs: "dog.pitch.deck", conformingTo: .package)]
    open.title = "Choose deck to recover"
    open.begin { [weak self] response in
      guard response == .OK, let source = open.url else { return }
      let save = NSSavePanel()
      save.nameFieldStringValue =
        source.deletingPathExtension().lastPathComponent + " — Recovered.pitchdeck"
      save.begin { response in
        guard response == .OK, let destination = save.url else { return }
        Task {
          do {
            let recovered = try await Task.detached {
              try PitchDeckDocumentStore.recoverCopy(from: source, to: destination)
            }.value
            await self?.open(recovered)
          } catch { await MainActor.run { self?.failure = error.localizedDescription } }
        }
      }
    }
  }

  func addMediaFolder(reconnect rootID: String? = nil) {
    let panel = NSOpenPanel()
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    panel.title = rootID == nil ? "Choose media folder" : "Reconnect media folder"
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url, let self else { return }
      self.scanTask = Task { await self.scan(url: url, rootID: rootID) }
    }
  }
  private func scan(url: URL?, rootID: String?) async {
    guard !scanRunning else { return }
    scanRunning = true
    status = "Scanning media…"
    defer { scanRunning = false }
    guard let media = try? await session.mediaSession() else { return }
    let updater = Task { [weak self] in
      while !Task.isCancelled {
        await self?.refreshCatalog()
        try? await Task.sleep(for: .milliseconds(500))
      }
    }
    defer { updater.cancel() }
    do {
      let result: Data
      if let url {
        result =
          try await
          (rootID == nil
          ? media.authorizeRootJSON(url) : media.reconnectRootJSON(rootId: rootID!, url: url))
      } else {
        result = try await media.scanRootJSON(rootId: rootID!)
      }
      await refreshCatalog()
      let object = try JSONSerialization.jsonObject(with: result) as? [String: Any]
      let scan = object?["scan"] as? [String: Any]
      status =
        scan?["status"] as? String == "incomplete"
        ? "Scan stopped with partial results; nothing was marked missing."
        : "\(assets.count) media files available"
    } catch is CancellationError {
      status = "Scan cancelled; discovered media remains available."
    } catch { failure = error.localizedDescription }
  }
  func rescan(_ id: String) { scanTask = Task { await scan(url: nil, rootID: id) } }
  func cancelScan() {
    scanTask?.cancel()
    Task { if let media = try? await session.mediaSession() { await media.cancelNativeScans() } }
  }
  func refreshCatalog() async {
    let generation = catalogGeneration
    do {
      let media = try await session.mediaSession()
      let data = try await media.nativeCatalogData()
      let catalog = try JSONDecoder().decode(NativeCatalogSnapshot.self, from: data)
      guard generation == catalogGeneration else { return }
      guard catalog.revision != catalogRevision else { return }
      let resolved = try await media.nativeSources(assetIds: catalog.assets.map(\.id))
      guard generation == catalogGeneration else { return }
      assets = catalog.assets
      roots = catalog.roots
      sources = resolved
      catalogRevision = catalog.revision
    } catch {
      if document != nil { status = "Media list needs refreshing: \(error.localizedDescription)" }
    }
  }
  func toggleCompare(_ id: String? = nil) {
    guard let id = id ?? focusedAssetID else { return }
    if compareIDs.contains(id) {
      compareIDs.remove(id)
    } else if compareIDs.count < 3 {
      compareIDs.insert(id)
    } else {
      status = "Comparison holds up to three images."
    }
  }
  func revealFocused() {
    guard let id = focusedAssetID, let source = sources[id] else { return }
    do {
      try NativeMediaIO.withSource(source) { _, url in
        NSWorkspace.shared.activateFileViewerSelecting([url])
      }
    } catch { failure = error.localizedDescription }
  }
  func export(_ options: HandoffOptions) {
    guard !exportRunning else { return }
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    panel.title = "Choose handoff destination"
    panel.begin { [weak self] response in
      guard response == .OK, let parent = panel.url, let self else { return }
      self.showExport = false
      self.exportTask = Task { await self.performExport(parent: parent, options: options) }
    }
  }
  private func performExport(parent: URL, options: HandoffOptions) async {
    await flush()
    guard failedCommands.isEmpty else {
      failure =
        "Pending actions must be saved or explicitly discarded before taking the handoff snapshot."
      return
    }
    exportRunning = true
    exportProgress = 0
    defer { exportRunning = false }
    do {
      let frozen = try JSONDecoder().decode(
        DeckDocumentSnapshot.self, from: await session.snapshot())
      let media = try await session.mediaSession()
      await media.excludeNativeDestination(parent)
      let ids = Set(frozen.deck.slides.flatMap { Array($0.chosenIDs) + $0.settings.shortlist })
      let sources = try await media.nativeSources(assetIds: Array(ids))
      let work = Task.detached(priority: .userInitiated) {
        try NativeHandoffExporter.export(
          snapshot: frozen, sources: sources, to: parent, options: options
        ) { [weak self] event in
          Task { @MainActor in
            self?.exportProgress = Double(event.completed) / Double(max(1, event.total))
            self?.status = event.message
          }
        }
      }
      let result = try await withTaskCancellationHandler(
        operation: { try await work.value }, onCancel: { work.cancel() })
      exportResult = result
      status =
        result.issues.isEmpty
        ? "Handoff exported: \(result.slideCount) slides, \(result.originalCopies) original copies."
        : "Handoff exported with \(result.issues.count) exceptions. Review Export issues.txt."
      NSWorkspace.shared.activateFileViewerSelecting([result.url])
    } catch is CancellationError {
      status = "Export cancelled; previous handoffs were not changed."
    } catch { failure = error.localizedDescription }
  }
  func cancelExport() { exportTask?.cancel() }
}
