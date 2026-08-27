import SwiftUI

struct DeckWorkbenchApp: App {
    @StateObject private var controller: DeckSessionController

    init() {
        let initializedController: DeckSessionController
        do {
            initializedController = try DeckSessionController()
        } catch {
            fatalError(WorkbenchFailure.unexpected(error).errorDescription ?? "Deck Workbench could not start")
        }
        _controller = StateObject(wrappedValue: initializedController)
    }

    var body: some Scene {
        Window("Deck Workbench", id: "main") {
            WorkbenchRootView(controller: controller)
                .frame(minWidth: 1180, minHeight: 700)
        }
        .windowStyle(.titleBar)
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
                    Task { await controller.perform { try controller.save() } }
                }
                    .keyboardShortcut("s")
                    .disabled(!controller.hasDocument)
                Button("Close Deck") {
                    Task { await controller.perform { try await controller.closeDocument() } }
                }
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
        VStack(spacing: 0) {
            HStack(spacing: 8 * shellScale) {
                Button("New Deck…") { Task { await controller.perform { _ = try await controller.presentNewDocument() } } }
                Button("Open Deck…") { Task { await controller.perform { _ = try await controller.presentOpenDocument() } } }
                Button("Save") { Task { await controller.perform { try controller.save() } } }
                    .disabled(!controller.hasDocument)
                Button("Close Deck") { Task { await controller.perform { try await controller.closeDocument() } } }
                    .disabled(!controller.hasDocument)
                Divider().frame(height: 18 * shellScale)
                Text(controller.documentTitle)
                    .font(.system(size: 13 * shellScale, weight: .semibold))
                    .accessibilityLabel("Document")
                    .accessibilityValue(controller.documentTitle)
                Spacer()
                Text(controller.status)
                    .foregroundStyle(.secondary)
                    .font(.system(size: 11 * shellScale))
                    .accessibilityLabel("Document status")
                    .accessibilityValue(controller.status)
                Button("Export Review PDF…") { Task { await controller.perform { _ = try await controller.presentPDFExport() } } }
                    .disabled(!controller.hasDocument)
            }
            .font(.system(size: 13 * shellScale))
            .padding(.horizontal, 10 * shellScale)
            .padding(.vertical, 6 * shellScale)
            .frame(minHeight: 42 * shellScale)
            .background(.bar)

            WorkspaceWebView(controller: controller)
        }
        .alert(item: $controller.presentedFailure) { presented in
            Alert(
                title: Text("Deck Workbench couldn’t complete the action"),
                message: Text(presented.failure.errorDescription ?? "An unexpected error occurred"),
                dismissButton: .default(Text("OK"))
            )
        }
    }
}
