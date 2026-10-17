import Foundation

enum NativeCompatibilityChecks {
  private static func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw WorkbenchFailure(name: "AcceptanceFailure", message: message) }
  }
  static func run() async throws {
    guard let kernelURL = Bundle.main.url(forResource: "deck-kernel", withExtension: "js", subdirectory: "Kernel") else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Compatibility checks need the packaged kernel.")
    }
    let files = FileManager.default
    let root = files.temporaryDirectory.appendingPathComponent("Workbench-compatibility-\(UUID().uuidString)", isDirectory: true)
    try files.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? files.removeItem(at: root) }
    let kernel = try DeckKernelHost(kernelURL: kernelURL)
    let checkpoint = try kernel.createInitialCheckpoint(seed: ["deckId": "compat-deck", "sectionId": "part", "slideId": "slide", "blockId": "head", "title": "Compatibility", "initialHeadline": "Words about appearance, contents and state are ordinary copy."])
    func legacy(_ name: String) throws -> URL {
      let url = root.appendingPathComponent(name + ".pitchdeck", isDirectory: true)
      let store = try PitchDeckDocumentStore.create(at: url, checkpoint: checkpoint)
      try require(store.manifest.schemaVersion == 3, "New packages did not use the new reader guard")
      try store.close()
      let manifestURL = url.appendingPathComponent("manifest.json")
      var manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as! [String: Any]
      manifest["schemaVersion"] = 2
      try JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys]).write(to: manifestURL, options: .atomic)
      return url
    }
    func originals(_ url: URL) throws -> [String: Data] {
      try Dictionary(uniqueKeysWithValues: ["manifest.json", "checkpoint.json", "journal.ndjson"].map { ($0, try Data(contentsOf: url.appendingPathComponent($0))) })
    }
    let url = try legacy("Notes then starter")
    let beforeOpen = try originals(url)
    let session = try NativeDocumentSession(kernelURL: kernelURL)
    _ = try await session.open(at: url)
    try require(try originals(url) == beforeOpen, "Opening a legacy deck changed its saved copy or reader schema")
    _ = try await session.execute(type: "native.slide.patch", payload: JSONSerialization.data(withJSONObject: ["slideId": "slide", "patch": ["notes": "A normal note"]]), deckID: "compat-deck", commandID: "plain-note", label: "Note")
    try require(await session.documentSchemaVersion() == 2, "An ordinary note silently promoted a legacy native deck")
    try await session.save()
    let beforeStarter = try originals(url)
    _ = try await session.execute(type: "native.slide.patch", payload: JSONSerialization.data(withJSONObject: ["slideId": "slide", "patch": ["layout": ["appearance": "light"]]]), deckID: "compat-deck", commandID: "starter-colour", label: "Appearance")
    try require(await session.documentSchemaVersion() == 3, "Starter fields reached the journal without the new reader guard")
    let backup = url.appendingPathComponent("recovery/pre-starter-0.2.0", isDirectory: true)
    for (name, bytes) in beforeStarter {
      try require(try Data(contentsOf: backup.appendingPathComponent(name)) == bytes, "Migration backup changed \(name)")
    }
    let savedJournal = try Data(contentsOf: url.appendingPathComponent("journal.ndjson"))
    try require(savedJournal.starts(with: beforeStarter["journal.ndjson"]!), "Migration rewrote the existing journal")
    _ = try await session.history(redo: false, deckID: "compat-deck")
    try require(await session.documentSchemaVersion() == 3, "Undo downgraded a file with newer redo history")
    try await session.close()
    let reopened = try NativeDocumentSession(kernelURL: kernelURL)
    _ = try await reopened.open(at: url)
    try require(await reopened.documentSchemaVersion() == 3, "Reopening lost the reader guard")
    _ = try await reopened.history(redo: true, deckID: "compat-deck")
    let state = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: await reopened.snapshot())
    try require(state.deck.slides[0].settings.layout.appearance == "light" && state.deck.slides[0].settings.notes == "A normal note", "Migration/reopen/redo lost durable decisions")
    try await reopened.close()

    let blockedURL = try legacy("Blocked backup")
    let blocked = try NativeDocumentSession(kernelURL: kernelURL)
    _ = try await blocked.open(at: blockedURL)
    let beforeFailure = try originals(blockedURL)
    let recovery = blockedURL.appendingPathComponent("recovery", isDirectory: true)
    let held = blockedURL.appendingPathComponent("held-recovery", isDirectory: true)
    let outside = root.appendingPathComponent("Outside", isDirectory: true)
    try files.createDirectory(at: outside, withIntermediateDirectories: false)
    try files.moveItem(at: recovery, to: held)
    try files.createSymbolicLink(at: recovery, withDestinationURL: outside)
    var rejected = false
    do {
      _ = try await blocked.execute(type: "native.slide.patch", payload: JSONSerialization.data(withJSONObject: ["slideId": "slide", "patch": ["layout": ["appearance": "light"]]]), deckID: "compat-deck", commandID: "blocked-migration", label: "Appearance")
    } catch { rejected = true }
    try require(rejected && originals(blockedURL) == beforeFailure, "A failed migration backup changed the active package")
    try require(try files.contentsOfDirectory(atPath: outside.path).isEmpty, "Migration followed a linked recovery directory")
    try files.removeItem(at: recovery)
    try files.moveItem(at: held, to: recovery)
    try await blocked.close()

    try await crashRecovery(root: root, checkpoint: checkpoint, kernelURL: kernelURL)

    let typedCopy = ["nextDeck": ["sections": [["slides": [["contentBlocks": [["role": "body", "value": ["text": "appearance"]]]]]]]]] as [String: Any]
    try require(!PitchDeckDocumentStore.preparedNeedsStarterSchema(typedCopy), "Copy words were mistaken for schema fields")
    let stateOnly = ["nextDeck": ["sections": [["slides": [["contentBlocks": [["role": "body", "state": "unreviewed"]]]]]]]] as [String: Any]
    try require(PitchDeckDocumentStore.preparedNeedsStarterSchema(stateOnly), "Copy review state did not require the new reader")
  }

  /// A crash leaves a lock from a dead process and possibly a partial final
  /// journal line. Each is repaired only with consent for the exact bytes,
  /// keeping the originals; live locks and other Macs' locks are never taken.
  private static func crashRecovery(root: URL, checkpoint: Data, kernelURL: URL) async throws {
    let files = FileManager.default
    let url = root.appendingPathComponent("Crashed.pitchdeck", isDirectory: true)
    try PitchDeckDocumentStore.create(at: url, checkpoint: checkpoint).close()
    let session = try NativeDocumentSession(kernelURL: kernelURL)
    _ = try await session.open(at: url)
    _ = try await session.execute(type: "native.slide.patch", payload: JSONSerialization.data(withJSONObject: ["slideId": "slide", "patch": ["notes": "Saved before the crash"]]), deckID: "compat-deck", commandID: "before-crash", label: "Note")
    try await session.close()
    let finished = Process()
    finished.executableURL = URL(fileURLWithPath: "/usr/bin/true")
    try finished.run(); finished.waitUntilExit()
    func lock(pid: Int32, host: String) throws -> Data {
      try JSONSerialization.data(withJSONObject: ["format": PitchDeckDocumentStore.writerLockFormat, "schemaVersion": 1, "ownerToken": "crashed-writer",
        "processId": pid, "createdAt": "2026-10-17T12:00:00Z", "hostId": host, "bootSession": PitchDeckDocumentStore.currentBootSession()])
    }
    let lockURL = url.appendingPathComponent(PitchDeckDocumentStore.writerLockFile)
    let journalURL = url.appendingPathComponent("journal.ndjson")
    func failureName(_ repairs: PitchDeckOpenRepairs = PitchDeckOpenRepairs()) async -> WorkbenchFailure? {
      do { _ = try await session.open(at: url, repairs: repairs); try await session.close(); return nil }
      catch { return error as? WorkbenchFailure }
    }
    for (pid, host, label) in [(ProcessInfo.processInfo.processIdentifier, PitchDeckDocumentStore.currentHostID(), "a running writer"), (finished.processIdentifier, "another-mac", "another Mac")] {
      try lock(pid: pid, host: host).write(to: lockURL)
      try require(await failureName()?.name == "DocumentBusy", "A lock held by \(label) was offered for replacement")
      try files.removeItem(at: lockURL)
    }
    let staleLock = try lock(pid: finished.processIdentifier, host: PitchDeckDocumentStore.currentHostID())
    try staleLock.write(to: lockURL)
    let intact = try Data(contentsOf: journalURL)
    var torn = intact; torn.append(Data("{\"interrupted\":".utf8))
    try torn.write(to: journalURL)
    guard let stale = await failureName(), stale.name == "StaleWriterLock", let lockDigest = stale.detail else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "A dead writer's lock was not recognised")
    }
    try require(try Data(contentsOf: lockURL) == staleLock && Data(contentsOf: journalURL) == torn, "Detecting a crash changed the deck before consent")
    try require(await failureName(PitchDeckOpenRepairs(staleLockDigest: "different"))?.name == "StaleWriterLock", "A lock was replaced without consent for its exact bytes")
    guard let interrupted = await failureName(PitchDeckOpenRepairs(staleLockDigest: lockDigest)), interrupted.name == "InterruptedJournal", let journalDigest = interrupted.detail else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "An interrupted journal line was not recognised")
    }
    let kept = try files.contentsOfDirectory(atPath: url.appendingPathComponent("recovery").path)
    try require(kept.contains { $0.hasPrefix("stale-writer-lock-") } && !files.fileExists(atPath: lockURL.path), "The replaced lock was not kept or the failed open kept a lock")
    try require(try Data(contentsOf: journalURL) == torn, "The journal changed before consent")
    _ = try await session.open(at: url, repairs: PitchDeckOpenRepairs(interruptedJournalDigest: journalDigest))
    let state = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: await session.snapshot())
    try require(state.deck.slides[0].settings.notes == "Saved before the crash", "Crash recovery lost an acknowledged change")
    try await session.close()
    try require(try Data(contentsOf: journalURL) == intact, "The interrupted line was not set aside exactly")
    let journals = try files.contentsOfDirectory(atPath: url.appendingPathComponent("recovery").path).filter { $0.hasPrefix("interrupted-journal-") }
    try require(journals.count == 1 && Data(contentsOf: url.appendingPathComponent("recovery/\(journals[0])")) == torn, "The original interrupted journal was not kept")
  }
}
