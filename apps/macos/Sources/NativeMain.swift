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
    guard controller?.document != nil || controller?.lifecycleBusy == true else { return .terminateNow }
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
      Button("Paste Final Copy") { openWindow(id: "workbench"); controller.pasteCopy() }.keyboardShortcut("v", modifiers: [.command, .shift])
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
      ).disabled(!controller.canExport)
    }
    CommandGroup(replacing: .undoRedo) {
      Button("Undo") { controller.undo() }.keyboardShortcut("z").disabled(controller.document == nil)
      Button("Redo") { controller.undo(redo: true) }.keyboardShortcut(
        "z", modifiers: [.command, .shift]
      ).disabled(controller.document == nil)
    }
    CommandGroup(replacing: .appSettings) {
      Button("Settings…") { controller.showSettings = true }.keyboardShortcut(",")
    }
    CommandMenu("Slide") {
      Button("Add Slide") { controller.addSlide() }.keyboardShortcut("n", modifiers: [.command, .shift])
        .disabled(!controller.slideEditingAvailable)
      Button("Duplicate Slide") { controller.duplicateSlide() }.keyboardShortcut("d")
        .disabled(!controller.slideEditingAvailable)
      Button("Rename Slide…") { controller.renameSlide() }.disabled(!controller.slideEditingAvailable)
      Button("Edit Copy…") { controller.beginEditCopy() }.keyboardShortcut("e")
        .disabled(!controller.slideEditingAvailable)
      Divider()
      Menu("Layout") {
        ForEach(NativeLayoutChoice.all) { choice in
          Button(choice.name) { controller.chooseLayout(choice.id) }
        }
      }.disabled(!controller.slideEditingAvailable)
      Button("Move Earlier") { controller.reorderSlide(-1) }.keyboardShortcut(.upArrow, modifiers: [.command, .option])
        .disabled(!controller.slideEditingAvailable || !controller.canReorderSlide(controller.selectedSlideID, by: -1))
      Button("Move Later") { controller.reorderSlide(1) }.keyboardShortcut(.downArrow, modifiers: [.command, .option])
        .disabled(!controller.slideEditingAvailable || !controller.canReorderSlide(controller.selectedSlideID, by: 1))
      Divider()
      Button("Delete Slide…", role: .destructive) { controller.removeSlide() }
        .keyboardShortcut(.delete, modifiers: [.command, .shift])
        .disabled(!controller.slideEditingAvailable || controller.slides.count <= 1)
    }
    CommandMenu("Workbench") {
      Button("Curate") { controller.phase = "curate" }.keyboardShortcut("1")
      Button("Assemble") { controller.phase = "assemble" }.keyboardShortcut("2")
      Button("Search media") { controller.searchMedia() }.keyboardShortcut("f")
      Button("Show / Hide context panel") { controller.showContext.toggle() }.keyboardShortcut("i", modifiers: [.command, .option])
      Button("Fit canvas") { controller.fitCanvas() }.keyboardShortcut("0")
      Button("Review deck") { controller.startCleanPreview() }.keyboardShortcut("p", modifiers: [.command, .shift])
      Divider()
      Button("Reveal Focused Media in Finder") { controller.revealFocused() }.keyboardShortcut(
        "r", modifiers: [.command, .shift]
      ).disabled(controller.focusedAssetID == nil)
      Button("Retry Pending Actions") { controller.retryPending() }.disabled(
        controller.failedCommands.isEmpty)
      Button("Save Pending Actions…") { controller.savePending() }.disabled(controller.failedCommands.isEmpty)
      Button("Restore Pending Actions…") { controller.restorePending() }.disabled(controller.document == nil)
    }
    CommandGroup(replacing: .help) {
      Button("Keyboard Shortcuts") {
        controller.previewOpen = false
        controller.showShortcuts = true
      }.keyboardShortcut("/")
    }
  }
}
