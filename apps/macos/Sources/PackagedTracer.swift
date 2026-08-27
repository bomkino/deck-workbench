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
                guard arguments.count > modeIndex + 3 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "--tracer-story-reopen requires Deck, create-result and reopen-result paths")
                }
                try await storyReopenPhase(
                    controller: controller,
                    documentURL: URL(fileURLWithPath: arguments[modeIndex + 1]),
                    createResultURL: URL(fileURLWithPath: arguments[modeIndex + 2]),
                    resultURL: URL(fileURLWithPath: arguments[modeIndex + 3])
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

        let rawKeyboardJourney = try await controller.invokeWorkspaceForTracer(
            """
            deckWorkbench.renderProjection(
              await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } })
            );
            const findBody = () => [...document.querySelectorAll('#additional-content textarea')]
              .find((field) => field.dataset.blockId === bodyBlockId);
            const waitForRevision = async (expected) => {
              for (let attempt = 0; attempt < 100; attempt += 1) {
                const next = await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } });
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

            return {
              committed, undone, redone,
              focusAfterCommit, focusAfterUndo, focusAfterRedo,
              compositionDefaultPrevented: composing.defaultPrevented,
              dirtyUndoDefaultPrevented: dirtyUndo.defaultPrevented,
              commitDefaultPrevented: commit.defaultPrevented,
              undoDefaultPrevented: undo.defaultPrevented,
              redoDefaultPrevented: redo.defaultPrevented,
              afterCompositionRevision: afterComposition.revision,
              afterDirtyUndoRevision: afterDirtyUndo.revision
            };
            """,
            arguments: ["bodyBlockId": bodyBlockId, "secondSlideId": secondSlideId]
        )
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
        let removed = try requireStory(rawRemoved, revision: 12)
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
        let structurallyRemoved = try requireStory(rawStructurallyRemoved, revision: 14)
        try requireStoryOrder(
            structurallyRemoved,
            sectionIds: [openingSectionId],
            slideIdsBySection: [[openingSlideId]]
        )

        guard let durableDocumentURL = controller.documentURL else {
            throw WorkbenchFailure(name: "MissingAttachment", message: "Created Story Deck URL is unavailable")
        }
        let replayController = try DeckSessionController()
        _ = try replayController.openDocument(at: durableDocumentURL)
        let replayed = try replayController.query(name: "story.document", params: [:])
        _ = try requireStory(replayed, revision: 14)

        let crashRecoveryRevision = try verifyInterruptedManifestRecovery(from: durableDocumentURL, expectedRevision: 14)
        try await controller.closeDocument()
        guard !controller.hasDocument else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Explicit close left the Deck session open")
        }
        try writeJSON([
            "phase": "story-create",
            "revision": 14,
            "sectionIds": [secondSectionId, openingSectionId],
            "openingSlideIds": [openingSlideId, secondSlideId],
            "journalReplayRevision": 14,
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
            "compositionCommitIgnored": true,
            "dirtyUndoReservedForText": true,
            "bodyRemoved": true,
            "removedSectionId": secondSectionId,
            "removedSlideId": secondSlideId,
            "structuralRemoval": true,
            "crashRecoveryRevision": crashRecoveryRevision,
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
              openingSlideIds.count == 2
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
        let reopened = try requireStory(rawReopened, revision: 14)
        try requireStoryOrder(reopened, sectionIds: [openingSectionId], slideIdsBySection: [[openingSlideId]])
        guard reopened["deckTitle"] as? String == "The Hill" else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Deck metadata did not survive structural removal")
        }

        let rawSectionRestored = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sectionRestored = try requireStory(rawSectionRestored, revision: 15)
        try requireStoryOrder(
            sectionRestored,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId]]
        )

        let rawSlideRestored = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let slideRestored = try requireStory(rawSlideRestored, revision: 16)
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
        let contentRestored = try requireStory(rawContentRestored, revision: 17)
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
              restoredParagraphProjection["revision"] as? Int == 17,
              let restoredProjectedBlocks = restoredParagraphProjection["contentBlocks"] as? [[String: Any]],
              restoredProjectedBlocks.count == 2
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Reopened Slide projection omitted restored Story paragraphs")
        }
        try requireParagraphs(in: restoredProjectedBlocks[1], expected: bodyParagraphs)

        let rawOriginalBody = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.undo(); return await deckBridge.query({ name: 'slide.activeProjection', params: { slideId: secondSlideId } })",
            arguments: ["secondSlideId": secondSlideId]
        )
        guard let originalBody = rawOriginalBody as? [String: Any],
              originalBody["revision"] as? Int == 18,
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
              paragraphsRedone["revision"] as? Int == 19,
              let redoneParagraphBlocks = paragraphsRedone["contentBlocks"] as? [[String: Any]],
              redoneParagraphBlocks.count == 2,
              redoneParagraphBlocks[1]["plainText"] as? String == bodyText
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Redo did not restore the multiline body")
        }
        try requireParagraphs(in: redoneParagraphBlocks[1], expected: bodyParagraphs)

        let rawContentRemoved = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let contentRemoved = try requireStory(rawContentRemoved, revision: 20)
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
        let slideRemoved = try requireStory(rawSlideRemoved, revision: 21)
        try requireStoryOrder(
            slideRemoved,
            sectionIds: [secondSectionId, openingSectionId],
            slideIdsBySection: [[], [openingSlideId]]
        )

        let rawSectionRemoved = try await controller.invokeWorkspaceForTracer(
            "await deckBridge.redo(); return await deckBridge.query({ name: 'story.document', params: {} })"
        )
        let sectionRemoved = try requireStory(rawSectionRemoved, revision: 22)
        try requireStoryOrder(sectionRemoved, sectionIds: [openingSectionId], slideIdsBySection: [[openingSlideId]])
        try controller.save()
        try writeJSON([
            "phase": "story-reopen",
            "reopenedRevision": 14,
            "undoSectionRevision": 15,
            "undoSlideRevision": 16,
            "undoContentRevision": 17,
            "undoParagraphUpdateRevision": 18,
            "redoParagraphUpdateRevision": 19,
            "redoContentRevision": 20,
            "redoSlideRevision": 21,
            "redoSectionRevision": 22,
            "sectionIds": [secondSectionId, openingSectionId],
            "openingSlideIds": [openingSlideId, secondSlideId],
            "deckTitle": "The Hill",
            "renamedSectionTitle": "Act II",
            "slideIntent": "editorial-body",
            "bodyBlockId": bodyBlockId,
            "bodyOriginalText": bodyOriginalText,
            "bodyText": bodyText,
            "bodyParagraphs": bodyParagraphs,
            "paragraphsPreservedAfterReopen": true,
            "keyboardFocusRetained": true,
            "bodyRemovedAfterRedo": true,
            "structuralRemovalAfterRedo": true,
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

    private static func verifyInterruptedManifestRecovery(from documentURL: URL, expectedRevision: Int) throws -> Int {
        let files = FileManager.default
        let recoveryURL = documentURL.deletingLastPathComponent()
            .appendingPathComponent("Interrupted-\(UUID().uuidString).pitchdeck", isDirectory: true)
        try files.copyItem(at: documentURL, to: recoveryURL)

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

        let (_, loaded) = try PitchDeckDocumentStore.open(at: recoveryURL)
        guard loaded.repairedJournalHead else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Interrupted manifest head was not repaired")
        }
        let recoveredController = try DeckSessionController()
        let recovered = try recoveredController.openDocument(at: recoveryURL)
        guard recovered["revision"] as? Int == expectedRevision else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Crash recovery did not replay the durable journal tail")
        }
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
