import AppKit
import SwiftUI

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

private struct AdaptiveToolbarLabelStyle: LabelStyle {
    let compact: Bool

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: compact ? 0 : 6) {
            configuration.icon
            if !compact {
                configuration.title
            }
        }
    }
}

struct WorkbenchRootView: View {
    @ObservedObject var controller: DeckSessionController

    private var shellScale: CGFloat { CGFloat(controller.interfaceScale) }
    private var toolbarHeight: CGFloat { max(44, 54 * shellScale) }
    private var toolbarSpacing: CGFloat { 12 * shellScale }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: toolbarSpacing) {
                Button {
                    Task { await controller.perform { _ = try await controller.presentNewDocument() } }
                } label: {
                    Label("New Deck…", systemImage: "rectangle.stack.badge.plus")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .help("Create a new Deck")
                .accessibilityLabel("New Deck")

                Button {
                    Task { await controller.perform { _ = try await controller.presentOpenDocument() } }
                } label: {
                    Label("Open Deck…", systemImage: "folder")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .help("Open a Deck")
                .accessibilityLabel("Open Deck")

                Button {
                    Task { await controller.perform { try await controller.saveFromUser() } }
                } label: {
                    Label("Save", systemImage: "square.and.arrow.down")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(!controller.hasDocument)
                .help("Save the current Deck")
                .accessibilityLabel("Save Deck")

                Button {
                    Task { await controller.perform { try await controller.closeDocument() } }
                } label: {
                    Label("Close Deck", systemImage: "xmark.square")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(!controller.hasDocument)
                .help("Close the current Deck")
                .accessibilityLabel("Close Deck")

                Divider()
                    .frame(height: 24 * shellScale)

                VStack(alignment: .leading, spacing: 2 * shellScale) {
                    Text("DECK")
                        .font(.system(size: 9 * shellScale, weight: .bold))
                        .tracking(1.2 * shellScale)
                        .foregroundStyle(.secondary)
                    Text(controller.documentTitle)
                        .font(.system(size: 15 * shellScale, weight: .bold))
                        .lineLimit(1)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Document")
                .accessibilityValue(controller.documentTitle)

                Spacer(minLength: 16 * shellScale)

                Text(controller.status)
                    .foregroundStyle(.secondary)
                    .font(.system(size: 12 * shellScale, weight: .medium))
                    .lineLimit(1)
                    .accessibilityLabel("Document status")
                    .accessibilityValue(controller.status)
                    .accessibilityAddTraits(.updatesFrequently)

                Button {
                    Task { await controller.perform { _ = try await controller.presentPDFExport() } }
                } label: {
                    Label("Export Review PDF…", systemImage: "arrow.up.doc")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(!controller.hasDocument)
                .help("Export the active Slide as a review PDF")
                .accessibilityLabel("Export active Slide review PDF")
            }
            .buttonStyle(.bordered)
            .labelStyle(AdaptiveToolbarLabelStyle(compact: shellScale >= 1.5))
            .controlSize(.large)
            .font(.system(size: 14 * shellScale, weight: .semibold))
            .padding(.horizontal, 16 * shellScale)
            .padding(.vertical, 9 * shellScale)
            .frame(minHeight: toolbarHeight)
            .background(Color(nsColor: .windowBackgroundColor))

            Divider()

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
