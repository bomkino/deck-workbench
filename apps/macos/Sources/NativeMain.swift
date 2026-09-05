import AppKit
import SwiftUI

@main
struct NativeMain {
  @MainActor static func main() {
    if let index = CommandLine.arguments.firstIndex(of: "--native-self-test"),
      CommandLine.arguments.indices.contains(index + 1)
    {
      let app = NSApplication.shared
      let delegate = NativeSelfTestDelegate(
        output: URL(fileURLWithPath: CommandLine.arguments[index + 1], isDirectory: true))
      app.delegate = delegate
      app.setActivationPolicy(.regular)
      withExtendedLifetime(delegate) { app.run() }
    } else {
      NativeWorkbenchApplication.main()
    }
  }
}
@MainActor
final class NativeAppDelegate: NSObject, NSApplicationDelegate {
  weak var controller: NativeWorkbenchController?
  private var pending = false
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard controller?.document != nil else { return .terminateNow }
    guard !pending else { return .terminateLater }
    pending = true
    Task { [weak self] in
      let okay = await self?.controller?.closeForSwitch() ?? true
      self?.pending = false
      sender.reply(toApplicationShouldTerminate: okay)
    }
    return .terminateLater
  }
  func application(_ application: NSApplication, open urls: [URL]) {
    guard let url = urls.first else { return }
    Task { await controller?.open(url) }
  }
}
struct NativeWorkbenchApplication: App {
  @NSApplicationDelegateAdaptor(NativeAppDelegate.self) private var delegate
  @StateObject private var controller: NativeWorkbenchController
  init() {
    do {
      let controller = try NativeWorkbenchController()
      _controller = StateObject(wrappedValue: controller)
      delegate.controller = controller
    } catch {
      let alert = NSAlert()
      alert.messageText = "Workbench could not start"
      alert.informativeText = error.localizedDescription
      alert.runModal()
      fatalError(error.localizedDescription)
    }
  }
  var body: some Scene {
    Window("Workbench", id: "workbench") {
      NativeWorkbenchRoot(controller: controller).onOpenURL { url in
        Task { await controller.open(url) }
      }
    }.defaultSize(width: 1440, height: 900)
      .commands { NativeWorkbenchCommands(controller: controller) }
  }
}
struct NativeWorkbenchCommands: Commands {
  @ObservedObject var controller: NativeWorkbenchController
  @Environment(\.openWindow) private var openWindow
  var body: some Commands {
    CommandGroup(replacing: .newItem) {
      Button("Import Final Copy…") {
        openWindow(id: "workbench")
        controller.importFile()
      }.keyboardShortcut("n")
      Button("Open Deck…") {
        openWindow(id: "workbench")
        controller.openPanel()
      }.keyboardShortcut("o")
      Menu("Open Recent") {
        ForEach(controller.recentDocuments, id: \.path) { url in
          Button(url.deletingPathExtension().lastPathComponent) {
            openWindow(id: "workbench")
            Task { await controller.open(url) }
          }
        }
      }
      Divider()
      Button("Recover Saved Copy…") {
        openWindow(id: "workbench")
        controller.recoverCopy()
      }
    }
    CommandGroup(replacing: .saveItem) {
      Button("Save") { controller.save() }.keyboardShortcut("s").disabled(
        controller.document == nil)
      Button("Export Handoff…") { controller.showExport = true }.keyboardShortcut(
        "e", modifiers: [.command, .shift]
      ).disabled(controller.document == nil || controller.exportRunning)
    }
    CommandGroup(replacing: .undoRedo) {
      Button("Undo") { controller.undo() }.keyboardShortcut("z").disabled(
        controller.document?.history.canUndo != true)
      Button("Redo") { controller.undo(redo: true) }.keyboardShortcut(
        "z", modifiers: [.command, .shift]
      ).disabled(controller.document?.history.canRedo != true)
    }
    CommandGroup(replacing: .appSettings) {
      Button("Settings…") { controller.showSettings = true }.keyboardShortcut(",")
    }
    CommandMenu("Workbench") {
      Button("Curate") { controller.phase = "curate" }.keyboardShortcut("1")
      Button("Assemble") { controller.phase = "assemble" }.keyboardShortcut("2")
      Divider()
      Button("Reveal Focused Media in Finder") { controller.revealFocused() }.keyboardShortcut(
        "r", modifiers: [.command, .shift]
      ).disabled(controller.focusedAssetID == nil)
      Button("Retry Pending Actions") { controller.retryPending() }.disabled(
        controller.failedCommands.isEmpty)
      Button("Save Pending Actions…") { controller.savePending() }.disabled(
        controller.failedCommands.isEmpty)
    }
    CommandGroup(replacing: .help) {
      Button("Keyboard Shortcuts") {
        controller.previewOpen = false
        controller.showShortcuts = true
      }.keyboardShortcut("/")
    }
  }
}
