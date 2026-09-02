import AppKit
import Foundation
import PDFKit
import UniformTypeIdentifiers
import WebKit

@MainActor
final class BridgeCoordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, WorkspaceProjectionSink {
    private weak var webView: WKWebView?
    private let controller: DeckSessionController
    private var loadContinuation: CheckedContinuation<Void, Error>?
    private let tracerMode = CommandLine.arguments.contains { $0.hasPrefix("--tracer-") }

    init(controller: DeckSessionController) {
        self.controller = controller
        super.init()
        controller.attachWorkspace(self)
    }

    var mediaController: DeckSessionController { controller }

    func attach(webView: WKWebView) {
        self.webView = webView
    }

    func waitUntilLoaded() async throws {
        if webView?.isLoading == false, webView?.url != nil { return }
        try await withCheckedThrowingContinuation { continuation in
            loadContinuation = continuation
        }
    }

    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        Task { @MainActor in
            await receive(message)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadContinuation?.resume()
        loadContinuation = nil
        Task { await controller.workspaceBecameReady() }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let allowed = navigationAction.request.url?.scheme == "pitchdog-ui"
        decisionHandler(allowed ? .allow : .cancel)
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.title = "Choose Workbench Markdown"
        panel.prompt = "Choose"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [UTType(filenameExtension: "md", conformingTo: .plainText) ?? .plainText]
        let complete: (NSApplication.ModalResponse) -> Void = { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
        if let window = webView.window {
            panel.beginSheetModal(for: window, completionHandler: complete)
        } else {
            panel.begin(completionHandler: complete)
        }
    }

    func renderProjection(_ projection: [String: Any]) async throws {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        _ = try await webView.callAsyncJavaScript(
            "deckWorkbench.renderProjection(projection)",
            arguments: ["projection": projection],
            in: nil,
            contentWorld: .page
        )
    }

    func clearProjection() async throws {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        _ = try await webView.callAsyncJavaScript(
            "deckWorkbench.clearProjection()",
            arguments: [:],
            in: nil,
            contentWorld: .page
        )
    }

    func saveDrafts() async throws -> [String: Any] {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        let raw = try await webView.callAsyncJavaScript(
            "return await deckWorkbench.saveDrafts()",
            arguments: [:],
            in: nil,
            contentWorld: .page
        )
        guard let result = raw as? [String: Any] else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace draft result is invalid")
        }
        return result
    }

