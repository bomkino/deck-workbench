import SwiftUI
import WebKit

struct WorkspaceWebView: NSViewRepresentable {
    @ObservedObject var controller: DeckSessionController

    func makeCoordinator() -> BridgeCoordinator {
        BridgeCoordinator(controller: controller)
    }

    func makeNSView(context: Context) -> WKWebView {
        WorkspaceWebViewFactory.make(coordinator: context.coordinator)
    }

    func updateNSView(_ webView: WKWebView, context: Context) {}
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
