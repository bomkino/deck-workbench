import AppKit
import SwiftUI

@MainActor
struct NativeShortcutDefinition {
  let key: String
  let shift: Bool
  let display: String
  let label: String
  let scope: String
  let action: (NativeWorkbenchController) -> Void
}
@MainActor
enum NativeShortcuts {
  static var handledEventCount = 0
  static let definitions: [NativeShortcutDefinition] = [
    .init(
      key: "left", shift: false, display: "← / →",
      label: "Previous / next image in this collection", scope: "curate",
      action: { $0.focusNext(-1) }),
    .init(
      key: "right", shift: false, display: "→", label: "Next image", scope: "curate",
      action: { $0.focusNext(1) }),
    .init(
      key: "up", shift: false, display: "↑ / ↓", label: "Previous / next grid row", scope: "curate",
      action: { $0.focusNext(-$0.gridColumns) }),
    .init(
      key: "down", shift: false, display: "↓", label: "Next grid row", scope: "curate",
      action: { $0.focusNext($0.gridColumns) }),
    .init(
      key: " ", shift: false, display: "Space", label: "Open / close image preview", scope: "curate",
      action: { if $0.previewOpen { $0.previewOpen = false } else { $0.preview() } }),
    .init(
      key: "s", shift: false, display: "S", label: "Add image to this slide’s shortlist",
      scope: "curate", action: { $0.decide("shortlist") }),
    .init(
      key: "s", shift: true, display: "Shift-S",
      label: "Remove from shortlist; keep any chosen assignment", scope: "curate",
      action: { $0.decide("remove-shortlist") }),
    .init(
      key: "m", shift: false, display: "M", label: "Choose image for the selected slide role",
      scope: "curate", action: { $0.decide("use") }),
    .init(
      key: "x", shift: false, display: "X", label: "Reject for this slide; unassign if chosen",
      scope: "curate", action: { $0.decide("reject") }),
    .init(
      key: "x", shift: true, display: "Shift-X", label: "Restore a rejected candidate",
      scope: "curate", action: { $0.decide("clear-reject") }),
    .init(
      key: "c", shift: false, display: "C", label: "Add/remove image in comparison (up to three)",
      scope: "curate", action: { $0.toggleCompare() }),
    .init(
      key: "c", shift: true, display: "Shift-C", label: "Open comparison", scope: "curate",
      action: { if !$0.compareIDs.isEmpty { $0.compareOpen = true } }),
    .init(
      key: "[", shift: false, display: "[ / ]", label: "Previous / next slide", scope: "any",
      action: { $0.moveSlide(-1) }),
    .init(
      key: "]", shift: false, display: "]", label: "Next slide", scope: "any",
      action: { $0.moveSlide(1) }),
    .init(
      key: "?", shift: true, display: "?", label: "Show keyboard reference", scope: "any",
      action: {
        $0.previewOpen = false
        $0.showShortcuts = true
      }),
  ]
  static func handle(_ event: NSEvent, controller: NativeWorkbenchController) -> Bool {
    guard event.type == .keyDown, controller.document != nil else { return false }
    if controller.showShortcuts || controller.showExport || controller.showSettings
      || controller.copyEditorOpen || controller.imported != nil || controller.showApplyLayout || controller.showExportResult
    {
      return false
    }
    if let text = NSApp.keyWindow?.firstResponder as? NSTextView, text.isEditable { return false }
    if NSApp.keyWindow?.firstResponder is NSSlider || NSApp.keyWindow?.firstResponder is NSPopUpButton || NSApp.keyWindow?.firstResponder is NSComboBox { return false }
    if event.keyCode == 49 && NSApp.keyWindow?.firstResponder is NSButton { return false }
    let flags = event.modifierFlags.intersection([.command, .control, .option, .shift])
    guard !flags.contains(.command), !flags.contains(.control), !flags.contains(.option) else {
      return false
    }
    if controller.compareOpen {
      let ids = controller.compareIDs
      if event.keyCode == 53 { controller.compareOpen = false; return true }
      guard !ids.isEmpty else { return false }
      let index = ids.firstIndex(of: controller.comparedAssetID ?? "") ?? 0
      let name = (event.charactersIgnoringModifiers ?? "").lowercased()
      if event.keyCode == 123 || event.keyCode == 124 {
        controller.comparedAssetID = ids[max(0, min(ids.count - 1, index + (event.keyCode == 123 ? -1 : 1)))]
        return true
      }
      if let number = Int(name), (1...ids.count).contains(number) {
        if !event.isARepeat { controller.decide("use", assetID: ids[number - 1]) }
        return true
      }
      if name == "m" || name == "s" {
        if !event.isARepeat { controller.decide(name == "m" ? "use" : "shortlist", assetID: ids[index]) }
        return true
      }
      return false
    }
    if event.keyCode == 53 && controller.previewOpen {
      controller.previewOpen = false
      return true
    }
    let key: [UInt16: String] = [123: "left", 124: "right", 125: "down", 126: "up"]
    let name = key[event.keyCode] ?? (event.charactersIgnoringModifiers ?? "").lowercased()
    if controller.phase == "assemble", !controller.previewOpen, !controller.cleanPreview, let arrow = key[event.keyCode],
      let slide = controller.selectedSlide, let canvas = controller.document?.deck.canvasPreset
    {
      guard let scene = controller.resolvedScene else { return false }
      if scene.legacy && controller.selectionTarget == "text" { return false }
      let target = controller.selectionTarget
      guard
        let frame = target == "text"
          ? scene.textRegion : scene.imageLayers.first(where: { $0.role == target })?.frame
      else { return false }
      let step = flags.contains(.shift) ? 10.0 : 1.0
      controller.nudge(
        dx: arrow == "left" ? -step : arrow == "right" ? step : 0,
        dy: arrow == "up" ? -step : arrow == "down" ? step : 0, frame: PrototypeFrame(frame))
      return true
    }
    guard
      let definition = definitions.first(where: {
        $0.key == name && $0.shift == flags.contains(.shift)
          && ($0.scope == "any" || $0.scope == (controller.previewOpen ? "curate" : controller.phase))
      })
    else { return false }
    if event.isARepeat && !["left", "right", "up", "down", "[", "]"].contains(name) { return true }
    definition.action(controller)
    return true
  }
}
struct NativeShortcutSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text("Keyboard Shortcuts").font(.title2)
        Spacer()
        Button("Done") { controller.showShortcuts = false }.keyboardShortcut(.cancelAction)
      }
      Text(
        "Curation commands are identical in the grid and preview. They pause while you type copy, notes or search text."
      ).foregroundStyle(.secondary)
      ScrollView {
        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 12) {
          ForEach(Array(NativeShortcuts.definitions.enumerated()), id: \.offset) { _, item in
            if !["right", "down", "]"].contains(item.key) {
              GridRow {
                Text(item.display).font(.system(.body, design: .monospaced))
                Text(item.label)
              }
            }
          }
          Divider()
          GridRow {
            Text("⌘Z / ⇧⌘Z").monospaced()
            Text("Undo / redo a saved decision or gesture")
          }
          GridRow {
            Text("⌘S").monospaced()
            Text("Save pending notes and the deck")
          }
          GridRow {
            Text("⇧⌘E").monospaced()
            Text("Export designer handoff")
          }
          GridRow {
            Text("⌘/").monospaced()
            Text("Open this keyboard reference")
          }
          GridRow {
            Text("Assemble: arrows").monospaced()
            Text("Nudge selected text/frame; Shift moves ten units")
          }
          GridRow {
            Text("Space-drag").monospaced()
            Text("Pan canvas; pinch to zoom")
          }
          GridRow {
            Text("Escape").monospaced()
            Text("Cancel a canvas drag or close preview")
          }
        }
      }
    }.padding(24).nativeSheetFrame(width: 720, height: 620)
  }
}
struct NativeKeyboardRouter: NSViewRepresentable {
  @ObservedObject var controller: NativeWorkbenchController
  func makeNSView(context: Context) -> NativeKeyMonitorView {
    let view = NativeKeyMonitorView()
    view.controller = controller
    view.install()
    return view
  }
  func updateNSView(_ view: NativeKeyMonitorView, context: Context) { view.controller = controller }
  static func dismantleNSView(_ view: NativeKeyMonitorView, coordinator: ()) { view.remove() }
}
@MainActor
final class NativeKeyMonitorView: NSView {
  weak var controller: NativeWorkbenchController?
  private var monitor: Any?
  func install() {
    guard monitor == nil else { return }
    monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      guard let self, let controller = self.controller, let host = self.window,
        event.window === host || event.window?.sheetParent === host
      else { return event }
      if NativeShortcuts.handle(event, controller: controller) {
        NativeShortcuts.handledEventCount += 1
        return nil
      }
      return event
    }
  }
  func remove() {
    if let monitor { NSEvent.removeMonitor(monitor) }
    monitor = nil
  }
}
struct NativeWindowGuard: NSViewRepresentable {
  let controller: NativeWorkbenchController
  func makeNSView(context: Context) -> NativeGuardView {
    let view = NativeGuardView()
    view.controller = controller
    return view
  }
  func updateNSView(_ view: NativeGuardView, context: Context) {
    view.controller = controller
    view.install()
  }
}
@MainActor
final class NativeGuardView: NSView {
  weak var controller: NativeWorkbenchController?
  private var proxy: NativeCloseDelegate?
  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    install()
  }
  func install() {
    guard let window, let controller, proxy == nil else { return }
    let proxy = NativeCloseDelegate(controller: controller, original: window.delegate)
    self.proxy = proxy
    window.delegate = proxy
  }
}
@MainActor
final class NativeCloseDelegate: NSObject, NSWindowDelegate {
  weak var controller: NativeWorkbenchController?
  let original: NSWindowDelegate?
  private var approved = false, pending = false
  init(controller: NativeWorkbenchController, original: NSWindowDelegate?) {
    self.controller = controller
    self.original = original
  }
  func windowShouldClose(_ sender: NSWindow) -> Bool {
    if approved { return original?.windowShouldClose?(sender) ?? true }
    guard !pending else { return false }
    pending = true
    Task { [weak self, weak sender] in
      guard let self else { return }
      let okay = await self.controller?.closeForSwitch() ?? true
      self.pending = false
      if okay {
        self.approved = true
        sender?.performClose(nil)
      }
    }
    return false
  }
  override func responds(to selector: Selector!) -> Bool {
    super.responds(to: selector) || original?.responds(to: selector) == true
  }
  override func forwardingTarget(for selector: Selector!) -> Any? { original }
}
