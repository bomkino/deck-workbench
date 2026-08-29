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
    func saveDrafts() async throws -> [String: Any]
    func writeOnePagePDF(to destination: URL) async throws
}

@MainActor
final class DeckSessionController: ObservableObject {
    @Published private(set) var documentTitle = "No Deck open"
    @Published private(set) var documentURL: URL?
    @Published private(set) var status = "Create or open a Deck"
    @Published private(set) var hasDocument = false
    @Published private(set) var canUndo = false
    @Published private(set) var canRedo = false
    @Published var presentedFailure: PresentedWorkbenchFailure?

    @Published private(set) var interfaceScale: Double
    private(set) var artboardZoom: Double = 0.35
    private let kernelURL: URL
    private var kernel: DeckKernelHost
    private var store: PitchDeckDocumentStore?
    private var mediaSession: MediaCatalogSession?
    private var processedMediaCommands: [String: Data] = [:]
    private weak var workspace: WorkspaceProjectionSink?

    init(bundle: Bundle = .main) throws {
        guard let kernelURL = bundle.url(forResource: "deck-kernel", withExtension: "js", subdirectory: "Kernel") else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Bundled Deck kernel is missing")
        }
        self.kernelURL = kernelURL
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

    func createDocument(at url: URL, title: String? = nil) throws -> [String: Any] {
        let resolvedTitle = title ?? url.deletingPathExtension().lastPathComponent
        let candidateKernel = try DeckKernelHost(kernelURL: kernelURL)
        var candidateMedia: MediaCatalogSession?
        let seed: [String: Any] = [
            "deckId": UUID().uuidString.lowercased(),
            "sectionId": UUID().uuidString.lowercased(),
            "slideId": UUID().uuidString.lowercased(),
            "blockId": UUID().uuidString.lowercased(),
            "title": resolvedTitle,
            "initialHeadline": "Untitled Story",
        ]
        let checkpoint = try candidateKernel.createInitialCheckpoint(seed: seed)
        let createdStore = try PitchDeckDocumentStore.create(at: url, checkpoint: checkpoint)
        do {
            try candidateKernel.open(checkpoint: checkpoint)
            let projection = try candidateKernel.query("slide.activeProjection")
            let media = try MediaCatalogSession(
                packageURL: createdStore.packageURL,
                deckId: createdStore.manifest.deckId
            )
            candidateMedia = media
            try activate(
                kernel: candidateKernel,
                store: createdStore,
                mediaSession: media,
                title: resolvedTitle,
                status: "Created \(createdStore.packageURL.lastPathComponent)",
                projection: projection
            )
            return projection
        } catch {
            candidateMedia?.revoke()
            try? createdStore.close()
            throw error
        }
    }

    func openDocument(at url: URL) throws -> [String: Any] {
        let candidateKernel = try DeckKernelHost(kernelURL: kernelURL)
        var candidateMedia: MediaCatalogSession?
        let (openedStore, loaded) = try PitchDeckDocumentStore.open(at: url)
        do {
            try candidateKernel.open(checkpoint: loaded.checkpoint)
            for record in loaded.replayRecords {
                try candidateKernel.replay(record)
            }
            let summary = try candidateKernel.query("deck.summary")
            guard summary["revision"] as? Int == openedStore.currentRevision else {
                throw WorkbenchFailure(name: "JournalCorruption", message: "Kernel replay did not reach durable document revision")
            }
            let projection = try candidateKernel.query("slide.activeProjection")
            let media = try MediaCatalogSession(
                packageURL: openedStore.packageURL,
                deckId: openedStore.manifest.deckId
            )
            candidateMedia = media
            let openedStatus: String
            if loaded.recoveredPreviousCheckpoint {
                openedStatus = "Recovered prior checkpoint and replayed valid journal"
            } else if loaded.repairedJournalHead {
                openedStatus = "Recovered durable journal tail"
            } else {
                openedStatus = "Opened revision \(openedStore.currentRevision)"
            }
            try activate(
                kernel: candidateKernel,
                store: openedStore,
                mediaSession: media,
                title: summary["title"] as? String ?? openedStore.manifest.title,
                status: openedStatus,
                projection: projection
            )
            return projection
        } catch {
            candidateMedia?.revoke()
            try? openedStore.close()
            throw error
        }
    }

