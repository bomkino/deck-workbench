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
            guard let webView, let window = webView.window, let controller else { return }
            WorkbenchWindowChrome.configure(window, webView: webView)
            WorkbenchWindowCloseGuard.shared.install(on: window, controller: controller)
        }
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        guard let window = webView.window else { return }
        WorkbenchWindowChrome.configure(window, webView: webView)
        WorkbenchWindowCloseGuard.shared.install(on: window, controller: controller)
    }
}

@MainActor
enum WorkbenchWindowChrome {
    private static let dragRegionIdentifier = NSUserInterfaceItemIdentifier("dog.pitch.deck-workbench.window-drag-region")
    private static let dragRegionWidth: CGFloat = 32
    private static let toolbarHeight: CGFloat = 48

    static func configure(_ window: NSWindow, webView: WKWebView) {
        window.styleMask.insert(.fullSizeContentView)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isMovable = true
        window.isMovableByWindowBackground = false
        DispatchQueue.main.async { [weak webView] in
            guard let webView else { return }
            synchronizeWindowControlInset(for: webView)
        }
    }

    static func synchronizeWindowControlInset(for webView: WKWebView) {
        guard let window = webView.window else { return }
        let buttons = [
            NSWindow.ButtonType.closeButton,
            .miniaturizeButton,
            .zoomButton,
        ].compactMap { window.standardWindowButton($0) }
        guard let occupiedMaxX = buttons
            .map({ $0.convert($0.bounds, to: nil).maxX })
            .max()
        else { return }
        let inset = ceil(occupiedMaxX + 12)
        installDragRegion(in: window, x: inset)
        webView.evaluateJavaScript(
            "document.documentElement.style.setProperty('--macos-window-controls-inset', '\(Int(inset))px');"
        )
    }

    private static func installDragRegion(in window: NSWindow, x: CGFloat) {
        guard let contentView = window.contentView else { return }
        let dragRegion = contentView.subviews
            .first(where: { $0.identifier == dragRegionIdentifier }) as? WorkbenchWindowDragRegion
            ?? WorkbenchWindowDragRegion(frame: .zero)
        dragRegion.identifier = dragRegionIdentifier
        dragRegion.frame = NSRect(
            x: x,
            y: contentView.bounds.maxY - toolbarHeight,
            width: dragRegionWidth,
            height: toolbarHeight
        )
        dragRegion.autoresizingMask = [.minYMargin]
        if dragRegion.superview == nil {
            contentView.addSubview(dragRegion, positioned: .above, relativeTo: nil)
        }
    }
}

final class WorkbenchWindowDragRegion: NSView {
    override var acceptsFirstResponder: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }

    override func accessibilityIsIgnored() -> Bool { true }
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
        configuration.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.dataset.workspaceHost = 'macos';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = coordinator
        webView.uiDelegate = coordinator
        webView.allowsMagnification = false
        coordinator.attach(webView: webView)
        webView.load(URLRequest(url: URL(string: "pitchdog-ui://app/index.html")!))
        return webView
    }
}
