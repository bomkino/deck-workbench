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
  var noteSlideID: String? = nil
  var noteGeneration: Int? = nil
}

@MainActor
final class NativeWorkbenchController: ObservableObject {
  @Published var document: DeckDocumentSnapshot? { didSet { indexDocument() } }
  @Published var selectedSlideID: String? { didSet { if oldValue != selectedSlideID { selectionChanged() } } }
  @Published var focusedAssetID: String? { didSet { if oldValue != focusedAssetID { prefetchAdjacent() } } }
  @Published var phase = "curate" {
    didSet {
      if oldValue != phase {
        previewOpen = false; compareOpen = false
        if phase == "curate" { cleanPreview = false }
      }
    }
  }
  @Published var status = "Import final copy to begin."
  @Published var failure: String?
  @Published var assets: [NativeMediaAsset] = [] { didSet { indexAssets() } }
  @Published var roots: [NativeMediaRoot] = []
  @Published var sources: [String: NativeMediaSource] = [:]
  @Published var query = "" { didSet { if oldValue != query { refreshMediaScope(resetPreview: true) } } }
  @Published var collection = "all" { didSet { if oldValue != collection { refreshMediaScope(resetPreview: true) } } }
  @Published var selectedRootID: String? { didSet { if oldValue != selectedRootID { refreshMediaScope(resetPreview: true) } } }
  @Published var previewIDs: [String] = []
  private var previewUsesCandidates = false
  private var previewReturnFocusID: String?
  @Published var previewOpen = false {
    didSet {
      if oldValue && !previewOpen {
        if previewUsesCandidates && !filteredAssets.contains(where: { $0.id == focusedAssetID }) {
          focusedAssetID = filteredAssets.first(where: { $0.id == previewReturnFocusID })?.id ?? filteredAssets.first?.id
        }
        previewReturnFocusID = nil
        refreshMediaScope(resetPreview: true)
      }
      prefetchAdjacent()
    }
  }
  @Published var compareOpen = false
  @Published var comparedAssetID: String?
  @Published var searchRequest = 0
  @Published var mediaFocusRequest = 0
  private var pendingSearchFocus = false
  @Published var compareIDs: [String] = []
  @Published var gridColumns = 3
  @Published var curateRole = "primary"
  @Published var showShortcuts = false
  @Published var showExport = false
  @Published var showCopy = false
  @Published var copyEditorOpen = false
  @Published private(set) var copyEditorTarget: DeckSlide?
  @Published private(set) var copyEditorDeckID: String?
  @Published private(set) var copyEditorSaving = false
  @Published var copyEditorError: String?
  @Published private(set) var slideActionBusy = false
  private(set) var slideOrdinals: [String: Int] = [:]
  @Published var showSettings = false
  @Published var showApplyLayout = false
  @Published var showExportResult = false
  @Published var cleanPreview = false {
    didSet {
      guard oldValue != cleanPreview else { return }
      if cleanPreview { phase = "assemble"; previewOpen = false; compareOpen = false }
      fitCanvas()
    }
  }
  @Published var viewportRevision = 0
  @Published var showContext = true
  @Published var contextWidth: Double = UserDefaults.standard.object(forKey: "native.contextWidth") as? Double ?? 310 {
    didSet { UserDefaults.standard.set(contextWidth, forKey: "native.contextWidth") }
  }
  @Published var autoAdvance = UserDefaults.standard.bool(forKey: "native.autoAdvance") {
    didSet { UserDefaults.standard.set(autoAdvance, forKey: "native.autoAdvance") }
  }
  @Published var sortOrder = "filename" { didSet { sortAssets() } }
  @Published private(set) var filteredAssets: [NativeMediaAsset] = []
  private(set) var assetIndex: [String: NativeMediaAsset] = [:]
  private(set) var slideIndex: [String: DeckSlide] = [:]
  private(set) var slides: [DeckSlide] = []
  private(set) var chosenAssetIDs: Set<String> = []
  private(set) var shortlistedAssetIDs: Set<String> = []
  private var orderedAssets: [NativeMediaAsset] = []
  private var filterSignature = ""
  private var assetGeneration = 0
  private var noteGenerations: [String: Int] = [:]
  private var enqueuedNoteGenerations: [String: Int] = [:]
  @Published var imported: ImportedCopyDocument?
  @Published private(set) var importRunning = false
  @Published private(set) var replacementSaving = false
  @Published var importError: String?
  @Published private(set) var exportChoosingDestination = false
  private var importGeneration = 0
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
  @Published private(set) var lifecycleBusy = false
  private var catalogRevision: Int = -1
  private var catalogGeneration = 0
  private var mediaAccessGeneration = 0
  private var catalogRefreshToken: UUID?
  private var exportGeneration = 0
  private var prefetchTask: Task<Void, Never>?
  private var resolvedRevision: Int?
  private var resolvedSlideID: String?
  private var resolvedDeckID: String?
  private(set) var sceneGeneration = 0
  private var resolvedKey: Int?
  private var resolvedValue: ResolvedPrototype?
  var resolvedScene: ResolvedPrototype? {
    guard let slide = selectedSlide, let canvas = document?.deck.canvasPreset else { return nil }
    let deckID = document?.deck.deckId
    if resolvedRevision == document?.revision && resolvedSlideID == slide.id && resolvedDeckID == deckID {
      return resolvedValue
    }
    resolvedRevision = document?.revision; resolvedSlideID = slide.id; resolvedDeckID = deckID
    var hash = Hasher()
    hash.combine(deckID); hash.combine(slide.id); hash.combine(slide.intent)
    hash.combine(try? nativeJSON(slide.settings.layout)); hash.combine(try? nativeJSON(slide.copyBlocks))
    hash.combine(try? nativeJSON(slide.mediaAssignments)); hash.combine(try? nativeJSON(slide.legacyComposition))
    hash.combine(canvas.width); hash.combine(canvas.height)
    let key = hash.finalize()
    if resolvedKey != key {
      resolvedKey = key
      resolvedValue = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
      sceneGeneration += 1
    }
    return resolvedValue
  }
  private func prefetchAdjacent() {
    prefetchTask?.cancel()
    guard previewOpen, let id = focusedAssetID, let index = previewIDs.firstIndex(of: id) else { return }
    let candidates = [index + 1, index - 1].filter { previewIDs.indices.contains($0) }.compactMap { sources[previewIDs[$0]] }
    prefetchTask = Task {
      for source in candidates { guard !Task.isCancelled else { return }; _ = await NativeThumbnailService.shared.data(for: source, longestSide: 2048) }
    }
  }

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
  var selectedSlide: DeckSlide? { selectedSlideID.flatMap { slideIndex[$0] } }
  var focusedAsset: NativeMediaAsset? { focusedAssetID.flatMap { assetIndex[$0] } }
  private func indexDocument() {
    slides = document?.deck.slides ?? []
    slideIndex = Dictionary(uniqueKeysWithValues: slides.map { ($0.id, $0) })
    slideOrdinals = Dictionary(uniqueKeysWithValues: slides.enumerated().map { ($0.element.id, $0.offset + 1) })
    refreshMediaScope()
    if let slide = selectedSlide {
      if !slide.imageRoles.contains(curateRole) { curateRole = slide.imageRoles.first ?? "primary" }
      let preset = NativeSlideRenderer.resolvedPreset(slide: slide)
      if preset == "image-only" && ["text", "gradient"].contains(selectionTarget) { selectionTarget = slide.imageRoles.first ?? "primary" }
      else if selectionTarget == "gradient" && (preset == "text-only" || slide.imageRoles.count > 1) { selectionTarget = "text" }
      else if !["text", "gradient"].contains(selectionTarget) && !slide.imageRoles.contains(selectionTarget) { selectionTarget = "text" }
    }
  }
  private func indexAssets() {
    assetIndex = Dictionary(uniqueKeysWithValues: assets.map { ($0.id, $0) })
    assetGeneration += 1
    sortAssets()
  }
  private func sortAssets() {
    orderedAssets = assets.sorted { a, b in
      if sortOrder == "modified", a.modifiedAt != b.modifiedAt { return (a.modifiedAt ?? 0) > (b.modifiedAt ?? 0) }
      let left = sortOrder == "folder" ? a.folder + "/" + a.filename : a.filename
      let right = sortOrder == "folder" ? b.folder + "/" + b.filename : b.filename
      let order = left.localizedStandardCompare(right)
      return order == .orderedSame ? a.id < b.id : order == .orderedAscending
    }
    filterSignature = ""
    refreshMediaScope(resetPreview: true)
  }
  private func selectionChanged() {
    selectionTarget = selectedSlide.map { NativeSlideRenderer.resolvedPreset(slide: $0) == "image-only" } == true ? "primary" : "text"
    curateRole = selectedSlide?.imageRoles.first ?? "primary"
    compareOpen = false
    compareIDs = []; comparedAssetID = nil
    viewportRevision += 1
    refreshMediaScope(resetPreview: true)
  }
  private func refreshMediaScope(resetPreview: Bool = false) {
    let slide = selectedSlide
    let chosen = slide?.chosenIDs ?? []
    let shortlist = Set(slide?.settings.shortlist ?? [])
    let rejected = Set(slide?.settings.rejected ?? [])
    var hash = Hasher()
    hash.combine(assetGeneration); hash.combine(sortOrder); hash.combine(query); hash.combine(collection)
    hash.combine(selectedRootID); hash.combine(selectedSlideID); hash.combine(chosen); hash.combine(shortlist); hash.combine(rejected)
    let signature = String(hash.finalize())
    guard signature != filterSignature || resetPreview else { return }
    filterSignature = signature
    chosenAssetIDs = chosen
    shortlistedAssetIDs = shortlist
    let oldIDs = filteredAssets.map(\.id)
    let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
    filteredAssets = orderedAssets.filter { asset in
      if let root = selectedRootID, asset.rootId != root { return false }
      if !search.isEmpty && !"\(asset.filename) \(asset.folder) \(asset.title)".localizedCaseInsensitiveContains(search) { return false }
      switch collection {
      case "shortlist": return shortlist.contains(asset.id)
      case "chosen": return chosen.contains(asset.id)
      case "rejected": return rejected.contains(asset.id)
      default: return !rejected.contains(asset.id)
      }
    }
    let ids = filteredAssets.map(\.id)
    let available = Set(ids)
    if previewOpen {
      let previous = previewIDs
      if previewUsesCandidates {
        let candidateIDs = (slide?.mediaAssignments ?? []).map(\.assetReferenceId) + (slide?.settings.shortlist ?? [])
        var seen = Set<String>()
        previewIDs = candidateIDs.filter { assetIndex[$0] != nil && seen.insert($0).inserted }
      } else { previewIDs = resetPreview ? ids : previewIDs.filter { available.contains($0) } }
      if let focused = focusedAssetID, !previewIDs.contains(focused) {
        let index = previous.firstIndex(of: focused) ?? 0
        focusedAssetID = previewIDs.isEmpty ? nil : previewIDs[min(index, previewIDs.count - 1)]
      }
      if previewIDs.isEmpty { previewOpen = false }
    } else if let focused = focusedAssetID, !available.contains(focused) {
      let index = oldIDs.firstIndex(of: focused) ?? 0
      focusedAssetID = ids.isEmpty ? nil : ids[min(index, ids.count - 1)]
    }
  }
  func clearFilters() { query = ""; selectedRootID = nil; collection = "all" }
  func fitCanvas() { zoom = 1; viewportRevision += 1 }
  var notes: String { selectedSlideID.map { notes(for: $0) } ?? "" }
  func notes(for slideID: String) -> String {
    notesDrafts[slideID] ?? slideIndex[slideID]?.settings.notes ?? ""
  }
  var canExport: Bool {
    document != nil && !lifecycleBusy && !copyEditorOpen && !exportRunning
      && !exportChoosingDestination && !replacementSaving && imported == nil
      && !showApplyLayout && !showExportResult && !showSettings && !showShortcuts
  }
  func searchMedia() {
    guard document != nil, !lifecycleBusy, !copyEditorOpen else { return }
    previewOpen = false; compareOpen = false; cleanPreview = false
    pendingSearchFocus = true
    phase = "curate"; searchRequest += 1
  }
  func consumeSearchFocusRequest() -> Bool {
    defer { pendingSearchFocus = false }
    return pendingSearchFocus
  }
  func endCleanPreview() { cleanPreview = false }
  func startCleanPreview() {
    guard document != nil, !lifecycleBusy, !copyEditorOpen else { return }
    cleanPreview.toggle()
    NSApp.keyWindow?.makeFirstResponder(nil)
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
      noteGenerations = [:]
      enqueuedNoteGenerations = [:]
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
    guard slideIndex[id] != nil, !lifecycleBusy else { return }
    // selectionChanged owns the visible target. Do not select invisible text on
    // image-only slides after it has already selected the image.
    selectedSlideID = id
  }
  func moveSlide(_ delta: Int) {
    guard let slides = document?.deck.slides, !slides.isEmpty else { return }
    let current = (selectedSlideID.flatMap { slideOrdinals[$0] } ?? 1) - 1
    selectSlide(slides[min(slides.count - 1, max(0, current + delta))].id)
  }
  func focusAsset(_ id: String) {
    pendingSearchFocus = false
    focusedAssetID = id
    mediaFocusRequest += 1
    NSApp.keyWindow?.makeFirstResponder(nil)
  }
  func focusNext(_ delta: Int) {
    let ids = previewOpen ? previewIDs : filteredAssets.map(\.id)
    guard !ids.isEmpty else { return }
    guard let index = ids.firstIndex(of: focusedAssetID ?? "") else {
      focusedAssetID = delta < 0 ? ids.last : ids.first
      return
    }
    focusedAssetID = ids[min(ids.count - 1, max(0, index + delta))]
  }
  func preview(_ id: String? = nil) {
    previewUsesCandidates = false
    if let id { focusedAssetID = id }
    previewIDs = filteredAssets.map(\.id)
    if !previewIDs.contains(focusedAssetID ?? "") { focusedAssetID = previewIDs.first }
    previewOpen = focusedAssetID != nil
  }