    func execute(command: [String: Any]) throws -> [String: Any] {
        guard let store else { throw WorkbenchFailure(name: "KernelUnavailable", message: "No Deck is open") }
        let prepared = try kernel.prepare(command: command)
        if prepared["duplicate"] as? Bool == true {
            let projection = try query(name: "slide.activeProjection", params: [:])
            updateHistoryAvailability(from: projection)
            return [
                "acknowledgement": prepared["acknowledgement"] as Any,
                "projection": projection,
            ]
        }
        _ = try store.appendDurably(prepared: prepared)
        let acknowledgement = try kernel.commit(prepared)
        status = "Revision \(acknowledgement["revision"] as? Int ?? store.currentRevision) durable"
        let projection = try query(name: "slide.activeProjection", params: [:])
        updateHistoryAvailability(from: projection)
        return [
            "acknowledgement": acknowledgement,
            "projection": projection,
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

    func mediaQuery(name: String, params: [String: Any]) async throws -> [String: Any] {
        guard let mediaSession else {
            throw WorkbenchFailure(name: "DocumentUnavailable", message: "No Deck media session is open")
        }
        let paramsJSON = try JSONSerialization.data(withJSONObject: params, options: [.sortedKeys, .withoutEscapingSlashes])
        let result = try Self.decodeObject(try await mediaSession.queryJSON(name: name, paramsJSON: paramsJSON))
        guard self.mediaSession === mediaSession else {
            throw WorkbenchFailure(name: "DocumentUnavailable", message: "The Deck changed while the media query was running")
        }
        return result
    }

    func executeMedia(command: [String: Any]) async throws -> [String: Any] {
        let validated = try validateMediaCommand(command)
        if let duplicate = processedMediaCommands[validated.commandId] {
            return try Self.decodeObject(duplicate)
        }
        guard let mediaSession else {
            throw WorkbenchFailure(name: "DocumentUnavailable", message: "No Deck media session is open")
        }
        let summary = try kernel.query("deck.summary")
        guard let revision = summary["revision"] as? Int else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Deck revision is unavailable")
        }
        guard validated.expectedRevision == revision else {
            throw WorkbenchFailure(
                name: "StaleRevision",
                message: "Expected revision \(revision); received \(validated.expectedRevision)"
            )
        }

        let resultData: Data
        switch validated.type {
        case "media.root.authorize":
            resultData = try await mediaSession.authorizeRootJSON(
                try await presentMediaRoot(title: "Choose Media Folder")
            )
        case "media.root.reconnect":
            resultData = try await mediaSession.reconnectRootJSON(
                rootId: validated.rootId!,
                url: try await presentMediaRoot(title: "Reconnect Media Folder")
            )
        case "media.root.scan":
            resultData = try await mediaSession.scanRootJSON(rootId: validated.rootId!)
        default:
            throw WorkbenchFailure(name: "InvalidCommand", message: "Unknown native media command")
        }
        guard self.mediaSession === mediaSession else {
            throw WorkbenchFailure(name: "DocumentUnavailable", message: "The Deck changed while the media command was running")
        }
        var media = try Self.decodeObject(resultData)
        let catalogRevision = try await mediaSession.catalogRevisionValue()
        guard self.mediaSession === mediaSession else {
            throw WorkbenchFailure(name: "DocumentUnavailable", message: "The Deck changed while the media command was running")
        }
        media["catalogRevision"] = catalogRevision
        let response: [String: Any] = [
            "acknowledgement": [
                "commandId": validated.commandId,
                "revision": revision,
                "status": "completed",
            ],
            "media": media,
            "projection": try kernel.query("slide.activeProjection"),
        ]
        processedMediaCommands[validated.commandId] = try JSONSerialization.data(
            withJSONObject: response,
            options: [.sortedKeys, .withoutEscapingSlashes]
        )
        return response
    }

    func mediaResourceData(nonce: String, assetId: String, profile: String) async throws -> Data {
        guard let mediaSession else {
            throw WorkbenchFailure(name: "StaleMediaSession", message: "This media resource session is no longer active")
        }
        let data = try await mediaSession.resourceData(nonce: nonce, assetId: assetId, profile: profile)
        guard self.mediaSession === mediaSession else {
            throw WorkbenchFailure(name: "StaleMediaSession", message: "This media resource session is no longer active")
        }
        return data
    }

    func save() throws {
        guard let store else { throw WorkbenchFailure(name: "KernelUnavailable", message: "No Deck is open") }
        try store.saveCheckpoint(kernel.serialize())
        status = "Checkpoint saved at revision \(store.currentRevision)"
    }

    func saveFromUser() async throws {
        try await flushWorkspaceDrafts()
        try save()
    }

    func closeDocument() async throws {
        guard hasDocument, let store else { return }
        try await flushWorkspaceDrafts()
        try save()
        try store.close()
        mediaSession?.revoke()
        mediaSession = nil
        processedMediaCommands = [:]
        self.store = nil
        documentURL = nil
        documentTitle = "No Deck open"
        hasDocument = false
        canUndo = false
        canRedo = false
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

    func stepInterfaceScale(_ offset: Int) throws -> [String: Any] {
        guard let currentIndex = Self.interfaceScaleSteps.firstIndex(of: interfaceScale) else {
            throw WorkbenchFailure(name: "InvalidPreferences", message: "Stored Interface Scale is unsupported")
        }
        let nextIndex = min(max(currentIndex + offset, 0), Self.interfaceScaleSteps.count - 1)
        return try setInterfaceScale(Self.interfaceScaleSteps[nextIndex])
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
        try await flushWorkspaceDrafts()
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
        try await flushWorkspaceDrafts()
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
        try await flushWorkspaceDrafts()
        try await workspace.writeOnePagePDF(to: url)
        status = "Exported one-page PDF"
        return url
    }

    func exportPDF(to destination: URL) async throws {
        guard hasDocument, let workspace else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace is not ready for PDF export")
        }
        try await flushWorkspaceDrafts()
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

    private struct ValidatedMediaCommand {
        let commandId: String
        let expectedRevision: Int
        let type: String
        let rootId: String?
    }

    private func validateMediaCommand(_ command: [String: Any]) throws -> ValidatedMediaCommand {
        guard let commandId = command["commandId"] as? String,
              !commandId.isEmpty,
              commandId.count <= 256,
              let expectedRevision = command["expectedRevision"] as? Int,
              expectedRevision >= 0,
              let type = command["type"] as? String,
              ["media.root.authorize", "media.root.reconnect", "media.root.scan"].contains(type),
              let payload = command["payload"] as? [String: Any],
              let source = command["source"] as? [String: Any],
              let sourceKind = source["kind"] as? String,
              ["ui", "keyboard", "cli", "mcp", "migration"].contains(sourceKind),
              let issuedAt = command["issuedAt"] as? String,
              issuedAt.range(
                of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$"#,
                options: .regularExpression
              ) != nil
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Native media command envelope is invalid")
        }
        if let label = source["label"], !(label is String) {
            throw WorkbenchFailure(name: "InvalidCommand", message: "source.label must be a string")
        }
        if type == "media.root.authorize" {
            guard payload.isEmpty else {
                throw WorkbenchFailure(
                    name: "InvalidCommand",
                    message: "media.root.authorize does not accept renderer paths or parameters"
                )
            }
            return ValidatedMediaCommand(
                commandId: commandId,
                expectedRevision: expectedRevision,
                type: type,
                rootId: nil
            )
        }
        guard payload.count == 1,
              let rootId = payload["rootId"] as? String,
              !rootId.isEmpty
        else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "\(type) requires only an opaque rootId")
        }
        return ValidatedMediaCommand(
            commandId: commandId,
            expectedRevision: expectedRevision,
            type: type,
            rootId: rootId
        )
    }

    private func presentMediaRoot(title: String) async throws -> URL {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.folder]
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = false
        panel.resolvesAliases = false
        panel.treatsFilePackagesAsDirectories = false
        panel.title = title
        guard await response(for: panel) == .OK, let url = panel.url else {
            throw WorkbenchFailure(name: "JobCancelled", message: "Media Root selection was cancelled")
        }
        return url
    }

    private static func decodeObject(_ data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Native media response is invalid")
        }
        return value
    }

    private func commitHistory(prepared: [String: Any]) throws -> [String: Any] {
        guard let store else { throw WorkbenchFailure(name: "KernelUnavailable", message: "No Deck is open") }
        _ = try store.appendDurably(prepared: prepared)
        let acknowledgement = try kernel.commit(prepared)
        let projection = try query(name: "slide.activeProjection", params: [:])
        updateHistoryAvailability(from: projection)
        return [
            "acknowledgement": acknowledgement,
            "projection": projection,
        ]
    }

    private func flushWorkspaceDrafts() async throws {
        guard hasDocument else { return }
        guard let workspace else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace is not ready to save Slide drafts")
        }
        let result = try await workspace.saveDrafts()
        guard result["saved"] as? Bool == true else {
            throw WorkbenchFailure(
                name: "UnsavedWorkspaceDraft",
                message: "Save the highlighted Slide draft before leaving this Deck"
            )
        }
    }

    private func activate(
        kernel candidateKernel: DeckKernelHost,
        store candidateStore: PitchDeckDocumentStore,
        mediaSession candidateMediaSession: MediaCatalogSession,
        title: String,
        status candidateStatus: String,
        projection: [String: Any]
    ) throws {
        if let currentStore = store {
            do {
                try currentStore.saveCheckpoint(kernel.serialize())
                try currentStore.close()
            } catch {
                candidateMediaSession.revoke()
                throw error
            }
        }
        mediaSession?.revoke()
        kernel = candidateKernel
        store = candidateStore
        mediaSession = candidateMediaSession
        processedMediaCommands = [:]
        documentURL = candidateStore.packageURL
        documentTitle = title
        hasDocument = true
        status = candidateStatus
        updateHistoryAvailability(from: projection)
    }

    private func updateHistoryAvailability(from projection: [String: Any]) {
        guard let history = projection["history"] as? [String: Any] else {
            canUndo = false
            canRedo = false
            return
        }
        canUndo = history["canUndo"] as? Bool == true
        canRedo = history["canRedo"] as? Bool == true
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
                Task { @MainActor in
                    for attempt in 1...8 {
                        try? await Task.sleep(for: .milliseconds(750))
                        guard panel.isVisible else { return }
                        NSApplication.shared.activate(ignoringOtherApps: true)
                        panel.makeKeyAndOrderFront(nil)
                        Self.postSystemReturnKey()
                        if attempt > 1 {
                            print("DW-T00 native save panel retry \(attempt)")
                            fflush(stdout)
                        }
                    }
                }
            }
        }
    }

    private static func postSystemReturnKey() {
        let source = CGEventSource(stateID: .hidSystemState)
        CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: true)?.post(tap: .cghidEventTap)
        CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: false)?.post(tap: .cghidEventTap)
    }

    static let interfaceScaleSteps: [Double] = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75]
    private static let allowedInterfaceScales = Set(interfaceScaleSteps)
}
