import SwiftUI

@main
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
                .task { await PackagedTracer.runIfRequested(controller: controller) }
        }
        .windowStyle(.titleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Deck…") {
                    Task { _ = try? await controller.presentNewDocument() }
                }
                .keyboardShortcut("n")
                Button("Open Deck…") {
                    Task { _ = try? await controller.presentOpenDocument() }
                }
                .keyboardShortcut("o")
                Button("Save") { try? controller.save() }
                    .keyboardShortcut("s")
                    .disabled(!controller.hasDocument)
            }
            CommandGroup(replacing: .undoRedo) {
                Button("Undo") {
                    Task {
                        if let result = try? controller.undo(),
                           let projection = result["projection"] as? [String: Any]
                        {
                            try? await controller.renderCurrentProjection()
                            _ = projection
                        }
                    }
                }
                .keyboardShortcut("z")
                .disabled(!controller.hasDocument)
                Button("Redo") {
                    Task {
                        _ = try? controller.redo()
                        try? await controller.renderCurrentProjection()
                    }
                }
                .keyboardShortcut("z", modifiers: [.command, .shift])
                .disabled(!controller.hasDocument)
            }
            CommandGroup(after: .saveItem) {
                Divider()
                Button("Export Review PDF…") {
                    Task { _ = try? await controller.presentPDFExport() }
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
                Button("New Deck…") { Task { _ = try? await controller.presentNewDocument() } }
                Button("Open…") { Task { _ = try? await controller.presentOpenDocument() } }
                Button("Save") { try? controller.save() }
                    .disabled(!controller.hasDocument)
                Divider().frame(height: 18)
                Text(controller.documentTitle).font(.headline)
                Spacer()
                Text(controller.status).foregroundStyle(.secondary).font(.caption)
                Button("Export PDF…") { Task { _ = try? await controller.presentPDFExport() } }
                    .disabled(!controller.hasDocument)
            }
            .padding(.horizontal, 10)
            .frame(height: 42)
            .background(.bar)

            WorkspaceWebView(controller: controller)
        }
    }
}