  func previewCandidate(_ id: String) {
    guard let slide = selectedSlide else { return }
    if !previewOpen { previewReturnFocusID = focusedAssetID }
    previewUsesCandidates = true
    var seen = Set<String>()
    previewIDs = ((slide.mediaAssignments ?? []).map(\.assetReferenceId) + slide.settings.shortlist).filter { assetIndex[$0] != nil && seen.insert($0).inserted }
    guard previewIDs.contains(id) else { return }
    focusedAssetID = id
    previewOpen = true
    compareOpen = false
  }
  func enqueue(type: String, payload: [String: Any], label: String, slideID: String? = nil) {
    guard let deckID = document?.deck.deckId, !lifecycleBusy else { return }
    do {
      let data = try JSONSerialization.data(withJSONObject: payload, options: .sortedKeys)
      submit(
        NativePendingCommand(
          type: type, payload: data, deckID: deckID, commandID: UUID().uuidString.lowercased(),
          label: label))
    } catch { failure = error.localizedDescription }
  }
  private func submit(_ command: NativePendingCommand, completion: ((Bool) -> Void)? = nil) {
    pendingCount += 1
    let prior = writeTail
    writeTail = Task { [weak self] in
      await prior?.value
      guard let self else { completion?(false); return }
      var saved = false
      defer {
        completion?(saved)
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
        self.acknowledgeNote(command)
        saved = true
      } catch {
        let rejected = WorkbenchFailure.unexpected(error)
        if ["InvalidCommand", "DocumentChanged", "NoDocument"].contains(rejected.name) {
          // Definitive validation rejection did not touch the journal. Keep later
          // independent actions usable; only uncertain storage failures fence it.
          self.failure = "\(command.label) was not applied: \(rejected.message)"
          if let id = command.noteSlideID { self.enqueuedNoteGenerations[id] = nil }
          return
        }
        self.failedCommands.append(command)
        self.failure =
          "\(command.label) was not acknowledged as saved. \(error.localizedDescription) Your pending actions are retained; use Retry Pending Actions or Save Pending Actions before closing."
      }
    }
  }
  private func acknowledgeNote(_ command: NativePendingCommand) {
    guard let id = command.noteSlideID, let generation = command.noteGeneration else { return }
    if enqueuedNoteGenerations[id] == generation { enqueuedNoteGenerations[id] = nil }
    // Acknowledging older text must not erase keystrokes typed during its write.
    if noteGenerations[id] == generation { notesDrafts[id] = nil }
  }
  func setNotes(_ value: String, slideID: String? = nil) {
    guard let id = slideID ?? selectedSlideID, slideIndex[id] != nil, !lifecycleBusy else { return }
    notesDrafts[id] = value
    noteGenerations[id, default: 0] += 1
    let generation = noteGenerations[id]!
    noteTasks[id]?.cancel()
    let deckID = document?.deck.deckId
    noteTasks[id] = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(350))
      guard !Task.isCancelled, let self, self.document?.deck.deckId == deckID,
        self.noteGenerations[id] == generation else { return }
      self.commitNote(id)
      self.noteTasks[id] = nil
    }
  }
  private func commitNote(_ id: String) {
    guard let text = notesDrafts[id], let generation = noteGenerations[id],
      enqueuedNoteGenerations[id] != generation, let deckID = document?.deck.deckId else { return }
    if slideIndex[id]?.settings.notes == text && enqueuedNoteGenerations[id] == nil {
      notesDrafts[id] = nil
      return
    }
    do {
      let data = try JSONSerialization.data(withJSONObject: ["slideId": id, "patch": ["notes": text]], options: .sortedKeys)
      enqueuedNoteGenerations[id] = generation
      submit(NativePendingCommand(type: "native.slide.patch", payload: data, deckID: deckID,
        commandID: UUID().uuidString.lowercased(), label: "Save designer notes", noteSlideID: id, noteGeneration: generation))
    } catch { failure = error.localizedDescription }
  }
  func flush() async {
    for task in noteTasks.values { task.cancel() }
    noteTasks = [:]
    for id in Array(notesDrafts.keys) { commitNote(id) }
    repeat { await writeTail?.value } while pendingCount > 0
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
  func chooseLayout(_ preset: String, id: String? = nil) {
    curateRole = "primary"
    selectionTarget = preset == "image-only" ? "primary" : "text"
    // A fresh placement uses the preset's gradient direction. Image crops,
    // provisional type, copy, notes and candidates remain authored separately.
    patchLayout(["preset": preset, "textFrame": NSNull(), "frames": NSNull(), "gradient": NSNull()], id: id)
  }
  func cropZoom(for role: String) -> Double? {
    guard let layer = resolvedScene?.imageLayers.first(where: { $0.role == role }),
      let id = layer.assetID, let asset = assetIndex[id], let width = asset.width, let height = asset.height,
      width > 0, height > 0, layer.fit != "fit" else { return nil }
    return NativeLayoutGeometry.cropZoom(layer, width: Double(width), height: Double(height))
  }
  func zoomCrop(_ amount: Double, role: String, slideID: String) {
    guard !lifecycleBusy, amount.isFinite, let slide = slideIndex[slideID], let canvas = document?.deck.canvasPreset else { return }
    let scene = slideID == selectedSlideID ? resolvedScene : NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
    guard let layer = scene?.imageLayers.first(where: { $0.role == role }), layer.fit != "fit",
      let id = layer.assetID, let asset = assetIndex[id], let width = asset.width, let height = asset.height,
      width > 0, height > 0 else { return }
    let crop = NativeLayoutGeometry.zoomedCrop(layer, width: Double(width), height: Double(height), zoom: amount)
    do { patchLayout(["crops": [role: try nativeObject(crop)]], id: slideID) }
    catch { failure = error.localizedDescription }
  }
  func centerCrop(role: String, slideID: String) {
    guard let slide = slideIndex[slideID] else { return }
    var crop = slide.settings.layout.crops[role] ?? .full
    crop.x = (1 - crop.width) / 2; crop.y = (1 - crop.height) / 2
    do { patchLayout(["crops": [role: try nativeObject(crop)]], id: slideID) }
    catch { failure = error.localizedDescription }
  }
  func resetPlacement() {
    guard let slide = selectedSlide, slide.settings.layout.preset != "legacy" else { return }
    chooseLayout(slide.settings.layout.preset, id: slide.id)
  }
  func decide(_ action: String, assetID: String? = nil, role: String? = nil) {
    guard let slideID = selectedSlideID,
      let asset = (assetID ?? focusedAssetID).flatMap({ assetIndex[$0] })
    else { return }
    let targetRole = role ?? curateRole
    if action == "use", selectedSlide?.imageRoles.contains(targetRole) != true {
      failure = "This layout has no such image slot. Choose an image layout or another visible slot."
      return
    }
    do {
      enqueue(
        type: "native.curate.set",
        payload: [
          "slideId": slideID, "asset": try nativeObject(asset.reference), "action": action,
          "role": targetRole, "assignmentId": UUID().uuidString.lowercased(),
          "fingerprint": asset.fingerprint,
        ], label: action == "use" ? "Choose image" : "Update shortlist")
      if autoAdvance && ["use", "shortlist", "reject"].contains(action) && focusedAssetID == asset.id { focusNext(1) }
    } catch { failure = error.localizedDescription }
  }
  func nudge(dx: Double, dy: Double, frame: PrototypeFrame) {
    guard let slideID = selectedSlideID else { return }
    do {
      var payload: [String: Any] = [
        "slideId": slideID, "target": selectionTarget, "frame": try nativeObject(frame), "dx": dx, "dy": dy,
      ]
      if selectionTarget == "gradient", let gradient = resolvedScene?.gradient {
        payload["gradient"] = try nativeObject(gradient)
      }
      enqueue(type: "native.nudge", payload: payload, label: "Nudge prototype")
    } catch { failure = error.localizedDescription }
  }
  func undo(redo: Bool = false, documentOnly: Bool = false) {
    if !documentOnly, let editor = NSApp.keyWindow?.firstResponder as? NSTextView, editor.isEditable,
      let manager = editor.undoManager {
      if redo { if manager.canRedo { manager.redo() } }
      else { if manager.canUndo { manager.undo() } }
      return
    }
    guard let deckID = document?.deck.deckId, !lifecycleBusy else { return }
    for task in noteTasks.values { task.cancel() }
    noteTasks = [:]
    for id in Array(notesDrafts.keys) { commitNote(id) }
    let prior = writeTail
    pendingCount += 1
    writeTail = Task { [weak self] in
      await prior?.value
      guard let self else { return }
      defer { self.pendingCount -= 1 }
      guard self.failedCommands.isEmpty, self.document?.deck.deckId == deckID else { return }
      let history = self.document?.history
      guard redo ? history?.canRedo == true : history?.canUndo == true else { return }
      do { self.accept(try await self.session.history(redo: redo, deckID: deckID)) }
      catch { self.failure = error.localizedDescription }
    }
  }
  func applyArrangement(to slideIDs: [String]) {
    guard let slide = selectedSlide, !slideIDs.isEmpty else { return }
    let layout = slide.settings.layout
    do {
      var patch: [String: Any] = ["preset": layout.preset == "legacy" ? "left" : NativeSlideRenderer.resolvedPreset(slide: slide),
        "columns": layout.columns, "bodySize": layout.bodySize, "fitCopy": layout.fitCopy,
        "frames": try nativeObject(layout.frames.filter { slide.imageRoles.contains($0.key) })]
      patch["textFrame"] = try layout.textFrame.map { try nativeObject($0) } ?? NSNull()
      patch["gradient"] = try layout.gradient.map { try nativeObject($0) } ?? NSNull()
      enqueue(type: "native.layout.apply", payload: ["slideIds": slideIDs, "layout": patch], label: "Apply prototype arrangement")
      showApplyLayout = false
    } catch { failure = error.localizedDescription }
  }
  func replacementMatches(for incoming: ImportedCopyDocument) -> [String: String] {
    let old = slides
    var matches: [String: String] = [:]
    for slide in old where old.filter({ $0.title == slide.title }).count == 1 {
      let candidates = incoming.slides.filter { $0.title == slide.title }
      if candidates.count == 1 { matches[slide.id] = candidates[0].id }
    }
    return matches
  }
  func replaceCopy(with imported: ImportedCopyDocument, matches: [String: String]? = nil) {
    guard !replacementSaving, !lifecycleBusy, let deckID = document?.deck.deckId else { return }
    let mapping = matches ?? replacementMatches(for: imported)
    let old = slides.filter { mapping[$0.id] != nil }
    let incoming = imported.slides
    guard !old.isEmpty, Set(mapping.values).count == mapping.count,
      mapping.allSatisfy({ pair in slideIndex[pair.key] != nil && incoming.contains(where: { $0.id == pair.value }) }) else {
      failure = "Map each incoming slide to one existing slide. Nothing was changed."
      return
    }
    do {
      let replacements: [[String: Any]] = try old.map { slide in
        let new = incoming.first { $0.id == mapping[slide.id] }!
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
        return ["slideId": slide.id, "blocks": try nativeObject(blocks),
          "expectedBlocks": try nativeObject(slide.copyBlocks)]
      }
      let payload = try JSONSerialization.data(withJSONObject: ["slides": replacements], options: .sortedKeys)
      replacementSaving = true; importError = nil
      submit(NativePendingCommand(type: "native.copy.replace", payload: payload, deckID: deckID,
        commandID: UUID().uuidString.lowercased(), label: "Replace approved copy")) { [weak self] saved in
        guard let self else { return }
        self.replacementSaving = false
        if saved { self.imported = nil }
        else { self.importError = self.failure ?? "Replacement was not saved. Your import is still here." }
      }
    } catch { importError = error.localizedDescription }
  }
  var slideEditingAvailable: Bool {
    document != nil && selectedSlide != nil && !lifecycleBusy && !slideActionBusy && !cleanPreview
      && failedCommands.isEmpty && !copyEditorOpen && !showApplyLayout && imported == nil
      && !showExport && !showSettings && !showShortcuts
  }
  func beginEditCopy(_ id: String? = nil) {
    guard slideEditingAvailable, let slide = (id ?? selectedSlideID).flatMap({ slideIndex[$0] }) else { return }
    copyEditorTarget = slide
    copyEditorDeckID = document?.deck.deckId
    copyEditorError = nil
    copyEditorOpen = true
  }
  func cancelEditCopy() {
    guard !copyEditorSaving else { return }
    copyEditorOpen = false
    copyEditorTarget = nil
    copyEditorDeckID = nil
    copyEditorError = nil
  }
  func editCopy(_ blocks: [DeckCopyBlock], title: String? = nil) {
    guard !copyEditorSaving, let target = copyEditorTarget, let deckID = copyEditorDeckID,
      deckID == document?.deck.deckId, !lifecycleBusy else { return }
    do {
      var update: [String: Any] = ["slideId": target.id, "blocks": try nativeObject(blocks),
        "expectedBlocks": try nativeObject(target.copyBlocks)]
      if let title, title != target.title { update["title"] = title }
      let payload = try JSONSerialization.data(withJSONObject: ["slides": [update]], options: .sortedKeys)
      copyEditorSaving = true
      copyEditorError = nil
      submit(NativePendingCommand(type: "native.copy.replace", payload: payload, deckID: deckID,
        commandID: UUID().uuidString.lowercased(), label: "Edit Copy")) { [weak self] saved in
        guard let self else { return }
        self.copyEditorSaving = false
        if saved { self.cancelEditCopy() }
        else { self.copyEditorError = self.failure ?? "Copy was not saved. Your draft is still here." }
      }
    } catch { copyEditorError = error.localizedDescription }
  }

  private func queueSlideEdit(type: String, payload: [String: Any], label: String,
    selectedAfter: String? = nil, openCopy: Bool = false) {
    guard slideEditingAvailable, let deckID = document?.deck.deckId else { return }
    let selectedBefore = selectedSlideID
    do {
      let data = try JSONSerialization.data(withJSONObject: payload, options: .sortedKeys)
      // Save pending notes before duplication/deletion; the kernel then copies the
      // latest durable slide, not a stale UI snapshot.
      for task in noteTasks.values { task.cancel() }
      noteTasks = [:]
      for id in Array(notesDrafts.keys) { commitNote(id) }
      slideActionBusy = true
      submit(NativePendingCommand(type: type, payload: data, deckID: deckID,
        commandID: UUID().uuidString.lowercased(), label: label)) { [weak self] saved in
        guard let self else { return }
        self.slideActionBusy = false
        guard saved, self.document?.deck.deckId == deckID else { return }
        if let selectedAfter, self.slideIndex[selectedAfter] != nil,
          self.selectedSlideID == selectedBefore || self.slideIndex[selectedBefore ?? ""] == nil {
          self.selectSlide(selectedAfter)
          if openCopy { self.beginEditCopy(selectedAfter) }
        }
      }
    } catch { failure = error.localizedDescription }
  }
  func addSlide(after requestedID: String? = nil, openCopy: Bool = true) {
    guard let deck = document?.deck else { return }
    let anchor = requestedID ?? selectedSlideID
    guard let section = deck.sections.first(where: { $0.slides.contains(where: { $0.id == anchor }) }) ?? deck.sections.first else { return }
    let id = UUID().uuidString.lowercased()
    var ordinal = slides.count + 1
    while slides.contains(where: { $0.title == "Slide \(ordinal)" }) { ordinal += 1 }
    queueSlideEdit(type: "native.slide.add", payload: ["slideId": id, "sectionId": section.id,
      "afterSlideId": anchor.map { $0 as Any } ?? NSNull(), "title": "Slide \(ordinal)"],
      label: "Add Slide", selectedAfter: id, openCopy: openCopy)
  }
  func duplicateSlide(_ requestedID: String? = nil) {
    guard let id = requestedID ?? selectedSlideID, let source = slideIndex[id],
      let section = document?.deck.sections.first(where: { $0.slides.contains(where: { $0.id == id }) }) else { return }
    let duplicateID = UUID().uuidString.lowercased()
    var stem = String(source.title.prefix(450))
    while stem.utf16.count > 450 { stem.removeLast() }
    var title = "\(stem) — Copy", n = 2
    while slides.contains(where: { $0.title == title }) { title = "\(stem) — Copy \(n)"; n += 1 }
    queueSlideEdit(type: "native.slide.duplicate", payload: ["slideId": duplicateID,
      "sourceSlideId": id, "sectionId": section.id, "afterSlideId": id, "title": title],
      label: "Duplicate Slide", selectedAfter: duplicateID)
  }
  func renameSlide(_ requestedID: String? = nil) {
    guard slideEditingAvailable, let id = requestedID ?? selectedSlideID, let slide = slideIndex[id] else { return }
    let alert = NSAlert()
    alert.messageText = "Rename slide"
    alert.informativeText = "This is the slide name in the sidebar and handoff folders, not the on-slide headline."
    let field = NSTextField(string: slide.title)
    field.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
    alert.accessoryView = field
    alert.addButton(withTitle: "Rename"); alert.addButton(withTitle: "Cancel")
    alert.window.initialFirstResponder = field
    guard alert.runModal() == .alertFirstButtonReturn else { return }
    let title = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty && title.utf16.count <= 500 else { failure = "Use a slide name from 1 to 500 characters."; return }
    renameSlide(id, to: title)
  }
  func renameSlide(_ id: String, to title: String) {
    queueSlideEdit(type: "native.slide.rename", payload: ["slideId": id, "title": title], label: "Rename Slide")
  }
  func canReorderSlide(_ id: String?, by delta: Int) -> Bool {
    guard let id, let ordinal = slideOrdinals[id] else { return false }
    return slides.indices.contains(ordinal - 1 + delta)
  }
  func reorderSlide(_ delta: Int, id requestedID: String? = nil) {
    guard let id = requestedID ?? selectedSlideID, let ordinal = slideOrdinals[id],
      canReorderSlide(id, by: delta), abs(delta) == 1 else { return }
    let neighborID = slides[ordinal - 1 + delta].id
    guard let section = document?.deck.sections.first(where: { $0.slides.contains(where: { $0.id == neighborID }) }),
      let index = section.slides.firstIndex(where: { $0.id == neighborID }) else { return }
    let after: Any = delta > 0 ? neighborID : (index > 0 ? section.slides[index - 1].id as Any : NSNull())
    queueSlideEdit(type: "slide.move", payload: ["slideId": id, "targetSectionId": section.id, "afterSlideId": after], label: "Move Slide", selectedAfter: id)
  }
  func removeSlide(_ requestedID: String? = nil) {
    guard slideEditingAvailable, let id = requestedID ?? selectedSlideID, let slide = slideIndex[id] else { return }
    guard slides.count > 1 else { failure = "Keep at least one slide. You can edit the last slide or add a replacement first."; return }
    let alert = NSAlert()
    alert.messageText = "Delete ‘\(slide.title)’?"
    alert.informativeText = "Removes this slide, its copy, notes and image choices from the deck. Original media files stay untouched. Undo restores the whole slide."
    alert.addButton(withTitle: "Cancel"); alert.addButton(withTitle: "Delete Slide")
    alert.buttons.last?.hasDestructiveAction = true
    guard alert.runModal() == .alertSecondButtonReturn else { return }
    deleteSlideConfirmed(id)
  }
  func deleteSlideConfirmed(_ id: String) {
    guard let ordinal = slideOrdinals[id], slides.count > 1 else { return }
    let neighbor = slides[ordinal < slides.count ? ordinal : ordinal - 2].id
    queueSlideEdit(type: "slide.remove", payload: ["slideId": id], label: "Delete Slide", selectedAfter: neighbor)
  }

  func pasteCopy() {
    guard !lifecycleBusy, !importRunning, !replacementSaving else { return }
    guard !copyEditorOpen else { copyEditorError = "Save or cancel this copy edit before importing more writing."; return }
    guard let text = NSPasteboard.general.string(forType: .string), !text.isEmpty else {
      failure = "Copy the final writing to the clipboard first."
      return
    }
    beginImport { try NativeCopyImport.parse(Data(text.utf8), filename: "Pasted copy.md") }
  }
  func importFile() {
    guard !lifecycleBusy, !importRunning, !replacementSaving else { return }
    guard !copyEditorOpen else { copyEditorError = "Save or cancel this copy edit before importing more writing."; return }
    let deckID = document?.deck.deckId
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.plainText, UTType(filenameExtension: "md") ?? .plainText]
    panel.allowsMultipleSelection = false
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url, let self,
        !self.lifecycleBusy, self.document?.deck.deckId == deckID else { return }
      self.beginImport { try NativeCopyImport.read(url) }
    }
  }
  private func beginImport(_ operation: @escaping @Sendable () throws -> ImportedCopyDocument) {
    guard !lifecycleBusy, !importRunning else { return }
    importRunning = true; importError = nil; importGeneration += 1
    let generation = importGeneration, deckID = document?.deck.deckId
    Task { [weak self] in
      defer { if let self, generation == self.importGeneration { self.importRunning = false } }
      do {
        let result = try await Task.detached(priority: .userInitiated, operation: operation).value
        guard let self, generation == self.importGeneration, !self.lifecycleBusy,
          self.document?.deck.deckId == deckID else { return }
        self.imported = result
      } catch {
        if let self, generation == self.importGeneration { self.failure = error.localizedDescription }
      }
    }
  }
  func createImported() {
    guard let imported, !lifecycleBusy, !replacementSaving else { return }
    let deckID = document?.deck.deckId
    let panel = NSSavePanel()
    panel.allowedContentTypes = [UTType(exportedAs: "dog.pitch.deck", conformingTo: .package)]
    panel.nameFieldStringValue = "\(NativeHandoffExporter.safeName(imported.title)).pitchdeck"
    panel.canCreateDirectories = true
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url, let self,
        self.document?.deck.deckId == deckID else { return }
      Task { await self.createImported(imported, at: url) }
    }
  }
  func createImported(_ imported: ImportedCopyDocument, at url: URL) async {
    guard !lifecycleBusy else { return }
    lifecycleBusy = true
    defer { lifecycleBusy = false }
    guard await closeCurrentDocument() else { return }
    do {
      let seed = try await Task.detached(priority: .userInitiated) { try imported.checkpoint() }.value
      try apply(await session.create(at: url, seed: seed))
      documentURL = url; remember(url); self.imported = nil
      phase = "curate"; status = "Copy imported. Adjust it whenever you need to."
      await refreshCatalog()
    } catch { self.imported = imported; importError = error.localizedDescription; failure = error.localizedDescription }
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
    if documentURL?.standardizedFileURL == url.standardizedFileURL { return }
    lifecycleBusy = true
    defer { lifecycleBusy = false }
    guard await closeCurrentDocument() else { return }
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
    guard !lifecycleBusy else { return false }
    lifecycleBusy = true
    defer { lifecycleBusy = false }
    return await closeCurrentDocument()
  }
  private func closeCurrentDocument() async -> Bool {
    if replacementSaving { await flush() }
    if copyEditorSaving { await flush() }
    guard !copyEditorOpen else {
      copyEditorError = "Save or cancel this copy edit before closing or switching decks."
      return false
    }
    await flush()
    guard failedCommands.isEmpty && notesDrafts.isEmpty else {
      failure =
        "Some notes or actions are not saved. Retry them, or save the pending-actions file and explicitly discard the queue before closing."
      return false
    }
    if exportRunning || exportChoosingDestination {
      failure = "Cancel or finish the handoff before closing this deck."
      return false
    }
    scanTask?.cancel()
    scanTask = nil; scanRunning = false
    catalogGeneration += 1; catalogRefreshToken = nil
    importGeneration += 1; importRunning = false
    prefetchTask?.cancel(); prefetchTask = nil
    if let media = try? await session.mediaSession() { await media.cancelNativeScans() }
    do {
      try await session.close()
      document = nil
      documentURL = nil
      selectedSlideID = nil
      notesDrafts = [:]
      noteGenerations = [:]
      enqueuedNoteGenerations = [:]
      previewOpen = false; previewIDs = []; previewUsesCandidates = false
      compareOpen = false; comparedAssetID = nil; compareIDs = []
      focusedAssetID = nil; cleanPreview = false; exportResult = nil; showExportResult = false
      showExport = false; showApplyLayout = false; imported = nil; importError = nil
      pendingSearchFocus = false
      query = ""; collection = "all"; selectedRootID = nil
      failure = nil
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
    guard !lifecycleBusy, let deckID = document?.deck.deckId else { return }
    guard !copyEditorOpen else { copyEditorError = "Use Save Copy below to save this edit, or Cancel to keep the saved version."; return }
    Task {
      await flush()
      guard failedCommands.isEmpty, notesDrafts.isEmpty, document?.deck.deckId == deckID, !lifecycleBusy else { return }
      do {
        try await session.save(expectedDeckID: deckID)
        if document?.deck.deckId == deckID { status = "All changes saved" }
      } catch { failure = error.localizedDescription }
    }
  }
  func retryPending() {
    guard !lifecycleBusy, !exportRunning, !exportChoosingDestination, !copyEditorOpen else { return }
    lifecycleBusy = true
    Task {
      defer { lifecycleBusy = false }
      await writeTail?.value
      guard let url = documentURL else { return }
      let pending = failedCommands
      scanTask?.cancel(); scanTask = nil; scanRunning = false
      catalogGeneration += 1; catalogRefreshToken = nil
      do {
        try await session.close()
        try apply(await session.open(at: url))
        catalogRevision = -1
        catalogGeneration += 1
        await refreshCatalog()
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
      notesDrafts = [:]
      enqueuedNoteGenerations = [:]
      for task in noteTasks.values { task.cancel() }
      noteTasks = [:]
      failure = nil
    }
  }
  func restorePending() {
    guard let deckID = document?.deck.deckId, failedCommands.isEmpty else {
      failure = "Open the intended deck and resolve its current pending queue before restoring actions."
      return
    }
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.json]
    panel.allowsMultipleSelection = false
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url, let self else { return }
      do {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: 8 * 1024 * 1024 + 1) ?? Data()
        guard data.count <= 8 * 1024 * 1024 else { throw WorkbenchFailure(name: "InvalidRecovery", message: "The recovery file is too large.") }
        let commands = try JSONDecoder().decode([NativePendingCommand].self, from: data)
        let allowed: Set<String> = ["native.slide.patch", "native.curate.set", "native.copy.replace", "native.nudge", "native.layout.apply", "slide.move", "slide.remove", "native.slide.add", "native.slide.duplicate", "native.slide.rename"]
        guard !commands.isEmpty, commands.count <= 1000,
          Set(commands.map(\.commandID)).count == commands.count,
          commands.allSatisfy({ $0.deckID == deckID && allowed.contains($0.type) && !$0.commandID.isEmpty && $0.commandID.utf8.count <= 256 && $0.payload.count <= 1_048_576 }) else {
          throw WorkbenchFailure(name: "InvalidRecovery", message: "This file has invalid actions or belongs to a different deck. Nothing was changed.")
        }
        for command in commands { guard try JSONSerialization.jsonObject(with: command.payload) is [String: Any] else { throw WorkbenchFailure(name: "InvalidRecovery", message: "An action has no valid payload.") } }
        let alert = NSAlert()
        alert.messageText = "Restore \(commands.count) saved actions?"
        alert.informativeText = "Only the currently open matching deck can receive them. Already-saved command IDs are not applied twice. Keep your recovery file until you have checked the result."
        alert.addButton(withTitle: "Cancel"); alert.addButton(withTitle: "Restore actions")
        if alert.runModal() == .alertSecondButtonReturn, self.document?.deck.deckId == deckID, !self.lifecycleBusy {
          for var command in commands { command.noteSlideID = nil; command.noteGeneration = nil; self.submit(command) }
        }
      } catch { self.failure = error.localizedDescription }
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
    guard !lifecycleBusy, !scanRunning, let deckID = document?.deck.deckId else { return }
    let panel = NSOpenPanel()
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    panel.title = rootID == nil ? "Choose media folder" : "Reconnect media folder"
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url, let self,
        self.document?.deck.deckId == deckID else { return }
      self.startScan(url: url, rootID: rootID)
    }
  }
  private func startScan(url: URL?, rootID: String?) {
    guard !scanRunning, !lifecycleBusy, document != nil else { return }
    scanRunning = true
    let generation = catalogGeneration
    scanTask = Task { await self.scan(url: url, rootID: rootID, generation: generation) }
  }
  private func scan(url: URL?, rootID: String?, generation: Int) async {
    guard generation == catalogGeneration else { return }
    status = "Scanning media…"
    defer { if generation == catalogGeneration { scanRunning = false; scanTask = nil } }
    guard let media = try? await session.mediaSession() else { return }
    let updater = Task { [weak self] in
      while !Task.isCancelled {
        guard let self, generation == self.catalogGeneration else { return }
        await self.refreshCatalog()
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
      guard generation == catalogGeneration else { return }
      catalogRevision = -1
      mediaAccessGeneration += 1
      // A final/reconnected snapshot supersedes an older poll. Its generation
      // check prevents that poll from publishing obsolete source permissions.
      catalogRefreshToken = nil
      if Task.isCancelled {
        status = "Scan cancelled; discovered media remains available."
        return
      }
      await refreshCatalog()
      guard generation == catalogGeneration else { return }
      let object = try JSONSerialization.jsonObject(with: result) as? [String: Any]
      let scan = object?["scan"] as? [String: Any]
      status =
        scan?["status"] as? String == "incomplete"
        ? "Scan stopped with partial results; nothing was marked missing."
        : "\(assets.count) media files available"
    } catch is CancellationError {
      if generation == catalogGeneration { status = "Scan cancelled; discovered media remains available." }
    } catch { if generation == catalogGeneration { failure = error.localizedDescription } }
  }
  func rescan(_ id: String) { startScan(url: nil, rootID: id) }
  func cancelScan() { scanTask?.cancel() }
  func refreshCatalog() async {
    guard catalogRefreshToken == nil else { return }
    let token = UUID(), generation = catalogGeneration, access = mediaAccessGeneration
    catalogRefreshToken = token
    defer { if catalogRefreshToken == token { catalogRefreshToken = nil } }
    do {
      let media = try await session.mediaSession()
      guard let update = try await media.nativeCatalogUpdate(after: catalogRevision) else { return }
      guard generation == catalogGeneration, access == mediaAccessGeneration, !Task.isCancelled else { return }
      var resolved = update.sources
      for id in Array(resolved.keys) { resolved[id]?.accessGeneration = access }
      // Sources and catalogue describe one actor-owned revision; no repeated
      // whole-catalog JSON decoding on the main actor for idle scan polls.
      sources = resolved
      roots = update.catalog.roots
      assets = update.catalog.assets
      catalogRevision = update.catalog.revision
      prefetchAdjacent()
    } catch {
      if generation == catalogGeneration, document != nil, !Task.isCancelled {
        status = "Media list needs refreshing: \(error.localizedDescription)"
      }
    }
  }
  func toggleCompare(_ id: String? = nil) {
    guard let id = id ?? focusedAssetID else { return }
    if compareIDs.contains(id) {
      compareIDs.removeAll { $0 == id }
      if comparedAssetID == id { comparedAssetID = compareIDs.first }
    } else if compareIDs.count < 3 {
      compareIDs.append(id)
      if !compareIDs.contains(comparedAssetID ?? "") { comparedAssetID = id }
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
    guard canExport, let deckID = document?.deck.deckId else { return }
    exportChoosingDestination = true
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    panel.title = "Choose handoff destination"
    panel.begin { [weak self] response in
      guard let self else { return }
      self.exportChoosingDestination = false
      guard response == .OK, let parent = panel.url, self.canExport,
        self.document?.deck.deckId == deckID else { return }
      self.showExport = false
      self.exportTask = Task { await self.performExport(parent: parent, options: options, expectedDeckID: deckID) }
    }
  }
  func performExport(parent: URL, options: HandoffOptions, expectedDeckID: String) async {
    guard canExport, document?.deck.deckId == expectedDeckID else { return }
    exportRunning = true; exportProgress = 0; exportGeneration += 1
    let generation = exportGeneration
    defer { exportRunning = false; exportGeneration += 1 }
    await flush()
    guard document?.deck.deckId == expectedDeckID else { return }
    guard failedCommands.isEmpty && notesDrafts.isEmpty else {
      failure =
        "Pending notes and actions must be saved or explicitly discarded before taking the handoff snapshot."
      return
    }
    do {
      try Task.checkCancellation()
      let frozen = try JSONDecoder().decode(
        DeckDocumentSnapshot.self, from: await session.snapshot())
      let media = try await session.mediaSession()
      let ids = NativeHandoffExporter.requiredAssetIDs(snapshot: frozen, options: options)
      let sources = try await media.nativeSources(assetIds: Array(ids))
      let work = Task.detached(priority: .userInitiated) {
        try NativeHandoffExporter.export(
          snapshot: frozen, sources: sources, to: parent, options: options
        ) { [weak self] event in
          Task { @MainActor in
            guard let self, self.exportGeneration == generation, self.exportRunning else { return }
            self.exportProgress = max(self.exportProgress, Double(event.completed) / Double(max(1, event.total)))
            self.status = event.message
          }
        }
      }
      let result = try await withTaskCancellationHandler(
        operation: { try await work.value }, onCancel: { work.cancel() })
      exportProgress = 1
      exportResult = result
      showExportResult = true
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
