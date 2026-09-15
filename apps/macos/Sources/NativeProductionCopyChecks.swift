import Foundation

/// Called by the native package journey. Exercises the real copy exporter and
/// both native intake paths without loading media or changing a user document.
enum NativeProductionCopyChecks {
  private static func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw WorkbenchFailure(name: "AcceptanceFailure", message: message) }
  }
  static func run() throws {
    let exact = "\nFirst — ₹1,000.\nsoft return\n\nA paragraph.\n\n\nLast.\n"
    var structuralLines: [String] = []
    for prefix in NativeWorkbenchMarkdown.reserved {
      structuralLines.append(prefix + " literal")
      structuralLines.append("\\" + prefix + " literal")
      structuralLines.append("\\\\" + prefix + " literal")
    }
    let structural = structuralLines.joined(separator: "\n") + "\n```\nliteral fence\n```"
    for (canvasID, width) in [("cinemascope-2576x1080", 2576), ("widescreen-1920x1080", 1920)] {
      func block(_ id: String, _ role: String, _ text: String, key: String? = nil, state: String? = nil) throws -> [String: Any] {
        var value: [String: Any] = ["id": id, "semanticKey": key ?? id, "role": role, "value": try nativeObject(RichCopy(text))]
        if let state { value["state"] = state }
        return value
      }
      let plan = "{\"format\":\"pitchdog.workbench-plan\",\"version\":1,\"copyFieldStates\":{\"headline\":\"present\",\"subheadline\":\"intentionally-blank\",\"body\":\"present\"}}"
      let blocks = try [block("head", "headline", "Legacy headline", key: "workbench.copy.headline"),
        block("body-one", "body", exact, key: "workbench.copy.body"), block("body-two", "body", structural),
        block("caption", "caption", "Caption must survive."), block("credit", "credit", "Photo credit must survive."),
        block("plan", "workbench-plan", plan, key: "workbench.plan.v1")]
      let second = try [block("head-two", "headline", "", state: "intentionally-blank"),
        block("sub-two", "subheadline", "", state: "unreviewed"), block("body-three", "body", "Second slide.", state: "present")]
      let object: [String: Any] = ["revision": 7, "history": ["canUndo": false, "canRedo": false], "deck": [
        "deckId": "production-deck", "title": "Production Copy Probe", "canvasPreset": ["id": canvasID, "width": width, "height": 1080],
        "sections": [["id": "part", "title": "Part", "slides": [
          ["id": "slide-a", "intent": "full-bleed", "internalTitle": "Repeated title", "contentBlocks": blocks],
          ["id": "slide-b", "intent": "full-bleed", "internalTitle": "Repeated title", "contentBlocks": second]]]]]]
      let snapshot = try JSONDecoder().decode(DeckDocumentSnapshot.self, from: JSONSerialization.data(withJSONObject: object))
      try require(snapshot.deck.slides[0].copyBlocks.count == 5, "Legacy workbench.copy.* was hidden as metadata")
      let result = try NativeWorkbenchMarkdown.project(snapshot: snapshot, slides: snapshot.deck.slides)
      let parsed = try NativeCopyImport.parse(Data(result.markdown.utf8), filename: "workbench.md")
      try require(parsed.canvasID == canvasID && parsed.slides.count == 2, "Production canvas or duplicate-title slide count changed")
      try require(parsed.slides[0].blocks[0].text == "Legacy headline", "Legacy headline did not reach production intake")
      let expected = [exact, structural, "Caption must survive.", "Photo credit must survive."].joined(separator: "\n\n")
      try require(parsed.slides[0].blocks[2].text == expected, "Production projection changed copy, escapes or LF boundaries")
      try require(parsed.slides[0].blocks[1].state == "intentionally-blank" && parsed.slides[1].blocks[1].state == "unreviewed", "Blank states were conflated")
      try require(result.manifest.slides[0].blocks.map(\.text) == snapshot.deck.slides[0].copyBlocks.map(\.text), "Manifest lost original fields")
      let manifest = try JSONDecoder().decode(WorkbenchProductionManifest.self, from: JSONEncoder().encode(result.manifest))
      try require(manifest.copySHA256 == NativeWorkbenchMarkdown.sha256(Data(result.markdown.utf8)), "Production copy digest did not survive manifest encoding")
      try require(manifest.slides.allSatisfy { $0.appearance == nil }, "Legacy slides gained an invented production appearance")
      var mixed = snapshot
      var light = NativeSlideSettings.initial; light.layout.appearance = "light"
      var dark = NativeSlideSettings.initial; dark.layout.appearance = "dark"
      mixed.deck.sections[0].slides[0].native = light
      mixed.deck.sections[0].slides[1].native = dark
      let mixedCopy = try NativeWorkbenchMarkdown.project(snapshot: mixed, slides: mixed.deck.slides)
      let mixedManifest = try JSONDecoder().decode(WorkbenchProductionManifest.self, from: JSONEncoder().encode(mixedCopy.manifest))
      try require(mixedManifest.slides.map(\.appearance) == ["light", "dark"], "Production appearance lost per-slide ownership")
      if width == 1920 {
        var combined = snapshot
        combined.deck.sections[0].slides[0].contentBlocks[1].setText(String(repeating: "a", count: 131_071))
        combined.deck.sections[0].slides[0].contentBlocks[2].setText(String(repeating: "b", count: 131_071))
        combined.deck.sections[0].slides[0].contentBlocks[3].setText("")
        combined.deck.sections[0].slides[0].contentBlocks[4].setText("")
        let boundary = try NativeWorkbenchMarkdown.project(snapshot: combined, slides: combined.deck.slides)
        let boundaryImport = try NativeCopyImport.parse(Data(boundary.markdown.utf8), filename: "workbench.md")
        try require(boundaryImport.slides[0].blocks[2].text.utf16.count == 262_144, "Valid combined copy at the intake boundary was lost")
        combined.deck.sections[0].slides[0].contentBlocks[2].setText(String(repeating: "b", count: 131_072))
        var combinedRefused = false
        do { _ = try NativeWorkbenchMarkdown.project(snapshot: combined, slides: combined.deck.slides) }
        catch let error as WorkbenchFailure { combinedRefused = error.name == "ProductionCopy" && error.message.contains("262144") }
        try require(combinedRefused, "Production delivered combined writing that its importer rejects")
        var oversized = snapshot
        oversized.deck.sections[0].slides[0].contentBlocks[1].setText(String(repeating: "a", count: 1_048_577))
        var refused = false
        do { _ = try NativeWorkbenchMarkdown.project(snapshot: oversized, slides: oversized.deck.slides) }
        catch let error as WorkbenchFailure { refused = error.name == "ProductionCopy" && error.message.contains("1 MiB") }
        try require(refused, "Production writing exceeded the actual file intake limit")
      }
      let selected = try NativeWorkbenchMarkdown.project(snapshot: snapshot, slides: [snapshot.deck.slides[1]])
      try require(selected.manifest.slides[0].sourceOrdinal == 2 && selected.manifest.slides[0].exportOrdinal == 1 && selected.manifest.slides[0].slideID == "slide-b", "Selected-export ordinal replaced stable identity")
      var rejected = false
      do { _ = try NativeCopyImport.parse(Data(result.markdown.replacingOccurrences(of: "State: unreviewed", with: "State: invented").utf8), filename: "invalid.md") }
      catch { rejected = true }
      try require(rejected, "Malformed production state was silently accepted")
      let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Workbench-copy-probe-\(UUID().uuidString)", isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: folder) }
      var options = HandoffOptions()
      options.prototypePDF = false; options.notesPDF = false; options.approved = false; options.shortlisted = false
      let exported = try NativeHandoffExporter.export(snapshot: snapshot, sources: [:], to: folder, options: options, progress: { _ in })
      try require(exported.issues.isEmpty && exported.produced == ["Copy.md"], "Copy-only exporter needed media or omitted copy")
      let reread = try NativeCopyImport.read(exported.url.appendingPathComponent("Copy.md"))
      try require(reread.canvasID == canvasID, "Copy.md re-import silently changed the canvas")
      try require(reread.slides[0].blocks.map(\.text) == snapshot.deck.slides[0].copyBlocks.map(\.text), "Copy.md round trip changed literal fields or their boundary LFs")
      options.copy = false; options.productionCopy = true
      try require(NativeHandoffExporter.requiredAssetIDs(snapshot: snapshot, options: options).isEmpty, "Production writing alone requested artwork")
      let writing = try NativeHandoffExporter.export(snapshot: snapshot, sources: [:], to: folder, options: options, progress: { _ in })
      let writingDirectory = writing.url.appendingPathComponent("Production")
      let writingImport = try NativeCopyImport.read(writingDirectory.appendingPathComponent("workbench.md"))
      try require(writing.produced.contains("Production") && writingImport.slides.count == 2
        && !FileManager.default.fileExists(atPath: writingDirectory.appendingPathComponent("PSD").path), "Optional PSD export created artwork or omitted importable production writing")
      try require(writing.produced.contains("Starter Kit"), "Portable starter kit was omitted from production export")
      try NativeStarterKit.verify(writing.url.appendingPathComponent("Starter Kit"))
      if width == 1920 {
        // Exercise the export boundary with only InDesign requested. Its writing,
        // PSDs and portable scripts must exist before an Adobe app is contacted.
        options.productionCopy = false; options.psd = false; options.inDesign = true
        let automatic = try NativeHandoffExporter.export(snapshot: snapshot, sources: [:], to: folder, options: options, progress: { _ in })
        try require(automatic.produced.contains("Production") && automatic.produced.contains("Starter Kit"), "Automatic InDesign omitted its dependencies")
        try require(FileManager.default.fileExists(atPath: automatic.url.appendingPathComponent("Production/PSD/Slide 02.psd").path)
          && FileManager.default.fileExists(atPath: automatic.url.appendingPathComponent("Starter Kit/Automation/Photoshop/Export Slide PNGs.jsx").path), "The portable Adobe handoff is incomplete")
      }
      var field = snapshot.deck.slides[0].copyBlocks[0]
      field.setText("")
      try require(field.state == "intentionally-blank", "Deliberately cleared copy was not recorded as blank")
    }
    try contents()
    guard let kernelURL = Bundle.main.url(forResource: "deck-kernel", withExtension: "js", subdirectory: "Kernel") else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Replacement checks need the packaged kernel.")
    }
    try replacement(kernelURL: kernelURL)
  }

  static func replacement(kernelURL: URL) throws {
    let kernel = try DeckKernelHost(kernelURL: kernelURL)
    try kernel.open(checkpoint: kernel.createInitialCheckpoint(seed: [
      "deckId": "replacement-deck", "sectionId": "part", "slideId": "normal",
      "blockId": "head", "title": "Replacement", "initialHeadline": "Original writing"]))
    func snapshot() throws -> DeckDocumentSnapshot {
      try JSONDecoder().decode(DeckDocumentSnapshot.self,
        from: JSONSerialization.data(withJSONObject: kernel.query("native.document")))
    }
    func send(_ type: String, _ payload: [String: Any]) throws {
      let command: [String: Any] = ["commandId": UUID().uuidString.lowercased(),
        "expectedRevision": try snapshot().revision, "type": type, "payload": payload,
        "source": ["kind": "ui"], "issuedAt": "2026-09-14T20:00:00Z"]
      _ = try kernel.commit(kernel.prepare(command: command))
    }
    try send("native.slide.rename", ["slideId": "normal", "title": "Normal"])
    let assets: [[String: Any]] = (1...2).map { index in
      ["asset": ["id": "image-\(index)", "label": "Image \(index).png", "mediaKind": "image", "availability": "available"], "fingerprint": "source-\(index)"]
    }
    try send("native.slide.add", ["slideId": "board", "sectionId": "part", "afterSlideId": "normal",
      "title": "Moodboard", "kind": "moodboard", "assets": assets])
    try send("native.slide.patch", ["slideId": "board", "patch": ["notes": "Keep this direction",
      "layout": ["appearance": "light", "crops": ["primary": ["x": 0.1, "y": 0.2, "width": 0.6, "height": 0.5]],
        "frames": ["primary": ["x": 96, "y": 256, "width": 800, "height": 600]]]]])
    try send("native.slide.add", ["slideId": "toc", "sectionId": "part", "afterSlideId": "normal",
      "title": "Contents", "kind": "contents"])
    let before = try snapshot()
    let projected = NativeContents.resolve(slides: before.deck.slides)
    let production = try NativeWorkbenchMarkdown.project(snapshot: before, slides: projected)
    var imported = try NativeCopyImport.parse(Data(production.markdown.utf8), filename: "workbench.md")
    let revised = "Revised — ₹1,000.\n\nKeep this paragraph.\n"
    for part in imported.parts.indices {
      for slide in imported.parts[part].slides.indices where imported.parts[part].slides[slide].title != "Contents" {
        for block in imported.parts[part].slides[slide].blocks.indices {
          let role = imported.parts[part].slides[slide].blocks[block].role
          if role == "headline" || role == "body" { imported.parts[part].slides[slide].blocks[block].setText(revised) }
        }
      }
    }
    let matches = NativeCopyReplacement.matches(imported, in: before.deck)
    try require(Set(matches.keys) == Set(["normal", "board"]), "Generated Contents was automatically matched for replacement")
    try require(NativeCopyReplacement.destinations(in: before.deck).map(\.id) == ["normal", "board"], "Contents remained a selectable replacement destination")
    var stale = matches
    stale["toc"] = imported.slides.first { $0.title == "Contents" }!.id
    var refused = false
    do { _ = try NativeCopyReplacement.payload(imported, in: before.deck, matches: stale) }
    catch let error as WorkbenchFailure { refused = error.name == "CopyReplacement" && error.message.contains("Contents updates automatically") }
    try require(refused, "A stale Contents destination could overwrite its generated copy")
    let payload = try NativeCopyReplacement.payload(imported, in: before.deck, matches: matches)
    try send("native.copy.replace", JSONSerialization.jsonObject(with: payload) as! [String: Any])
    let after = try snapshot()
    for old in before.deck.slides {
      let changed = after.deck.slides.first { $0.id == old.id }!
      if old.id == "toc" {
        try require(nativeJSON(changed) == nativeJSON(old), "Replacement wrote the derived Contents body into source copy")
      } else {
        try require(changed.copyBlocks.first { $0.role == "headline" }?.text == revised
          && changed.copyBlocks.first { $0.role == "body" }?.text == revised, "Normal or moodboard writing was not replaced exactly")
        try require(Set(old.copyBlocks.map(\.id)).isSubset(of: Set(changed.copyBlocks.map(\.id))), "Replacement changed existing field identities")
        var preserved = changed
        preserved.contentBlocks = old.contentBlocks
        try require(nativeJSON(preserved) == nativeJSON(old), "Replacement changed moodboard images, crops, frames, shortlist, notes or appearance")
      }
    }
    _ = try kernel.commit(kernel.prepareUndo())
    try require(nativeJSON(snapshot().deck) == nativeJSON(before.deck), "One Undo did not restore the complete copy replacement")
    _ = try kernel.commit(kernel.prepareRedo())
    let saved = try kernel.serialize()
    try kernel.open(checkpoint: saved)
    try require(nativeJSON(snapshot().deck) == nativeJSON(after.deck), "Reopen lost the replacement or preserved slide data")
  }

  private static func contents() throws {
    func slide(_ id: String, _ title: String, contents: Bool = false, included: Bool = true) -> DeckSlide {
      var settings = NativeSlideSettings.initial
      settings.included = included; settings.layout.contents = contents
      return DeckSlide(id: id, intent: contents ? "contents" : "full-bleed", internalTitle: title,
        contentBlocks: [DeckCopyBlock(id: id + ":head", semanticKey: "headline", role: "headline", value: RichCopy(title)),
          DeckCopyBlock(id: id + ":body", semanticKey: "body", role: "body", value: RichCopy("Stored copy")),
          DeckCopyBlock(id: id + ":credit", semanticKey: "credit", role: "credit", value: RichCopy("Credit stays"))], native: settings)
    }
    let first = slide("a", "Same title"), second = slide("b", "Same title"), toc = slide("toc", "Contents", contents: true)
    let hidden = slide("hidden", "Excluded", included: false), other = slide("other", "Other contents", contents: true)
    let roster = [first, toc, hidden, second, other]
    let resolved = NativeContents.resolve(slides: roster)
    let body = resolved[1].copyBlocks.first { $0.role == "body" }
    try require(body?.id == "toc:contents" && body?.text == "Same title\t01\nSame title\t03", "Contents lost roster ordinals, duplicate titles or inclusion rules")
    try require(resolved[1].copyBlocks.filter { $0.role == "body" }.count == 1 && resolved[1].copyBlocks.last?.text == "Credit stays", "Contents replaced unrelated copy")
    try require(roster[1].copyBlocks[1].text == "Stored copy", "Contents projection mutated the source")
    let moved = NativeContents.resolve(slides: [toc, second, first])
    try require(moved[0].copyBlocks.first { $0.role == "body" }?.text == "Same title\t02\nSame title\t03", "Contents did not follow reordered slides")
    let selected = NativeContents.resolve(slides: [toc, second])
    try require(selected[0].copyBlocks.first { $0.role == "body" }?.text == "Same title\t02", "Selected export contents retained excluded source positions")
    let document = DeckDocument(deckId: "contents", title: "Contents probe", canvasPreset: DeckCanvas(id: "widescreen-1920x1080", width: 1920, height: 1080), sections: [DeckSection(id: "one", title: "One", slides: [first, toc]), DeckSection(id: "two", title: "Two", slides: [hidden, second, other])])
    try require(NativeContents.resolve(document: document).sections[0].slides[1].copyBlocks.first { $0.role == "body" }?.text == body?.text, "Contents preview and export roster disagree")
  }
}
