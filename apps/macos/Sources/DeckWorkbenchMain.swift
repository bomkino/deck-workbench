import AppKit
import Darwin
import SwiftUI
import WebKit

@main
enum DeckWorkbenchMain {
    @MainActor
    static func main() {
        let isTracer = CommandLine.arguments.contains("--tracer-create")
            || CommandLine.arguments.contains("--tracer-reopen")
        if !isTracer {
            DeckWorkbenchApp.main()
            return
        }

        let application = NSApplication.shared
        let delegate = TracerApplicationDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.accessory)
        application.run()
    }
}

@MainActor
final class TracerApplicationDelegate: NSObject, NSApplicationDelegate {
    private var controller: DeckSessionController?
    private var coordinator: BridgeCoordinator?
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let controller = try DeckSessionController()
            let coordinator = BridgeCoordinator(controller: controller)
            let webView = WorkspaceWebViewFactory.make(coordinator: coordinator)
            let window = NSWindow(
                contentRect: NSRect(x: -2000, y: -2000, width: 1280, height: 800),
                styleMask: [.borderless],
                backing: .buffered,
                defer: false
            )
            window.contentView = webView
            window.orderFront(nil)
            self.controller = controller
            self.coordinator = coordinator
            self.window = window
            Task { await PackagedTracer.runIfRequested(controller: controller) }
        } catch {
            let failure = WorkbenchFailure.unexpected(error)
            fputs("\(failure.name): \(failure.message)\n", stderr)
            fflush(stderr)
            Darwin.exit(1)
        }
    }
}