    func draftSummary() async throws -> [String: Any] {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        let raw = try await webView.callAsyncJavaScript(
            "return deckWorkbench.draftSummary()",
            arguments: [:],
            in: nil,
            contentWorld: .page
        )
        guard let result = raw as? [String: Any] else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace draft summary is invalid")
        }
        return result
    }

    func writeOnePagePDF(to destination: URL) async throws {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        let rawFrame = try await webView.callAsyncJavaScript(
            "return await deckWorkbench.exportFrame()",
            arguments: [:],
            in: nil,
            contentWorld: .page
        )
        if let frame = rawFrame as? [String: Any],
           let errorName = frame["error"] as? String
        {
            if errorName == "CompositionOverflow" {
                let count = frame["overflowCount"] as? Int ?? 1
                throw WorkbenchFailure(name: errorName, message: "\(count) authored element(s) exceed the composition frame")
            }
            if errorName == "ExportBusy" {
                throw WorkbenchFailure(name: errorName, message: "Another PDF export is already in progress")
            }
            if errorName == "ExportStale" {
                throw WorkbenchFailure(name: errorName, message: "The active Slide changed while preparing export")
            }
            if errorName == "AssemblyUnavailable" || errorName == "AssemblyMediaUnavailable" {
                let message = frame["message"] as? String ?? "The active Slide Assembly is unavailable for export"
                throw WorkbenchFailure(name: errorName, message: message)
            }
        }
        guard let frame = rawFrame as? [String: Any],
              let token = frame["token"] as? String,
              !token.isEmpty,
              let x = frame["x"] as? Double,
              let y = frame["y"] as? Double,
              let width = frame["width"] as? Double,
              let height = frame["height"] as? Double,
              let canvasWidth = frame["canvasWidth"] as? Double,
              let canvasHeight = frame["canvasHeight"] as? Double,
              width > 0,
              height > 0,
              canvasWidth > 0,
              canvasHeight > 0
        else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Slide export frame is invalid")
        }
        let finishExport = {
            let rawCleanup = try await webView.callAsyncJavaScript(
                "return deckWorkbench.finishExport(token)",
                arguments: ["token": token],
                in: nil,
                contentWorld: .page
            )
            guard let cleanup = rawCleanup as? [String: Any], cleanup["finished"] as? Bool == true else {
                throw WorkbenchFailure(name: "ExportCleanupFailed", message: "Workspace export session did not close")
            }
        }
        do {
            let expectedRatio = canvasWidth / canvasHeight
            guard abs((width / height) - expectedRatio) < 0.02 else {
                throw WorkbenchFailure(name: "UnsupportedExportEffect", message: "Slide projection does not match selected canvas ratio")
            }
            let configuration = WKPDFConfiguration()
            configuration.rect = CGRect(x: x, y: y, width: width, height: height)
            let data: Data = try await withCheckedThrowingContinuation { continuation in
                webView.createPDF(configuration: configuration) { result in
                    continuation.resume(with: result)
                }
            }
            guard let document = PDFDocument(data: data), document.pageCount == 1 else {
                throw WorkbenchFailure(name: "UnsupportedExportEffect", message: "PDF output is not a parseable one-page document")
            }
            do {
                try data.write(to: destination, options: [.atomic])
            } catch {
                throw WorkbenchFailure(name: "ExportDestinationDenied", message: error.localizedDescription)
            }
        } catch {
            let operationFailure = error
            do {
                try await finishExport()
            } catch {
                let cleanupFailure = WorkbenchFailure.unexpected(error)
                let primaryFailure = WorkbenchFailure.unexpected(operationFailure)
                throw WorkbenchFailure(
                    name: "ExportCleanupFailed",
                    message: "\(primaryFailure.name) failed and workspace cleanup also failed as \(cleanupFailure.name)"
                )
            }
            throw operationFailure
        }
        try await finishExport()
    }

    func invokeForTracer(_ body: String, arguments: [String: Any] = [:]) async throws -> Any? {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        guard let window = webView.window else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Tracer WebView is not attached to a window")
        }
        window.makeKeyAndOrderFront(nil)
        guard window.makeFirstResponder(webView) else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Tracer WebView could not become first responder")
        }
        do {
            return try await webView.callAsyncJavaScript(body, arguments: arguments, in: nil, contentWorld: .page)
        } catch {
            let failure = error as NSError
            let message = failure.userInfo["WKJavaScriptExceptionMessage"] as? String
                ?? failure.userInfo[NSLocalizedDescriptionKey] as? String
                ?? error.localizedDescription
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Tracer JavaScript failed: \(message)")
        }
    }

    private func receive(_ message: WKScriptMessage) async {
        guard message.name == BridgeContract.messageHandler,
              let body = message.body as? [String: Any],
              let requestId = body["requestId"] as? String,
              requestId.count <= 128
        else {
            return
        }
        guard let rawMethod = body["method"] as? String,
              let method = BridgeMethod(rawValue: rawMethod),
              let payload = body["payload"] as? [String: Any]
        else {
            trace("bridge malformed \(requestId)")
            try? await respond(
                requestId: requestId,
                failure: WorkbenchFailure(name: "InvalidCommand", message: "Unknown or malformed bridge method")
            )
            return
        }
        trace("bridge receive \(method.rawValue) \(requestId)")
        do {
            let encoded = try JSONSerialization.data(withJSONObject: body)
            guard encoded.count <= 1_048_576 else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Bridge payload exceeds 1 MiB")
            }
            let result = try await handle(method, payload: payload)
            trace("bridge handled \(method.rawValue) \(requestId)")
            try await respond(requestId: requestId, result: result)
            trace("bridge responded \(method.rawValue) \(requestId)")
        } catch {
            let failure = WorkbenchFailure.unexpected(error)
            trace("bridge failed \(method.rawValue) \(requestId): \(failure.name) \(failure.message)")
            try? await respond(requestId: requestId, failure: failure)
        }
    }

    private func handle(_ method: BridgeMethod, payload: [String: Any]) async throws -> Any {
        switch method {
        case .deckCreate:
            if let writingImport = payload["writingImport"] {
                guard payload.count == 1 else {
                    throw WorkbenchFailure(name: "InvalidCommand", message: "deck.create writingImport accepts no other fields")
                }
                return try await controller.presentWritingImport(writingImport)
            }
            guard payload.isEmpty else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "deck.create accepts only optional writingImport")
            }
            return try await controller.presentNewDocument()
        case .deckOpen:
            return try await controller.presentOpenDocument()
        case .deckQuery:
            guard let name = payload["name"] as? String else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Named query is required")
            }
            trace("bridge query \(name)")
            if name == "media.roots" || name == "media.assets" {
                return try await controller.mediaQuery(
                    name: name,
                    params: payload["params"] as? [String: Any] ?? [:]
                )
            }
            return try controller.query(name: name, params: payload["params"] as? [String: Any] ?? [:])
        case .deckExecute:
            guard let command = payload["command"] as? [String: Any] else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Typed Deck command is required")
            }
            trace("bridge execute \(command["type"] as? String ?? "unknown")")
            if let type = command["type"] as? String, type.hasPrefix("media.") {
                return try await controller.executeMedia(command: command)
            }
            return try controller.execute(command: command)
        case .deckUndo:
            return try controller.undo()
        case .deckRedo:
            return try controller.redo()
        case .deckExportPDF:
            return ["url": try await controller.presentPDFExport().path]
        case .uiGetPreferences:
            return controller.preferences()
        case .uiCopyText:
            guard payload.count == 1, let text = payload["text"] as? String else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "ui.copyText requires only a text string")
            }
            return try controller.copyText(text)
        case .uiSetTheme:
            guard let value = payload["value"] as? String else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Theme value is required")
            }
            return try controller.setTheme(value)
        case .uiSetInterfaceScale:
            guard let value = payload["value"] as? Double else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Interface Scale value is required")
            }
            return try controller.setInterfaceScale(value)
        case .uiSetArtboardZoom:
            guard let value = payload["value"] as? Double else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Artboard zoom value is required")
            }
            return try controller.setArtboardZoom(value)
        }
    }

    private func respond(requestId: String, result: Any) async throws {
        try await sendResponse(["requestId": requestId, "ok": true, "result": result])
    }

    private func respond(requestId: String, failure: WorkbenchFailure) async throws {
        try await sendResponse([
            "requestId": requestId,
            "ok": false,
            "error": ["name": failure.name, "message": failure.message],
        ])
    }

    private func sendResponse(_ response: [String: Any]) async throws {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        _ = try await webView.callAsyncJavaScript(
            "__deckBridgeReceive(response)",
            arguments: ["response": response],
            in: nil,
            contentWorld: .page
        )
    }

    private func trace(_ message: String) {
        guard tracerMode else { return }
        fputs("DW-BRIDGE \(message)\n", stderr)
        fflush(stderr)
    }
}
