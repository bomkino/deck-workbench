import AppKit
import SwiftUI

private enum WorkbenchFont {
    static let bodyRegularName = "pd-body-400"
    static let bodySemiboldName = "pd-body-600"
    static let bodyBoldName = "pd-body-700"
    static let phosphorName = "Phosphor"

    static func bodyRegular(size: CGFloat) -> Font {
        .custom(bodyRegularName, fixedSize: size)
    }

    static func requireBundledFaces() {
        let requiredNames = [bodyRegularName, bodySemiboldName, bodyBoldName, phosphorName]
        let missingNames = requiredNames.filter { NSFont(name: $0, size: 12) == nil }
        guard missingNames.isEmpty else {
            fatalError("Deck Workbench is missing bundled fonts: \(missingNames.joined(separator: ", "))")
        }
    }
}

@MainActor
final class WorkbenchAppDelegate: NSObject, NSApplicationDelegate {
    weak var controller: DeckSessionController?
    private var terminationPending = false

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard controller?.hasDocument == true else { return .terminateNow }
        if terminationPending { return .terminateLater }
        terminationPending = true
        Task { @MainActor in
            do {
                try await controller?.closeDocument()
                sender.reply(toApplicationShouldTerminate: true)
            } catch {
                if let controller {
                    await controller.perform { throw error }
                }
                terminationPending = false
                sender.reply(toApplicationShouldTerminate: false)
            }
        }
        return .terminateLater
    }
}

struct DeckWorkbenchApp: App {
    @NSApplicationDelegateAdaptor(WorkbenchAppDelegate.self) private var appDelegate
    @StateObject private var controller: DeckSessionController

    init() {
        WorkbenchFont.requireBundledFaces()
        let initializedController: DeckSessionController
        do {
            initializedController = try DeckSessionController()
        } catch {
            fatalError(WorkbenchFailure.unexpected(error).errorDescription ?? "Deck Workbench could not start")
        }
        _controller = StateObject(wrappedValue: initializedController)
        appDelegate.controller = initializedController
    }

    var body: some Scene {
        Window("Deck Workbench", id: "main") {
            WorkbenchRootView(controller: controller)
                .frame(minWidth: 1180, minHeight: 700)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Deck…") {
                    Task { await controller.perform { _ = try await controller.presentNewDocument() } }
                }
                .keyboardShortcut("n")
                Button("Open Deck…") {
                    Task { await controller.perform { _ = try await controller.presentOpenDocument() } }
                }
                .keyboardShortcut("o")
                Button("Save") {
                    Task { await controller.perform { try await controller.saveFromUser() } }
                }
                    .keyboardShortcut("s")
                    .disabled(!controller.hasDocument)
                Button("Close Deck") {
                    Task { await controller.perform { try await controller.closeDocument() } }
                }
                .keyboardShortcut("w")
                .disabled(!controller.hasDocument)
            }
            CommandGroup(replacing: .undoRedo) {
                Button("Undo") {
                    Task {
                        await controller.perform {
                            _ = try controller.undo()
                            try await controller.renderCurrentProjection()
                        }
                    }
                }
                .keyboardShortcut("z")
                .disabled(!controller.canUndo)
                Button("Redo") {
                    Task {
                        await controller.perform {
                            _ = try controller.redo()
                            try await controller.renderCurrentProjection()
                        }
                    }
                }
                .keyboardShortcut("z", modifiers: [.command, .shift])
                .disabled(!controller.canRedo)
            }
            CommandGroup(after: .saveItem) {
                Divider()
                Button("Export Review PDF…") {
                    Task { await controller.perform { _ = try await controller.presentPDFExport() } }
                }
                .keyboardShortcut("e", modifiers: [.command, .shift])
                .disabled(!controller.hasDocument)
            }
            CommandGroup(after: .toolbar) {
                Divider()
                Menu("Theme") {
                    ForEach(DeckSessionController.themeValues, id: \.self) { value in
                        Button(controller.theme == value
                            ? "\(value.capitalized) ✓"
                            : value.capitalized) {
                            Task { await controller.perform { _ = try controller.setTheme(value) } }
                        }
                    }
                }
                Menu("Interface Scale") {
                    ForEach(DeckSessionController.interfaceScaleSteps, id: \.self) { value in
                        Button(controller.interfaceScale == value
                            ? "\(Int(value * 100))% ✓"
                            : "\(Int(value * 100))%") {
                            Task { await controller.perform { _ = try controller.setInterfaceScale(value) } }
                        }
                    }
                    Divider()
                    Button("Decrease Interface Scale") {
                        Task { await controller.perform { _ = try controller.stepInterfaceScale(-1) } }
                    }
                    .keyboardShortcut("-", modifiers: [.command, .option, .shift])
                    Button("Increase Interface Scale") {
                        Task { await controller.perform { _ = try controller.stepInterfaceScale(1) } }
                    }
                    .keyboardShortcut("=", modifiers: [.command, .option, .shift])
                    Button("Reset Interface Scale") {
                        Task { await controller.perform { _ = try controller.setInterfaceScale(1) } }
                    }
                    .keyboardShortcut("0", modifiers: [.command, .option, .shift])
                }
            }
        }
    }
}

struct WorkbenchRootView: View {
    @ObservedObject var controller: DeckSessionController

    private var shellScale: CGFloat { CGFloat(controller.interfaceScale) }

    var body: some View {
        WorkspaceWebView(controller: controller)
        .font(WorkbenchFont.bodyRegular(size: 14 * shellScale))
        .alert(item: $controller.presentedFailure) { presented in
            Alert(
                title: Text("Deck Workbench couldn’t complete the action"),
                message: Text(presented.failure.errorDescription ?? "An unexpected error occurred"),
                dismissButton: .default(Text("OK"))
            )
        }
    }
}
