import AppKit
import Combine
import Foundation
import UniformTypeIdentifiers

extension UTType {
    static let pitchDeckPackage = UTType(exportedAs: "dog.pitch.deck", conformingTo: .package)
}

@MainActor
protocol WorkspaceProjectionSink: AnyObject {
    func renderProjection(_ projection: [String: Any]) async throws
    func clearProjection() async throws
    func writeOnePagePDF(to destination: URL) async throws
}

@MainActor
final class DeckSessionController: ObservableObject {
    @Published private(set) var documentTitle = "No Deck open"
    @Published private(set) var documentURL: URL?
    @Published private(set) var status = "Create or open a Deck"
    @Published private(set) var hasDocument = false
    @Published var presentedFailure: PresentedWorkbenchFailure?

    private(set) var interfaceScale: Double
    private(set) var artboardZoom: Double = 0.35
    private let kernel: DeckKernelHost
    private var store: PitchDeckDocumentStore?
    private weak var workspace: WorkspaceProjectionSink?

    init(bundle: Bundle = .main) throws {
        guard let kernelURL = bundle.url(forResource: "deck-kernel", withExtension: "js", subdirectory: "Kernel") else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Bundled Deck kernel is missing")
        }
        kernel = try DeckKernelHost(kernelURL: kernelURL)
        let storedScale = UserDefaults.standard.double(forKey: "interfaceScale")
        interfaceScale = Self.allowedInterfaceScales.contains(storedScale) ? storedScale : 1
    }

    func attachWorkspace(_ sink: WorkspaceProjectionSink) {
        workspace = sink
    }

    func perform(_ operation: () async throws -> Void) async {
        do {
            try await operation()
        } catch {
            let failure = WorkbenchFailure.unexpected(error)
            guard failure.name != "JobCancelled" else { return }
            status = failure.errorDescription ?? "The action failed"
            presentedFailure = PresentedWorkbenchFailure(failure: failure)
        }
    }

    func dismissPresentedFailure() {
        presentedFailure = nil
    }

    func workspaceBecameReady() async {
        guard hasDocument else { return }
        do {
            try await renderCurrentProjection()
        } catch {
            status = WorkbenchFailure.unexpected(error).errorDescription ?? "Workspace unavailable"
        }
    }

    func createDocument(at url: URL, title: String = "Tracer Deck") throws -> [String: Any] {
        let seed: [String: Any] = [
            "deckId": UUID().uuidString.lowercased(),
            "sectionId": UUID().uuidString.lowercased(),
            "slideId": UUID().uuidString.lowercased(),
            "blockId": UUID().uuidString.lowercased(),
            "title": title,
            "initialHeadline": "Untitled Story",
        ]
        let checkpoint = try kernel.createInitialCheckpoint(seed: seed)
        let createdStore = try PitchDeckDocumentStore.create(at: url, checkpoint: checkpoint)
        try kernel.open(checkpoint: checkpoint)
        store = createdStore
        documentURL = createdStore.packageURL
        documentTitle = title
        hasDocument = true
        status = "Created \(createdStore.packageURL.lastPathComponent)"
        return try query(name: "slide.activeProjection", params: [:])
    }

    func openDocument(at url: URL) throws -> [String: Any] {
        let (openedStore, loaded) = try PitchDeckDocumentStore.open(at: url)
        try kernel.open(checkpoint: loaded.checkpoint)
        for record in loaded.replayRecords {
            try kernel.replay(record)
        }
        let summary = try kernel.query("deck.summary")
        guard summary["revision"] as? Int == openedStore.currentRevision else {
            throw WorkbenchFailure(name: "JournalCorruption", message: "Kernel replay did not reach durable document revision")
        }
        store = openedStore
        documentURL = openedStore.packageURL
        documentTitle = summary["title"] as? String ?? openedStore.manifest.title
        hasDocument = true
        if loaded.recoveredPreviousCheckpoint {
            status = "Recovered prior checkpoint and replayed valid journal"
        } else if loaded.repairedJournalHead {
            status = "Recovered durable journal tail"
        } else {
            status = "Opened revision \(openedStore.currentRevision)"
        }
        return try query(name: "slide.activeProjection", params: [:])
    }

    func execute(command: [String: Any]) throws -> [String: Any] {
        guard let store else { throw WorkbenchFailure(name: "KernelUnavailable", message: "No Deck is open") }
        let prepared = try kernel.prepare(command: command)
        if prepared["duplicate"] as? Bool == true {
            return [
                "acknowledgement": prepared["acknowledgement"] as Any,
                "projection": try query(name: "slide.activeProjection", params: [:]),
            ]
        }
        _ = try store.appendDurably(prepared: prepared)
        let acknowledgement = try kernel.commit(prepared)
        status = "Revision \(acknowledgement["revision"] as? Int ?? store.currentRevision) durable"
        return [
            "acknowledgement": acknowledgement,
            "projection": try query(name: "slide.activeProjection", params: [:]),
        ]
    }

    func undo() throws -> [String: Any] {
        try commitHistory(prepared: kernel.prepareUndo())
    }

    func redo() throws -> [String: Any] {
        try commitHistory(prepared: kernel.prepareRedo())
    }

    func query(name: String, params: [String: Any]) throws -> [String: Any] {
        guard hasDocument else { throw WorkbenchFailure(name: "KernelUnavailable", message: "No Deck is open") }
        return try kernel.query(name, params: params)
    }

    func save() throws {
        guard let store else { throw WorkbenchFailure(name: "KernelUnavailable", message: "No Deck is open") }
        try store.saveCheckpoint(kernel.serialize())
        status = "Checkpoint saved at revision \(store.currentRevision)"
    }

    func closeDocument() async throws {
        guard hasDocument else { return }
        try save()
        store = nil
        documentURL = nil
        documentTitle = "No Deck open"
        hasDocument = false
        status = "Deck closed"
        try await workspace?.clearProjection()
    }

    func setInterfaceScale(_ value: Double) throws -> [String: Any] {
        guard Self.allowedInterfaceScales.contains(value) else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Interface Scale must use an allowed step")
        }
        interfaceScale = value
        UserDefaults.standard.set(value, forKey: "interfaceScale")
        return preferences()
    }

    func setArtboardZoom(_ value: Double) throws -> [String: Any] {
        guard value >= 0.1, value <= 4 else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Artboard zoom must be between 10% and 400%")
        }
        artboardZoom = value
        return preferences()
    }

    func preferences() -> [String: Any] {
        ["interfaceScale": interfaceScale, "artboardZoom": artboardZoom]
    }

    func presentNewDocument(tracerDestination: URL? = nil) async throws -> [String: Any] {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.pitchDeckPackage]
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.nameFieldStringValue = "Untitled.pitchdeck"
        panel.title = "Create Deck"
        if let tracerDestination {
            panel.directoryURL = tracerDestination.deletingLastPathComponent()
            panel.nameFieldStringValue = tracerDestination.lastPathComponent
        }
        guard await response(for: panel, tracerDestination: tracerDestination) == .OK, let url = panel.url else {
            throw WorkbenchFailure(name: "JobCancelled", message: "Deck creation was cancelled")
        }
        let projection = try createDocument(at: url)
        try await workspace?.renderProjection(projection)
        return projection
    }

    func presentOpenDocument() async throws -> [String: Any] {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.pitchDeckPackage]
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        panel.title = "Open Deck"
        guard await response(for: panel) == .OK, let url = panel.url else {
            throw WorkbenchFailure(name: "JobCancelled", message: "Open was cancelled")
        }
        let projection = try openDocument(at: url)
        try await workspace?.renderProjection(projection)
        return projection
    }

    func presentPDFExport() async throws -> URL {
        guard hasDocument, let workspace else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace is not ready for PDF export")
        }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.pdf]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = "\(documentTitle).pdf"
        panel.title = "Export Review PDF"
        guard await response(for: panel) == .OK, let url = panel.url else {
            throw WorkbenchFailure(name: "JobCancelled", message: "PDF export was cancelled")
        }
        try await workspace.writeOnePagePDF(to: url)
        status = "Exported one-page PDF"
        return url
    }

    func exportPDF(to destination: URL) async throws {
        guard hasDocument, let workspace else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace is not ready for PDF export")
        }
        try await workspace.writeOnePagePDF(to: destination)
        status = "Exported one-page PDF"
    }

    func renderCurrentProjection() async throws {
        guard let workspace else { return }
        try await workspace.renderProjection(try query(name: "slide.activeProjection", params: [:]))
    }

    func waitForTracerWorkspace() async throws {
        guard let coordinator = workspace as? BridgeCoordinator else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Typed workspace bridge is not attached")
        }
        try await coordinator.waitUntilLoaded()
    }

    func invokeWorkspaceForTracer(_ body: String, arguments: [String: Any] = [:]) async throws -> Any? {
        guard let coordinator = workspace as? BridgeCoordinator else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Typed workspace bridge is not attached")
        }
        return try await coordinator.invokeForTracer(body, arguments: arguments)
    }

    private func commitHistory(prepared: [String: Any]) throws -> [String: Any] {
        guard let store else { throw WorkbenchFailure(name: "KernelUnavailable", message: "No Deck is open") }
        _ = try store.appendDurably(prepared: prepared)
        let acknowledgement = try kernel.commit(prepared)
        return [
            "acknowledgement": acknowledgement,
            "projection": try query(name: "slide.activeProjection", params: [:]),
        ]
    }

    private func response(
        for panel: NSSavePanel,
        tracerDestination: URL? = nil
    ) async -> NSApplication.ModalResponse {
        await withCheckedContinuation { continuation in
            NSApplication.shared.activate(ignoringOtherApps: true)
            panel.begin { continuation.resume(returning: $0) }
            if tracerDestination != nil {
                print("DW-T00 native save panel presented")
                fflush(stdout)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) {
                    panel.makeKeyAndOrderFront(nil)
                    Self.postSystemReturnKey()
                }
            }
        }
    }

    private static func postSystemReturnKey() {
        let source = CGEventSource(stateID: .hidSystemState)
        CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: true)?.post(tap: .cghidEventTap)
        CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: false)?.post(tap: .cghidEventTap)
    }

    private static let allowedInterfaceScales: Set<Double> = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75]
}
