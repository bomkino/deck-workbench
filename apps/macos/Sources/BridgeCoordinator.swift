import Foundation
import PDFKit
import WebKit

@MainActor
final class BridgeCoordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WorkspaceProjectionSink {
    private weak var webView: WKWebView?
    private let controller: DeckSessionController
    private var loadContinuation: CheckedContinuation<Void, Error>?

    init(controller: DeckSessionController) {
        self.controller = controller
        super.init()
        controller.attachWorkspace(self)
    }

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

    func renderProjection(_ projection: [String: Any]) async throws {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        _ = try await webView.callAsyncJavaScript(
            "deckWorkbench.renderProjection(projection)",
            arguments: ["projection": projection],
            in: nil,
            contentWorld: .page
        )
    }

    func writeOnePagePDF(to destination: URL) async throws {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        let rawFrame = try await webView.callAsyncJavaScript(
            "return deckWorkbench.exportFrame()",
            arguments: [:],
            in: nil,
            contentWorld: .page
        )
        guard let frame = rawFrame as? [String: Any],
              let x = frame["x"] as? Double,
              let y = frame["y"] as? Double,
              let width = frame["width"] as? Double,
              let height = frame["height"] as? Double,
              width > 0,
              height > 0
        else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Slide export frame is invalid")
        }
        let expectedRatio = 2576.0 / 1080.0
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
    }

    func invokeForTracer(_ body: String, arguments: [String: Any] = [:]) async throws -> Any? {
        guard let webView else { throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "WebView is unavailable") }
        return try await webView.callAsyncJavaScript(body, arguments: arguments, in: nil, contentWorld: .page)
    }

    private func receive(_ message: WKScriptMessage) async {
        guard message.name == BridgeContract.messageHandler,
              let body = message.body as? [String: Any],
              let requestId = body["requestId"] as? String,
              requestId.count <= 128,
              let rawMethod = body["method"] as? String,
              let method = BridgeMethod(rawValue: rawMethod),
              let payload = body["payload"] as? [String: Any]
        else {
            return
        }
        do {
            let encoded = try JSONSerialization.data(withJSONObject: body)
            guard encoded.count <= 1_048_576 else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Bridge payload exceeds 1 MiB")
            }
            let result = try await handle(method, payload: payload)
            try await respond(requestId: requestId, result: result)
        } catch {
            try? await respond(requestId: requestId, failure: WorkbenchFailure.unexpected(error))
        }
    }

    private func handle(_ method: BridgeMethod, payload: [String: Any]) async throws -> Any {
        switch method {
        case .deckCreate:
            return try await controller.presentNewDocument()
        case .deckOpen:
            return try await controller.presentOpenDocument()
        case .deckQuery:
            guard let name = payload["name"] as? String else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Named query is required")
            }
            return try controller.query(name: name, params: payload["params"] as? [String: Any] ?? [:])
        case .deckExecute:
            guard let command = payload["command"] as? [String: Any] else {
                throw WorkbenchFailure(name: "InvalidCommand", message: "Typed Deck command is required")
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
}
