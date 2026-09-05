import Foundation

/// The sole owner of a document's kernel and file store. Methods containing a
/// commit have no suspension point; expected revisions never come from a view.
struct NativeWriteReceipt: Sendable {
  let snapshot: Data?
  let revision: Int
  let viewError: String?
}

actor NativeDocumentSession {
  private let kernelURL: URL
  private var kernel: DeckKernelHost
  private var store: PitchDeckDocumentStore?
  private var media: MediaCatalogSession?
  private var fenced = false

  init(kernelURL: URL) throws {
    self.kernelURL = kernelURL
    kernel = try DeckKernelHost(kernelURL: kernelURL)
  }

  func create(at url: URL, seed: Data) throws -> Data {
    guard store == nil else {
      throw WorkbenchFailure(
        name: "DocumentBusy", message: "Close the current deck before creating another.")
    }
    let object = try JSONSerialization.jsonObject(with: seed) as? [String: Any] ?? [:]
    let candidate = try DeckKernelHost(kernelURL: kernelURL)
    let checkpoint =
      object["format"] as? String == "pitchdog.deck-checkpoint"
      ? seed : try candidate.createInitialCheckpoint(seed: object)
    try candidate.open(checkpoint: checkpoint)
    let newStore = try PitchDeckDocumentStore.create(at: url, checkpoint: checkpoint)
    do {
      try candidate.open(checkpoint: checkpoint)
      let newMedia = try MediaCatalogSession(
        packageURL: newStore.packageURL, deckId: newStore.manifest.deckId)
      kernel = candidate
      store = newStore
      media = newMedia
      fenced = false
      return try snapshot()
    } catch {
      try? newStore.close()
      throw error
    }
  }

  func open(at url: URL) throws -> Data {
    guard store == nil else {
      throw WorkbenchFailure(
        name: "DocumentBusy", message: "Close the current deck before opening another.")
    }
    let candidate = try DeckKernelHost(kernelURL: kernelURL)
    let (newStore, loaded) = try PitchDeckDocumentStore.open(at: url)
    do {
      try candidate.open(checkpoint: loaded.checkpoint)
      for record in loaded.replayRecords { try candidate.replay(record) }
      let summary = try candidate.query("deck.summary")
      guard summary["revision"] as? Int == newStore.currentRevision else {
        throw WorkbenchFailure(
          name: "JournalCorruption", message: "The recovered document revisions disagree.")
      }
      let newMedia = try MediaCatalogSession(
        packageURL: newStore.packageURL, deckId: newStore.manifest.deckId)
      kernel = candidate
      store = newStore
      media = newMedia
      fenced = false
      return try snapshot()
    } catch {
      try? newStore.close()
      throw error
    }
  }

  func snapshot() throws -> Data {
    guard store != nil else {
      throw WorkbenchFailure(name: "NoDocument", message: "Open or import a deck first.")
    }
    return try JSONSerialization.data(
      withJSONObject: kernel.query("native.document"), options: [.sortedKeys])
  }

  func execute(
    type: String, payload: Data, deckID: String, commandID: String, label: String,
    source: String = "ui"
  ) throws -> NativeWriteReceipt {
    guard let store, !fenced, !store.needsRecovery else {
      throw WorkbenchFailure(
        name: "RecoveryRequired",
        message: "This deck needs to be reopened before more changes can be saved.")
    }
    guard store.manifest.deckId == deckID else {
      throw WorkbenchFailure(
        name: "DocumentChanged",
        message: "The intended deck is no longer open. Nothing was changed.")
    }
    let command: [String: Any] = [
      "commandId": commandID, "expectedRevision": store.currentRevision, "type": type,
      "payload": try JSONSerialization.jsonObject(with: payload),
      "source": ["kind": source, "label": label],
      "issuedAt": ISO8601DateFormatter().string(from: Date()),
    ]
    let prepared = try kernel.prepare(command: command)
    if prepared["duplicate"] as? Bool == true { return writeReceipt() }
    // The backup/reader guard is applied only for the first native mutation.
    if type.hasPrefix("native.") { try store.ensureNativeCompatibilityBackup() }
    do {
      _ = try store.appendDurably(prepared: prepared)
      _ = try kernel.commit(prepared)
    } catch {
      fenced = store.needsRecovery
      throw error
    }
    // A refresh failure never retries the committed command.
    return writeReceipt()
  }

  func history(redo: Bool, deckID: String) throws -> NativeWriteReceipt {
    guard let store, !fenced, !store.needsRecovery, store.manifest.deckId == deckID else {
      throw WorkbenchFailure(
        name: "RecoveryRequired", message: "The intended deck is not writable.")
    }
    let prepared = try (redo ? kernel.prepareRedo() : kernel.prepareUndo())
    do {
      _ = try store.appendDurably(prepared: prepared)
      _ = try kernel.commit(prepared)
    } catch {
      fenced = store.needsRecovery
      throw error
    }
    return writeReceipt()
  }

  private func writeReceipt() -> NativeWriteReceipt {
    do {
      return NativeWriteReceipt(
        snapshot: try snapshot(), revision: store?.currentRevision ?? 0, viewError: nil)
    } catch {
      return NativeWriteReceipt(
        snapshot: nil, revision: store?.currentRevision ?? 0, viewError: error.localizedDescription)
    }
  }

  func save() throws {
    guard let store, !fenced, !store.needsRecovery else {
      throw WorkbenchFailure(
        name: "RecoveryRequired", message: "Reopen this deck to recover its saved state.")
    }
    do { try store.saveCheckpoint(kernel.serialize()) } catch {
      fenced = store.needsRecovery
      throw error
    }
  }
  func close() throws {
    guard let store else { return }
    // Never write a stale checkpoint over a possibly durable interrupted append.
    if !fenced && !store.needsRecovery { try save() }
    try store.close()
    media?.revoke()
    self.store = nil
    media = nil
    fenced = false
  }
  func recoveryRequired() -> Bool { fenced || store?.needsRecovery == true }
  func documentURL() -> URL? { store?.packageURL }
  func mediaSession() throws -> MediaCatalogSession {
    guard let media else {
      throw WorkbenchFailure(name: "NoDocument", message: "Open a deck first.")
    }
    return media
  }
}
