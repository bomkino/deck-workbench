import AppKit
import Darwin
import Foundation

@MainActor
enum PackagedTracer {
    static func runIfRequested(controller: DeckSessionController) async {
        let arguments = CommandLine.arguments
        let modes = [
            "--tracer-create",
            "--tracer-reopen",
            "--tracer-story-create",
            "--tracer-story-reopen",
            "--tracer-writing-import",
        ]
        guard let modeIndex = arguments.firstIndex(where: { modes.contains($0) }) else {
            return
        }
        print("DW-T00 tracer process started: \(arguments[modeIndex])")
        fflush(stdout)
        let watchdog = Task.detached {
            try? await Task.sleep(for: .seconds(120))
            guard !Task.isCancelled else { return }
            fputs("WorkspaceUnavailable: packaged tracer exceeded 120 seconds\n", stderr)
            fflush(stderr)
            Darwin.exit(124)
        }
        do {
            try await controller.waitForTracerWorkspace()
            print("DW-T00 workspace loaded")
            fflush(stdout)
            let mode = arguments[modeIndex]
            if mode == "--tracer-create" {
                guard arguments.count > modeIndex + 2 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "--tracer-create requires Deck and result paths")
                }
                try await createPhase(
                    controller: controller,
                    documentURL: URL(fileURLWithPath: arguments[modeIndex + 1]),
                    resultURL: URL(fileURLWithPath: arguments[modeIndex + 2])
                )
            } else if mode == "--tracer-reopen" {
                guard arguments.count > modeIndex + 3 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "--tracer-reopen requires Deck, PDF and result paths")
                }
                try await reopenPhase(
                    controller: controller,
                    documentURL: URL(fileURLWithPath: arguments[modeIndex + 1]),
                    pdfURL: URL(fileURLWithPath: arguments[modeIndex + 2]),
                    resultURL: URL(fileURLWithPath: arguments[modeIndex + 3])
                )
            } else if mode == "--tracer-story-create" {
                guard arguments.count > modeIndex + 2 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "--tracer-story-create requires Deck and result paths")
                }
                try await storyCreatePhase(
                    controller: controller,
                    documentURL: URL(fileURLWithPath: arguments[modeIndex + 1]),
                    resultURL: URL(fileURLWithPath: arguments[modeIndex + 2])
                )
            } else if mode == "--tracer-story-reopen" {
                guard arguments.count > modeIndex + 3 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "--tracer-story-reopen requires Deck, create-result and reopen-result paths")
                }
                try await storyReopenPhase(
                    controller: controller,
                    documentURL: URL(fileURLWithPath: arguments[modeIndex + 1]),
                    createResultURL: URL(fileURLWithPath: arguments[modeIndex + 2]),
                    resultURL: URL(fileURLWithPath: arguments[modeIndex + 3])
                )
            } else {
                guard arguments.count > modeIndex + 2 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "--tracer-writing-import requires Deck and result paths")
                }
                try await writingImportPhase(
                    controller: controller,
                    documentURL: URL(fileURLWithPath: arguments[modeIndex + 1]),
                    resultURL: URL(fileURLWithPath: arguments[modeIndex + 2])
                )
            }
            watchdog.cancel()
            fflush(stdout)
            Darwin.exit(0)
        } catch {
            watchdog.cancel()
            let failure = WorkbenchFailure.unexpected(error)
            fputs("\(failure.name): \(failure.message)\n", stderr)
            fflush(stderr)
            Darwin.exit(1)
        }
    }

    private static let writingImportFixture = """
    # Deck

    Format: workbench-markdown/1
    Title: Aurora’s Field Notes — 東京
    Canvas: widescreen-1920x1080

    ## Part: Arrival

    Purpose: Establish the place

    ### Slide: First Light

    Purpose: Open on the landscape
    Style: undecided
    Content pattern: simple-copy

    #### Headline

    State: present
    Light arrives — quietly.

    #### Subheadline

    State: unreviewed

    #### Body

    State: present
    Read the [field notes](https://example.test/notes).

    Then listen.
    \\Purpose: this is visible copy, not metadata.

    ### Slide: The Pause

    Purpose: Hold an authored blank
    Style: undecided
    Content pattern: no-on-slide-text

    #### Headline

    State: intentionally-blank

    #### Subheadline

    State: present
    Nothing is missing.

    #### Body

    State: unreviewed

    ## Part: Return

    Purpose: Bring the thought home

    ### Slide: What Remains

    Purpose: Close without rewriting
    Style: undecided
    Content pattern: simple-copy

    #### Headline

    State: present
    We return as ourselves.

    #### Subheadline

    State: intentionally-blank

    #### Body

    State: present
    Spelling, punctuation, and order stay put.
    """

    private static func writingImportPhase(
        controller: DeckSessionController,
        documentURL: URL,
        resultURL: URL
    ) async throws {
        let files = FileManager.default
        guard !files.fileExists(atPath: documentURL.path) else {
            throw WorkbenchFailure(name: "AlreadyExists", message: "Writing-import tracer destination already exists")
        }
        let controls = try await controller.invokeWorkspaceForTracer(
            "return { copyVisible: !!document.getElementById('copy-conversion-prompt')?.offsetParent, importVisible: !!document.getElementById('open-writing-import')?.offsetParent, hasDeck: !!deckWorkbench.projection() }"
        )
        guard let controlState = controls as? [String: Any],
              controlState["copyVisible"] as? Bool == true,
              controlState["importVisible"] as? Bool == true,
              controlState["hasDeck"] as? Bool == false
        else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Plan writing controls were not visible with no Deck open")
        }

        let canonicalPromptResult = try await controller.invokeWorkspaceForTracer(
            "return { version: WORKBENCH_CONVERSION_PROMPT_V1.version, text: WORKBENCH_CONVERSION_PROMPT_V1.text }"
        )
        guard let canonicalPrompt = canonicalPromptResult as? [String: Any],
              canonicalPrompt["version"] as? String == "workbench-conversion-prompt/1",
              let expectedPrompt = canonicalPrompt["text"] as? String
        else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Canonical conversion prompt is unavailable")
        }
        let copyResult = try await controller.invokeWorkspaceForTracer(
            """
            const button = document.getElementById('copy-conversion-prompt')
            button.click()
            for (let attempt = 0; attempt < 40 && button.textContent !== 'Copied' && !document.getElementById('conversion-prompt-dialog').open; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 50))
            }
            return { label: button.textContent, fallbackOpen: document.getElementById('conversion-prompt-dialog').open }
            """
        )
        let prompt = NSPasteboard.general.string(forType: .string) ?? ""
        guard let copied = copyResult as? [String: Any],
              copied["label"] as? String == "Copied",
              copied["fallbackOpen"] as? Bool == false,
              prompt == expectedPrompt
        else {
            throw WorkbenchFailure(name: "ClipboardWriteFailed", message: "Installed writing-import prompt did not reach the native clipboard truthfully")
        }

        let previewResult = try await controller.invokeWorkspaceForTracer(
            """
            document.getElementById('open-writing-import').click()
            const sourceElement = document.getElementById('writing-import-source')
            const preview = document.getElementById('writing-import-preview')
            sourceElement.value = source
            sourceElement.dispatchEvent(new Event('input', { bubbles: true }))
            document.getElementById('preview-writing-import').click()
            return {
              source: sourceElement.value,
              preview: preview.textContent,
              warnings: preview.querySelectorAll('.import-warnings li').length,
              errors: preview.querySelectorAll('.import-errors li').length,
              importDisabled: document.getElementById('import-writing').disabled,
            }
            """,
            arguments: ["source": writingImportFixture]
        )
        guard let preview = previewResult as? [String: Any],
              preview["source"] as? String == writingImportFixture,
              preview["warnings"] as? Int == 0,
              preview["errors"] as? Int == 0,
              preview["importDisabled"] as? Bool == false,
              let previewText = preview["preview"] as? String,
              previewText.contains("Aurora’s Field Notes — 東京"),
              previewText.contains("Canvas: widescreen-1920x1080"),
              previewText.contains("2 Parts · 3 Slides · 5 present · 2 intentionally blank · 2 unreviewed"),
              previewText.contains("Arrival"),
              previewText.contains("First Light"),
              previewText.contains("The Pause"),
              previewText.contains("Return"),
              previewText.contains("What Remains")
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Installed writing-import Preview did not preserve the fixture contract")
        }

        try controller.configureWritingImportTracerPanel(destination: documentURL, cancel: false)
        let importResult = try await controller.invokeWorkspaceForTracer(
            """
            const dialog = document.getElementById('writing-import-dialog')
            const button = document.getElementById('import-writing')
            button.click()
            button.click()
            const status = document.getElementById('save-state')
            for (let attempt = 0; attempt < 240 && (dialog.open || !status.textContent.includes('Imported')); attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 250))
            }
            return { dialogOpen: dialog.open, phase: deckWorkbench.phase(), status: status.textContent }
            """
        )
        guard let importedUI = importResult as? [String: Any],
              importedUI["dialogOpen"] as? Bool == false,
              importedUI["phase"] as? String == "plan",
              (importedUI["status"] as? String)?.contains("Imported \(documentURL.lastPathComponent) · 2 Parts · 3 Slides") == true,
              controller.documentURL?.standardizedFileURL.path == documentURL.standardizedFileURL.path
        else {
            throw WorkbenchFailure(name: "CheckpointWriteFailure", message: "Installed writing import did not create and activate exactly one Deck")
        }

        let summaryBefore = try controller.query(name: "deck.summary", params: [:])
        let storyBefore = try controller.query(name: "story.document", params: [:])
        try verifyWritingImportStory(storyBefore)
        guard summaryBefore["revision"] as? Int == 0,
              summaryBefore["sectionCount"] as? Int == 2,
              summaryBefore["slideCount"] as? Int == 3,
              (summaryBefore["canvas"] as? [String: Any])?["id"] as? String == "widescreen-1920x1080"
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Imported Deck summary is not the canonical revision-zero fixture")
        }
        let idsBefore = try writingImportIDs(storyBefore)
        let checkpointBeforeClose = try JSONSerialization.data(
            withJSONObject: readJSON(from: documentURL.appendingPathComponent("checkpoint.json")),
            options: [.sortedKeys, .withoutEscapingSlashes]
        )
        guard (try Data(contentsOf: documentURL.appendingPathComponent("journal.ndjson"))).isEmpty else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Imported Deck was not created with empty history")
        }

        try await controller.closeDocument()
        _ = try controller.openDocument(at: documentURL)
        try await controller.renderCurrentProjection()
        let summaryAfter = try controller.query(name: "deck.summary", params: [:])
        let storyAfter = try controller.query(name: "story.document", params: [:])
        try verifyWritingImportStory(storyAfter)
        guard try writingImportIDs(storyAfter) == idsBefore,
              summaryAfter["revision"] as? Int == 0,
              (summaryAfter["canvas"] as? [String: Any])?["id"] as? String == "widescreen-1920x1080",
              try JSONSerialization.data(
                withJSONObject: readJSON(from: documentURL.appendingPathComponent("checkpoint.json")),
                options: [.sortedKeys, .withoutEscapingSlashes]
              ) == checkpointBeforeClose
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Close and reopen changed imported IDs, copy, states, order, or Canvas")
        }

        let manifestBeforeNegative = try Data(contentsOf: documentURL.appendingPathComponent("manifest.json"))
        let checkpointBeforeNegative = try Data(contentsOf: documentURL.appendingPathComponent("checkpoint.json"))
        let journalBeforeNegative = try Data(contentsOf: documentURL.appendingPathComponent("journal.ndjson"))
        let malformedResult = try await controller.invokeWorkspaceForTracer(
            """
            document.getElementById('open-writing-import').click()
            const sourceElement = document.getElementById('writing-import-source')
            const preview = document.getElementById('writing-import-preview')
            sourceElement.value = '# Deck\\n\\nFormat: wrong\\nTitle: Broken'
            sourceElement.dispatchEvent(new Event('input', { bubbles: true }))
            document.getElementById('preview-writing-import').click()
            const result = { disabled: document.getElementById('import-writing').disabled, errors: preview.querySelectorAll('.import-errors li').length }
            document.getElementById('writing-import-dialog').close('tracer-malformed')
            return result
            """
        )
        guard let malformed = malformedResult as? [String: Any],
              malformed["disabled"] as? Bool == true,
              (malformed["errors"] as? Int ?? 0) > 0
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Malformed installed input was not blocked")
        }

        let cancelledURL = documentURL.deletingLastPathComponent().appendingPathComponent("Cancelled.pitchdeck")
        if files.fileExists(atPath: cancelledURL.path) { try files.removeItem(at: cancelledURL) }
        _ = try await controller.invokeWorkspaceForTracer(
            """
            document.getElementById('open-writing-import').click()
            const sourceElement = document.getElementById('writing-import-source')
            sourceElement.value = source
            sourceElement.dispatchEvent(new Event('input', { bubbles: true }))
            document.getElementById('preview-writing-import').click()
            return { ready: !document.getElementById('import-writing').disabled }
            """,
            arguments: ["source": writingImportFixture]
        )
        try controller.configureWritingImportTracerPanel(destination: cancelledURL, cancel: true)
        let cancellationResult = try await controller.invokeWorkspaceForTracer(
            """
            const button = document.getElementById('import-writing')
            button.click()
            const started = button.disabled
            for (let attempt = 0; attempt < 80 && button.disabled; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 250))
            }
            const result = { started, settled: !button.disabled }
            document.getElementById('writing-import-dialog').close('tracer-cancelled')
            return result
            """
        )
        let summaryAfterNegative = try controller.query(name: "deck.summary", params: [:])
        guard let cancellation = cancellationResult as? [String: Any],
              cancellation["started"] as? Bool == true,
              cancellation["settled"] as? Bool == true,
              !files.fileExists(atPath: cancelledURL.path),
              controller.documentURL?.standardizedFileURL == documentURL.standardizedFileURL,
              summaryAfterNegative["deckId"] as? String == summaryBefore["deckId"] as? String,
              summaryAfterNegative["revision"] as? Int == 0,
              try Data(contentsOf: documentURL.appendingPathComponent("manifest.json")) == manifestBeforeNegative,
              try Data(contentsOf: documentURL.appendingPathComponent("checkpoint.json")) == checkpointBeforeNegative,
              try Data(contentsOf: documentURL.appendingPathComponent("journal.ndjson")) == journalBeforeNegative
        else {
            throw WorkbenchFailure(name: "CheckpointWriteFailure", message: "Malformed input or save cancellation changed the active Deck or filesystem")
        }

        try writeJSON([
            "phase": "writing-import",
            "clipboard": true,
            "promptVersion": canonicalPrompt["version"] as? String ?? "",
            "promptBytes": prompt.lengthOfBytes(using: .utf8),
            "preview": ["parts": 2, "slides": 3, "present": 5, "intentionallyBlank": 2, "unreviewed": 2, "warnings": 0],
            "canvas": "widescreen-1920x1080",
            "revision": 0,
            "stableIDs": true,
            "exactSemanticContent": true,
            "duplicateClickCreatedOneDeck": true,
            "malformedInputPreservedDeck": true,
            "saveCancellationPreservedDeck": true,
            "document": documentURL.path,
        ], to: resultURL)
        print("DW-T00 writing-import tracer passed")
    }

    private static func writingImportIDs(_ story: [String: Any]) throws -> [String] {
        guard let sections = story["sections"] as? [[String: Any]] else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Writing-import Story has no Parts")
        }
        return try sections.flatMap { section -> [String] in
            guard let sectionID = section["id"] as? String,
                  let slides = section["slides"] as? [[String: Any]]
            else { throw WorkbenchFailure(name: "JournalCorruption", message: "Writing-import Part identity is invalid") }
            return try [sectionID] + slides.flatMap { slide -> [String] in
                guard let slideID = slide["id"] as? String,
                      let blocks = slide["contentBlocks"] as? [[String: Any]]
                else { throw WorkbenchFailure(name: "JournalCorruption", message: "Writing-import Slide identity is invalid") }
                return [slideID] + blocks.compactMap { $0["id"] as? String }
            }
        }
    }

    private static func verifyWritingImportStory(_ story: [String: Any]) throws {
        guard story["deckTitle"] as? String == "Aurora’s Field Notes — 東京",
              let sections = story["sections"] as? [[String: Any]],
              sections.count == 2,
              sections[0]["title"] as? String == "Arrival",
              sections[0]["purpose"] as? String == "Establish the place",
              sections[1]["title"] as? String == "Return",
              sections[1]["purpose"] as? String == "Bring the thought home",
              let arrivalSlides = sections[0]["slides"] as? [[String: Any]],
              let returnSlides = sections[1]["slides"] as? [[String: Any]],
              arrivalSlides.count == 2,
              returnSlides.count == 1
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Writing-import Part and Slide order changed")
        }
        let slides = arrivalSlides + returnSlides
        let expectedTitles = ["First Light", "The Pause", "What Remains"]
        let expectedPurposes = ["Open on the landscape", "Hold an authored blank", "Close without rewriting"]
        let expectedStates: [[String: String]] = [
            ["headline": "present", "subheadline": "unreviewed", "body": "present"],
            ["headline": "intentionally-blank", "subheadline": "present", "body": "unreviewed"],
            ["headline": "present", "subheadline": "intentionally-blank", "body": "present"],
        ]
        for index in slides.indices {
            guard let blocks = slides[index]["contentBlocks"] as? [[String: Any]],
                  let planText = blocks.first(where: { $0["role"] as? String == "workbench-plan" })?["plainText"] as? String,
                  let planData = planText.data(using: .utf8),
                  let plan = try JSONSerialization.jsonObject(with: planData) as? [String: Any],
                  plan["format"] as? String == "pitchdog.workbench-plan",
                  plan["version"] as? Int == 1,
                  plan["internalTitle"] as? String == expectedTitles[index],
                  plan["purpose"] as? String == expectedPurposes[index],
                  plan["copyFieldStates"] as? [String: String] == expectedStates[index]
            else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Writing-import metadata or copy states changed on Slide \(index + 1)")
            }
        }
        guard let firstBlocks = slides[0]["contentBlocks"] as? [[String: Any]],
              firstBlocks.first(where: { $0["role"] as? String == "headline" })?["plainText"] as? String == "Light arrives — quietly.",
              firstBlocks.first(where: { $0["role"] as? String == "body" })?["plainText"] as? String == "Read the [field notes](https://example.test/notes).\n\nThen listen.\nPurpose: this is visible copy, not metadata."
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Writing-import Unicode, Markdown, blanks, or reserved copy changed")
        }
    }

    private static func createPhase(
        controller: DeckSessionController,
        documentURL: URL,
        resultURL: URL
    ) async throws {
        print("DW-T00 create phase: document")
        fflush(stdout)
        let missingDocument = documentURL.deletingLastPathComponent().appendingPathComponent("Missing.pitchdeck")
        await controller.perform { _ = try controller.openDocument(at: missingDocument) }
        guard controller.presentedFailure?.failure.name == "MissingAttachment",
              controller.status.contains("MissingAttachment")
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Native document failure was not presented")
        }
        controller.dismissPresentedFailure()
        let initial = try await controller.presentNewDocument(tracerDestination: documentURL)
        guard initial["revision"] as? Int == 0 else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "New Deck did not start at revision 0")
        }

        let edited = try await controller.invokeWorkspaceForTracer(
            "return await deckWorkbench.tracerEditHeadline(text)",
            arguments: ["text": "A hill that refuses to be scenery"]
        )
        guard let editedProjection = edited as? [String: Any],
              editedProjection["revision"] as? Int == 1,
              ((editedProjection["headline"] as? [String: Any])?["plainText"] as? String) == "A hill that refuses to be scenery"
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Typed Story edit did not reach durable projection")
        }

        _ = try await controller.invokeWorkspaceForTracer(
            "const result = await deckBridge.undo(); deckWorkbench.renderProjection(result.projection); return result.projection"
        )
        let redone = try await controller.invokeWorkspaceForTracer(
            "const result = await deckBridge.redo(); deckWorkbench.renderProjection(result.projection); return result.projection"
        )
        guard let redoneProjection = redone as? [String: Any], redoneProjection["revision"] as? Int == 3 else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Undo/redo did not use durable command history")
        }

        let scales = try await controller.invokeWorkspaceForTracer(
            "const theme = await deckBridge.setTheme({ value: 'dark' }); applyThemePreference(theme.theme); const ui = await deckBridge.setInterfaceScale({ value: 1.25 }); const artboard = await deckBridge.setArtboardZoom({ value: 0.5 }); return { theme, ui, artboard, projection: deckWorkbench.projection() }"
        )
        guard let scaleResult = scales as? [String: Any],
              let theme = scaleResult["theme"] as? [String: Any],
              let ui = scaleResult["ui"] as? [String: Any],
              let artboard = scaleResult["artboard"] as? [String: Any],
              theme["theme"] as? String == "dark",
              ui["interfaceScale"] as? Double == 1.25,
              artboard["artboardZoom"] as? Double == 0.5,
              controller.theme == "dark",
              controller.interfaceScale == 1.25
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Theme, Interface Scale and artboard zoom preferences did not remain independent")
        }

        guard let durableDocumentURL = controller.documentURL else {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Created Deck URL is unavailable")
        }
        let failedOpenURL = durableDocumentURL.deletingLastPathComponent()
            .appendingPathComponent("Failed-Open.pitchdeck", isDirectory: true)
        try FileManager.default.copyItem(at: durableDocumentURL, to: failedOpenURL)
        try FileManager.default.removeItem(
            at: failedOpenURL.appendingPathComponent(PitchDeckDocumentStore.writerLockFile)
        )
        let failedManifestURL = failedOpenURL.appendingPathComponent("manifest.json")
        var failedManifest = try JSONSerialization.jsonObject(with: Data(contentsOf: failedManifestURL)) as! [String: Any]
        failedManifest["schemaVersion"] = 2
        try JSONSerialization.data(withJSONObject: failedManifest, options: [.prettyPrinted, .sortedKeys])
            .write(to: failedManifestURL, options: [.atomic])
        let failedOpenName = failureName { try controller.openDocument(at: failedOpenURL) }
        let liveAfterFailedOpen = try controller.query(name: "slide.activeProjection", params: [:])
        let replayController = try DeckSessionController(requiresWorkspaceDraftFlush: false)
        let busyName = failureName { try replayController.openDocument(at: durableDocumentURL) }
        let liveAfterBusy = try controller.query(name: "slide.activeProjection", params: [:])
        guard failedOpenName == "UnsupportedSchema",
              liveAfterFailedOpen["revision"] as? Int == 3,
              ((liveAfterFailedOpen["headline"] as? [String: Any])?["plainText"] as? String) == "A hill that refuses to be scenery",
              busyName == "DocumentBusy",
              liveAfterBusy["revision"] as? Int == 3,
              ((liveAfterBusy["headline"] as? [String: Any])?["plainText"] as? String) == "A hill that refuses to be scenery"
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Concurrent open displaced or changed the live Deck")
        }
        try await controller.closeDocument()
        let replayed = try replayController.openDocument(at: durableDocumentURL)
        guard replayed["revision"] as? Int == 3,
              ((replayed["headline"] as? [String: Any])?["plainText"] as? String) == "A hill that refuses to be scenery"
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Journal replay from revision-zero checkpoint failed")
        }

        try await replayController.closeDocument()
        try writeJSON([
            "phase": "create",
            "revision": 3,
            "headline": "A hill that refuses to be scenery",
            "theme": controller.theme,
            "interfaceScale": 1.25,
            "nativeInterfaceScale": controller.interfaceScale,
            "artboardZoom": 0.5,
            "nativeSavePanel": true,
            "nativeFailurePresented": true,
            "concurrentWriterFailure": busyName,
            "failedOpenFailure": failedOpenName,
            "failedOpenPreservedLiveSession": true,
            "journalReplayRevision": 3,
            "document": durableDocumentURL.path,
        ], to: resultURL)
        print("DW-T00 tracer create phase passed")
    }

    private static func reopenPhase(
        controller: DeckSessionController,
        documentURL: URL,
        pdfURL: URL,
        resultURL: URL
    ) async throws {
        print("DW-T00 reopen phase: document")
        fflush(stdout)
        let reopened = try controller.openDocument(at: documentURL)
        try await controller.renderCurrentProjection()
        let reopenedHeadline = (reopened["headline"] as? [String: Any])?["plainText"] as? String
        guard reopened["revision"] as? Int == 3,
              reopenedHeadline == "A hill that refuses to be scenery",
              (reopened["history"] as? [String: Any])?["canUndo"] as? Bool == true
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Reopen did not recover semantic Deck and undo history")
        }

        let undone = try await controller.invokeWorkspaceForTracer(
            "const result = await deckBridge.undo(); return await refreshWorkspace(result.projection?.slide?.id)"
        )
        guard let undoneProjection = undone as? [String: Any],
              undoneProjection["revision"] as? Int == 4,
              ((undoneProjection["headline"] as? [String: Any])?["plainText"] as? String) == "Untitled Story"
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Undo after reopen failed")
        }

        let assembly = try await controller.invokeWorkspaceForTracer(
            """
            const slideId = deckWorkbench.projection()?.slide?.id;
            if (!slideId) throw new Error('Tracer Slide is unavailable');
            const planned = await executeStructural(
              'slide.intent.set',
              { slideId, intent: 'text-only' },
              slideId,
              { sourceLabel: 'Prepare packaged export', preserveCurrentSelection: true }
            );
            if (!planned) throw new Error('Tracer text-only Plan was not committed');
            await enterPhaseForSlide('assemble', slideId);
            const assembled = await ensureAssemblyFromPlan(deckWorkbench.projection());
            return {
              revision: assembled?.revision,
              phase: deckWorkbench.phase(),
              compositionPresent: Boolean(assembled?.composition),
              visualStyle: assembled?.designOption?.planAtCreation?.visualStyle ?? null,
            };
            """
        )
        guard let assemblyResult = assembly as? [String: Any],
              assemblyResult["revision"] as? Int == 6,
              assemblyResult["phase"] as? String == "assemble",
              assemblyResult["compositionPresent"] as? Bool == true,
              assemblyResult["visualStyle"] as? String == "text-only"
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Packaged export Assembly was not created from the text-only Plan")
        }

        try await controller.exportPDF(to: pdfURL)
        try controller.save()
        let negativeResults = try verifyNegativeDocuments(from: documentURL)
        try await controller.closeDocument()
        try writeJSON([
            "phase": "reopen",
            "reopenedRevision": 3,
            "reopenedHeadline": reopenedHeadline as Any,
            "undoRevision": 4,
            "undoHeadline": "Untitled Story",
            "assemblyRevision": 6,
            "assemblyStyle": "text-only",
            "assemblyReady": true,
            "pdf": pdfURL.path,
            "corruptJournalFailure": negativeResults.corruptJournal,
            "unsupportedSchemaFailure": negativeResults.unsupportedSchema,
            "linkedReadFailure": negativeResults.linkedRead,
            "linkedAppendFailure": negativeResults.linkedAppend,
            "linkedWriteFailure": negativeResults.linkedWrite,
            "writerLockReleasedOnClose": true,
        ], to: resultURL)
        print("DW-T00 tracer reopen phase passed")
    }

    private static func storyCreatePhase(
        controller: DeckSessionController,
        documentURL: URL,
        resultURL: URL
    ) async throws {
        print("DW-W01 Story create phase: document")
        fflush(stdout)
        let initial = try await controller.presentNewDocument(tracerDestination: documentURL)
        guard initial["revision"] as? Int == 0,
              let openingSection = initial["section"] as? [String: Any],
              let openingSectionId = openingSection["id"] as? String,
              let openingSlide = initial["slide"] as? [String: Any],
              let openingSlideId = openingSlide["id"] as? String
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Story Deck did not start with the canonical fixture")
        }
        print("DW-W01 Story create phase: native document created")
        fflush(stdout)

        let secondSectionId = UUID().uuidString.lowercased()
        let secondSlideId = UUID().uuidString.lowercased()
        let secondBlockId = UUID().uuidString.lowercased()
        let bodyBlockId = UUID().uuidString.lowercased()
        let rawStory = try await controller.invokeWorkspaceForTracer(
            """
            const execute = async (type, payload) => {
              const story = await deckBridge.query({ name: 'story.document', params: {} });
              return await deckBridge.execute({ command: {
                commandId: crypto.randomUUID(), expectedRevision: story.revision, type, payload,
                source: { kind: 'ui', label: 'DW-W01 packaged Story journey' },
                issuedAt: new Date().toISOString()
              }});
            };
            await execute('section.add', { sectionId: secondSectionId, title: 'Act Two', afterSectionId: openingSectionId });
            await execute('slide.add', {
              sectionId: secondSectionId, slideId: secondSlideId, blockId: secondBlockId,
              intent: 'statement', headline: richText('The Work Begins'), afterSlideId: null
            });
            await execute('section.move', { sectionId: secondSectionId, afterSectionId: null });
            await execute('slide.move', { slideId: secondSlideId, targetSectionId: openingSectionId, afterSlideId: openingSlideId });
            await execute('section.rename', { sectionId: secondSectionId, title: 'Act II' });
            await execute('slide.intent.set', { slideId: secondSlideId, intent: 'editorial-body' });
            await execute('deck.rename', { title: 'The Hill' });
            await execute('content.add', {
              slideId: secondSlideId, blockId: bodyBlockId, semanticKey: 'story.body.1', role: 'body',
              value: richText('A body block that survives design.'), afterBlockId: secondBlockId
            });
            return await deckBridge.query({ name: 'story.document', params: {} });
            """,
            arguments: [
                "openingSectionId": openingSectionId,
                "openingSlideId": openingSlideId,
                "secondSectionId": secondSectionId,
                "secondSlideId": secondSlideId,
                "secondBlockId": secondBlockId,
                "bodyBlockId": bodyBlockId,
            ]
        )
        print("DW-W01 Story create phase: structural commands returned")
        fflush(stdout)
        let story = try requireStory(rawStory, revision: 8)
        try requireStoryOrder(
            story,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )
        guard story["deckTitle"] as? String == "The Hill",
              let storySections = story["sections"] as? [[String: Any]],
              storySections[0]["title"] as? String == "Act II",
              let openingSlides = storySections[1]["slides"] as? [[String: Any]],
              openingSlides[1]["intent"] as? String == "editorial-body",
              let contentBlocks = openingSlides[1]["contentBlocks"] as? [[String: Any]],
              contentBlocks.count == 2,
              contentBlocks[1]["id"] as? String == bodyBlockId,
              contentBlocks[1]["plainText"] as? String == "A body block that survives design."
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Story rename or Slide intent did not project")
        }

        print("DW-W01 Story create phase: keyboard journey starting")
        fflush(stdout)
        let rawKeyboardJourney = try await controller.invokeWorkspaceForTracer(
            """
            const selectedSlide = await deckWorkbench.selectSlide(secondSlideId);
            if (selectedSlide?.slide?.id !== secondSlideId) throw new Error('Target Slide selection failed');
            const findBody = () => [...document.querySelectorAll('#additional-content textarea')]
              .find((field) => field.dataset.blockId === bodyBlockId);
            const waitForRevision = async (expected) => {
              for (let attempt = 0; attempt < 100; attempt += 1) {
                const next = deckWorkbench.projection();
                if (next.revision === expected) return next;
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              throw new Error(`Timed out waiting for revision ${expected}`);
            };
            const original = findBody();
            if (!original) throw new Error('Body textarea is unavailable');
            original.focus();

            const composing = new KeyboardEvent('keydown', {
              key: 'Enter', metaKey: true, bubbles: true, cancelable: true
            });
            Object.defineProperty(composing, 'isComposing', { value: true });
            original.dispatchEvent(composing);
            const afterComposition = await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } });

            original.value = 'Local draft';
            const dirtyUndo = new KeyboardEvent('keydown', {
              key: 'z', metaKey: true, bubbles: true, cancelable: true
            });
            original.dispatchEvent(dirtyUndo);
            const afterDirtyUndo = await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } });

            original.value = 'A body block.\\n\\nThat survives design.';
            const commit = new KeyboardEvent('keydown', {
              key: 'Enter', metaKey: true, bubbles: true, cancelable: true
            });
            original.dispatchEvent(commit);
            const committed = await waitForRevision(9);
            const focusAfterCommit = document.activeElement === findBody();

            const undo = new KeyboardEvent('keydown', {
              key: 'z', metaKey: true, bubbles: true, cancelable: true
            });
            findBody().dispatchEvent(undo);
            const undone = await waitForRevision(10);
            const focusAfterUndo = document.activeElement === findBody();

            const redo = new KeyboardEvent('keydown', {
              key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true
            });
            findBody().dispatchEvent(redo);
            const redone = await waitForRevision(11);
            const focusAfterRedo = document.activeElement === findBody();

            const findSequenceSlide = () => [...document.querySelectorAll('#sequence-list [data-slide-id]')]
              .find((button) => button.dataset.slideId === openingSlideId);
            const waitForSequenceFocus = async () => {
              for (let attempt = 0; attempt < 100; attempt += 1) {
                const button = findSequenceSlide();
                if (button && document.activeElement === button) return true;
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              return false;
            };
            for (let attempt = 0; attempt < 100 && !findSequenceSlide(); attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            const sequenceSlide = findSequenceSlide();
            if (!sequenceSlide) throw new Error('Sequence Slide is unavailable');
            const selectedSequenceSlide = document.querySelector('#sequence-list [aria-current="page"]');
            const openingSequenceSection = [...document.querySelectorAll('#sequence-list [data-section-id]')]
              .find((row) => row.dataset.sectionId === openingSectionId);
            const priorInterfaceScale = interfaceScale;
            await enterPhaseForSlide('assemble', secondSlideId);
            const assemblyCreated = await ensureAssemblyFromPlan(deckWorkbench.projection());
            if (assemblyCreated?.revision !== 12 || !assemblyCreated?.composition || !assemblyCreated?.designOption?.id) {
              throw new Error('Story Assembly creation did not settle before sequence input');
            }
            await enterPhaseForSlide('plan', secondSlideId);
            const targetSizesByScale = [];
            const artboardWidthsByScale = [];
            for (const scale of INTERFACE_SCALE_STEPS) {
              interfaceScale = scale;
              applyScales();
              document.documentElement.getBoundingClientRect();
              const targets = [...document.querySelectorAll('button, select, input, textarea, .slide-row, .section-row')]
                .filter((element) => element.getClientRects().length > 0);
              const violations = targets.map((element) => {
                const rect = element.getBoundingClientRect();
                return { tag: element.tagName, id: element.id, width: rect.width, height: rect.height };
              }).filter((target) => target.width < 43.5 || target.height < 43.5);
              await enterPhaseForSlide('assemble', secondSlideId);
              applyScales();
              document.documentElement.getBoundingClientRect();
              const artboardRect = document.querySelector('#artboard').getBoundingClientRect();
              const shellRect = document.querySelector('#artboard-shell').getBoundingClientRect();
              targetSizesByScale.push({ scale, targetCount: targets.length, violations });
              artboardWidthsByScale.push({
                scale,
                artboardWidth: artboardRect.width,
                artboardHeight: artboardRect.height,
                shellWidth: shellRect.width,
                shellHeight: shellRect.height
              });
              await enterPhaseForSlide('plan', secondSlideId);
            }
            interfaceScale = 1.75;
            applyScales();
            document.documentElement.getBoundingClientRect();
            const planView = document.querySelector('[data-phase-view="plan"]');
            const scrollOwners = [planView, ...planView.querySelectorAll('*')]
              .filter((element) => element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)
              .map((element) => ({ element, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft }));
            const essentialControlSelectors = ['#add-section', '#add-slide', '#slide-intent', '#headline', '#save-plan'];
            const essentialControlReachability = essentialControlSelectors.map((selector) => {
              const element = document.querySelector(selector);
              if (!element) return { selector, reachable: false, width: 0, height: 0 };
              element.scrollIntoView({ block: 'center', inline: 'nearest' });
              document.documentElement.getBoundingClientRect();
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                selector,
                reachable: element.getClientRects().length > 0
                  && style.display !== 'none'
                  && style.visibility !== 'hidden'
                  && rect.width > 0
                  && rect.height > 0
                  && rect.left >= -1
                  && rect.top >= -1
                  && rect.right <= document.documentElement.clientWidth + 1
                  && rect.bottom <= document.documentElement.clientHeight + 1,
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom
              };
            });
            scrollOwners.forEach(({ element, scrollTop, scrollLeft }) => {
              element.scrollTop = scrollTop;
              element.scrollLeft = scrollLeft;
            });
            const canvas = projection?.canvas ?? { width: 2576, height: 1080 };
            const scaleReflowContract = {
              interfaceScale,
              viewportWidth: document.documentElement.clientWidth,
              viewportHeight: document.documentElement.clientHeight,
              documentWidth: document.documentElement.scrollWidth,
              artboardZoom,
              canvasAspectRatio: canvas.width / canvas.height,
              layout1440At150: workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1.5 }),
              layout1440At175: workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1.75 }),
              layout1512At150: workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1.5 }),
              layout1512At175: workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1.75 }),
              targetSizesByScale,
              artboardWidthsByScale,
              essentialControlReachability,
              essentialControlsInsideViewport: essentialControlReachability.every(({ reachable }) => reachable)
            };
            interfaceScale = priorInterfaceScale;
            applyScales();
            const accessibilityContract = {
              workbenchLabel: document.querySelector('main.workbench')?.getAttribute('aria-label'),
              workbenchBusy: document.querySelector('main.workbench')?.getAttribute('aria-busy'),
              statusRole: document.querySelector('#save-state')?.getAttribute('role'),
              statusLive: document.querySelector('#save-state')?.getAttribute('aria-live'),
              statusAtomic: document.querySelector('#save-state')?.getAttribute('aria-atomic'),
              artboardZoomLabel: document.querySelector('#artboard-zoom')?.getAttribute('aria-label'),
              fitArtboardLabel: document.querySelector('#fit-artboard')?.getAttribute('aria-label'),
              brandHidden: document.querySelector('.brand-mark')?.getAttribute('aria-hidden'),
              selectedSlideId: selectedSequenceSlide?.dataset.slideId,
              selectedSlideLabel: selectedSequenceSlide?.getAttribute('aria-label'),
              selectedSlideCurrent: selectedSequenceSlide?.getAttribute('aria-current'),
              slideShortcuts: sequenceSlide.getAttribute('aria-keyshortcuts'),
              sectionRole: openingSequenceSection?.getAttribute('role'),
              sectionLabel: openingSequenceSection?.getAttribute('aria-label'),
              sectionShortcuts: openingSequenceSection?.getAttribute('aria-keyshortcuts')
            };
            sequenceSlide.focus();
            const moveUp = new KeyboardEvent('keydown', {
              key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true
            });
            sequenceSlide.dispatchEvent(moveUp);
            await waitForRevision(13);
            const sequenceMovedUp = await deckBridge.query({ name: 'story.document', params: {} });
            const focusAfterMoveUp = await waitForSequenceFocus();

            const moveDown = new KeyboardEvent('keydown', {
              key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true
            });
            findSequenceSlide().dispatchEvent(moveDown);
            await waitForRevision(14);
            const sequenceMovedDown = await deckBridge.query({ name: 'story.document', params: {} });
            const focusAfterMoveDown = await waitForSequenceFocus();

            const findSequenceSection = () => [...document.querySelectorAll('#sequence-list [data-section-id]')]
              .find((row) => row.dataset.sectionId === openingSectionId);
            const waitForSectionFocus = async () => {
              for (let attempt = 0; attempt < 100; attempt += 1) {
                const row = findSequenceSection();
                if (row && document.activeElement === row) return true;
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              return false;
            };
            const sequenceSection = findSequenceSection();
            if (!sequenceSection) throw new Error('Sequence Section is unavailable');
            sequenceSection.focus();
            const moveSectionUp = new KeyboardEvent('keydown', {
              key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true
            });
            sequenceSection.dispatchEvent(moveSectionUp);
            await waitForRevision(15);
            const sectionMovedUp = await deckBridge.query({ name: 'story.document', params: {} });
            const focusAfterSectionMoveUp = await waitForSectionFocus();

            const moveSectionDown = new KeyboardEvent('keydown', {
              key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true
            });
            findSequenceSection().dispatchEvent(moveSectionDown);
            await waitForRevision(16);
            const sectionMovedDown = await deckBridge.query({ name: 'story.document', params: {} });
            const focusAfterSectionMoveDown = await waitForSectionFocus();

            const findSlideMoveControl = (slideId, direction) => {
              const slide = [...document.querySelectorAll('#sequence-list [data-slide-id]')]
                .find((button) => button.dataset.slideId === slideId);
              return slide?.closest('.slide-entry')?.querySelector(`.move-sequence[data-direction="${direction}"]`);
            };
            const slideDownControl = findSlideMoveControl(openingSlideId, 'down');
            if (!slideDownControl) throw new Error('Slide down control is unavailable');
            slideDownControl.click();
            await waitForRevision(17);
            const controlSlideMovedDown = await deckBridge.query({ name: 'story.document', params: {} });
            const focusAfterControlSlideDown = await waitForSequenceFocus();

            const slideUpControl = findSlideMoveControl(openingSlideId, 'up');
            if (!slideUpControl) throw new Error('Slide up control is unavailable');
            slideUpControl.click();
            await waitForRevision(18);
            const controlSlideMovedUp = await deckBridge.query({ name: 'story.document', params: {} });
            const focusAfterControlSlideUp = await waitForSequenceFocus();

            const findSectionMoveControl = (sectionId, direction) => {
              const section = [...document.querySelectorAll('#sequence-list [data-section-id]')]
                .find((row) => row.dataset.sectionId === sectionId);
              return section?.querySelector(`.move-sequence[data-direction="${direction}"]`);
            };
            const waitForSectionIdentityFocus = async (sectionId) => {
              for (let attempt = 0; attempt < 100; attempt += 1) {
                if (document.activeElement?.dataset.sectionId === sectionId) return true;
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              return false;
            };
            const sectionDownControl = findSectionMoveControl(secondSectionId, 'down');
            if (!sectionDownControl) throw new Error('Section down control is unavailable');
            sectionDownControl.click();
            await waitForRevision(19);
            const controlSectionMovedDown = await deckBridge.query({ name: 'story.document', params: {} });
            const focusAfterControlSectionDown = await waitForSectionIdentityFocus(secondSectionId);

            const sectionUpControl = findSectionMoveControl(secondSectionId, 'up');
            if (!sectionUpControl) throw new Error('Section up control is unavailable');
            sectionUpControl.click();
            await waitForRevision(20);
            const controlSectionMovedUp = await deckBridge.query({ name: 'story.document', params: {} });
            const focusAfterControlSectionUp = await waitForSectionIdentityFocus(secondSectionId);

            return {
              committed, undone, redone,
              accessibilityContract,
              assemblyCreation: {
                revision: assemblyCreated.revision,
                designOptionId: assemblyCreated.designOption.id,
                compositionPresent: Boolean(assemblyCreated.composition)
              },
              scaleReflowContract,
              sequenceMovedUp, sequenceMovedDown,
              sectionMovedUp, sectionMovedDown,
              controlSlideMovedDown, controlSlideMovedUp,
              controlSectionMovedDown, controlSectionMovedUp,
              focusAfterCommit, focusAfterUndo, focusAfterRedo,
              focusAfterMoveUp, focusAfterMoveDown,
              focusAfterSectionMoveUp, focusAfterSectionMoveDown,
              focusAfterControlSlideDown, focusAfterControlSlideUp,
              focusAfterControlSectionDown, focusAfterControlSectionUp,
              compositionDefaultPrevented: composing.defaultPrevented,
              dirtyUndoDefaultPrevented: dirtyUndo.defaultPrevented,
              commitDefaultPrevented: commit.defaultPrevented,
              undoDefaultPrevented: undo.defaultPrevented,
              redoDefaultPrevented: redo.defaultPrevented,
              moveUpDefaultPrevented: moveUp.defaultPrevented,
              moveDownDefaultPrevented: moveDown.defaultPrevented,
              moveSectionUpDefaultPrevented: moveSectionUp.defaultPrevented,
              moveSectionDownDefaultPrevented: moveSectionDown.defaultPrevented,
              afterCompositionRevision: afterComposition.revision,
              afterDirtyUndoRevision: afterDirtyUndo.revision
            };
            """,
            arguments: [
                "bodyBlockId": bodyBlockId,
                "openingSectionId": openingSectionId,
                "openingSlideId": openingSlideId,
                "secondSectionId": secondSectionId,
                "secondSlideId": secondSlideId,
            ]
        )
        print("DW-W01 Story create phase: keyboard journey returned")
        fflush(stdout)
        guard let keyboardJourney = rawKeyboardJourney as? [String: Any],
              let keyboardCommitted = keyboardJourney["committed"] as? [String: Any],
              keyboardCommitted["revision"] as? Int == 9,
              let committedBlocks = keyboardCommitted["contentBlocks"] as? [[String: Any]],
              committedBlocks[1]["plainText"] as? String == "A body block.\n\nThat survives design.",
              let keyboardUndone = keyboardJourney["undone"] as? [String: Any],
              keyboardUndone["revision"] as? Int == 10,
              let undoneBlocks = keyboardUndone["contentBlocks"] as? [[String: Any]],
              undoneBlocks[1]["plainText"] as? String == "A body block that survives design.",
              let keyboardRedone = keyboardJourney["redone"] as? [String: Any],
              keyboardRedone["revision"] as? Int == 11,
              keyboardJourney["focusAfterCommit"] as? Bool == true,
              keyboardJourney["focusAfterUndo"] as? Bool == true,
              keyboardJourney["focusAfterRedo"] as? Bool == true,
              keyboardJourney["compositionDefaultPrevented"] as? Bool == false,
              keyboardJourney["dirtyUndoDefaultPrevented"] as? Bool == false,
              keyboardJourney["commitDefaultPrevented"] as? Bool == true,
              keyboardJourney["undoDefaultPrevented"] as? Bool == true,
              keyboardJourney["redoDefaultPrevented"] as? Bool == true,
              keyboardJourney["afterCompositionRevision"] as? Int == 8,
              keyboardJourney["afterDirtyUndoRevision"] as? Int == 8
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Story keyboard commit, history or focus contract failed")
        }
        guard let assemblyCreation = keyboardJourney["assemblyCreation"] as? [String: Any],
              assemblyCreation["revision"] as? Int == 12,
              assemblyCreation["compositionPresent"] as? Bool == true,
              let assemblyDesignOptionId = assemblyCreation["designOptionId"] as? String,
              !assemblyDesignOptionId.isEmpty
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Story Assembly creation did not settle before sequence input")
        }
        guard let accessibility = keyboardJourney["accessibilityContract"] as? [String: Any],
              accessibility["workbenchLabel"] as? String == "Deck Workbench Editorial Desk",
              accessibility["workbenchBusy"] as? String == "false",
              accessibility["statusRole"] as? String == "status",
              accessibility["statusLive"] as? String == "polite",
              accessibility["statusAtomic"] as? String == "true",
              accessibility["artboardZoomLabel"] as? String == "Artboard Zoom",
              accessibility["fitArtboardLabel"] as? String == "Fit Artboard to Stage",
              accessibility["brandHidden"] as? String == "true",
              accessibility["selectedSlideId"] as? String == secondSlideId,
              accessibility["selectedSlideLabel"] as? String == "Slide 2: The Work Begins",
              accessibility["selectedSlideCurrent"] as? String == "page",
              accessibility["slideShortcuts"] as? String == "Alt+ArrowUp Alt+ArrowDown",
              accessibility["sectionRole"] as? String == "group",
              accessibility["sectionLabel"] as? String == "Opening Section",
              accessibility["sectionShortcuts"] as? String == "Alt+ArrowUp Alt+ArrowDown"
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Editorial Spine accessibility contract failed")
        }
        if let scaleReflowDiagnostic = keyboardJourney["scaleReflowContract"],
           JSONSerialization.isValidJSONObject(scaleReflowDiagnostic),
           let diagnosticData = try? JSONSerialization.data(withJSONObject: scaleReflowDiagnostic, options: [.sortedKeys]),
           let diagnosticText = String(data: diagnosticData, encoding: .utf8) {
            print("DW-W01 scale contract: \(diagnosticText)")
            fflush(stdout)
        }
        guard let scaleReflow = keyboardJourney["scaleReflowContract"] as? [String: Any],
              scaleReflow["interfaceScale"] as? Double == 1.75,
              let viewportWidth = (scaleReflow["viewportWidth"] as? NSNumber)?.doubleValue,
              let documentWidth = (scaleReflow["documentWidth"] as? NSNumber)?.doubleValue,
              documentWidth <= viewportWidth + 1,
              scaleReflow["layout1440At150"] as? String == "single-column",
              scaleReflow["layout1440At175"] as? String == "single-column",
              scaleReflow["layout1512At150"] as? String == "single-column",
              scaleReflow["layout1512At175"] as? String == "single-column",
              let targetSizesByScale = scaleReflow["targetSizesByScale"] as? [[String: Any]],
              targetSizesByScale.count == 7,
              targetSizesByScale.allSatisfy({ (($0["targetCount"] as? NSNumber)?.intValue ?? 0) > 0
                  && (($0["violations"] as? [[String: Any]])?.isEmpty == true) }),
              let artboardWidthsByScale = scaleReflow["artboardWidthsByScale"] as? [[String: Any]],
              artboardWidthsByScale.count == 7,
              let artboardZoom = (scaleReflow["artboardZoom"] as? NSNumber)?.doubleValue,
              artboardZoom >= 0.1,
              let canvasAspectRatio = (scaleReflow["canvasAspectRatio"] as? NSNumber)?.doubleValue,
              canvasAspectRatio > 1,
              artboardWidthsByScale.allSatisfy({ entry in
                  guard let artboardWidth = (entry["artboardWidth"] as? NSNumber)?.doubleValue,
                        let artboardHeight = (entry["artboardHeight"] as? NSNumber)?.doubleValue,
                        let shellWidth = (entry["shellWidth"] as? NSNumber)?.doubleValue,
                        let shellHeight = (entry["shellHeight"] as? NSNumber)?.doubleValue else { return false }
                  let expectedWidth = 1088 * artboardZoom
                  let expectedHeight = expectedWidth / canvasAspectRatio
                  return artboardWidth > 1 && artboardHeight > 1 && shellWidth > 1 && shellHeight > 1
                      && abs(artboardWidth - expectedWidth) <= 1
                      && abs(artboardHeight - expectedHeight) <= 1
                      && abs((artboardWidth / artboardHeight) - canvasAspectRatio) <= 0.01
                      && abs(artboardWidth - shellWidth) <= 1 && abs(artboardHeight - shellHeight) <= 1
              }),
              let firstArtboardWidth = (artboardWidthsByScale.first?["artboardWidth"] as? NSNumber)?.doubleValue,
              let firstArtboardHeight = (artboardWidthsByScale.first?["artboardHeight"] as? NSNumber)?.doubleValue,
              artboardWidthsByScale.allSatisfy({ entry in
                  guard let width = (entry["artboardWidth"] as? NSNumber)?.doubleValue,
                        let height = (entry["artboardHeight"] as? NSNumber)?.doubleValue else { return false }
                  return abs(width - firstArtboardWidth) <= 1 && abs(height - firstArtboardHeight) <= 1
              }),
              let essentialControlReachability = scaleReflow["essentialControlReachability"] as? [[String: Any]],
              essentialControlReachability.count == 5,
              essentialControlReachability.allSatisfy({ entry in
                  entry["reachable"] as? Bool == true
                      && ((entry["width"] as? NSNumber)?.doubleValue ?? 0) > 0
                      && ((entry["height"] as? NSNumber)?.doubleValue ?? 0) > 0
              }),
              scaleReflow["essentialControlsInsideViewport"] as? Bool == true
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Interface Scale reflow, target size or artboard independence contract failed")
        }
        let sequenceMovedUp = try requireStory(keyboardJourney["sequenceMovedUp"], revision: 13)
        try requireStoryOrder(
            sequenceMovedUp,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[openingSlideId], [secondSlideId]]
        )
        let sequenceMovedDown = try requireStory(keyboardJourney["sequenceMovedDown"], revision: 14)
        try requireStoryOrder(
            sequenceMovedDown,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )
        guard keyboardJourney["focusAfterMoveUp"] as? Bool == true,
              keyboardJourney["focusAfterMoveDown"] as? Bool == true,
              keyboardJourney["moveUpDefaultPrevented"] as? Bool == true,
              keyboardJourney["moveDownDefaultPrevented"] as? Bool == true
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Sequence keyboard reorder or focus contract failed")
        }
        let sectionMovedUp = try requireStory(keyboardJourney["sectionMovedUp"], revision: 15)
        try requireStoryOrder(
            sectionMovedUp,
            sectionIds: [openingSectionId, secondSectionId],
            slideIdsBySection: [[openingSlideId, secondSlideId], []]
        )
        let sectionMovedDown = try requireStory(keyboardJourney["sectionMovedDown"], revision: 16)
        try requireStoryOrder(
            sectionMovedDown,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )
        guard keyboardJourney["focusAfterSectionMoveUp"] as? Bool == true,
              keyboardJourney["focusAfterSectionMoveDown"] as? Bool == true,
              keyboardJourney["moveSectionUpDefaultPrevented"] as? Bool == true,
              keyboardJourney["moveSectionDownDefaultPrevented"] as? Bool == true
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Sequence Section keyboard reorder or focus contract failed")
        }
        let controlSlideMovedDown = try requireStory(keyboardJourney["controlSlideMovedDown"], revision: 17)
        try requireStoryOrder(
            controlSlideMovedDown,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [secondSlideId, openingSlideId]]
        )
        let controlSlideMovedUp = try requireStory(keyboardJourney["controlSlideMovedUp"], revision: 18)
        try requireStoryOrder(
            controlSlideMovedUp,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )
        let controlSectionMovedDown = try requireStory(keyboardJourney["controlSectionMovedDown"], revision: 19)
        try requireStoryOrder(
            controlSectionMovedDown,
            sectionIds: [openingSectionId, secondSectionId],
            slideIdsBySection: [[openingSlideId, secondSlideId], []]
        )
        let controlSectionMovedUp = try requireStory(keyboardJourney["controlSectionMovedUp"], revision: 20)
        try requireStoryOrder(
            controlSectionMovedUp,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )
        guard keyboardJourney["focusAfterControlSlideDown"] as? Bool == true,
              keyboardJourney["focusAfterControlSlideUp"] as? Bool == true,
              keyboardJourney["focusAfterControlSectionDown"] as? Bool == true,
              keyboardJourney["focusAfterControlSectionUp"] as? Bool == true
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Sequence control reorder or focus contract failed")
        }
        let rawParagraphProjection = try await controller.invokeWorkspaceForTracer(
            "return await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } })",
            arguments: ["secondSlideId": secondSlideId]
        )
        guard let paragraphProjection = rawParagraphProjection as? [String: Any],
              let projectedBlocks = paragraphProjection["contentBlocks"] as? [[String: Any]],
              projectedBlocks.count == 2
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Active Slide projection omitted Story Content Blocks")
        }
        try requireParagraphs(
            in: projectedBlocks[1],
            expected: ["A body block.", "", "That survives design."]
        )

        let rawRemoved = try await controller.invokeWorkspaceForTracer(
            """
            const story = await deckBridge.query({ name: 'story.document', params: {} });
            await deckBridge.execute({ command: {
              commandId: crypto.randomUUID(), expectedRevision: story.revision, type: 'content.remove',
              payload: { slideId: secondSlideId, blockId: bodyBlockId },
              source: { kind: 'ui', label: 'DW-W01-D01 packaged removal journey' },
              issuedAt: new Date().toISOString()
            }});
            return await deckBridge.query({ name: 'story.document', params: {} });
            """,
            arguments: ["secondSlideId": secondSlideId, "bodyBlockId": bodyBlockId]
        )
        let removed = try requireStory(rawRemoved, revision: 21)
        guard let removedSections = removed["sections"] as? [[String: Any]],
              let removedSlides = removedSections[1]["slides"] as? [[String: Any]],
              let removedBlocks = removedSlides[1]["contentBlocks"] as? [[String: Any]],
              removedBlocks.count == 1,
              removedBlocks.allSatisfy({ $0["id"] as? String != bodyBlockId })
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Content removal did not reach the Story projection")
        }

        let rawStructurallyRemoved = try await controller.invokeWorkspaceForTracer(
            """
            const execute = async (type, payload) => {
              const story = await deckBridge.query({ name: 'story.document', params: {} });
              await deckBridge.execute({ command: {
                commandId: crypto.randomUUID(), expectedRevision: story.revision, type, payload,
                source: { kind: 'ui', label: 'DW-W01-D01-B packaged structural removal' },
                issuedAt: new Date().toISOString()
              }});
            };
            await execute('slide.remove', { slideId: secondSlideId });
            await execute('section.remove', { sectionId: secondSectionId });
            return await deckBridge.query({ name: 'story.document', params: {} });
            """,
            arguments: ["secondSectionId": secondSectionId, "secondSlideId": secondSlideId]
        )
        let structurallyRemoved = try requireStory(rawStructurallyRemoved, revision: 23)
        try requireStoryOrder(
            structurallyRemoved,
            sectionIds: [openingSectionId],
            slideIdsBySection: [[openingSlideId]]
        )

        guard let durableDocumentURL = controller.documentURL else {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Created Story Deck URL is unavailable")
        }
        let replayController = try DeckSessionController(requiresWorkspaceDraftFlush: false)
        let concurrentWriterName = failureName { try replayController.openDocument(at: durableDocumentURL) }
        guard concurrentWriterName == "DocumentBusy" else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Second Story writer was not rejected")
        }
        try await controller.closeDocument()
        _ = try replayController.openDocument(at: durableDocumentURL)
        let replayed = try replayController.query(name: "story.document", params: [:])
        _ = try requireStory(replayed, revision: 23)
        try await replayController.closeDocument()

        let crashRecoveryRevision = try await verifyInterruptedManifestRecovery(from: durableDocumentURL, expectedRevision: 23)
        guard !controller.hasDocument else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Explicit close left the Deck session open")
        }
        try writeJSON([
            "phase": "story-create",
            "revision": 23,
            "sectionIds": [secondSectionId, openingSectionId],
            "openingSlideIds": [openingSlideId, secondSlideId],
            "journalReplayRevision": 23,
            "deckTitle": "The Hill",
            "renamedSectionTitle": "Act II",
            "slideIntent": "editorial-body",
            "bodyBlockId": bodyBlockId,
            "bodyOriginalText": "A body block that survives design.",
            "bodyText": "A body block.\n\nThat survives design.",
            "bodyParagraphs": ["A body block.", "", "That survives design."],
            "keyboardCommitRevision": 9,
            "keyboardUndoRevision": 10,
            "keyboardRedoRevision": 11,
            "keyboardFocusRetained": true,
            "assemblyCreationRevision": 12,
            "assemblyDesignOptionId": assemblyDesignOptionId,
            "sequenceMoveUpRevision": 13,
            "sequenceMoveDownRevision": 14,
            "sequenceKeyboardFocusRetained": true,
            "sectionMoveUpRevision": 15,
            "sectionMoveDownRevision": 16,
            "sectionKeyboardFocusRetained": true,
            "controlSlideMoveDownRevision": 17,
            "controlSlideMoveUpRevision": 18,
            "controlSectionMoveDownRevision": 19,
            "controlSectionMoveUpRevision": 20,
            "sequenceControlFocusRetained": true,
            "compositionCommitIgnored": true,
            "dirtyUndoReservedForText": true,
            "bodyRemoved": true,
            "removedSectionId": secondSectionId,
            "removedSlideId": secondSlideId,
            "structuralRemoval": true,
            "crashRecoveryRevision": crashRecoveryRevision,
            "concurrentWriterFailure": concurrentWriterName,
            "closedBeforeReopen": true,
        ], to: resultURL)
        print("DW-W01 Story create phase passed")
    }

    private static func storyReopenPhase(
        controller: DeckSessionController,
        documentURL: URL,
        createResultURL: URL,
        resultURL: URL
    ) async throws {
        print("DW-W01 Story reopen phase: document")
        fflush(stdout)
        let createResult = try readJSON(from: createResultURL)
        guard let bodyBlockId = createResult["bodyBlockId"] as? String,
              let bodyOriginalText = createResult["bodyOriginalText"] as? String,
              let bodyText = createResult["bodyText"] as? String,
              let bodyParagraphs = createResult["bodyParagraphs"] as? [String],
              bodyParagraphs.count == 3,
              let sectionIds = createResult["sectionIds"] as? [String],
              sectionIds.count == 2,
              let openingSlideIds = createResult["openingSlideIds"] as? [String],
              openingSlideIds.count == 2,
              let assemblyDesignOptionId = createResult["assemblyDesignOptionId"] as? String,
              !assemblyDesignOptionId.isEmpty
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Story create receipt lacks stable structural identities")
        }
        let secondSectionId = sectionIds[0]
        let openingSectionId = sectionIds[1]
        let openingSlideId = openingSlideIds[0]
        let secondSlideId = openingSlideIds[1]
        _ = try controller.openDocument(at: documentURL)
        try await controller.renderCurrentProjection()
        let rawReopened = try await controller.invokeWorkspaceForTracer(
            "return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let reopened = try requireStory(rawReopened, revision: 23)
        try requireStoryOrder(reopened, sectionIds: [openingSectionId], slideIdsBySection: [[openingSlideId]])
        guard reopened["deckTitle"] as? String == "The Hill" else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Deck metadata did not survive structural removal")
        }

        let rawSectionRestored = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sectionRestored = try requireStory(rawSectionRestored, revision: 24)
        try requireStoryOrder(
            sectionRestored,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId]]
        )

        let rawSlideRestored = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let slideRestored = try requireStory(rawSlideRestored, revision: 25)
        try requireStoryOrder(
            slideRestored,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )
        guard let slideSections = slideRestored["sections"] as? [[String: Any]],
              slideSections[0]["title"] as? String == "Act II",
              let restoredSlides = slideSections[1]["slides"] as? [[String: Any]],
              restoredSlides[1]["intent"] as? String == "editorial-body",
              let blocksBeforeContentUndo = restoredSlides[1]["contentBlocks"] as? [[String: Any]],
              blocksBeforeContentUndo.count == 1
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Undo did not restore Section and Slide identity and metadata")
        }

        let rawContentRestored = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let contentRestored = try requireStory(rawContentRestored, revision: 26)
        guard let contentSections = contentRestored["sections"] as? [[String: Any]],
              let contentSlides = contentSections[1]["slides"] as? [[String: Any]],
              let restoredBlocks = contentSlides[1]["contentBlocks"] as? [[String: Any]],
              restoredBlocks.count == 2,
              restoredBlocks[1]["id"] as? String == bodyBlockId,
              restoredBlocks[1]["plainText"] as? String == bodyText
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Undo did not restore Content Block identity and order")
        }

        let rawRestoredParagraphProjection = try await controller.invokeWorkspaceForTracer(
            "return await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } })",
            arguments: ["secondSlideId": secondSlideId]
        )
        guard let restoredParagraphProjection = rawRestoredParagraphProjection as? [String: Any],
              restoredParagraphProjection["revision"] as? Int == 26,
              let restoredProjectedBlocks = restoredParagraphProjection["contentBlocks"] as? [[String: Any]],
              restoredProjectedBlocks.count == 2
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Reopened Slide projection omitted restored Story paragraphs")
        }
        try requireParagraphs(in: restoredProjectedBlocks[1], expected: bodyParagraphs)

        let rawControlSectionMoveUpUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let controlSectionMoveUpUndone = try requireStory(rawControlSectionMoveUpUndone, revision: 27)
        try requireStoryOrder(
            controlSectionMoveUpUndone,
            sectionIds: [openingSectionId, secondSectionId],
            slideIdsBySection: [[openingSlideId, secondSlideId], []]
        )

        let rawControlSectionMoveDownUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let controlSectionMoveDownUndone = try requireStory(rawControlSectionMoveDownUndone, revision: 28)
        try requireStoryOrder(
            controlSectionMoveDownUndone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )

        let rawControlSlideMoveUpUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let controlSlideMoveUpUndone = try requireStory(rawControlSlideMoveUpUndone, revision: 29)
        try requireStoryOrder(
            controlSlideMoveUpUndone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [secondSlideId, openingSlideId]]
        )

        let rawControlSlideMoveDownUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let controlSlideMoveDownUndone = try requireStory(rawControlSlideMoveDownUndone, revision: 30)
        try requireStoryOrder(
            controlSlideMoveDownUndone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )

        let rawSectionMoveDownUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sectionMoveDownUndone = try requireStory(rawSectionMoveDownUndone, revision: 31)
        try requireStoryOrder(
            sectionMoveDownUndone,
            sectionIds: [openingSectionId, secondSectionId],
            slideIdsBySection: [[openingSlideId, secondSlideId], []]
        )

        let rawSectionMoveUpUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sectionMoveUpUndone = try requireStory(rawSectionMoveUpUndone, revision: 32)
        try requireStoryOrder(
            sectionMoveUpUndone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )

        let rawSequenceMoveDownUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sequenceMoveDownUndone = try requireStory(rawSequenceMoveDownUndone, revision: 33)
        try requireStoryOrder(
            sequenceMoveDownUndone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[openingSlideId], [secondSlideId]]
        )

        let rawSequenceMoveUpUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sequenceMoveUpUndone = try requireStory(rawSequenceMoveUpUndone, revision: 34)
        try requireStoryOrder(
            sequenceMoveUpUndone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )

        let rawAssemblyUndone = try await controller.invokeWorkspaceForTracer(
            """
            await deckBridge.undo();
            const active = await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } });
            return {
              revision: active.revision,
              compositionPresent: Boolean(active.composition),
              designOptionPresent: Boolean(active.designOption)
            };
            """,
            arguments: ["secondSlideId": secondSlideId]
        )
        guard let assemblyUndone = rawAssemblyUndone as? [String: Any],
              assemblyUndone["revision"] as? Int == 35,
              assemblyUndone["compositionPresent"] as? Bool == false,
              assemblyUndone["designOptionPresent"] as? Bool == false
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Undo did not remove the Plan-created Assembly")
        }

        let rawOriginalBody = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } })",
            arguments: ["secondSlideId": secondSlideId]
        )
        guard let originalBody = rawOriginalBody as? [String: Any],
              originalBody["revision"] as? Int == 36,
              let originalBlocks = originalBody["contentBlocks"] as? [[String: Any]],
              originalBlocks.count == 2,
              originalBlocks[1]["plainText"] as? String == bodyOriginalText
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Undo did not restore the original single-paragraph body")
        }
        try requireParagraphs(in: originalBlocks[1], expected: [bodyOriginalText])

        let rawParagraphsRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } })",
            arguments: ["secondSlideId": secondSlideId]
        )
        guard let paragraphsRedone = rawParagraphsRedone as? [String: Any],
              paragraphsRedone["revision"] as? Int == 37,
              let redoneParagraphBlocks = paragraphsRedone["contentBlocks"] as? [[String: Any]],
              redoneParagraphBlocks.count == 2,
              redoneParagraphBlocks[1]["plainText"] as? String == bodyText
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Redo did not restore the multiline body")
        }
        try requireParagraphs(in: redoneParagraphBlocks[1], expected: bodyParagraphs)

        let rawAssemblyRedone = try await controller.invokeWorkspaceForTracer(
            """
            await deckBridge.redo();
            const active = await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } });
            return {
              revision: active.revision,
              compositionPresent: Boolean(active.composition),
              designOptionId: active.designOption?.id ?? null,
              designOptionSource: active.designOption?.source ?? null
            };
            """,
            arguments: ["secondSlideId": secondSlideId]
        )
        guard let assemblyRedone = rawAssemblyRedone as? [String: Any],
              assemblyRedone["revision"] as? Int == 38,
              assemblyRedone["compositionPresent"] as? Bool == true,
              assemblyRedone["designOptionId"] as? String == assemblyDesignOptionId,
              assemblyRedone["designOptionSource"] as? String == "plan"
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Redo did not restore the same Plan-created Assembly")
        }

        let rawSequenceMoveUpRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sequenceMoveUpRedone = try requireStory(rawSequenceMoveUpRedone, revision: 39)
        try requireStoryOrder(
            sequenceMoveUpRedone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[openingSlideId], [secondSlideId]]
        )

        let rawSequenceMoveDownRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sequenceMoveDownRedone = try requireStory(rawSequenceMoveDownRedone, revision: 40)
        try requireStoryOrder(
            sequenceMoveDownRedone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )

        let rawSectionMoveUpRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sectionMoveUpRedone = try requireStory(rawSectionMoveUpRedone, revision: 41)
        try requireStoryOrder(
            sectionMoveUpRedone,
            sectionIds: [openingSectionId, secondSectionId],
            slideIdsBySection: [[openingSlideId, secondSlideId], []]
        )

        let rawSectionMoveDownRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sectionMoveDownRedone = try requireStory(rawSectionMoveDownRedone, revision: 42)
        try requireStoryOrder(
            sectionMoveDownRedone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )

        let rawControlSlideMoveDownRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let controlSlideMoveDownRedone = try requireStory(rawControlSlideMoveDownRedone, revision: 43)
        try requireStoryOrder(
            controlSlideMoveDownRedone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [secondSlideId, openingSlideId]]
        )

        let rawControlSlideMoveUpRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let controlSlideMoveUpRedone = try requireStory(rawControlSlideMoveUpRedone, revision: 44)
        try requireStoryOrder(
            controlSlideMoveUpRedone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )

        let rawControlSectionMoveDownRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let controlSectionMoveDownRedone = try requireStory(rawControlSectionMoveDownRedone, revision: 45)
        try requireStoryOrder(
            controlSectionMoveDownRedone,
            sectionIds: [openingSectionId, secondSectionId],
            slideIdsBySection: [[openingSlideId, secondSlideId], []]
        )

        let rawControlSectionMoveUpRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let controlSectionMoveUpRedone = try requireStory(rawControlSectionMoveUpRedone, revision: 46)
        try requireStoryOrder(
            controlSectionMoveUpRedone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )

        let rawContentRemoved = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let contentRemoved = try requireStory(rawContentRemoved, revision: 47)
        guard let redoneContentSections = contentRemoved["sections"] as? [[String: Any]],
              let redoneContentSlides = redoneContentSections[1]["slides"] as? [[String: Any]],
              let redoneContentBlocks = redoneContentSlides[1]["contentBlocks"] as? [[String: Any]],
              redoneContentBlocks.count == 1
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Redo did not remove Content Block")
        }

        let rawSlideRemoved = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let slideRemoved = try requireStory(rawSlideRemoved, revision: 48)
        try requireStoryOrder(
            slideRemoved,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId]]
        )

        let rawSectionRemoved = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sectionRemoved = try requireStory(rawSectionRemoved, revision: 49)
        try requireStoryOrder(sectionRemoved, sectionIds: [openingSectionId], slideIdsBySection: [[openingSlideId]])
        try controller.save()
        try writeJSON([
            "phase": "story-reopen",
            "reopenedRevision": 23,
            "undoSectionRevision": 24,
            "undoSlideRevision": 25,
            "undoContentRevision": 26,
            "undoControlSectionMoveUpRevision": 27,
            "undoControlSectionMoveDownRevision": 28,
            "undoControlSlideMoveUpRevision": 29,
            "undoControlSlideMoveDownRevision": 30,
            "undoSectionMoveDownRevision": 31,
            "undoSectionMoveUpRevision": 32,
            "undoSequenceMoveDownRevision": 33,
            "undoSequenceMoveUpRevision": 34,
            "undoAssemblyRevision": 35,
            "undoParagraphUpdateRevision": 36,
            "redoParagraphUpdateRevision": 37,
            "redoAssemblyRevision": 38,
            "redoSequenceMoveUpRevision": 39,
            "redoSequenceMoveDownRevision": 40,
            "redoSectionMoveUpRevision": 41,
            "redoSectionMoveDownRevision": 42,
            "redoControlSlideMoveDownRevision": 43,
            "redoControlSlideMoveUpRevision": 44,
            "redoControlSectionMoveDownRevision": 45,
            "redoControlSectionMoveUpRevision": 46,
            "redoContentRevision": 47,
            "redoSlideRevision": 48,
            "redoSectionRevision": 49,
            "sectionIds": [secondSectionId, openingSectionId],
            "openingSlideIds": [openingSlideId, secondSlideId],
            "deckTitle": "The Hill",
            "renamedSectionTitle": "Act II",
            "slideIntent": "editorial-body",
            "bodyBlockId": bodyBlockId,
            "bodyOriginalText": bodyOriginalText,
            "bodyText": bodyText,
            "bodyParagraphs": bodyParagraphs,
            "assemblyDesignOptionId": assemblyDesignOptionId,
            "assemblyUndoRedoStable": true,
            "paragraphsPreservedAfterReopen": true,
            "keyboardFocusRetained": true,
            "sequenceKeyboardFocusRetained": true,
            "sectionKeyboardFocusRetained": true,
            "sequenceControlFocusRetained": true,
            "bodyRemovedAfterRedo": true,
            "structuralRemovalAfterRedo": true,
        ], to: resultURL)
        try await controller.closeDocument()
        print("DW-W01 Story reopen phase passed")
    }

    private static func requireStory(_ raw: Any?, revision: Int) throws -> [String: Any] {
        guard let story = raw as? [String: Any], story["revision"] as? Int == revision else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Story projection has the wrong revision")
        }
        return story
    }

    private static func requireStoryOrder(
        _ story: [String: Any],
        sectionIds: [String],
        slideIdsBySection: [[String]]
    ) throws {
        guard let sections = story["sections"] as? [[String: Any]],
              sections.count == sectionIds.count,
              sections.map({ $0["id"] as? String }) == sectionIds.map({ Optional($0) })
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Story Section order is incorrect")
        }
        for (index, section) in sections.enumerated() {
            guard let slides = section["slides"] as? [[String: Any]],
                  slides.map({ $0["id"] as? String }) == slideIdsBySection[index].map({ Optional($0) })
            else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Story Slide order is incorrect")
            }
        }
    }

    private static func requireParagraphs(in block: [String: Any], expected: [String]) throws {
        guard let value = block["value"] as? [String: Any],
              value["type"] as? String == "doc",
              let paragraphs = value["content"] as? [[String: Any]],
              paragraphs.count == expected.count
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Story field lost semantic paragraph boundaries")
        }
        for (index, paragraph) in paragraphs.enumerated() {
            guard paragraph["type"] as? String == "paragraph",
                  let nodes = paragraph["content"] as? [[String: Any]],
                  nodes.allSatisfy({ $0["type"] as? String == "text" }),
                  nodes.compactMap({ $0["text"] as? String }).joined() == expected[index]
            else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Story paragraph content changed")
            }
        }
    }

    private static func verifyInterruptedManifestRecovery(from documentURL: URL, expectedRevision: Int) async throws -> Int {
        let files = FileManager.default
        let recoveryURL = documentURL.deletingLastPathComponent()
            .appendingPathComponent("Interrupted-\(UUID().uuidString).pitchdeck", isDirectory: true)
        try files.copyItem(at: documentURL, to: recoveryURL)
        let copiedLock = recoveryURL.appendingPathComponent(PitchDeckDocumentStore.writerLockFile)
        if files.fileExists(atPath: copiedLock.path) { try files.removeItem(at: copiedLock) }

        let journalURL = recoveryURL.appendingPathComponent("journal.ndjson")
        let journalText = try String(contentsOf: journalURL, encoding: .utf8)
        let lines = journalText.split(separator: "\n", omittingEmptySubsequences: true)
        guard lines.count >= 2,
              let staleRecordData = String(lines[lines.count - 2]).data(using: .utf8),
              let staleRecord = try JSONSerialization.jsonObject(with: staleRecordData) as? [String: Any],
              let staleHash = staleRecord["recordHash"] as? String
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Crash-recovery fixture has no valid prior journal head")
        }

        let manifestURL = recoveryURL.appendingPathComponent("manifest.json")
        var manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as! [String: Any]
        manifest["journalHeadHash"] = staleHash
        try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
            .write(to: manifestURL, options: [.atomic])

        let (recoveryStore, loaded) = try PitchDeckDocumentStore.open(at: recoveryURL)
        guard loaded.repairedJournalHead else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Interrupted manifest head was not repaired")
        }
        try recoveryStore.close()
        let recoveredController = try DeckSessionController(requiresWorkspaceDraftFlush: false)
        let recovered = try recoveredController.openDocument(at: recoveryURL)
        guard recovered["revision"] as? Int == expectedRevision else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Crash recovery did not replay the durable journal tail")
        }
        try await recoveredController.closeDocument()
        return expectedRevision
    }

    private static func readJSON(from url: URL) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Tracer receipt is not a JSON object")
        }
        return value
    }

    private static func writeJSON(_ value: [String: Any], to url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url, options: [.atomic])
    }

    private static func verifyNegativeDocuments(from documentURL: URL) throws -> (
        corruptJournal: String,
        unsupportedSchema: String,
        linkedRead: String,
        linkedAppend: String,
        linkedWrite: String
    ) {
        let files = FileManager.default
        let root = documentURL.deletingLastPathComponent()
        let unsupportedURL = root.appendingPathComponent("Unsupported.pitchdeck", isDirectory: true)
        let corruptURL = root.appendingPathComponent("Corrupt.pitchdeck", isDirectory: true)
        let linkedReadURL = root.appendingPathComponent("Linked-Read.pitchdeck", isDirectory: true)
        let linkedAppendURL = root.appendingPathComponent("Linked-Append.pitchdeck", isDirectory: true)
        let linkedWriteURL = root.appendingPathComponent("Linked-Write.pitchdeck", isDirectory: true)
        try files.copyItem(at: documentURL, to: unsupportedURL)
        try files.copyItem(at: documentURL, to: corruptURL)
        try files.copyItem(at: documentURL, to: linkedReadURL)
        try files.copyItem(at: documentURL, to: linkedAppendURL)
        try files.copyItem(at: documentURL, to: linkedWriteURL)
        for fixture in [unsupportedURL, corruptURL, linkedReadURL, linkedAppendURL, linkedWriteURL] {
            let copiedLock = fixture.appendingPathComponent(PitchDeckDocumentStore.writerLockFile)
            if files.fileExists(atPath: copiedLock.path) { try files.removeItem(at: copiedLock) }
        }

        let unsupportedManifestURL = unsupportedURL.appendingPathComponent("manifest.json")
        var unsupportedManifest = try JSONSerialization.jsonObject(with: Data(contentsOf: unsupportedManifestURL)) as! [String: Any]
        unsupportedManifest["schemaVersion"] = 2
        try JSONSerialization.data(withJSONObject: unsupportedManifest, options: [.prettyPrinted, .sortedKeys])
            .write(to: unsupportedManifestURL, options: [.atomic])

        let journalURL = corruptURL.appendingPathComponent("journal.ndjson")
        var journal = try Data(contentsOf: journalURL)
        guard let mutationIndex = journal.firstIndex(of: Character("c").asciiValue!) else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Negative journal fixture could not mutate")
        }
        journal[mutationIndex] = Character("C").asciiValue!
        try journal.write(to: journalURL, options: [.atomic])

        let unsupportedName = failureName { try PitchDeckDocumentStore.open(at: unsupportedURL) }
        let corruptName = failureName { try PitchDeckDocumentStore.open(at: corruptURL) }

        let readSentinel = root.appendingPathComponent("linked-read-sentinel.json")
        let appendSentinel = root.appendingPathComponent("linked-append-sentinel.ndjson")
        let writeSentinel = root.appendingPathComponent("linked-write-sentinel.json")
        let sentinel = Data("outside-package-sentinel".utf8)
        try sentinel.write(to: readSentinel)
        try sentinel.write(to: appendSentinel)
        try sentinel.write(to: writeSentinel)

        let linkedManifest = linkedReadURL.appendingPathComponent("manifest.json")
        try files.removeItem(at: linkedManifest)
        try files.createSymbolicLink(at: linkedManifest, withDestinationURL: readSentinel)
        let linkedReadName = failureName { try PitchDeckDocumentStore.open(at: linkedReadURL) }

        let (appendStore, _) = try PitchDeckDocumentStore.open(at: linkedAppendURL)
        let linkedJournal = linkedAppendURL.appendingPathComponent("journal.ndjson")
        try files.moveItem(
            at: linkedJournal,
            to: linkedAppendURL.appendingPathComponent("journal.original.ndjson")
        )
        try files.createSymbolicLink(at: linkedJournal, withDestinationURL: appendSentinel)
        let linkedAppendName = failureName {
            try appendStore.appendDurably(prepared: [
                "nextRevision": appendStore.currentRevision + 1,
                "journalOperation": ["operation": "undo"],
            ])
        }

        let (writeStore, _) = try PitchDeckDocumentStore.open(at: linkedWriteURL)
        let linkedWriteManifest = linkedWriteURL.appendingPathComponent("manifest.json")
        try files.moveItem(
            at: linkedWriteManifest,
            to: linkedWriteURL.appendingPathComponent("manifest.original.json")
        )
        try files.createSymbolicLink(at: linkedWriteManifest, withDestinationURL: writeSentinel)
        let linkedWriteName = failureName {
            try writeStore.appendDurably(prepared: [
                "nextRevision": writeStore.currentRevision + 1,
                "journalOperation": ["operation": "undo"],
            ])
        }
        try appendStore.close()
        try writeStore.close()

        guard unsupportedName == "UnsupportedSchema",
              corruptName == "JournalCorruption",
              linkedReadName == "MissingAttachment",
              linkedAppendName == "CheckpointWriteFailure",
              linkedWriteName == "CheckpointWriteFailure",
              try Data(contentsOf: readSentinel) == sentinel,
              try Data(contentsOf: appendSentinel) == sentinel,
              try Data(contentsOf: writeSentinel) == sentinel
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Negative document failures were not named correctly")
        }
        return (corruptName, unsupportedName, linkedReadName, linkedAppendName, linkedWriteName)
    }

    private static func failureName(_ operation: () throws -> Any) -> String {
        do {
            _ = try operation()
            return "UnexpectedSuccess"
        } catch let failure as WorkbenchFailure {
            return failure.name
        } catch {
            return "UnexpectedFailure"
        }
    }
}
