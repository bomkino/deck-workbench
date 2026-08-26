import AppKit
import Darwin
import Foundation

@MainActor
enum PackagedTracer {
    static func runIfRequested(controller: DeckSessionController) async {
        let arguments = CommandLine.arguments
        let modes = ["--tracer-create", "--tracer-reopen", "--tracer-story-create", "--tracer-story-reopen"]
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
            } else {
                guard arguments.count > modeIndex + 2 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "--tracer-story-reopen requires Deck and result paths")
                }
                try await storyReopenPhase(
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

    private static func createPhase(
        controller: DeckSessionController,
        documentURL: URL,
        resultURL: URL
    ) async throws {
        print("DW-T00 create phase: document")
        fflush(stdout)
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
            "const ui = await deckBridge.setInterfaceScale({ value: 1.25 }); const artboard = await deckBridge.setArtboardZoom({ value: 0.5 }); return { ui, artboard, projection: deckWorkbench.projection() }"
        )
        guard let scaleResult = scales as? [String: Any],
              let ui = scaleResult["ui"] as? [String: Any],
              let artboard = scaleResult["artboard"] as? [String: Any],
              ui["interfaceScale"] as? Double == 1.25,
              artboard["artboardZoom"] as? Double == 0.5
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Interface Scale and artboard zoom did not remain independent")
        }

        guard let durableDocumentURL = controller.documentURL else {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Created Deck URL is unavailable")
        }
        let replayController = try DeckSessionController()
        let replayed = try replayController.openDocument(at: durableDocumentURL)
        guard replayed["revision"] as? Int == 3,
              ((replayed["headline"] as? [String: Any])?["plainText"] as? String) == "A hill that refuses to be scenery"
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Journal replay from revision-zero checkpoint failed")
        }

        try controller.save()
        try writeJSON([
            "phase": "create",
            "revision": 3,
            "headline": "A hill that refuses to be scenery",
            "interfaceScale": 1.25,
            "artboardZoom": 0.5,
            "nativeSavePanel": true,
            "journalReplayRevision": 3,
            "document": controller.documentURL?.path ?? documentURL.path,
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
            "const result = await deckBridge.undo(); deckWorkbench.renderProjection(result.projection); return result.projection"
        )
        guard let undoneProjection = undone as? [String: Any],
              undoneProjection["revision"] as? Int == 4,
              ((undoneProjection["headline"] as? [String: Any])?["plainText"] as? String) == "Untitled Story"
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Undo after reopen failed")
        }

        try await controller.exportPDF(to: pdfURL)
        try controller.save()
        let negativeResults = try verifyNegativeDocuments(from: documentURL)
        try writeJSON([
            "phase": "reopen",
            "reopenedRevision": 3,
            "reopenedHeadline": reopenedHeadline as Any,
            "undoRevision": 4,
            "undoHeadline": "Untitled Story",
            "pdf": pdfURL.path,
            "corruptJournalFailure": negativeResults.corruptJournal,
            "unsupportedSchemaFailure": negativeResults.unsupportedSchema,
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

        let secondSectionId = UUID().uuidString.lowercased()
        let secondSlideId = UUID().uuidString.lowercased()
        let secondBlockId = UUID().uuidString.lowercased()
        let bodyBlockId = UUID().uuidString.lowercased()
        let rawStory = try await controller.invokeWorkspaceForTracer(
            """
            const richText = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
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

        guard let durableDocumentURL = controller.documentURL else {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Created Story Deck URL is unavailable")
        }
        let replayController = try DeckSessionController()
        _ = try replayController.openDocument(at: durableDocumentURL)
        let replayed = try replayController.query(name: "story.document", params: [:])
        _ = try requireStory(replayed, revision: 8)

        try controller.save()
        try writeJSON([
            "phase": "story-create",
            "revision": 8,
            "sectionIds": [secondSectionId, openingSectionId],
            "openingSlideIds": [openingSlideId, secondSlideId],
            "journalReplayRevision": 8,
            "deckTitle": "The Hill",
            "renamedSectionTitle": "Act II",
            "slideIntent": "editorial-body",
            "bodyBlockId": bodyBlockId,
            "bodyText": "A body block that survives design.",
        ], to: resultURL)
        print("DW-W01 Story create phase passed")
    }

    private static func storyReopenPhase(
        controller: DeckSessionController,
        documentURL: URL,
        resultURL: URL
    ) async throws {
        print("DW-W01 Story reopen phase: document")
        fflush(stdout)
        _ = try controller.openDocument(at: documentURL)
        try await controller.renderCurrentProjection()
        let rawReopened = try await controller.invokeWorkspaceForTracer(
            "return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let reopened = try requireStory(rawReopened, revision: 8)
        guard let sections = reopened["sections"] as? [[String: Any]],
              sections.count == 2,
              let secondSectionId = sections[0]["id"] as? String,
              let openingSectionId = sections[1]["id"] as? String,
              let openingSlides = sections[1]["slides"] as? [[String: Any]],
              openingSlides.count == 2,
              let openingSlideId = openingSlides[0]["id"] as? String,
              let secondSlideId = openingSlides[1]["id"] as? String
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Story ordering did not survive reopen")
        }
        guard reopened["deckTitle"] as? String == "The Hill",
              sections[0]["title"] as? String == "Act II",
              openingSlides[1]["intent"] as? String == "editorial-body",
              let contentBlocks = openingSlides[1]["contentBlocks"] as? [[String: Any]],
              contentBlocks.count == 2,
              let bodyBlockId = contentBlocks[1]["id"] as? String,
              contentBlocks[1]["plainText"] as? String == "A body block that survives design."
        else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Story rename or Slide intent did not survive reopen")
        }

        let rawUndone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let undone = try requireStory(rawUndone, revision: 9)
        try requireStoryOrder(
            undone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )
        guard let undoneSections = undone["sections"] as? [[String: Any]],
              let undoneSlides = undoneSections[1]["slides"] as? [[String: Any]],
              let undoneBlocks = undoneSlides[1]["contentBlocks"] as? [[String: Any]],
              undoneBlocks.count == 1
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Undo did not remove added Content Block")
        }

        let rawRedone = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let redone = try requireStory(rawRedone, revision: 10)
        try requireStoryOrder(
            redone,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId, secondSlideId]]
        )
        guard let redoneSections = redone["sections"] as? [[String: Any]],
              let redoneSlides = redoneSections[1]["slides"] as? [[String: Any]],
              let redoneBlocks = redoneSlides[1]["contentBlocks"] as? [[String: Any]],
              redoneBlocks.count == 2,
              redoneBlocks[1]["id"] as? String == bodyBlockId
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Redo did not restore added Content Block")
        }
        try controller.save()
        try writeJSON([
            "phase": "story-reopen",
            "reopenedRevision": 8,
            "undoRevision": 9,
            "redoRevision": 10,
            "sectionIds": [secondSectionId, openingSectionId],
            "openingSlideIds": [openingSlideId, secondSlideId],
            "deckTitle": "The Hill",
            "renamedSectionTitle": "Act II",
            "slideIntent": "editorial-body",
            "bodyBlockId": bodyBlockId,
            "bodyText": "A body block that survives design.",
        ], to: resultURL)
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

    private static func writeJSON(_ value: [String: Any], to url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url, options: [.atomic])
    }

    private static func verifyNegativeDocuments(from documentURL: URL) throws -> (corruptJournal: String, unsupportedSchema: String) {
        let files = FileManager.default
        let root = documentURL.deletingLastPathComponent()
        let unsupportedURL = root.appendingPathComponent("Unsupported.pitchdeck", isDirectory: true)
        let corruptURL = root.appendingPathComponent("Corrupt.pitchdeck", isDirectory: true)
        try files.copyItem(at: documentURL, to: unsupportedURL)
        try files.copyItem(at: documentURL, to: corruptURL)

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
        guard unsupportedName == "UnsupportedSchema", corruptName == "JournalCorruption" else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Negative document failures were not named correctly")
        }
        return (corruptName, unsupportedName)
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
