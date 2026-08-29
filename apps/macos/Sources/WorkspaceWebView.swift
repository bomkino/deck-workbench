import SwiftUI
import WebKit

struct WorkspaceWebView: NSViewRepresentable {
    @ObservedObject var controller: DeckSessionController

    func makeCoordinator() -> BridgeCoordinator {
        BridgeCoordinator(controller: controller)
    }

    func makeNSView(context: Context) -> WKWebView {
        let webView = WorkspaceWebViewFactory.make(coordinator: context.coordinator)
        DispatchQueue.main.async { [weak webView, weak controller] in
            guard let window = webView?.window, let controller else { return }
            WorkbenchWindowCloseGuard.shared.install(on: window, controller: controller)
        }
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        guard let window = webView.window else { return }
        WorkbenchWindowCloseGuard.shared.install(on: window, controller: controller)
    }
}

@MainActor
final class WorkbenchWindowCloseGuard: NSObject {
    static let shared = WorkbenchWindowCloseGuard()

    private weak var window: NSWindow?
    private weak var closeButton: NSButton?
    private weak var originalTarget: AnyObject?
    private var originalAction: Selector?
    private weak var controller: DeckSessionController?
    private var closePending = false

    func install(on window: NSWindow, controller: DeckSessionController) {
        guard self.window !== window else { return }
        restoreOriginalAction()
        guard let button = window.standardWindowButton(.closeButton) else { return }
        self.window = window
        closeButton = button
        originalTarget = button.target
        originalAction = button.action
        self.controller = controller
        button.target = self
        button.action = #selector(requestClose(_:))
    }

    @objc private func requestClose(_ sender: Any?) {
        guard !closePending else { return }
        guard controller?.hasDocument == true else {
            forwardClose()
            return
        }
        closePending = true
        closeButton?.isEnabled = false
        Task { @MainActor [weak self] in
            guard let self, let controller = self.controller else { return }
            do {
                try await controller.closeDocument()
                self.forwardClose()
            } catch {
                self.closePending = false
                self.closeButton?.isEnabled = true
                await controller.perform { throw error }
            }
        }
    }

    private func forwardClose() {
        let window = window
        closePending = false
        closeButton?.isEnabled = true
        restoreOriginalAction()
        window?.performClose(nil)
    }

    private func restoreOriginalAction() {
        if let closeButton, closeButton.target === self {
            closeButton.target = originalTarget
            closeButton.action = originalAction
        }
        window = nil
        closeButton = nil
        originalTarget = nil
        originalAction = nil
        controller = nil
    }
}

@MainActor
enum WorkspaceWebViewFactory {
    static func make(coordinator: BridgeCoordinator) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.isTextInteractionEnabled = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .nonPersistent()
        guard let schemeHandler = try? WorkspaceSchemeHandler() else {
            fatalError("Workspace resources are unavailable")
        }
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "pitchdog-ui")
        configuration.setURLSchemeHandler(
            MediaAssetSchemeHandler(controller: coordinator.mediaController),
            forURLScheme: "pitchdog-asset"
        )
        configuration.userContentController.add(coordinator, name: BridgeContract.messageHandler)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = coordinator
        webView.allowsMagnification = false
        coordinator.attach(webView: webView)
        webView.load(URLRequest(url: URL(string: "pitchdog-ui://app/index.html")!))
        return webView
    }
}
