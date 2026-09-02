import SwiftUI
import WebKit

struct WorkspaceWebView: NSViewRepresentable {
    @ObservedObject var controller: DeckSessionController

    func makeCoordinator() -> BridgeCoordinator {
        BridgeCoordinator(controller: controller)
    }

    func makeNSView(context: Context) -> WorkbenchWebContainer {
        let webView = WorkspaceWebViewFactory.make(coordinator: context.coordinator)
        let container = WorkbenchWebContainer(webView: webView)
        DispatchQueue.main.async { [weak container, weak controller] in
            guard let container, let window = container.window, let controller else { return }
            WorkbenchWindowChrome.configure(window, container: container)
            WorkbenchWindowCloseGuard.shared.install(on: window, controller: controller)
        }
        return container
    }

    func updateNSView(_ container: WorkbenchWebContainer, context: Context) {
        guard let window = container.window else { return }
        WorkbenchWindowChrome.configure(window, container: container)
        WorkbenchWindowCloseGuard.shared.install(on: window, controller: controller)
    }
}

final class WorkbenchWKWebView: WKWebView {
    override var mouseDownCanMoveWindow: Bool { false }
}

final class WorkbenchWebContainer: NSView {
    let webView: WKWebView
    private let dragRegion = WorkbenchWindowDragRegion(frame: .zero)
    private var dragLeadingConstraint: NSLayoutConstraint!

    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        webView.translatesAutoresizingMaskIntoConstraints = false
        dragRegion.translatesAutoresizingMaskIntoConstraints = false
        addSubview(webView)
        addSubview(dragRegion, positioned: .above, relativeTo: webView)
        dragLeadingConstraint = dragRegion.leadingAnchor.constraint(equalTo: leadingAnchor)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: trailingAnchor),
            webView.topAnchor.constraint(equalTo: topAnchor),
            webView.bottomAnchor.constraint(equalTo: bottomAnchor),
            dragLeadingConstraint,
            dragRegion.topAnchor.constraint(equalTo: topAnchor),
            dragRegion.widthAnchor.constraint(equalToConstant: 32),
            dragRegion.heightAnchor.constraint(equalToConstant: 48),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is unavailable")
    }

    override var mouseDownCanMoveWindow: Bool { true }

    func positionDragRegion(at x: CGFloat) {
        dragLeadingConstraint.constant = x
    }
}

@MainActor
enum WorkbenchWindowChrome {
    static func configure(_ window: NSWindow, container: WorkbenchWebContainer) {
        window.styleMask.insert(.fullSizeContentView)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isMovable = true
        window.isMovableByWindowBackground = true
        DispatchQueue.main.async { [weak container] in
            guard let container else { return }
            synchronizeWindowControlInset(for: container)
        }
    }

    static func synchronizeWindowControlInset(for container: WorkbenchWebContainer) {
        guard let window = container.window else { return }
        let buttons = [
            NSWindow.ButtonType.closeButton,
            .miniaturizeButton,
            .zoomButton,
        ].compactMap { window.standardWindowButton($0) }
        guard let occupiedMaxX = buttons
            .map({ container.convert($0.bounds, from: $0).maxX })
            .max()
        else { return }
        let inset = ceil(occupiedMaxX + 12)
        container.positionDragRegion(at: inset)
        container.webView.evaluateJavaScript(
            "document.documentElement.style.setProperty('--macos-window-controls-inset', '\(Int(inset))px');"
        )
    }
}

final class WorkbenchWindowDragRegion: NSView {
    override var acceptsFirstResponder: Bool { false }
    override var mouseDownCanMoveWindow: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

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

        let webView = WorkbenchWKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = coordinator
        webView.uiDelegate = coordinator
        webView.allowsMagnification = false
        coordinator.attach(webView: webView)
        webView.load(URLRequest(url: URL(string: "pitchdog-ui://app/index.html")!))
        return webView
    }
}
