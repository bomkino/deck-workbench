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
        WindowGroup("Deck Workbench") {
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
                .disabled(!controller.hasDocument)
                Button("Redo") {
                    Task {
                        await controller.perform {
                            _ = try controller.redo()
                            try await controller.renderCurrentProjection()
                        }
                    }
                }
                .keyboardShortcut("z", modifiers: [.command, .shift])
                .disabled(!controller.hasDocument)
            }
            CommandGroup(after: .saveItem) {
                Divider()
                Button("Export Review PDF…") {
                    Task { await controller.perform { _ = try await controller.presentPDFExport() } }
                }
                .keyboardShortcut("e", modifiers: [.command, .shift])
                .disabled(!controller.hasDocument)
            }
        }
    }
}

struct WorkbenchRootView: View {
    @ObservedObject var controller: DeckSessionController

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Button("New Deck…") { Task { await controller.perform { _ = try await controller.presentNewDocument() } } }
                Button("Open…") { Task { await controller.perform { _ = try await controller.presentOpenDocument() } } }
                Button("Save") { Task { await controller.perform { try controller.save() } } }
                    .disabled(!controller.hasDocument)
                Button("Close") { Task { await controller.perform { try await controller.closeDocument() } } }
                    .disabled(!controller.hasDocument)
                Divider().frame(height: 18)
                Text(controller.documentTitle)
                    .font(.headline)
                    .accessibilityLabel("Document")
                    .accessibilityValue(controller.documentTitle)
                Spacer()
                Text(controller.status)
                    .foregroundStyle(.secondary)
                    .font(.caption)
                    .accessibilityLabel("Document status")
                    .accessibilityValue(controller.status)
                Button("Export PDF…") { Task { await controller.perform { _ = try await controller.presentPDFExport() } } }
                    .disabled(!controller.hasDocument)
            }
            .padding(.horizontal, 10)
            .frame(height: 42)
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
