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
  @Published var failure: String? { didSet { if let failure, failure != oldValue { announce(failure) } } }
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
  @Published var adobeSetupBusy = false
  @Published var adobeStatus: [String: String] = [:]
  @Published var showApplyLayout = false
  @Published var showStarterStyle = false
  @Published var showMoodboard = false
  @Published var showExportResult = false
  @Published var cleanPreview = false {
    didSet {
      guard oldValue != cleanPreview else { return }
      if cleanPreview { phase = "assemble"; previewOpen = false; compareOpen = false }
      fitCanvas()
    }
  }
  @Published var viewportRevision = 0
  /// Review deck shows the slide's designer notes beside it (N).
  @Published var reviewNotes = false
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
  private var sortedOrder = ""
  private var heldNudge: NativeHeldNudge?
  private var heldNudgeTask: Task<Void, Never>?
  private var sortedKeys: [String: NativeAssetSortKey] = [:]
  private var searchText: [String: String] = [:]
  private var filterSignature = ""
  private(set) var assetGeneration = 0
  private var noteGenerations: [String: Int] = [:]
  /// When each slide's notes were last sent in this session: autosaves within
  /// a typing session undo as one step, a later one starts a new step.
  private var noteSentAt: [String: Date] = [:]
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
  /// Typing in notes is not published: each keystroke would redraw the whole
  /// workspace. The text editor keeps its own text; menus watch only whether
  /// any draft exists.
  var notesDrafts: [String: String] = [:] {
    didSet { if notesDrafts.isEmpty == hasNoteDrafts { hasNoteDrafts = !notesDrafts.isEmpty } }
  }
  @Published private(set) var hasNoteDrafts = false
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
  /// The deck whose actions are parked after Retry could not reopen it.
  private(set) var parkedDocumentURL: URL?
  let session: NativeDocumentSession
  /// Navigator thumbnails, observed separately so a render only redraws the slide list.
  let thumbnails = NativeSlideThumbnails()
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
      for source in candidates { guard !Task.isCancelled else { return }; _ = await NativeThumbnailService.shared.image(for: source, longestSide: 2048) }
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
    thumbnails.attach(self)
    applyTheme()
  }
  var selectedSlide: DeckSlide? { selectedSlideID.flatMap { slideIndex[$0] } }
  var focusedAsset: NativeMediaAsset? { focusedAssetID.flatMap { assetIndex[$0] } }
  private func indexDocument() {
    slides = NativeContents.resolve(slides: document?.deck.slides ?? [])
    slideIndex = Dictionary(uniqueKeysWithValues: slides.map { ($0.id, $0) })
    slideOrdinals = Dictionary(uniqueKeysWithValues: slides.enumerated().map { ($0.element.id, $0.offset + 1) })
    refreshMediaScope()
    thumbnails.schedule()
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
  /// Scans republish the whole library every few hundred files. Assets whose
  /// sort key is unchanged keep their relative order, so only new or changed
  /// ones are sorted and merged in, instead of re-sorting the library each poll.
  private func sortAssets() {
    let order = sortOrder
    func key(_ asset: NativeMediaAsset) -> NativeAssetSortKey {
      NativeAssetSortKey(modified: order == "modified" ? asset.modifiedAt : nil,
        name: order == "folder" ? asset.folder + "/" + asset.filename : asset.filename)
    }
    func before(_ a: (key: NativeAssetSortKey, asset: NativeMediaAsset), _ b: (key: NativeAssetSortKey, asset: NativeMediaAsset)) -> Bool {
      if order == "modified", a.key.modified != b.key.modified { return (a.key.modified ?? 0) > (b.key.modified ?? 0) }
      let result = a.key.name.localizedStandardCompare(b.key.name)
      return result == .orderedSame ? a.asset.id < b.asset.id : result == .orderedAscending
    }
    let keyed = assets.map { (key: key($0), asset: $0) }
    var kept: [(key: NativeAssetSortKey, asset: NativeMediaAsset)] = []
    var added: [(key: NativeAssetSortKey, asset: NativeMediaAsset)] = []
    let previous = order == sortedOrder
      ? Dictionary(orderedAssets.enumerated().map { ($0.element.id, $0.offset) }, uniquingKeysWith: { first, _ in first }) : [:]
    for item in keyed {
      if previous[item.asset.id] != nil, sortedKeys[item.asset.id] == item.key { kept.append(item) } else { added.append(item) }
    }
    kept.sort { previous[$0.asset.id]! < previous[$1.asset.id]! }
    added.sort(by: before)
    var merged: [NativeMediaAsset] = []
    merged.reserveCapacity(keyed.count)
    var i = 0, j = 0
    while i < kept.count || j < added.count {
      if j == added.count || (i < kept.count && !before(added[j], kept[i])) { merged.append(kept[i].asset); i += 1 }
      else { merged.append(added[j].asset); j += 1 }
    }
    orderedAssets = merged
    sortedOrder = order
    sortedKeys = Dictionary(keyed.map { ($0.asset.id, $0.key) }, uniquingKeysWith: { first, _ in first })
    searchText = Dictionary(assets.map { ($0.id, "\($0.filename) \($0.folder) \($0.title)") }, uniquingKeysWith: { first, _ in first })
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
      if !search.isEmpty && !(searchText[asset.id] ?? asset.filename).localizedCaseInsensitiveContains(search) { return false }
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
      && !showApplyLayout && !showStarterStyle && !showMoodboard && !showExportResult && !showSettings && !showShortcuts
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
  /// The next included slide, after the selected one and wrapping round, that
  /// still has an empty image slot.
  func nextSlideNeedingImage() {
    // A sheet works on the slide it opened with; never retarget it.
    guard document != nil, !slides.isEmpty, !lifecycleBusy, !modalOpen else { return }
    let start = slideOrdinals[selectedSlideID ?? ""] ?? 0
    let ordered = Array(slides[min(start, slides.count)...]) + Array(slides[..<min(start, slides.count)])
    guard let next = ordered.first(where: { NativeSlideReadiness($0).needsImage }) else {
      status = "Every included slide has its images."
      return
    }
    cleanPreview = false
    selectSlide(next.id)
    phase = "curate"
  }
  /// Any sheet that owns the keyboard; drops wait until it closes.
  var modalOpen: Bool {
    showShortcuts || showExport || showSettings || copyEditorOpen || imported != nil || showApplyLayout
      || showStarterStyle || showMoodboard || showExportResult
  }
  func startCleanPreview() {
    // Review can always end; it cannot start behind a sheet.
    guard document != nil, !lifecycleBusy, cleanPreview || !modalOpen else { return }
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
    apply(try JSONDecoder().decode(DeckDocumentSnapshot.self, from: data))
  }
  private func apply(_ snapshot: DeckDocumentSnapshot) {
    let newDeck = document?.deck.deckId != snapshot.deck.deckId
    // When the selected slide goes away (undoing an Add or Duplicate, a
    // deletion), select the slide now at its position, not the first slide.
    let position = newDeck ? nil : selectedSlideID.flatMap { id in slides.firstIndex { $0.id == id } }
    document = snapshot
    let remaining = snapshot.deck.slides
    if newDeck || !remaining.contains(where: { $0.id == selectedSlideID }) {
      if let position, !remaining.isEmpty { selectedSlideID = remaining[min(position, remaining.count - 1)].id }
      else { selectedSlideID = remaining.first?.id }
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
    if let snapshot = receipt.document {
      apply(snapshot)
    } else {
      failure =
        "Saved revision \(receipt.revision), but the view needs refreshing. \(receipt.viewError ?? "")"
    }
  }
  private func remember(_ url: URL) {
    // The packaged self-test's temporary decks never join the person's recents.
    guard !CommandLine.arguments.contains("--native-self-test") else { return }
    var urls = recentDocuments.filter { $0 != url }
    urls.insert(url, at: 0)
    UserDefaults.standard.set(Array(urls.prefix(12)).map(\.path), forKey: "native.recentDocuments")
    NSDocumentController.shared.noteNewRecentDocumentURL(url)
  }
  func selectSlide(_ id: String) {
    guard slideIndex[id] != nil, !lifecycleBusy else { return }
    // A held arrow's last moves belong to the slide they were made on.
    flushHeldNudge()
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
    if let index = ids.firstIndex(of: focusedAssetID ?? "") {
      focusedAssetID = ids[min(ids.count - 1, max(0, index + delta))]
    } else {
      focusedAssetID = delta < 0 ? ids.last : ids.first
    }
    // Media focus is drawn, not a real focus, so VoiceOver is told the image.
    if let id = focusedAssetID, let asset = assetIndex[id] { announce(asset.filename) }
  }
  /// Spoken by VoiceOver when it is running; ignored otherwise.
  func announce(_ text: String) {
    guard let window = NSApp.keyWindow ?? NSApp.mainWindow else { return }
    NSAccessibility.post(element: window, notification: .announcementRequested,
      userInfo: [.announcement: text, .priority: NSAccessibilityPriorityLevel.high.rawValue])
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
          if let id = command.noteSlideID {
            self.enqueuedNoteGenerations[id] = nil
            // Notes for a slide that no longer exists can never be saved.
            if self.slideIndex[id] == nil { self.notesDrafts[id] = nil; self.noteTasks.removeValue(forKey: id)?.cancel() }
          }
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
    guard slideIndex[id] != nil || !failedCommands.isEmpty else {
      // The slide was deleted (and its deletion saved); its draft has no destination.
      notesDrafts[id] = nil
      return
    }
    if slideIndex[id]?.settings.notes == text && enqueuedNoteGenerations[id] == nil {
      notesDrafts[id] = nil
      return
    }
    do {
      // Autosaves of one typing session undo as one step; after a pause of
      // half a minute, or after reopening, the next one is a step of its own.
      let continuing = noteSentAt[id].map { Date().timeIntervalSince($0) < 30 } ?? false
      noteSentAt[id] = Date()
      let data = try JSONSerialization.data(withJSONObject: ["slideId": id, "patch": ["notes": text], "coalesce": continuing], options: .sortedKeys)
      enqueuedNoteGenerations[id] = generation
      submit(NativePendingCommand(type: "native.slide.patch", payload: data, deckID: deckID,
        commandID: UUID().uuidString.lowercased(), label: "Save designer notes", noteSlideID: id, noteGeneration: generation))
    } catch { failure = error.localizedDescription }
  }
  func flush() async {
    flushHeldNudge()
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
  /// A press nudges at once. A held arrow's repeats are gathered and sent
  /// every 0.12 s, each merged into the press's Undo step, instead of one
  /// durable write and one Undo step per key repeat.
  func nudge(dx: Double, dy: Double, frame: PrototypeFrame, repeating: Bool = false) {
    guard let slideID = selectedSlideID else { return }
    let target = selectionTarget
    if let held = heldNudge, held.slideID != slideID || held.target != target || !repeating { flushHeldNudge() }
    guard repeating else { sendNudge(slideID: slideID, target: target, frame: frame, dx: dx, dy: dy, coalesce: false); return }
    var held = heldNudge ?? NativeHeldNudge(slideID: slideID, target: target, frame: frame)
    held.dx += dx; held.dy += dy; held.frame = frame
    heldNudge = held
    guard heldNudgeTask == nil else { return }
    heldNudgeTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(120))
      guard !Task.isCancelled else { return }
      self?.heldNudgeTask = nil
      self?.flushHeldNudge()
    }
  }
  private func flushHeldNudge() {
    heldNudgeTask?.cancel(); heldNudgeTask = nil
    guard let held = heldNudge else { return }
    heldNudge = nil
    guard held.slideID == selectedSlideID, held.dx != 0 || held.dy != 0 else { return }
    sendNudge(slideID: held.slideID, target: held.target, frame: held.frame, dx: held.dx, dy: held.dy, coalesce: true)
  }
  private func sendNudge(slideID: String, target: String, frame: PrototypeFrame, dx: Double, dy: Double, coalesce: Bool) {
    do {
      var payload: [String: Any] = [
        "slideId": slideID, "target": target, "frame": try nativeObject(frame), "dx": dx, "dy": dy,
      ]
      if coalesce { payload["coalesce"] = true }
      if target == "gradient", let gradient = resolvedScene?.gradient {
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
    // A sheet works from the deck as it opened; Undo waits until it closes.
    guard let deckID = document?.deck.deckId, !lifecycleBusy, !modalOpen else { return }
    // Moves still gathered from a held arrow are sent first, so Undo takes them back too.
    flushHeldNudge()
    for task in noteTasks.values { task.cancel() }
    noteTasks = [:]
    for id in Array(notesDrafts.keys) { commitNote(id) }
    let prior = writeTail
    pendingCount += 1
    writeTail = Task { [weak self] in
      await prior?.value
      guard let self else { return }
      defer { self.pendingCount -= 1 }
      guard self.document?.deck.deckId == deckID else { return }
      guard self.failedCommands.isEmpty else {
        self.failure = "\(redo ? "Redo" : "Undo") waits until the pending actions are saved. Retry or discard them first."
        return
      }
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
      if NativeSlideRenderer.resolvedPreset(slide: slide) == "moodboard" { patch["imageCount"] = layout.imageCount ?? 6 }
      patch["textFrame"] = try layout.textFrame.map { try nativeObject($0) } ?? NSNull()
      patch["gradient"] = try layout.gradient.map { try nativeObject($0) } ?? NSNull()
      enqueue(type: "native.layout.apply", payload: ["slideIds": slideIDs, "layout": patch], label: "Apply prototype arrangement")
      showApplyLayout = false
    } catch { failure = error.localizedDescription }
  }
  func applyStarterStyle(_ patch: [String: Any], allSlides: Bool) {
    let ids = allSlides ? slides.map(\.id) : [selectedSlideID].compactMap { $0 }
    guard !ids.isEmpty else { return }
    enqueue(type: "native.layout.apply", payload: ["slideIds": ids, "layout": patch], label: "Change deck style")
    showStarterStyle = false
  }
  /// Type and colours applied with different scopes are still one Undo step:
  /// the current slide takes both, every other slide the deck-wide one.
  func applyStarterStyle(type: [String: Any], typeAllSlides: Bool, colours: [String: Any], colourAllSlides: Bool) {
    guard !type.isEmpty, !colours.isEmpty, typeAllSlides != colourAllSlides, let current = selectedSlideID else {
      applyStarterStyle(type.merging(colours) { $1 }, allSlides: type.isEmpty ? colourAllSlides : typeAllSlides)
      return
    }
    let others = slides.map(\.id).filter { $0 != current }
    var groups: [[String: Any]] = [["slideIds": [current], "layout": type.merging(colours) { $1 }]]
    if !others.isEmpty { groups.append(["slideIds": others, "layout": typeAllSlides ? type : colours]) }
    enqueue(type: "native.layout.apply", payload: ["groups": groups], label: "Change deck style")
    showStarterStyle = false
  }
  var replacementSlides: [DeckSlide] {
    document.map { NativeCopyReplacement.destinations(in: $0.deck) } ?? []
  }
  func replacementMatches(for incoming: ImportedCopyDocument) -> [String: String] {
    document.map { NativeCopyReplacement.matches(incoming, in: $0.deck) } ?? [:]
  }
  func replaceCopy(with imported: ImportedCopyDocument, matches: [String: String]? = nil) {
    guard !replacementSaving, !lifecycleBusy, let deck = document?.deck else { return }
    do {
      let payload = try NativeCopyReplacement.payload(imported, in: deck,
        matches: matches ?? NativeCopyReplacement.matches(imported, in: deck))
      replacementSaving = true; importError = nil
      submit(NativePendingCommand(type: "native.copy.replace", payload: payload, deckID: deck.deckId,
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
      && failedCommands.isEmpty && !modalOpen
  }
  func beginEditCopy(_ id: String? = nil) {
    guard slideEditingAvailable, let slide = (id ?? selectedSlideID).flatMap({ slideIndex[$0] }) else { return }
    if slide.settings.layout.contents == true {
      failure = "Contents entries follow your included slides automatically. Rename or move those slides to update the index. Use Type & colours to style it."
      return
    }
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
        "expectedCopyDigest": NativeCopyDigest.digest(target.copyBlocks)]
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
  func addSpecialSlide(_ kind: String, assetIDs: [String] = [], after requestedID: String? = nil) {
    guard ["blank", "contents", "moodboard"].contains(kind), let deck = document?.deck else { return }
    let anchor = requestedID ?? selectedSlideID
    guard let section = deck.sections.first(where: { $0.slides.contains(where: { $0.id == anchor }) }) ?? deck.sections.first else { return }
    let id = UUID().uuidString.lowercased()
    let title = kind == "blank" ? "Blank" : kind == "contents" ? "Contents" : "Moodboard"
    do {
      let images: [[String: Any]] = try assetIDs.map { id in
        guard let asset = assetIndex[id] else { throw WorkbenchFailure(name: "MissingMedia", message: "A chosen image is no longer available. Choose it again.") }
        return ["asset": try nativeObject(asset.reference), "fingerprint": asset.fingerprint]
      }
      showMoodboard = false
      queueSlideEdit(type: "native.slide.add", payload: ["slideId": id, "sectionId": section.id,
        "afterSlideId": anchor.map { $0 as Any } ?? NSNull(), "title": title, "kind": kind, "assets": images],
        label: kind == "blank" ? "Add Blank Slide" : "Add \(title)", selectedAfter: id)
    } catch { failure = error.localizedDescription }
  }
  func moveSlideToPosition(_ requestedID: String? = nil) {
    guard slideEditingAvailable, let id = requestedID ?? selectedSlideID, let ordinal = slideOrdinals[id] else { return }
    let alert = NSAlert()
    alert.messageText = "Move slide to position"
    alert.informativeText = "Choose 1–\(slides.count). Contents and the next handoff follow this order."
    let field = NSTextField(string: String(ordinal)); field.frame = NSRect(x: 0, y: 0, width: 160, height: 24)
    alert.accessoryView = field; alert.addButton(withTitle: "Move"); alert.addButton(withTitle: "Cancel")
    alert.window.initialFirstResponder = field
    guard alert.runModal() == .alertFirstButtonReturn else { return }
    guard let destination = Int(field.stringValue), (1...slides.count).contains(destination) else { failure = "Enter a slide position from 1 to \(slides.count)."; return }
    moveSlide(id, to: destination)
  }
  func moveSlide(_ id: String, to position: Int) {
    guard let deck = document?.deck, let current = slideOrdinals[id], (1...slides.count).contains(position), current != position else { return }
    let others = slides.filter { $0.id != id }
    let anchor = position == 1 ? nil : others[position - 2].id
    guard let section = anchor.flatMap({ anchor in deck.sections.first { $0.slides.contains { $0.id == anchor } } }) ?? deck.sections.first else { return }
    queueSlideEdit(type: "slide.move", payload: ["slideId": id, "targetSectionId": section.id, "afterSlideId": anchor.map { $0 as Any } ?? NSNull()], label: "Move Slide", selectedAfter: id)
  }
  func duplicateSlide(_ requestedID: String? = nil) {
    guard let id = requestedID ?? selectedSlideID, let source = slideIndex[id],
      let section = document?.deck.sections.first(where: { $0.slides.contains(where: { $0.id == id }) }) else { return }
    let duplicateID = UUID().uuidString.lowercased()
    var title = NativeTitle.withSuffix(source.title, " — Copy"), n = 2
    while slides.contains(where: { $0.title == title }) { title = NativeTitle.withSuffix(source.title, " — Copy \(n)"); n += 1 }
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
    let title = NativeTitle.clean(field.stringValue)
    guard NativeTitle.isValid(title) else { failure = "Use a slide name of 1 to 240 characters."; return }
    renameSlide(id, to: title)
  }
  /// Deck and part names follow the same rule as slide names, so a name
  /// imported before that rule (or with a stray space or tab) can be fixed
  /// without re-importing.
  func renameDeck() {
    guard slideEditingAvailable, let deck = document?.deck,
      let title = askForName("Rename deck", "This names the deck in Workbench and in handoff folders and production writing.", current: deck.title)
    else { return }
    guard title != deck.title else { return }
    queueSlideEdit(type: "deck.rename", payload: ["title": title], label: "Rename Deck")
  }
  func renamePart(_ requestedID: String? = nil) {
    guard slideEditingAvailable, let id = requestedID ?? selectedSlideID,
      let section = document?.deck.sections.first(where: { $0.slides.contains(where: { $0.id == id }) }),
      let title = askForName("Rename part", "Parts group slides in the sidebar and in production writing.", current: section.title)
    else { return }
    guard title != section.title else { return }
    queueSlideEdit(type: "section.rename", payload: ["sectionId": section.id, "title": title], label: "Rename Part")
  }
  private func askForName(_ message: String, _ information: String, current: String) -> String? {
    let alert = NSAlert()
    alert.messageText = message
    alert.informativeText = information
    let field = NSTextField(string: current)
    field.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
    alert.accessoryView = field
    alert.addButton(withTitle: "Rename"); alert.addButton(withTitle: "Cancel")
    alert.window.initialFirstResponder = field
    guard alert.runModal() == .alertFirstButtonReturn else { return nil }
    let title = NativeTitle.clean(field.stringValue)
    guard NativeTitle.isValid(title) else { failure = "Use a name of 1 to 240 characters."; return nil }
    return title
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
  /// Files dropped on the window: a deck opens, writing is read for import
  /// and a folder is added as media.
  func handleDrop(_ urls: [URL]) -> Bool {
    guard let url = urls.first, !lifecycleBusy else { return false }
    guard !modalOpen else { status = "Finish or close the open sheet, then drop again."; return false }
    var directory: ObjCBool = false
    let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &directory)
    switch url.pathExtension.lowercased() {
    case "pitchdeck":
      Task { await open(url) }
    case "md", "markdown", "txt", "text":
      guard !importRunning, !replacementSaving else { return false }
      guard !copyEditorOpen else { copyEditorError = "Save or cancel this copy edit before importing more writing."; return false }
      beginImport { try NativeCopyImport.read(url) }
    default:
      guard exists, directory.boolValue, document != nil, !scanRunning else {
        status = document == nil ? "Drop final copy (.md or .txt) or a .pitchdeck to begin."
          : scanRunning ? "A media scan is running. Drop the folder again when it finishes."
          : "Drop a folder of media, final copy or a deck."
        return false
      }
      startScan(url: url, rootID: nil)
    }
    return true
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
    guard !lifecycleBusy else { status = "Workbench is finishing the previous action. Try again in a moment."; return }
    // Opening the deck that is already open does nothing, unless saving was
    // stopped and the messages ask for it to be reopened.
    if documentURL?.standardizedFileURL == url.standardizedFileURL, !(await session.recoveryRequired()) { return }
    lifecycleBusy = true
    defer { lifecycleBusy = false }
    guard await closeCurrentDocument(opening: url) else { return }
    do {
      try apply(await openWithConsent(url))
      documentURL = url
      remember(url)
      status = "Deck opened"
      await refreshCatalog()
      if parkedDocumentURL?.standardizedFileURL == url.standardizedFileURL {
        parkedDocumentURL = nil
        resubmitParked()
      }
    } catch is CancellationError {
      status = "The deck was not opened and was not changed."
    } catch {
      let name = (error as? WorkbenchFailure)?.name
      failure = name == "JournalCorruption" || name == "UnsupportedSchema" || name == "MissingAttachment"
        ? "\(error.localizedDescription) Use Recover Saved Copy to make a working copy; the original will not be changed."
        : error.localizedDescription
    }
  }
  /// A deck left by a crash may need its stale lock replaced or an interrupted
  /// final journal line set aside. Both happen only after the person agrees,
  /// for the exact bytes they were told about, with the originals kept inside
  /// the deck's recovery folder.
  private func openWithConsent(_ url: URL) async throws -> Data {
    var repairs = PitchDeckOpenRepairs()
    for _ in 0..<3 {
      do { return try await session.open(at: url, repairs: repairs) }
      catch let failure as WorkbenchFailure where ["StaleWriterLock", "InterruptedJournal"].contains(failure.name) && failure.detail != nil {
        let lock = failure.name == "StaleWriterLock"
        let alert = NSAlert()
        alert.messageText = lock ? "Open a deck that was not closed properly?" : "Open without the interrupted change?"
        alert.informativeText = failure.message + "\n\nTo leave this deck exactly as it is, choose Cancel and use File → Recover Saved Copy instead."
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: lock ? "Open Deck" : "Open Without It")
        guard alert.runModal() == .alertSecondButtonReturn else { throw CancellationError() }
        if lock { repairs.staleLockDigest = failure.detail } else { repairs.interruptedJournalDigest = failure.detail }
      }
    }
    throw WorkbenchFailure(name: "DocumentBusy", message: "The deck changed while Workbench was checking it. Nothing was changed; try opening it again.")
  }
  @discardableResult func closeForSwitch() async -> Bool {
    guard !lifecycleBusy else { status = "Workbench is finishing the previous action. Try again in a moment."; return false }
    lifecycleBusy = true
    defer { lifecycleBusy = false }
    return await closeCurrentDocument()
  }
  private func closeCurrentDocument(opening target: URL? = nil) async -> Bool {
    if document == nil, !failedCommands.isEmpty {
      // Actions parked for a deck that could not reopen go back to that deck only.
      if let parked = parkedDocumentURL, parked.standardizedFileURL == target?.standardizedFileURL { return true }
      failure = "\(failedCommands.count == 1 ? "One action" : "\(failedCommands.count) actions") for \(parkedDocumentURL?.deletingPathExtension().lastPathComponent ?? "the previous deck") are not saved. Reopen that deck, or choose Save Pending Actions… and then Discard Unsaved Actions… first."
      return false
    }
    if exportRunning || exportChoosingDestination {
      failure = "Cancel or finish the handoff before closing this deck."
      return false
    }
    if replacementSaving { await flush() }
    if copyEditorSaving { await flush() }
    guard !copyEditorOpen else {
      copyEditorError = "Save or cancel this copy edit before closing or switching decks."
      return false
    }
    await flush()
    guard failedCommands.isEmpty else {
      failure =
        "Some actions are not saved. Use Retry Pending Actions, or Save Pending Actions… and then Discard Unsaved Actions… before closing."
      return false
    }
    if !notesDrafts.isEmpty {
      // Everything that could be saved was; what remains was refused (a note
      // over the length limit, say). Never leave the deck impossible to close.
      let alert = NSAlert()
      alert.messageText = "Discard notes that could not be saved?"
      alert.informativeText = "Notes on \(notesDrafts.count == 1 ? "one slide" : "\(notesDrafts.count) slides") were refused when saving. The rest of the deck is saved. Copy the notes first if you need them."
      alert.addButton(withTitle: "Keep Deck Open")
      alert.addButton(withTitle: "Discard and Close")
      guard alert.runModal() == .alertSecondButtonReturn else { return false }
      notesDrafts = [:]
    }
    scanTask?.cancel()
    scanTask = nil; scanRunning = false
    catalogGeneration += 1; catalogRefreshToken = nil
    importGeneration += 1; importRunning = false
    prefetchTask?.cancel(); prefetchTask = nil
    if let media = try? await session.mediaSession() { await media.cancelNativeScans() }
    do {
      let closeWarning = try await session.close()
      clearDocumentState()
      failure = nil
      status = closeWarning ?? "Import final copy to begin."
      return true
    } catch {
      failure = error.localizedDescription
      return false
    }
  }
  /// The window state of no open deck. Parked actions are kept.
  private func clearDocumentState() {
    document = nil
    documentURL = nil
    selectedSlideID = nil
    notesDrafts = [:]
    noteGenerations = [:]
    enqueuedNoteGenerations = [:]
    noteSentAt = [:]
    heldNudgeTask?.cancel(); heldNudgeTask = nil; heldNudge = nil
    previewOpen = false; previewIDs = []; previewUsesCandidates = false
    compareOpen = false; comparedAssetID = nil; compareIDs = []
    focusedAssetID = nil; cleanPreview = false; exportResult = nil; showExportResult = false
    showExport = false; showApplyLayout = false; showStarterStyle = false; showMoodboard = false; imported = nil; importError = nil
    pendingSearchFocus = false
    query = ""; collection = "all"; selectedRootID = nil
    assets = []
    roots = []
    sources = [:]
    catalogRevision = -1
    status = "Import final copy to begin."
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
    // Note drafts join the parked queue first, so no debounce can slip a note
    // in while the deck reopens and then be cleared with the old queue.
    for task in noteTasks.values { task.cancel() }
    noteTasks = [:]
    for id in Array(notesDrafts.keys) { commitNote(id) }
    Task {
      defer { lifecycleBusy = false }
      await writeTail?.value
      guard let url = documentURL ?? parkedDocumentURL else { return }
      scanTask?.cancel(); scanTask = nil; scanRunning = false
      catalogGeneration += 1; catalogRefreshToken = nil
      if document != nil {
        do {
          try await session.close()
        } catch { failure = error.localizedDescription; return }
      }
      do {
        // A write cut short (a full disk) leaves a lock and an interrupted
        // line; the person is asked before either is set aside, as on open.
        try apply(await openWithConsent(url))
      } catch {
        // The deck is closed now; showing it would park every new edit.
        clearDocumentState()
        parkedDocumentURL = url
        let reason = error is CancellationError ? "it was left closed." : error.localizedDescription
        failure = "Retry could not reopen the deck: \(reason) Its unsaved actions are kept: choose Retry Pending Actions again, reopen the deck, or Save Pending Actions… to keep them in a file."
        return
      }
      documentURL = url
      parkedDocumentURL = nil
      catalogRevision = -1
      catalogGeneration += 1
      await refreshCatalog()
      resubmitParked()
    }
  }
  private func resubmitParked() {
    let pending = failedCommands
    guard !pending.isEmpty else { return }
    failedCommands = []
    failure = nil
    for command in pending { submit(command) }
  }
  /// Quitting with actions parked for a deck that could not reopen asks first.
  func confirmQuitWithParkedActions() -> Bool {
    guard document == nil, !failedCommands.isEmpty else { return true }
    let alert = NSAlert()
    alert.messageText = "Quit with \(failedCommands.count == 1 ? "one unsaved action" : "\(failedCommands.count) unsaved actions")?"
    alert.informativeText = "They could not be saved to \(parkedDocumentURL?.deletingPathExtension().lastPathComponent ?? "the deck"). Save them to a file to restore later with Workbench → Restore Pending Actions…."
    alert.addButton(withTitle: "Save Actions…")
    alert.addButton(withTitle: "Cancel")
    alert.addButton(withTitle: "Discard and Quit")
    switch alert.runModal() {
    case .alertFirstButtonReturn:
      let panel = NSSavePanel()
      panel.nameFieldStringValue = "Workbench pending actions.json"
      panel.allowedContentTypes = [.json]
      guard panel.runModal() == .OK, let url = panel.url else { return false }
      do { try nativeJSON(failedCommands).write(to: url, options: .atomic); return true }
      catch { failure = error.localizedDescription; return false }
    case .alertThirdButtonReturn: return true
    default: return false
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
  /// Every command type this app submits, so any saved queue can be restored.
  static let restorableCommandTypes: Set<String> = [
    "native.slide.patch", "native.curate.set", "native.copy.replace", "native.nudge", "native.layout.apply", "slide.move",
    "slide.remove", "native.slide.add", "native.slide.duplicate", "native.slide.rename", "deck.rename", "section.rename",
  ]
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
        let allowed = Self.restorableCommandTypes
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
        // Each refresh re-filters the library on the main actor; once a
        // second keeps a large scan visible without competing with the person.
        try? await Task.sleep(for: .seconds(1))
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
        // This task is cancelled, so the final catalogue is fetched outside it.
        Task { [weak self] in await self?.refreshCatalog() }
        return
      }
      await refreshCatalog()
      guard generation == catalogGeneration else { return }
      let object = try JSONSerialization.jsonObject(with: result) as? [String: Any]
      let scan = object?["scan"] as? [String: Any]
      if scan?["limitReached"] as? Bool == true {
        let limit = (scan?["limit"] as? Int).map { $0.formatted() } ?? "12,000"
        status = "This folder has more than \(limit) media files; the first \(limit) are available. Attach a smaller folder to see the rest."
      } else {
        status =
          scan?["status"] as? String == "incomplete"
          ? "Scan stopped with partial results; only files confirmed gone were marked missing."
          : "\(assets.count) media files available"
      }
    } catch is CancellationError {
      if generation == catalogGeneration {
        status = "Scan cancelled; discovered media remains available."
        catalogRevision = -1
        Task { [weak self] in await self?.refreshCatalog() }
      }
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
      thumbnails.schedule()
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
    let options = options.resolved
    guard canExport, document?.deck.deckId == expectedDeckID else { return }
    exportRunning = true; exportProgress = 0; exportGeneration += 1
    let generation = exportGeneration
    defer { exportRunning = false; exportGeneration += 1 }
    // Notes typed while the first flush runs are saved by the next one.
    for _ in 0..<3 {
      await flush()
      if notesDrafts.isEmpty || !failedCommands.isEmpty { break }
    }
    guard document?.deck.deckId == expectedDeckID else { return }
    guard failedCommands.isEmpty else {
      failure = "Pending actions must be saved before the handoff snapshot. Use Retry Pending Actions, or Save Pending Actions… and Discard Unsaved Actions…."
      return
    }
    guard notesDrafts.isEmpty else {
      failure = "Notes on \(notesDrafts.count == 1 ? "one slide" : "\(notesDrafts.count) slides") could not be saved, so the handoff was not started. Shorten them, or choose Workbench → Discard Unsaved Actions…, then export again."
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
            self.exportProgress = max(self.exportProgress, Double(event.completed) / Double(max(1, event.total)) * (options.inDesign ? 0.9 : 1))
            self.status = event.message
          }
        }
      }
      var result = try await withTaskCancellationHandler(
        operation: { try await work.value }, onCancel: { work.cancel() })
      if options.inDesign {
        if !result.produced.contains("Production") || !result.produced.contains("Starter Kit") {
          result = NativeAdobeAutomation.withIssue(result, "InDesign was not built because its production files or starter kit could not be exported.")
        } else {
          status = "Building InDesign · macOS may ask for Automation permission…"
          let handoff = result.url, width = Int(frozen.deck.canvasPreset.width), height = Int(frozen.deck.canvasPreset.height), count = result.slideCount
          let cancellation = handoff.appendingPathComponent("Automation/cancel")
          do {
            try FileManager.default.createDirectory(at: cancellation.deletingLastPathComponent(), withIntermediateDirectories: true)
            let overflow = try await NativeAdobeAutomation.waitForBuild(cancellation: cancellation) {
              try NativeAdobeAutomation.build(in: handoff, width: width, height: height, slideCount: count, cancellation: cancellation)
            }
            result.produced.append("InDesign/Deck.indd")
            if !overflow.isEmpty {
              result = NativeAdobeAutomation.withIssue(result, "Deck saved, but copy overflows on pages \(overflow.map(String.init).joined(separator: ", ")). Adjust those text frames before delivery.")
            }
          } catch {
            result = NativeAdobeAutomation.withIssue(result, error is CancellationError
              ? "Build cancelled. Your completed PSDs, writing and media are safe." : error.localizedDescription)
          }
        }
      }
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

  func setUpAdobe(_ id: String) {
    guard !adobeSetupBusy && !exportRunning else { return }
    adobeSetupBusy = true
    adobeStatus[id] = "Connecting… macOS may ask for permission."
    Task {
      defer { adobeSetupBusy = false }
      do {
        adobeStatus[id] = try await Task.detached(priority: .userInitiated) { try NativeAdobeAutomation.setUp(id) }.value
      } catch { adobeStatus[id] = error.localizedDescription }
    }
  }

  func saveStarterKit() {
    guard !adobeSetupBusy && !exportRunning else { return }
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.canCreateDirectories = true
    panel.title = "Save a copy of the complete starter kit"
    panel.begin { [weak self] response in
      guard let self, response == .OK, let parent = panel.url else { return }
      self.adobeSetupBusy = true
      Task {
        defer { self.adobeSetupBusy = false }
        do {
          let target = try await Task.detached(priority: .userInitiated) {
            var target = parent.appendingPathComponent("Workbench Starter Kit")
            var number = 2
            while FileManager.default.fileExists(atPath: target.path) {
              target = parent.appendingPathComponent("Workbench Starter Kit \(number)"); number += 1
            }
            try NativeStarterKit.copy(to: target)
            return target
          }.value
          NSWorkspace.shared.activateFileViewerSelecting([target])
          self.adobeStatus["kit"] = "Complete starter kit saved."
        } catch { self.adobeStatus["kit"] = error.localizedDescription }
      }
    }
  }
}
struct NativeAssetSortKey: Equatable {
  let modified: Int64?
  let name: String
}
struct NativeHeldNudge {
  let slideID: String
  let target: String
  var frame: PrototypeFrame
  var dx = 0.0
  var dy = 0.0
}
