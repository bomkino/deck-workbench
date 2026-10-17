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
    guard event.type == .keyDown, controller.document != nil, !controller.lifecycleBusy else { return false }
    if controller.showShortcuts || controller.showExport || controller.showSettings
      || controller.copyEditorOpen || controller.imported != nil || controller.showApplyLayout || controller.showStarterStyle || controller.showMoodboard || controller.showExportResult
    {
      return false
    }
    let responder = NSApp.keyWindow?.firstResponder
    if let text = responder as? NSTextView, text.isEditable { return false }
    if responder is NSSlider || responder is NSPopUpButton || responder is NSComboBox || responder is NSStepper { return false }
    if event.keyCode == 49 && responder is NSButton { return false }
    // A focused list or segmented control keeps its own navigation keys: the
    // slide list's arrows change slide, not the selected frame or image.
    let navigation: Set<UInt16> = [123, 124, 125, 126, 115, 119, 116, 121, 36, 76]
    if (responder is NSTableView || responder is NSSegmentedControl) && (navigation.contains(event.keyCode) || event.keyCode == 49) { return false }
    let flags = event.modifierFlags.intersection([.command, .control, .option, .shift])
    // Some layouts (German, for example) type [ and ] with Option.
    if flags.contains(.option), !flags.contains(.command), !flags.contains(.control),
      let typed = event.characters, typed == "[" || typed == "]"
    {
      controller.moveSlide(typed == "[" ? -1 : 1)
      return true
    }
    guard !flags.contains(.command), !flags.contains(.control), !flags.contains(.option) else {
      return false
    }
    if controller.cleanPreview && !controller.previewOpen && !controller.compareOpen {
      switch event.keyCode {
      case 123, 126, 116: controller.moveSlide(-1)
      case 124, 125, 121: controller.moveSlide(1)
      case 49: if !event.isARepeat { controller.moveSlide(flags.contains(.shift) ? -1 : 1) }
      case 115: if let id = controller.slides.first?.id { controller.selectSlide(id) }
      case 119: if let id = controller.slides.last?.id { controller.selectSlide(id) }
      case 53: controller.endCleanPreview()
      default: return false
      }
      return true
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
      controller.selectedSlide != nil
    {
      guard let scene = controller.resolvedScene else { return false }
      if scene.legacy && controller.selectionTarget == "text" { return false }
      let target = controller.selectionTarget
      guard
        let frame = target == "text"
          ? (NativeLayoutGeometry.hasText(scene) ? scene.textRegion : nil)
          : target == "gradient" ? (scene.gradient != nil ? scene.gradientFrame : nil)
          : scene.imageLayers.first(where: { $0.role == target })?.frame
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
  private static let groups: [(String, [(String, String)])] = [
    ("Slides", [
      ("⇧⌘N", "Add a slide after the selected slide"),
      ("⌘D", "Duplicate slide, copy, layout, choices and notes"),
      ("⌘E", "Edit slide copy"),
      ("⌥⌘↑ / ⌥⌘↓", "Move slide earlier / later"),
      ("⇧⌘Delete", "Delete slide with confirmation; original files stay untouched"),
      ("Double-click / Return", "On a slide: edit its copy. On an image: preview it"),
    ]),
    ("Canvas and review", [
      ("Assemble: arrows", "Nudge selected text/frame; Shift moves ten units"),
      ("Space-drag", "Pan canvas; pinch to zoom"),
      ("Escape", "Cancel a canvas drag or close preview"),
      ("⇧⌘P", "Review the deck: arrows, Space / Shift-Space, Home and End browse; Escape returns to editing"),
      ("⌘0 · ⌥⌘I", "Fit the canvas · show or hide the context panel"),
    ]),
    ("Deck and workspace", [
      ("⌘Z / ⇧⌘Z", "Undo / redo a saved decision or gesture"),
      ("⌘S", "Save pending notes and the deck"),
      ("⇧⌘E", "Export designer handoff"),
      ("⌘1 / ⌘2", "Curate / Assemble"),
      ("⌘F", "Switch to Curate and search media"),
      ("⌘N · ⇧⌘V · ⌘O", "Import final copy · paste final copy · open a deck"),
      ("⇧⌘R", "Reveal the focused media in Finder"),
      ("⌘/", "Open this keyboard reference"),
    ]),
  ]
  var body: some View {
    NativeSheetScaffold(title: "Keyboard Shortcuts",
      subtitle: "Curation commands are identical in the grid and preview. They pause while you type copy, notes or search text.",
      systemImage: "keyboard") {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          group("Curate and slides") {
            ForEach(Array(NativeShortcuts.definitions.enumerated()), id: \.offset) { _, item in
              if !["right", "down", "]"].contains(item.key) { row(item.display, item.label) }
            }
          }
          ForEach(Self.groups, id: \.0) { title, rows in
            group(title) { ForEach(rows, id: \.0) { row($0.0, $0.1) } }
          }
        }.padding(22)
      }
    } footer: {
      Spacer()
      Button("Done") { controller.showShortcuts = false }.keyboardShortcut(.cancelAction).buttonStyle(.borderedProminent)
    }.nativeSheetFrame(width: 740, height: 680)
  }
  private func group<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      NativeEyebrow(title)
      VStack(alignment: .leading, spacing: 0) { content() }.nativeCard(padding: 4)
    }
  }
  private func row(_ keys: String, _ label: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 16) {
      Text(keys).workbenchText(.code).padding(.horizontal, 7).padding(.vertical, 3)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
        .frame(width: 190, alignment: .leading)
      Text(label).workbenchText(.bodyCompact).fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }.padding(.horizontal, 10).padding(.vertical, 6).accessibilityElement(children: .combine)
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
    if approved {
      approved = false // one close, not permanent permission after reopening the window
      return original?.windowShouldClose?(sender) ?? true
    }
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
