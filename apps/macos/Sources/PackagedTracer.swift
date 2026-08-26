import AppKit
import Darwin
import Foundation

@MainActor
enum PackagedTracer {
    static func runIfRequested(controller: DeckSessionController) async {
        let arguments = CommandLine.arguments
        guard let modeIndex = arguments.firstIndex(where: { $0 == "--tracer-create" || $0 == "--tracer-reopen" }) else {
            return
        }
        do {
            try await controller.waitForTracerWorkspace()
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
            } else {
                guard arguments.count > modeIndex + 3 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "--tracer-reopen requires Deck, PDF and result paths")
                }
                try await reopenPhase(
                    controller: controller,
                    documentURL: URL(fileURLWithPath: arguments[modeIndex + 1]),
                    pdfURL: URL(fileURLWithPath: arguments[modeIndex + 2]),
                    resultURL: URL(fileURLWithPath: arguments[modeIndex + 3])
                )
            }
            fflush(stdout)
            NSApplication.shared.terminate(nil)
        } catch {
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
        let initial = try controller.createDocument(at: documentURL, title: "DW-T00 Tracer")
        try await controller.renderCurrentProjection()
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

        try controller.save()
        try writeJSON([
            "phase": "create",
            "revision": 3,
            "headline": "A hill that refuses to be scenery",
            "interfaceScale": 1.25,
            "artboardZoom": 0.5,
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
        try writeJSON([
            "phase": "reopen",
            "reopenedRevision": 3,
            "reopenedHeadline": reopenedHeadline as Any,
            "undoRevision": 4,
            "undoHeadline": "Untitled Story",
            "pdf": pdfURL.path,
        ], to: resultURL)
        print("DW-T00 tracer reopen phase passed")
    }

    private static func writeJSON(_ value: [String: Any], to url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url, options: [.atomic])
    }
}
