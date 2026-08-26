import SwiftUI
import WebKit

struct WorkspaceWebView: NSViewRepresentable {
    @ObservedObject var controller: DeckSessionController

    func makeCoordinator() -> BridgeCoordinator {
        BridgeCoordinator(controller: controller)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.isTextInteractionEnabled = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .nonPersistent()
        guard let schemeHandler = try? WorkspaceSchemeHandler() else {
            fatalError("Workspace resources are unavailable")
        }
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "pitchdog-ui")
        configuration.userContentController.add(context.coordinator, name: BridgeContract.messageHandler)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsMagnification = false
        context.coordinator.attach(webView: webView)
        webView.load(URLRequest(url: URL(string: "pitchdog-ui://app/index.html")!))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {}
}
