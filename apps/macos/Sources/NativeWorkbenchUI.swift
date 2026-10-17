import AppKit
import SwiftUI

struct NativeWorkbenchRoot: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State private var columns: NavigationSplitViewVisibility = .all
  @State private var editingColumns: NavigationSplitViewVisibility = .all
  @State private var dropTargeted = false
  var body: some View {
    NavigationSplitView(columnVisibility: $columns) {
      NativeSlideSidebar(controller: controller, thumbnails: controller.thumbnails).disabled(controller.lifecycleBusy)
    } detail: {
      VStack(spacing: 0) {
        if let failure = controller.failure {
          NativeFailureBanner(controller: controller, failure: failure)
        }
        if controller.document != nil && !controller.cleanPreview {
          NativeSlideEditingBar(controller: controller)
          Divider()
        }
        if controller.document == nil {
          NativeWelcomeView(controller: controller)
        } else {
          // The inspector keeps the width the person gives it; the work area
          // takes the rest, so a wide window never inflates the inspector or
          // stops the window from shrinking again.
          // In a narrow window the inspector gives way first (down to 240 pt),
          // so its chosen width never forces the window wider than the screen.
          GeometryReader { geometry in
            HStack(spacing: 0) {
              Group {
                if controller.compareOpen {
                  NativeCompareView(controller: controller)
                } else if controller.previewOpen {
                  NativePreviewView(controller: controller)
                } else if controller.phase == "curate" {
                  NativeCurateView(controller: controller)
                } else {
                  NativeAssembleView(controller: controller)
                }
              }.frame(maxWidth: .infinity, maxHeight: .infinity)
              if controller.showContext && !controller.cleanPreview {
                NativePanelResizeHandle(width: $controller.contextWidth, range: NativeWorkbenchRoot.inspectorWidths)
                NativeContextPanel(controller: controller)
                  .frame(width: inspectorWidth(available: geometry.size.width))
                  .frame(maxHeight: .infinity)
              }
            }
          }.disabled(controller.lifecycleBusy)
        }
        if !controller.cleanPreview {
          NativeStatusBar(controller: controller)
        }
      }.navigationTitle(controller.document?.deck.title ?? "Workbench")
        .navigationSubtitle(subtitle)
        .toolbar {
          ToolbarItemGroup(placement: .navigation) {
            Button {
              controller.importFile()
            } label: {
              Label("Import copy", systemImage: "square.and.arrow.down")
            }.help("Import final copy (Command-N)")
            Button {
              controller.openPanel()
            } label: {
              Label("Open deck", systemImage: "folder")
            }.help("Open a deck (Command-O)")
          }
          ToolbarItem(placement: .principal) {
            if controller.document != nil {
            Picker("Workspace", selection: $controller.phase) {
              Text("Curate").tag("curate")
              Text("Assemble").tag("assemble")
            }.pickerStyle(.segmented).frame(width: 210 * controller.interfaceScale).disabled(controller.document == nil)
              .help("Curate chooses media for each slide (Command-1); Assemble arranges it (Command-2)")
            }
          }
          ToolbarItemGroup(placement: .primaryAction) {
            if controller.document != nil {
            Button { controller.startCleanPreview() } label: {
              Label("Review deck", systemImage: controller.cleanPreview ? "stop.fill" : "play.fill")
            }.help("Review the deck without editing guides (Shift-Command-P)").disabled(controller.document == nil)
            Button { controller.showContext.toggle() } label: {
              Label("Copy, notes and inspector", systemImage: "sidebar.right")
            }.help("Show or hide context panel")
            Button {
              controller.undo(documentOnly: true)
            } label: {
              Label("Undo", systemImage: "arrow.uturn.backward")
            }.disabled(controller.document?.history.canUndo != true).help("Undo (Command-Z)")
            Button("Export Handoff…") { controller.showExport = true }.disabled(!controller.canExport)
              .buttonStyle(.borderedProminent).help("Export the designer handoff (Shift-Command-E)")
            }
          }
        }
    }
    .onChange(of: controller.cleanPreview) { _, clean in
      if clean { editingColumns = columns; columns = .detailOnly }
      else { columns = editingColumns }
    }
    // Without a deck the slide list is empty; the welcome screen takes the window.
    .onChange(of: controller.document == nil, initial: true) { _, empty in
      if !controller.cleanPreview { columns = empty ? .detailOnly : .all }
    }
    .dropDestination(for: URL.self) { urls, _ in controller.handleDrop(urls) } isTargeted: { dropTargeted = $0 }
    .overlay {
      if dropTargeted {
        RoundedRectangle(cornerRadius: NativeDesign.radiusLarge, style: .continuous)
          .strokeBorder(Color.accentColor, style: StrokeStyle(lineWidth: 3, dash: [10, 6]))
          .background(Color.accentColor.opacity(0.06), in: RoundedRectangle(cornerRadius: NativeDesign.radiusLarge, style: .continuous))
          .overlay {
            Label(controller.document == nil ? "Drop final copy or a deck" : "Drop a media folder, final copy or a deck",
              systemImage: "tray.and.arrow.down.fill")
              .workbenchText(.panelTitle).padding(.horizontal, 18).padding(.vertical, 12)
              .background(.regularMaterial, in: Capsule())
          }
          .padding(10).allowsHitTesting(false)
      }
    }
    .background(NativeKeyboardRouter(controller: controller).frame(width: 0, height: 0))
    .background(NativeWindowGuard(controller: controller).frame(width: 0, height: 0))
    .sheet(isPresented: $controller.showShortcuts) { NativeShortcutSheet(controller: controller) }
    .sheet(isPresented: $controller.showExport) { NativeExportSheet(controller: controller) }
    .sheet(isPresented: $controller.showSettings) { NativeSettingsView(controller: controller) }
    .sheet(isPresented: $controller.copyEditorOpen) {
      if let slide = controller.copyEditorTarget {
        NativeCopyEditor(controller: controller, slide: slide)
      }
    }
    .sheet(isPresented: $controller.showMoodboard) { NativeMoodboardSheet(controller: controller) }
    .sheet(isPresented: $controller.showStarterStyle) { NativeStarterStyleSheet(controller: controller) }
    .sheet(isPresented: $controller.showApplyLayout) { NativeApplyLayoutSheet(controller: controller) }
    .sheet(isPresented: $controller.showExportResult) { NativeHandoffResultSheet(controller: controller) }
    .sheet(
      isPresented: Binding(
        get: { controller.imported != nil }, set: { if !$0 { controller.imported = nil } })
    ) {
      if let imported = controller.imported {
        NativeImportSheet(controller: controller, imported: imported)
      }
    }
    .workbenchText(.body)
    .environment(\.workbenchInterfaceScale, controller.interfaceScale)
    .frame(minWidth: 900, minHeight: 600)
  }
  static let inspectorWidths: ClosedRange<Double> = 280...440
  private func inspectorWidth(available: CGFloat) -> CGFloat {
    let chosen = min(Self.inspectorWidths.upperBound, max(Self.inspectorWidths.lowerBound, controller.contextWidth))
    return max(240, min(chosen, available - 421))
  }
  private var subtitle: String {
    guard let deck = controller.document?.deck else { return "" }
    let count = controller.slides.count
    return "\(count) slide\(count == 1 ? "" : "s") · \(NativeCanvasChoice.name(deck.canvasPreset.id))"
  }
}

/// A slide's readiness for handoff, shared by the navigator and editing bar.
enum NativeSlideReadiness {
  case excluded, textOnly, needsImage(missing: Int), ready
  init(_ slide: DeckSlide) {
    let roles = slide.imageRoles
    let chosen = Set((slide.mediaAssignments ?? []).filter { roles.contains($0.role) }.map(\.role)).count
    if !slide.settings.included { self = .excluded }
    else if roles.isEmpty { self = .textOnly }
    else if chosen < roles.count { self = .needsImage(missing: roles.count - chosen) }
    else { self = .ready }
  }
  var isReady: Bool {
    switch self { case .ready, .textOnly: return true; default: return false }
  }
  var needsImage: Bool {
    if case .needsImage = self { return true }
    return false
  }
  var label: String {
    switch self {
    case .excluded: return "Excluded from export"
    case .textOnly: return "Text only"
    case .needsImage(let missing): return missing == 1 ? "Needs an image" : "Needs \(missing) images"
    case .ready: return "Images chosen"
    }
  }
  var systemImage: String {
    switch self {
    case .excluded: return "eye.slash"
    case .textOnly: return "text.alignleft"
    case .needsImage: return "photo.badge.plus"
    case .ready: return "checkmark.circle.fill"
    }
  }
  var tint: Color {
    switch self {
    case .excluded, .textOnly: return .secondary
    case .needsImage: return NativeDesign.attention
    case .ready: return NativeDesign.ready
    }
  }
}

struct NativeCanvasChoice: Identifiable {
  let id: String
  let name: String
  let size: String
  let aspect: CGFloat
  static let all: [NativeCanvasChoice] = [
    .init(id: "cinemascope-2576x1080", name: "Cinemascope", size: "2576 × 1080", aspect: 2576 / 1080),
    .init(id: "widescreen-1920x1080", name: "Widescreen", size: "1920 × 1080", aspect: 16 / 9),
    .init(id: "square-2160x2160", name: "Square", size: "2160 × 2160", aspect: 1),
    .init(id: "standard-1920x1440", name: "Standard", size: "1920 × 1440", aspect: 4 / 3),
    .init(id: "a4-portrait", name: "A4 portrait", size: "210 × 297 mm", aspect: 210 / 297),
    .init(id: "letter-portrait", name: "Letter portrait", size: "8.5 × 11 in", aspect: 8.5 / 11),
  ]
  static func name(_ id: String) -> String { all.first { $0.id == id }?.name ?? id }
}

struct NativeFailureBanner: View {
  @ObservedObject var controller: NativeWorkbenchController
  let failure: String
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(NativeDesign.attention)
        .font(.system(size: 16)).padding(.top, 1).accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 10) {
        Text(failure).workbenchText(.bodyCompact).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        if !controller.failedCommands.isEmpty {
          HStack(spacing: 8) {
            Button("Retry Pending Actions") { controller.retryPending() }.buttonStyle(.borderedProminent)
            Button("Save Pending Actions…") { controller.savePending() }
            Button("Discard Unsaved Actions…") { controller.discardPending() }
          }.controlSize(.small)
        }
      }
      Spacer(minLength: 0)
      Button("Dismiss") { controller.failure = nil }.controlSize(.small)
    }.padding(12)
      .background(NativeDesign.attention.opacity(0.11), in: RoundedRectangle(cornerRadius: NativeDesign.radius, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: NativeDesign.radius, style: .continuous).strokeBorder(NativeDesign.attention.opacity(0.35)))
      .padding(.horizontal, 12).padding(.vertical, 10)
  }
}

struct NativeStatusBar: View {
  @ObservedObject var controller: NativeWorkbenchController
  private var message: String {
    controller.pendingCount > 0
      ? "Saving \(controller.pendingCount) action\(controller.pendingCount==1 ? "" : "s")…"
      : !controller.failedCommands.isEmpty ? "\(controller.failedCommands.count) actions need recovery" : controller.status
  }
  private var icon: (String, Color) {
    if !controller.failedCommands.isEmpty { return ("exclamationmark.triangle.fill", NativeDesign.attention) }
    if controller.pendingCount > 0 { return ("arrow.triangle.2.circlepath", .secondary) }
    return controller.document == nil ? ("info.circle", .secondary) : ("checkmark.circle", .secondary)
  }
  var body: some View {
    VStack(spacing: 0) {
      Divider()
      HStack(spacing: 10) {
        Image(systemName: icon.0).foregroundStyle(icon.1).font(.system(size: 11)).accessibilityHidden(true)
        Text(message).workbenchText(.caption).foregroundStyle(.secondary).lineLimit(2)
        Spacer(minLength: 8)
        if controller.importRunning { ProgressView().controlSize(.small); Text("Reading copy…").workbenchText(.caption) }
        if controller.lifecycleBusy { ProgressView().controlSize(.small); Text("Saving and switching…").workbenchText(.caption) }
        if controller.scanRunning {
          ProgressView().controlSize(.small)
          Button("Cancel Scan") { controller.cancelScan() }.controlSize(.small)
        }
        if controller.exportRunning {
          ProgressView(value: controller.exportProgress).frame(width: 110)
          Button("Cancel Export") { controller.cancelExport() }.controlSize(.small)
        }
        Button {
          controller.showShortcuts = true
        } label: {
          Image(systemName: "keyboard")
        }.buttonStyle(.borderless).help("Keyboard Shortcuts (Command-/)").accessibilityLabel("Keyboard shortcuts")
      }.padding(.horizontal, 14).padding(.vertical, 7)
    }.background(.bar)
  }
}

struct NativeWelcomeView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 36) {
        VStack(alignment: .leading, spacing: 14) {
          Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 64, height: 64)
            .shadow(color: .black.opacity(0.15), radius: 6, y: 3).accessibilityHidden(true)
          NativeEyebrow("Deck Workbench")
          Text("Copy. Images. Intent.").workbenchText(.display)
          Text(
            "Bring in the final writing. Choose the media. Give the designer a clear starting point."
          ).workbenchText(.body).foregroundStyle(.secondary).frame(maxWidth: 520, alignment: .leading)
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 230 * controller.interfaceScale), spacing: 14, alignment: .top)], spacing: 14) { actions }
        VStack(alignment: .leading, spacing: 14) {
          NativeEyebrow("From final copy to handoff")
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 190 * controller.interfaceScale), spacing: 18, alignment: .top)], alignment: .leading, spacing: 14) { steps }
        }
        if !controller.recentDocuments.isEmpty {
          VStack(alignment: .leading, spacing: 10) {
            NativeEyebrow("Recent decks")
            VStack(spacing: 0) {
              ForEach(Array(controller.recentDocuments.prefix(5).enumerated()), id: \.element.path) { index, url in
                if index > 0 { Divider().padding(.leading, 56) }
                NativeRecentRow(url: url) { Task { await controller.open(url) } }
              }
            }.nativeCard(padding: 0)
          }
        }
        Label("Drop final copy (.md or .txt) or a .pitchdeck anywhere in this window.", systemImage: "tray.and.arrow.down")
          .workbenchText(.caption).foregroundStyle(.secondary)
      }.padding(.horizontal, 56).padding(.vertical, 52)
        .frame(maxWidth: 1000, alignment: .leading).frame(maxWidth: .infinity)
    }
    .background(
      LinearGradient(colors: [Color.accentColor.opacity(0.08), .clear], startPoint: .topLeading, endPoint: UnitPoint(x: 0.55, y: 0.6))
    )
  }
  @ViewBuilder private var actions: some View {
    NativeActionCard(title: "Import Final Copy…", detail: "Markdown or plain text from the writer. No text is rewritten.",
      systemImage: "square.and.arrow.down", shortcut: "⌘N", prominent: true) { controller.importFile() }
    NativeActionCard(title: "Paste Final Copy", detail: "Start from writing already on the clipboard.",
      systemImage: "doc.on.clipboard", shortcut: "⇧⌘V", prominent: false) { controller.pasteCopy() }
    NativeActionCard(title: "Open Deck…", detail: "Continue a .pitchdeck with its choices, notes and layouts.",
      systemImage: "folder", shortcut: "⌘O", prominent: false) { controller.openPanel() }
  }
  @ViewBuilder private var steps: some View {
    NativeJourneyStep(number: 1, title: "Import copy", detail: "Slides come from the writing, locked by default.")
    NativeJourneyStep(number: 2, title: "Curate", detail: "Shortlist and choose media for every slide.")
    NativeJourneyStep(number: 3, title: "Assemble", detail: "Rough layouts, type and colour as a starting point.")
    NativeJourneyStep(number: 4, title: "Hand off", detail: "PDFs, writing, PSDs and InDesign for the designer.")
  }
}

struct NativeActionCard: View {
  let title: String
  let detail: String
  let systemImage: String
  let shortcut: String
  let prominent: Bool
  let action: () -> Void
  @State private var hovering = false
  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top) {
          Image(systemName: systemImage).font(.system(size: 18, weight: .semibold))
            .foregroundStyle(prominent ? Color.white : Color.accentColor)
            .frame(width: 40, height: 40)
            .background(prominent ? Color.white.opacity(0.2) : Color.accentColor.opacity(0.12),
              in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          Spacer()
          Text(shortcut).workbenchText(.caption).foregroundStyle(prominent ? Color.white.opacity(0.8) : Color.secondary)
        }
        Text(title).workbenchText(.label).foregroundStyle(prominent ? Color.white : Color.primary)
        Text(detail).workbenchText(.caption).foregroundStyle(prominent ? Color.white.opacity(0.85) : Color.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }.padding(16).frame(maxWidth: .infinity, minHeight: 138, alignment: .topLeading)
        .background(prominent ? AnyShapeStyle(Color.accentColor.gradient) : AnyShapeStyle(NativeDesign.card),
          in: RoundedRectangle(cornerRadius: NativeDesign.radiusLarge, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeDesign.radiusLarge, style: .continuous)
          .strokeBorder(prominent ? Color.clear : hovering ? NativeDesign.strongStroke : NativeDesign.stroke))
        .shadow(color: .black.opacity(hovering ? 0.14 : 0.05), radius: hovering ? 14 : 6, y: hovering ? 5 : 2)
        .contentShape(RoundedRectangle(cornerRadius: NativeDesign.radiusLarge, style: .continuous))
    }.buttonStyle(.plain).frame(minWidth: 200)
      .onHover { hovering = $0 }
      .animation(.easeOut(duration: 0.15), value: hovering)
      .accessibilityLabel(title).accessibilityHint(detail)
  }
}

struct NativeJourneyStep: View {
  let number: Int
  let title: String
  let detail: String
  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Text("\(number)").font(.system(size: 12, weight: .bold, design: .rounded))
        .frame(width: 24, height: 24).foregroundStyle(.tint)
        .background(Color.accentColor.opacity(0.13), in: Circle())
      VStack(alignment: .leading, spacing: 3) {
        Text(title).workbenchText(.label)
        Text(detail).workbenchText(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
    }.frame(maxWidth: .infinity, alignment: .leading).accessibilityElement(children: .combine)
  }
}

struct NativeRecentRow: View {
  let url: URL
  let action: () -> Void
  @State private var hovering = false
  @State private var detail = ""
  private func describe() -> String {
    let folder = (url.deletingLastPathComponent().path as NSString).abbreviatingWithTildeInPath
    guard FileManager.default.fileExists(atPath: url.path) else { return "Not found in " + folder }
    guard let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate else { return folder }
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .full
    return "Edited " + formatter.localizedString(for: date, relativeTo: Date()) + " · " + folder
  }
  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: "rectangle.stack.fill").foregroundStyle(.tint)
          .frame(width: 32, height: 32)
          .background(Color.accentColor.opacity(0.11), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        VStack(alignment: .leading, spacing: 2) {
          Text(url.deletingPathExtension().lastPathComponent).workbenchText(.label).lineLimit(1)
          Text(detail).workbenchText(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
        }
        Spacer(minLength: 8)
        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(.tertiary)
      }.padding(.horizontal, 12).padding(.vertical, 10)
        .task(id: url) { detail = describe() }
        .background(hovering ? Color.primary.opacity(0.04) : Color.clear)
        .contentShape(Rectangle())
    }.buttonStyle(.plain).onHover { hovering = $0 }
      .accessibilityLabel("Open \(url.deletingPathExtension().lastPathComponent)")
  }
}

struct NativeSlideSidebar: View {
  @ObservedObject var controller: NativeWorkbenchController
  @ObservedObject var thumbnails: NativeSlideThumbnails
  private var selection: Binding<String?> {
    Binding(get: { controller.selectedSlideID },
            set: { if let id = $0 { controller.selectSlide(id) } })
  }
  private var aspect: CGFloat {
    guard let canvas = controller.document?.deck.canvasPreset, canvas.height > 0 else { return 16 / 9 }
    return canvas.width / canvas.height
  }
  var body: some View {
    List(selection: selection) {
      ForEach(controller.document?.deck.sections ?? []) { section in
        Section(section.title) {
          ForEach(section.slides) { slide in
            NativeSlideRow(slide: slide, ordinal: ordinal(slide), thumbnails: thumbnails, aspect: aspect).tag(slide.id)
          }
        }
      }
    }
    // The list's own primary action (double-click or Return) keeps selection
    // working, unlike a double-tap gesture inside List(selection:).
    .contextMenu(forSelectionType: String.self) { ids in
      if let id = ids.first { NativeSlideActions(controller: controller, slideID: id) }
    } primaryAction: { ids in
      if let id = ids.first { controller.beginEditCopy(id) }
    }
    .navigationTitle("Slides")
      .safeAreaInset(edge: .bottom, spacing: 0) {
        VStack(alignment: .leading, spacing: 10) {
          if controller.document != nil { progress }
          HStack {
            Button { controller.addSlide() } label: { Label("Add Slide", systemImage: "plus") }
              .disabled(!controller.slideEditingAvailable)
            Spacer()
            Menu { NativeSlideActions(controller: controller, slideID: controller.selectedSlideID) }
              label: { Image(systemName: "ellipsis.circle") }
              .menuStyle(.borderlessButton).frame(width: 24).accessibilityLabel("Slide actions")
          }
        }.padding(12).background(.bar)
      }
      .navigationSplitViewColumnWidth(min: 200, ideal: 244, max: 380)
  }
  @ViewBuilder private var progress: some View {
    let included = controller.slides.filter { $0.settings.included }
    let ready = included.filter { NativeSlideReadiness($0).isReady }.count
    let waiting = included.filter { NativeSlideReadiness($0).needsImage }.count
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("\(ready) of \(included.count) slides ready").workbenchText(.caption)
        Spacer()
        if included.count > 0 { Text("\(Int((Double(ready) / Double(included.count) * 100).rounded()))%").workbenchText(.caption).foregroundStyle(.secondary).monospacedDigit() }
      }
      GeometryReader { geometry in
        ZStack(alignment: .leading) {
          Capsule().fill(Color.primary.opacity(0.1))
          Capsule().fill(NativeDesign.ready)
            .frame(width: included.isEmpty ? 0 : geometry.size.width * CGFloat(ready) / CGFloat(included.count))
        }
      }.frame(height: 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(ready) of \(included.count) slides ready")
      if waiting > 0 {
        Button { controller.nextSlideNeedingImage() } label: {
          Label(waiting == 1 ? "Go to the slide that needs an image" : "Next of \(waiting) slides that need images", systemImage: "arrow.forward.circle.fill")
            .workbenchText(.caption)
        }.buttonStyle(.link).help("Command-J")
      } else if !included.isEmpty {
        Label("Every slide has its images", systemImage: "checkmark.seal.fill")
          .workbenchText(.caption).foregroundStyle(NativeDesign.ready)
      }
    }
      .help("A slide is ready when every image slot has a chosen image, or it is text only. Excluded slides are not counted.")
  }
  private func ordinal(_ slide: DeckSlide) -> String {
    guard let ordinal = controller.slideOrdinals[slide.id] else { return "" }
    return String(format: "%02d", ordinal)
  }
}
struct NativeSlideRow: View {
  let slide: DeckSlide
  let ordinal: String
  // Observed by each row: a List keeps its rows until their own inputs
  // change, so a finished thumbnail must reach the row directly.
  @ObservedObject var thumbnails: NativeSlideThumbnails
  let aspect: CGFloat
  private var thumbnail: NSImage? { thumbnails.images[slide.id] }
  private var overflowing: Bool { slide.settings.included && thumbnails.overflowing.contains(slide.id) }
  private var readiness: NativeSlideReadiness { NativeSlideReadiness(slide) }
  private var summary: String {
    let shortlisted = slide.settings.shortlist.count
    return readiness.label + (shortlisted > 0 && slide.settings.included ? " · \(shortlisted) shortlisted" : "")
  }
  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      Text(ordinal).workbenchText(.data).foregroundStyle(.secondary)
        .frame(minWidth: 20, alignment: .trailing).fixedSize().padding(.top, 2)
      VStack(alignment: .leading, spacing: 6) {
        ZStack {
          NativeDesign.pasteboard
          if let thumbnail {
            Image(nsImage: thumbnail).resizable().interpolation(.high).aspectRatio(contentMode: .fit)
          }
        }
        .aspectRatio(aspect, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(NativeDesign.strongStroke, lineWidth: 0.5))
        .opacity(slide.settings.included ? 1 : 0.4)
        .overlay(alignment: .bottomLeading) {
          if overflowing {
            Image(systemName: "text.badge.xmark").font(.system(size: 10, weight: .semibold)).foregroundStyle(.white)
              .padding(4).background(NativeDesign.attention, in: Circle()).padding(5)
              .help("Some copy does not fit this slide’s layout")
          }
        }
        .overlay(alignment: .bottomTrailing) {
          if readiness.needsImage {
            Image(systemName: "photo.badge.plus").font(.system(size: 10, weight: .semibold)).foregroundStyle(.white)
              .padding(4).background(NativeDesign.attention, in: Circle()).padding(5)
          } else if !slide.settings.included {
            Image(systemName: "eye.slash").font(.system(size: 10, weight: .semibold)).foregroundStyle(.white)
              .padding(4).background(Color.black.opacity(0.6), in: Circle()).padding(5)
          }
        }
        .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
        VStack(alignment: .leading, spacing: 2) {
          Text(slide.title).workbenchText(.bodyCompact).lineLimit(1)
          Text(summary).workbenchText(.caption).foregroundStyle(.secondary).lineLimit(1)
          if overflowing {
            Text("Copy doesn’t fit").workbenchText(.caption).foregroundStyle(NativeDesign.attention).lineLimit(1)
          }
        }
      }
    }.padding(.vertical, 5)
      .accessibilityElement(children: .combine)
      .accessibilityLabel("\(ordinal), \(slide.title), \(summary)\(overflowing ? ", copy doesn’t fit" : "")")
  }
}
struct NativeMediaGrid: View {
  @ObservedObject var controller: NativeWorkbenchController
  let width: CGFloat
  private var columns: [GridItem] {
    Array(repeating: GridItem(.flexible(minimum: 80), spacing: 14), count: columnCount)
  }
  private var columnCount: Int {
    max(1, Int((max(0, width - 32) + 14) / (controller.gridSize + 14)))
  }
  var body: some View {
    ScrollViewReader { scroll in
      ScrollView {
        LazyVGrid(columns: columns, spacing: 14) {
          ForEach(controller.filteredAssets) { asset in
            NativeAssetTile(controller: controller, asset: asset).id(asset.id)
          }
        }.padding(16)
      }.onChange(of: controller.focusedAssetID) { _, id in
        if !controller.previewOpen, let id { scroll.scrollTo(id, anchor: .center) }
      }.onAppear { if let id = controller.focusedAssetID { scroll.scrollTo(id, anchor: .center) } }
    }.onAppear { updateColumns() }
      .onChange(of: width) { _, _ in updateColumns() }
      .onChange(of: controller.gridSize) { _, _ in updateColumns() }
  }
  private func updateColumns() {
    controller.gridColumns = columnCount
  }
}

struct NativeCurateView: View {
  @ObservedObject var controller: NativeWorkbenchController
  @FocusState private var searchFocused: Bool
  private var filtered: Bool { controller.selectedRootID != nil || !controller.query.isEmpty || controller.collection != "all" }
  var body: some View {
    VStack(spacing: 0) {
      VStack(spacing: 10) {
        // The search field stays outside ViewThatFits: one field, one focus.
        HStack(spacing: 10) {
          searchField.frame(maxWidth: .infinity)
          sortMenu
          foldersMenu
        }
        // Every variant keeps the count and Clear filters; the size slider goes first.
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 10) { collectionPicker.pickerStyle(.segmented); scope; Spacer(minLength: 4); compareButton; thumbnailSize }
          HStack(spacing: 10) { collectionPicker.pickerStyle(.segmented); scope; Spacer(minLength: 4); compareButton }
          HStack(spacing: 10) { collectionPicker.pickerStyle(.menu); scope; Spacer(minLength: 4); compareButton }
        }
      }.padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 10)
      Divider()
      Group {
        if controller.assets.isEmpty {
          NativeEmptyState(systemImage: controller.scanRunning ? "hourglass" : "photo.on.rectangle.angled",
            title: controller.scanRunning ? "Reading your media folder…" : "Choose a folder of media.",
            message: "Originals stay where they are. Decisions are saved with the deck. You can also drop a folder here.") {
            if controller.scanRunning { ProgressView().controlSize(.small) }
            else { Button("Add Media Folder…") { controller.addMediaFolder() }.buttonStyle(.borderedProminent) }
          }
        } else if controller.filteredAssets.isEmpty {
          NativeEmptyState(systemImage: "line.3.horizontal.decrease.circle", title: "No media matches this view.",
            message: emptyMessage) {
            Button("Clear filters") { controller.clearFilters() }
          }
        } else {
          GeometryReader { geometry in
            NativeMediaGrid(controller: controller, width: geometry.size.width)
          }
        }
      }.frame(maxWidth: .infinity, maxHeight: .infinity).background(NativeDesign.pasteboard)
      Divider()
      NativeCurateActions(controller: controller).padding(.horizontal, 14).padding(.vertical, 10).background(.bar)
    }
  }
  private var emptyMessage: String {
    switch controller.collection {
    case "shortlist": return "Nothing is shortlisted for this slide yet. Press S on an image to add it."
    case "chosen": return "No image is chosen for this slide yet. Press M on an image to choose it."
    case "rejected": return "No image is rejected for this slide."
    default: return "Try another search or folder."
    }
  }
  private var searchField: some View {
    HStack(spacing: 6) {
      Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
      TextField("Search media", text: $controller.query).textFieldStyle(.plain)
        .accessibilityLabel("Search filenames and folders").focused($searchFocused)
        .onChange(of: controller.searchRequest) { _, _ in
          if controller.consumeSearchFocusRequest() { searchFocused = true }
        }
        .onAppear { if controller.consumeSearchFocusRequest() { searchFocused = true } }
        .onChange(of: controller.mediaFocusRequest) { _, _ in searchFocused = false }
        .onExitCommand { searchFocused = false; if let id = controller.filteredAssets.first?.id { controller.focusAsset(id) } else { controller.focusedAssetID = nil } }
      if !controller.query.isEmpty {
        Button { controller.query = "" } label: { Image(systemName: "xmark.circle.fill") }
          .buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("Clear search")
      }
    }.padding(.horizontal, 9).padding(.vertical, 6)
      .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
        .strokeBorder(searchFocused ? Color.accentColor.opacity(0.8) : NativeDesign.stroke, lineWidth: searchFocused ? 2 : 1))
  }
  private var collectionPicker: some View {
    Picker("Collection", selection: $controller.collection) {
      Text("All media").tag("all")
      Text(count("Shortlist", controller.shortlistedAssetIDs.count)).tag("shortlist")
      Text(count("Chosen", controller.chosenAssetIDs.count)).tag("chosen")
      Text(count("Rejected", controller.selectedSlide?.settings.rejected.count ?? 0)).tag("rejected")
    }.labelsHidden().fixedSize().accessibilityLabel("Media collection")
      .help("Show all media, or this slide’s shortlisted, chosen or rejected images")
  }
  private func count(_ title: String, _ value: Int) -> String { value > 0 ? "\(title) \(value)" : title }
  private var foldersMenu: some View {
    Menu {
      Button("Add Media Folder…") { controller.addMediaFolder() }
      ForEach(controller.roots) { root in
        Menu(root.label) {
          Button("Show this folder") { controller.selectedRootID = root.id }
          Button("Rescan") { controller.rescan(root.id) }
          Button("Reconnect…") { controller.addMediaFolder(reconnect: root.id) }
        }
      }
      Divider()
      Button("All folders") { controller.selectedRootID = nil }
    } label: {
      Label("Folders", systemImage: "folder")
    }.fixedSize().help("Add, show, rescan or reconnect media folders")
  }
  private var scope: some View {
    HStack(spacing: 8) {
      Text("\(controller.filteredAssets.count) media files").workbenchText(.caption).foregroundStyle(.secondary).fixedSize()
      if filtered {
        Text("·").foregroundStyle(.tertiary)
        Text(controller.roots.first { $0.id == controller.selectedRootID }?.label ?? "All folders").workbenchText(.caption)
          .foregroundStyle(.secondary).lineLimit(1)
        Button("Clear filters") { controller.clearFilters() }.buttonStyle(.link).workbenchText(.caption)
      }
    }
  }
  private var sortMenu: some View {
    Picker("Sort media", selection: $controller.sortOrder) {
      Text("Filename").tag("filename")
      Text("Folder").tag("folder")
      Text("Newest first").tag("modified")
    }.labelsHidden().frame(width: 130 * controller.interfaceScale).controlSize(.small)
      .help("Sort by filename, folder or modification date")
  }
  @ViewBuilder private var compareButton: some View {
    if !controller.compareIDs.isEmpty {
      Button { controller.compareOpen = true } label: { Label("Compare \(controller.compareIDs.count)", systemImage: "square.split.2x1") }
        .controlSize(.small).fixedSize().help("Compare candidates side by side (Shift-C)")
    }
  }
  private var thumbnailSize: some View {
    HStack(spacing: 6) {
      Image(systemName: "photo").font(.system(size: 9)).foregroundStyle(.secondary)
      Slider(value: $controller.gridSize, in: 100...260).frame(width: 96 * controller.interfaceScale).controlSize(.small)
        .help("Thumbnail size").accessibilityLabel("Thumbnail size")
      Image(systemName: "photo").font(.system(size: 14)).foregroundStyle(.secondary)
    }
  }
}
struct NativeAssetTile: View {
  @ObservedObject var controller: NativeWorkbenchController
  let asset: NativeMediaAsset
  @State private var hovering = false
  private var focused: Bool { controller.focusedAssetID == asset.id }
  private var chosenSlot: String? {
    guard let slide = controller.selectedSlide, controller.chosenAssetIDs.contains(asset.id) else { return nil }
    let roles = slide.imageRoles
    guard roles.count > 1, let role = slide.mediaAssignments?.first(where: { $0.assetReferenceId == asset.id && roles.contains($0.role) })?.role,
      let index = roles.firstIndex(of: role) else { return "Chosen" }
    return "Image \(index + 1)"
  }
  private var rejected: Bool { controller.selectedSlide?.settings.rejected.contains(asset.id) == true }
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ZStack {
        Color.black.opacity(0.07)
        NativeAssetImage(source: controller.sources[asset.id], longestSide: 512)
      }
      .frame(height: controller.gridSize * 0.68).frame(maxWidth: .infinity).clipped()
      .opacity(rejected ? 0.45 : 1)
      .overlay(alignment: .topLeading) {
        HStack(spacing: 4) {
          if let chosenSlot {
            Label(chosenSlot, systemImage: "checkmark.circle.fill").labelStyle(.titleAndIcon)
              .workbenchText(.eyebrow).foregroundStyle(.white)
              .padding(.horizontal, 7).padding(.vertical, 3).background(Color.accentColor, in: Capsule())
          }
          if rejected {
            Label("Rejected", systemImage: "xmark.circle.fill").labelStyle(.titleAndIcon)
              .workbenchText(.eyebrow).foregroundStyle(.white)
              .padding(.horizontal, 7).padding(.vertical, 3).background(Color.red.opacity(0.85), in: Capsule())
          }
        }.padding(7)
      }
      .overlay(alignment: .topTrailing) {
        HStack(spacing: 4) {
          if controller.compareIDs.contains(asset.id) {
            Image(systemName: "square.split.2x1.fill").accessibilityLabel("In comparison")
              .font(.system(size: 10, weight: .bold)).foregroundStyle(.white).padding(5).background(Color.black.opacity(0.55), in: Circle())
          }
          if controller.shortlistedAssetIDs.contains(asset.id) {
            Image(systemName: "bookmark.fill").accessibilityLabel("Shortlisted")
              .font(.system(size: 10, weight: .bold)).foregroundStyle(.white).padding(5).background(Color.orange, in: Circle())
          }
        }.padding(7)
      }
      .overlay(alignment: .bottomTrailing) {
        if hovering && !rejected {
          HStack(spacing: 2) {
            quick("Choose for slide", "checkmark", disabled: controller.selectedSlide?.imageRoles.isEmpty != false) { controller.decide("use", assetID: asset.id) }
            quick("Add to shortlist", "bookmark") { controller.decide("shortlist", assetID: asset.id) }
            quick("Preview", "arrow.up.left.and.arrow.down.right") { controller.preview(asset.id) }
          }.padding(3).background(.regularMaterial, in: Capsule()).padding(7)
            .transition(.opacity)
        }
      }
      Text(asset.filename).workbenchText(.caption).lineLimit(1).truncationMode(.middle)
        .foregroundStyle(focused ? Color.primary : Color.secondary)
        .padding(.horizontal, 9).padding(.vertical, 7).frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(NativeDesign.card)
    .clipShape(RoundedRectangle(cornerRadius: NativeDesign.radius, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: NativeDesign.radius, style: .continuous).strokeBorder(
        focused ? Color.accentColor : NativeDesign.stroke, lineWidth: focused ? 3 : 1)
    )
    .shadow(color: focused ? Color.accentColor.opacity(0.28) : Color.black.opacity(hovering ? 0.12 : 0.05),
      radius: focused ? 10 : hovering ? 8 : 3, y: focused ? 3 : 1)
    .onHover { hovering = $0 }
    .animation(.easeOut(duration: 0.12), value: hovering)
    // One gesture, so a single click focuses at once instead of waiting out
    // the double-click interval. Clicking a tile also takes keyboard focus
    // from the slide list, so the curation keys act on the grid.
    .contentShape(Rectangle()).onTapGesture {
      NSApp.keyWindow?.makeFirstResponder(nil)
      if NSApp.currentEvent?.clickCount == 2 { controller.preview(asset.id) } else { controller.focusAsset(asset.id) }
    }
    .accessibilityElement(children: .combine).accessibilityAddTraits(
      controller.focusedAssetID == asset.id ? .isSelected : []
    )
    .accessibilityAddTraits(.isButton)
    .accessibilityAction { controller.focusAsset(asset.id) }
    .accessibilityAction(named: Text("Shortlist")) { controller.decide("shortlist", assetID: asset.id) }
    .accessibilityAction(named: Text("Choose for slide")) { controller.decide("use", assetID: asset.id) }
    .accessibilityAction(named: Text("Reject for this slide")) { controller.decide("reject", assetID: asset.id) }
    .accessibilityAction(named: Text("Preview")) { controller.preview(asset.id) }
    .accessibilityAction(named: Text(controller.compareIDs.contains(asset.id) ? "Remove from comparison" : "Add to comparison")) { controller.toggleCompare(asset.id) }
    .contextMenu {
      Button("Choose for Slide") { controller.decide("use", assetID: asset.id) }
      Button("Add to Shortlist") { controller.decide("shortlist", assetID: asset.id) }
      Button("Remove from Shortlist") { controller.decide("remove-shortlist", assetID: asset.id) }
      Button("Reject for This Slide") { controller.decide("reject", assetID: asset.id) }
      Button("Restore rejected candidate") { controller.decide("clear-reject", assetID: asset.id) }
      Divider()
      Button(controller.compareIDs.contains(asset.id) ? "Remove from Comparison" : "Add to Comparison") { controller.toggleCompare(asset.id) }
      Button("Reveal in Finder") {
        controller.focusedAssetID = asset.id
        controller.revealFocused()
      }
    }
  }
  private func quick(_ label: String, _ systemImage: String, disabled: Bool = false, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: systemImage).font(.system(size: 11, weight: .semibold)).frame(width: 24, height: 22).contentShape(Rectangle())
    }.buttonStyle(.plain).disabled(disabled || controller.lifecycleBusy).help(label).accessibilityLabel(label)
  }
}
struct NativeAssetImage: View {
  let source: NativeMediaSource?
  var longestSide: Int = 2048
  @State private var image: NSImage?
  @State private var message: String?
  @State private var loading = true
  var body: some View {
    Group {
      if let image { Image(nsImage: image).resizable().aspectRatio(contentMode: .fit) }
      else {
        VStack(spacing: 8) {
          if loading { ProgressView().controlSize(.small) }
          else {
            Image(systemName: "photo")
            Text(message ?? "Media unavailable. Reconnect or rescan its folder.").workbenchText(.caption).multilineTextAlignment(.center)
          }
        }.foregroundStyle(.secondary).padding(12)
      }
    }.task(id: "\(source?.cacheKey ?? "missing"):\(longestSide)") {
      image = nil; message = nil; loading = true
      guard let source else { loading = false; return }
      let result = await NativeThumbnailService.shared.preview(for: source, longestSide: longestSide)
      guard !Task.isCancelled else { return }
      image = result.data.flatMap { NSImage(data: $0) }
      message = result.message
      loading = false
    }
  }
}
/// The decision bar: where a choice lands, and the keys that make it.
struct NativeCurateActions: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 12) { destination; Spacer(minLength: 8); actions }
      VStack(alignment: .leading, spacing: 10) { destination; HStack(spacing: 8) { actions } }
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
  @ViewBuilder private var destination: some View {
    if let slide = controller.selectedSlide {
      HStack(spacing: 8) {
        VStack(alignment: .leading, spacing: 1) {
          Text("Choosing for").workbenchText(.eyebrow).foregroundStyle(.secondary)
          Text(slide.title).workbenchText(.label).lineLimit(1)
        }.frame(maxWidth: 200, alignment: .leading)
        if slide.imageRoles.isEmpty {
          Text("Text only · shortlist for the designer").workbenchText(.caption).foregroundStyle(.secondary)
        } else {
          ForEach(Array(slide.imageRoles.prefix(6).enumerated()), id: \.element) { index, role in
            NativeSlotChip(controller: controller, slide: slide, role: role, index: index)
          }
          if slide.imageRoles.count > 6 { Text("+\(slide.imageRoles.count - 6)").workbenchText(.caption).foregroundStyle(.secondary) }
        }
      }
    }
  }
  @ViewBuilder private var actions: some View {
    Group {
      Button { controller.decide("use") } label: { NativeKeyedLabel(title: "Choose", systemImage: "checkmark", key: "M") }
        .buttonStyle(.borderedProminent)
        .disabled(controller.selectedSlide?.imageRoles.isEmpty != false)
        .accessibilityLabel("Choose · M")
      Button { controller.decide("shortlist") } label: { NativeKeyedLabel(title: "Shortlist", systemImage: "bookmark", key: "S") }
        .accessibilityLabel("Shortlist · S")
      Button { controller.decide("reject") } label: { NativeKeyedLabel(title: "Reject", systemImage: "xmark", key: "X") }
        .accessibilityLabel("Reject · X")
      Button { controller.preview() } label: { Image(systemName: "arrow.up.left.and.arrow.down.right") }
        .help("Preview (Space)").accessibilityLabel("Preview focused image")
    }.disabled(controller.focusedAssetID == nil || controller.lifecycleBusy)
  }
}
/// One image slot of the selected slide: what is chosen, and whether new
/// choices land here.
struct NativeSlotChip: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slide: DeckSlide
  let role: String
  let index: Int
  private var assetID: String? { slide.mediaAssignments?.first { $0.role == role }?.assetReferenceId }
  private var active: Bool { controller.curateRole == role && slide.imageRoles.count > 1 }
  var body: some View {
    Button { controller.curateRole = role } label: {
      HStack(spacing: 6) {
        ZStack {
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .strokeBorder(Color.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: assetID == nil ? [3, 2] : []))
          if let id = assetID {
            NativeAssetImage(source: controller.sources[id], longestSide: 256)
              .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
          } else {
            Image(systemName: "plus").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
          }
        }.frame(width: 38, height: 26)
        if slide.imageRoles.count > 1 { Text("\(index + 1)").workbenchText(.caption).monospacedDigit() }
      }.padding(3).padding(.trailing, slide.imageRoles.count > 1 ? 4 : 0)
        .background(active ? Color.accentColor.opacity(0.16) : Color.clear, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(active ? Color.accentColor : Color.clear, lineWidth: 1.5))
        .contentShape(Rectangle())
    }.buttonStyle(.plain)
      .help(slide.imageRoles.count > 1 ? "Choose into Image \(index + 1)" : assetID == nil ? "No image chosen" : controller.assetIndex[assetID!]?.filename ?? "Chosen image")
      .accessibilityLabel("Image \(index + 1): \(assetID.flatMap { controller.assetIndex[$0]?.filename } ?? "no image chosen")")
      .accessibilityAddTraits(controller.curateRole == role ? .isSelected : [])
  }
}
struct NativePreviewView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    ZStack {
      Color(white: 0.06)
      NativeAssetImage(source: controller.focusedAssetID.flatMap { controller.sources[$0] })
        .padding(.horizontal, 72).padding(.top, 76).padding(.bottom, 118)
      HStack {
        edgeButton("chevron.left", "Previous image") { controller.focusNext(-1) }
        Spacer()
        edgeButton("chevron.right", "Next image") { controller.focusNext(1) }
      }.padding(.horizontal, 16)
      VStack(spacing: 0) {
        HStack(alignment: .center, spacing: 12) {
          VStack(alignment: .leading, spacing: 2) {
            Text(controller.focusedAsset?.filename ?? "Preview").workbenchText(.label).lineLimit(1)
            Text(controller.selectedSlide?.title ?? "").workbenchText(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
          Spacer()
          if let id = controller.focusedAssetID {
            if controller.chosenAssetIDs.contains(id) { NativeBadge(text: "Chosen", systemImage: "checkmark.circle.fill", tint: .accentColor) }
            if controller.shortlistedAssetIDs.contains(id) { NativeBadge(text: "Shortlisted", systemImage: "bookmark.fill", tint: .orange) }
          }
          Text(position).workbenchText(.caption).foregroundStyle(.secondary).monospacedDigit()
          Button { controller.previewOpen = false } label: { HStack(spacing: 6) { Text("Done"); NativeKeycap("Esc") } }
            .accessibilityLabel("Done · Esc")
        }.padding(.horizontal, 18).padding(.vertical, 12)
          .background(LinearGradient(colors: [Color.black.opacity(0.75), .clear], startPoint: .top, endPoint: .bottom))
        Spacer()
        VStack(spacing: 8) {
          NativeCurateActions(controller: controller).nativeFloatingBar()
          Text("← → Browse · S Shortlist · M Choose · X Reject · C Compare · Space/Esc Close")
            .workbenchText(.caption).foregroundStyle(.secondary)
        }.padding(.horizontal, 18).padding(.bottom, 16)
      }
    }.frame(maxWidth: .infinity, maxHeight: .infinity)
      .environment(\.colorScheme, .dark)
  }
  private func edgeButton(_ systemImage: String, _ label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: systemImage).font(.system(size: 18, weight: .semibold))
        .frame(width: 40, height: 40).background(.regularMaterial, in: Circle())
    }.buttonStyle(.plain).accessibilityLabel(label)
  }
  private var position: String {
    guard let id = controller.focusedAssetID, let index = controller.previewIDs.firstIndex(of: id)
    else { return "" }
    return "\(index+1) / \(controller.previewIDs.count)"
  }
}
struct NativeCompareView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    VStack(spacing: 16) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text("Compare for \(controller.selectedSlide?.title ?? "slide")").workbenchText(.label)
          Text("\(controller.compareIDs.count) candidates").workbenchText(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        Button("Clear comparison") {
          controller.compareIDs = []
          controller.compareOpen = false
        }
        Button { controller.compareOpen = false } label: { HStack(spacing: 6) { Text("Done"); NativeKeycap("Esc") } }
          .accessibilityLabel("Done")
      }
      HStack(spacing: 14) {
        ForEach(Array(controller.compareIDs.enumerated()), id: \.element) { index, id in
          let selected = controller.comparedAssetID == id
          VStack(spacing: 10) {
            NativeAssetImage(source: controller.sources[id]).frame(maxWidth: .infinity, maxHeight: .infinity)
            HStack(spacing: 8) {
              NativeKeycap("\(index + 1)")
              Text(controller.assetIndex[id]?.filename ?? id).workbenchText(.caption).lineLimit(1).truncationMode(.middle)
              Spacer(minLength: 4)
              if controller.chosenAssetIDs.contains(id) { Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint).accessibilityLabel("Chosen") }
            }
            Button("Choose this image") { controller.decide("use", assetID: id) }
              .buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
          }.padding(12)
            .background(Color.white.opacity(selected ? 0.1 : 0.05), in: RoundedRectangle(cornerRadius: NativeDesign.radiusLarge, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: NativeDesign.radiusLarge, style: .continuous)
              .strokeBorder(selected ? Color.accentColor : Color.white.opacity(0.08), lineWidth: selected ? 3 : 1))
            .contentShape(Rectangle())
            .onTapGesture { controller.comparedAssetID = id }
        }
      }
      Text("← → Select candidate · M Choose · S Shortlist · 1/2/3 Choose directly · Esc Close").workbenchText(.caption).foregroundStyle(.secondary)
    }.padding(18).frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color(white: 0.08))
      .environment(\.colorScheme, .dark)
  }
}
struct NativeAssembleView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    ZStack(alignment: .bottom) {
      NativeCanvas(controller: controller)
        .overlay(alignment: .topTrailing) { reviewNotes }
      if controller.cleanPreview {
        VStack(spacing: 8) {
          reviewBar
          Text("← → Browse slides · Home / End Jump · N Notes · Escape Return to editing")
            .workbenchText(.caption).foregroundStyle(Color.white.opacity(0.5))
        }.padding(.bottom, 12)
      } else {
        VStack {
          Text("Drag text to move · Drag image to crop · Command-drag moves its frame · Space-drag pans · Escape cancels")
            .workbenchText(.caption).foregroundStyle(.secondary).lineLimit(1).padding(.top, 10).padding(.horizontal, 16)
          Spacer()
          canvasBar.padding(.bottom, 14)
        }
      }
    }
  }
  private var canvasBar: some View {
    HStack(spacing: 10) {
      Toggle(isOn: $controller.showGuides) { Label("Guides", systemImage: "grid") }.toggleStyle(.button)
        .help("Show the 24 × 12 layout grid; dragging snaps to it (Option-drag to move freely)")
      Divider().frame(height: 18)
      Button { controller.zoom = max(0.25, controller.zoom / 1.25) } label: { Image(systemName: "minus.magnifyingglass") }
        .buttonStyle(.borderless).accessibilityLabel("Zoom out")
      Slider(value: $controller.zoom, in: 0.25...3).frame(width: 110 * controller.interfaceScale).help("Canvas zoom; does not change export")
        .accessibilityLabel("Canvas zoom")
      Button { controller.zoom = min(3, controller.zoom * 1.25) } label: { Image(systemName: "plus.magnifyingglass") }
        .buttonStyle(.borderless).accessibilityLabel("Zoom in")
      Button("Fit") { controller.fitCanvas() }.help("Fit the slide to the window (Command-0)")
      Divider().frame(height: 18)
      Button { controller.startCleanPreview() } label: { Label("Review deck", systemImage: "play.fill") }
        .buttonStyle(.borderedProminent).help("Review the deck full-window (Shift-Command-P)")
    }.controlSize(.small).nativeFloatingBar()
  }
  @ViewBuilder private var reviewNotes: some View {
    if controller.cleanPreview && controller.reviewNotes, let slide = controller.selectedSlide {
      let notes = controller.notes(for: slide.id).trimmingCharacters(in: .whitespacesAndNewlines)
      VStack(alignment: .leading, spacing: 8) {
        NativeEyebrow("Designer notes")
        ScrollView {
          Text(notes.isEmpty ? "No notes for this slide." : notes)
            .workbenchText(.bodyCompact).foregroundStyle(notes.isEmpty ? Color.secondary : Color.primary)
            .frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
        }.frame(maxHeight: 260).fixedSize(horizontal: false, vertical: true)
      }.padding(16).frame(width: 340)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: NativeDesign.radiusLarge, style: .continuous))
        .environment(\.colorScheme, .dark)
        .padding(18)
    }
  }
  private var reviewBar: some View {
    HStack(spacing: 12) {
      Button { controller.moveSlide(-1) } label: { Image(systemName: "chevron.left") }
        .buttonStyle(.borderless)
        .disabled(!controller.canReorderSlide(controller.selectedSlideID, by: -1)).accessibilityLabel("Previous slide")
      Text("\(controller.slideOrdinals[controller.selectedSlideID ?? ""] ?? 0) / \(controller.slides.count)")
        .monospacedDigit().foregroundStyle(.secondary)
      Button { controller.moveSlide(1) } label: { Image(systemName: "chevron.right") }
        .buttonStyle(.borderless)
        .disabled(!controller.canReorderSlide(controller.selectedSlideID, by: 1)).accessibilityLabel("Next slide")
      Divider().frame(height: 18)
      Text(controller.selectedSlide?.title ?? "").workbenchText(.label).lineLimit(1).frame(maxWidth: 320)
      Divider().frame(height: 18)
      // Work started before reviewing stays visible and stoppable.
      if controller.exportRunning {
        ProgressView(value: controller.exportProgress).frame(width: 80)
        Button("Cancel Export") { controller.cancelExport() }.controlSize(.small)
      } else if controller.scanRunning {
        ProgressView().controlSize(.small)
        Button("Cancel Scan") { controller.cancelScan() }.controlSize(.small)
      }
      Toggle(isOn: $controller.reviewNotes) { HStack(spacing: 6) { Text("Notes"); NativeKeycap("N") } }
        .toggleStyle(.button).accessibilityLabel("Show designer notes")
      Button { controller.endCleanPreview() } label: { HStack(spacing: 6) { Text("Back to editing"); NativeKeycap("Esc") } }
        .accessibilityLabel("Back to editing · Esc")
    }.nativeFloatingBar().environment(\.colorScheme, .dark)
      .help("← → Browse slides · Home / End Jump · Escape Return to editing")
  }
}
struct NativeAssemblyInspector: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slide: DeckSlide
  @State private var bodySize: Double = 32
  @State private var opacity: Double = 0.78
  @State private var editingSize = false
  @State private var editingOpacity = false
  private var preset: String { NativeSlideRenderer.resolvedPreset(slide: slide) }
  private var legacy: Bool { slide.settings.layout.preset == "legacy" }
  var body: some View {
    Group {
      Section("Prototype layout") {
        NativeLayoutTiles(controller: controller, slide: slide)
        Toggle("Solid background", isOn: Binding(
          get: { preset == "text-only" },
          set: { controller.patchLayout(["preset": $0 ? "text-only" : "left"], id: slide.id) }))
          .disabled(!controller.slideEditingAvailable || legacy)
          .accessibilityIdentifier("slide-solid-background")
          .help("Hides artwork while keeping chosen images and shortlist. Turning off uses Text left with the first chosen image.")
        note("Solid background hides artwork but keeps chosen images and the shortlist; turning it off uses Text left with the first chosen image.")
        if preset == "moodboard" {
          Picker("Image slots", selection: Binding(get: { slide.settings.layout.imageCount ?? 6 }, set: { controller.patchLayout(["imageCount": $0, "frames": NSNull()]) })) {
            ForEach(1...12, id: \.self) { Text(String($0)).tag($0) }
          }
          note("Drag an image to crop it; Command-drag moves its frame. Reducing slots keeps displaced images shortlisted.")
        }
        if slide.settings.layout.contents == true { note("Contents updates from included slide names and order. Selected exports recalculate its page references.") }
        if legacy {
          note("Preserved layout. Text fitting and region controls require conversion; unsupported legacy shapes are not rendered.")
          Button("Convert to native prototype layout") { controller.chooseLayout("left") }
        }
      }
      Section("Text and appearance") {
        Group {
          Picker(
            "Columns",
            selection: Binding(
              get: { slide.settings.layout.columns }, set: { controller.patchLayout(["columns": $0]) })
          ) { ForEach(1...3, id: \.self) { Text(String($0)).tag($0) } }.pickerStyle(.segmented)
          Toggle(
            "Fit copy within readable limits",
            isOn: Binding(
              get: { slide.settings.layout.fitCopy }, set: { controller.patchLayout(["fitCopy": $0]) }))
          if slide.settings.layout.starterType == nil {
            LabeledContent("Provisional size") { Text("\(Int(bodySize))").monospacedDigit() }
            Slider(
              value: $bodySize, in: 20...48, step: 1,
              onEditingChanged: { editing in
                editingSize = editing
                if !editing { controller.patchLayout(["bodySize": bodySize]) }
              }).accessibilityLabel("Provisional size")
          }
          Picker("Slide appearance", selection: Binding(get: { slide.settings.layout.appearance ?? "dark" }, set: { controller.patchLayout(["appearance": $0]) })) {
            Text("Dark").tag("dark"); Text("Light").tag("light")
          }.pickerStyle(.segmented)
          LabeledContent {
            Button("Type & colours…") { controller.showStarterStyle = true }
              .help("Choose fonts, step through Head / Sub / Body sizes, and edit the four-accent palette")
          } label: {
            if let type = slide.settings.layout.starterType {
              Text("Head \(Int(NativeTypeSize.preset(role: "headline", step: type.head.step).size.rounded())) · Sub \(Int(NativeTypeSize.preset(role: "subheadline", step: type.sub.step).size.rounded())) · Body \(Int(NativeTypeSize.preset(role: "body", step: type.body.step).size.rounded()))")
                .workbenchText(.caption).foregroundStyle(.secondary)
            } else { Text("Type").workbenchText(.caption).foregroundStyle(.secondary) }
          }
          if let type = slide.settings.layout.starterType, !type.unavailableFonts.isEmpty {
            Text("Missing fonts: " + type.unavailableFonts.joined(separator: ", ") + ". System font is shown temporarily.").workbenchText(.caption).foregroundStyle(NativeDesign.attention)
          }
        }.disabled(legacy || preset == "image-only")
        if let canvas = controller.document?.deck.canvasPreset, let resolved = controller.resolvedScene {
          LabeledContent("Fit size") {
            Text(verbatim: "\(Int(resolved.effectiveBodySize)) · \(Int(canvas.width)) × \(Int(canvas.height))").monospacedDigit()
          }.workbenchText(.caption).foregroundStyle(.secondary)
          if resolved.overflowCharacters > 0 {
            Label("Some copy does not fit this rough layout. Export remains available; include a notes or copy companion to deliver the complete writing.",
              systemImage: "exclamationmark.triangle.fill")
              .workbenchText(.caption).foregroundStyle(NativeDesign.attention)
          }
        }
      }
      Section("Selected element") {
        Picker("Adjust", selection: $controller.selectionTarget) {
          if preset != "image-only" { Text("Text region").tag("text") }
          ForEach(Array(slide.imageRoles.enumerated()), id: \.element) { index, role in Text("Image \(index + 1)").tag(role) }
          if controller.resolvedScene?.gradient != nil { Text("Gradient").tag("gradient") }
        }
        if controller.selectionTarget == "gradient" {
          LabeledContent("Gradient strength") { Text("\(Int(opacity*100))%").monospacedDigit() }
          Slider(
            value: $opacity, in: 0...1,
            onEditingChanged: { editing in
              editingOpacity = editing
              if !editing {
                var g = controller.resolvedScene?.gradient ?? PrototypeGradient()
                g.opacity = opacity
                setGradient(g)
              }
            }).accessibilityLabel("Gradient strength")
          // Direction buttons change only the direction; the slide's gradient
          // colours (a light slide's cream fade, say) stay as they are.
          LabeledContent("Direction") {
            HStack(spacing: 4) {
              Button("Left") { setDirection(PrototypePoint(x: 0, y: 0.5), PrototypePoint(x: 0.72, y: 0.5)) }
              Button("Right") { setDirection(PrototypePoint(x: 1, y: 0.5), PrototypePoint(x: 0.28, y: 0.5)) }
              Button("Bottom") { setDirection(PrototypePoint(x: 0.5, y: 1), PrototypePoint(x: 0.5, y: 0.25)) }
            }.controlSize(.small)
          }
        } else if controller.selectionTarget != "text" {
          Picker(
            "Image",
            selection: Binding(
              get: { slide.settings.layout.imageFits[controller.selectionTarget] ?? "fill" },
              set: { controller.patchLayout(["imageFits": [controller.selectionTarget: $0]]) })
          ) {
            Text("Fill / crop").tag("fill")
            Text("Fit whole image").tag("fit")
          }.pickerStyle(.segmented)
          if controller.cropZoom(for: controller.selectionTarget) != nil {
            NativeCropZoomControls(controller: controller, slideID: slide.id, role: controller.selectionTarget)
              .id(slide.id + ":" + controller.selectionTarget)
          }
          Button("Reset crop") {
            controller.patchLayout([
              "crops": [controller.selectionTarget: ["x": 0, "y": 0, "width": 1, "height": 1]]
            ])
          }.controlSize(.small)
        }
        if controller.selectionTarget == "text", !legacy {
          Button("Reset text region") { controller.patchLayout(["textFrame": NSNull()]) }.controlSize(.small)
        }
        if let scene = controller.resolvedScene {
          LabeledContent("Nudge") {
            HStack(spacing: 2) {
              ForEach([("Left", "arrow.left"), ("Up", "arrow.up"), ("Down", "arrow.down"), ("Right", "arrow.right")], id: \.0) { direction, symbol in
                Button {
                  let target = controller.selectionTarget
                  if let frame = target == "text" ? scene.textRegion : scene.imageLayers.first(where: { $0.role == target })?.frame {
                    controller.nudge(dx: direction == "Left" ? -10 : direction == "Right" ? 10 : 0,
                      dy: direction == "Up" ? -10 : direction == "Down" ? 10 : 0, frame: PrototypeFrame(frame))
                  }
                } label: { Image(systemName: symbol) }
                  .help("Move selected region \(direction.lowercased()) by ten canvas units").accessibilityLabel("Move \(direction.lowercased())")
              }
            }.controlSize(.small)
          }.disabled(controller.selectionTarget == "gradient" || scene.legacy)
        }
      }
      Section("Arrangement") {
        if !legacy {
          Button("Reset placement") { controller.resetPlacement() }
            .help("Restore this layout’s text region, image frames and gradient. Keep copy, crops, notes and candidates.")
        }
        Button("Apply arrangement…") { controller.showApplyLayout = true }.help("Apply this layout to selected slides without changing their copy or image crops")
      }
    }.onAppear { synchronize() }
      .onChange(of: slide.id) { _, _ in synchronize() }
      .onChange(of: slide.settings.layout.bodySize) { _, value in if !editingSize { bodySize = value } }
      .onChange(of: controller.resolvedScene?.gradient) { _, value in if !editingOpacity { opacity = value?.opacity ?? 0 } }
  }
  private func note(_ text: String) -> some View {
    Text(text).workbenchText(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
  }
  private func synchronize() {
    bodySize = slide.settings.layout.bodySize
    opacity = controller.resolvedScene?.gradient?.opacity ?? 0

  }
  private func setGradient(_ gradient: PrototypeGradient) {
    do { controller.patchLayout(["gradient": try nativeObject(gradient)]) } catch {
      controller.failure = error.localizedDescription
    }
  }
  private func setDirection(_ start: PrototypePoint, _ end: PrototypePoint) {
    var g = controller.resolvedScene?.gradient ?? PrototypeGradient()
    g.opacity = opacity
    g.start = start
    g.end = end
    setGradient(g)
  }
}
/// Layout choices as schematics, so the arrangement is recognised before
/// its name is read.
struct NativeLayoutTiles: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slide: DeckSlide
  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 68 * controller.interfaceScale), spacing: 6)], spacing: 6) {
      ForEach(NativeLayoutChoice.all) { choice in
        let selected = slide.settings.layout.preset == choice.id
        Button { controller.chooseLayout(choice.id, id: slide.id) } label: {
          VStack(spacing: 4) {
            NativeLayoutSchematic(preset: choice.id, selected: selected)
              .aspectRatio(16 / 9, contentMode: .fit)
            Text(choice.shortName).workbenchText(.caption).lineLimit(1).minimumScaleFactor(0.8)
              .foregroundStyle(selected ? Color.primary : Color.secondary)
          }.padding(5)
            .background(selected ? Color.accentColor.opacity(0.14) : Color.clear, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(selected ? Color.accentColor : NativeDesign.stroke, lineWidth: selected ? 1.5 : 1))
            .contentShape(Rectangle())
        }.buttonStyle(.plain).help(choice.name)
          .accessibilityLabel(choice.name).accessibilityAddTraits(selected ? .isSelected : [])
      }
    }.disabled(!controller.slideEditingAvailable)
      .accessibilityIdentifier("slide-layout-tiles")
      .help("Change this slide’s prototype layout. Displaced images stay shortlisted. Undo restores the arrangement.")
  }
}
struct NativeExportSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  @AppStorage("native.export.prototype") private var prototype = true
  @AppStorage("native.export.notes") private var notes = true
  @AppStorage("native.export.copy") private var copy = true
  @AppStorage("native.export.approved") private var approved = true
  @AppStorage("native.export.shortlisted") private var shortlisted = true
  @AppStorage("native.export.productionCopy") private var productionCopy = true
  @AppStorage("native.export.psd") private var psd = true
  @AppStorage("native.export.inDesign") private var inDesign = false
  @AppStorage("native.export.psdCropToFrames") private var psdCropToFrames = true
  @State private var acceptChanged = false
  @State private var scope = "all"
  @State private var selectedIDs: Set<String> = []
  private var supportsPSD: Bool {
    controller.document.map { NativePSDExporter.supports($0.deck.canvasPreset) } ?? false
  }
  private var includeInDesign: Bool { inDesign && supportsPSD }
  private var includePSD: Bool { (psd || includeInDesign) && supportsPSD }
  private var includeProductionCopy: Bool { productionCopy || includePSD }
  private var exportIDs: Set<String> {
    let ids = scope == "current" ? Set([controller.selectedSlideID ?? ""]) : scope == "selected" ? selectedIDs : Set(controller.slides.map(\.id))
    return Set(controller.slides.filter { $0.settings.included && ids.contains($0.id) }.map(\.id))
  }
  private var exportCount: Int { exportIDs.count }
  private var itemCount: Int {
    [prototype, notes, copy, includeProductionCopy, includePSD, includeInDesign, approved, shortlisted].filter { $0 }.count
  }
  var body: some View {
    NativeSheetScaffold(title: "Export designer handoff", subtitle: "A new folder. Original source files stay untouched.", systemImage: "shippingbox") {
      Form {
        NativeExportReadiness(controller: controller, thumbnails: controller.thumbnails, slideIDs: exportIDs)
        Section("Guides and writing") {
          item("Prototype.pdf", "Clean visual guide", "doc.richtext", $prototype)
          item("Prototype with notes.pdf", "Complete copy and direction", "doc.text.below.ecg", $notes)
          item("Copy.md", "Complete writing", "text.alignleft", $copy)
        }
        Section {
          item("Production / workbench.md", "Figma or InDesign writing", "doc.plaintext", Binding(
            get: { includeProductionCopy }, set: { productionCopy = $0 }
          )).disabled(includePSD)
          item("Production / PSD", "Numbered Photoshop slides", "square.stack.3d.up", Binding(
            get: { includePSD }, set: { psd = $0 }
          )).disabled(!supportsPSD || includeInDesign)
          item("InDesign / Deck.indd", "Build automatically", "wand.and.stars", Binding(
            get: { includeInDesign }, set: { inDesign = $0 }
          )).disabled(!supportsPSD)
          if includeInDesign {
            caption("Includes PSDs, writing and the complete starter kit. InDesign opens to build your deck after the handoff is saved. macOS may ask for Automation permission.")
          }
          if includePSD {
            Picker("PSD artwork", selection: $psdCropToFrames) {
              Text("Match Workbench · editable masks").tag(true)
              Text("Full images · no frame crop").tag(false)
            }
            caption(psdCropToFrames
              ? "Keeps the Workbench framing with editable layer masks. Full original images remain inside Smart Objects; disable a mask in Photoshop to reveal them."
              : "Keeps image position and scale, with framing masks disabled. Images may extend beyond their Workbench frames. The full originals remain editable inside Smart Objects.")
            caption(includeInDesign ? "PSDs are created one at a time before InDesign starts." : "Includes workbench.md for Figma or InDesign. PSDs are created one at a time; Adobe apps can stay closed.")
          } else if !supportsPSD {
            caption("PSDs need 1920 × 1080 or 2576 × 1080. Writing, PDFs and original media are available for this canvas.")
          }
          if includeProductionCopy {
            caption("Starter Kit · both sizes, layout kits, colour/type controls, text scrambling and the Photoshop → Figma PNG exporter. Included in this folder.")
          }
        } header: { Text("Production") }
        Section("Media") {
          item("Approved Media", "Original files per slide", "photo.on.rectangle", $approved)
          item("Shortlisted Media", "Candidates per slide", "bookmark", $shortlisted)
        }
        Section {
          Picker("Slides", selection: $scope) {
            Text("All included").tag("all"); Text("Current slide").tag("current"); Text("Choose slides").tag("selected")
          }.pickerStyle(.segmented)
          if scope == "selected" {
            ForEach(controller.slides.filter { $0.settings.included }) { slide in
              Toggle(slide.title, isOn: Binding(get: { selectedIDs.contains(slide.id) }, set: { if $0 { selectedIDs.insert(slide.id) } else { selectedIDs.remove(slide.id) } }))
            }
          }
          Text(exportCount == 0 ? "No included slides in this selection. Enable Include in handoff, or choose other slides." : "\(exportCount) included slide\(exportCount == 1 ? "" : "s")")
            .workbenchText(.bodyCompact).foregroundStyle(exportCount == 0 ? NativeDesign.attention : Color.secondary)
        } header: { Text("Slides") }
        Section {
          Toggle("Accept externally changed source files", isOn: $acceptChanged)
          caption("Leave this off to detect originals that changed after selection. Missing media and layout warnings are reported, not hidden.")
        } header: { Text("Source checks") }
      }.formStyle(.grouped)
    } footer: {
      Button("Cancel") { controller.showExport = false }.keyboardShortcut(.cancelAction)
      Spacer()
      Text("\(exportCount) slide\(exportCount == 1 ? "" : "s") · \(itemCount) item\(itemCount == 1 ? "" : "s")")
        .workbenchText(.caption).foregroundStyle(.secondary)
      Button("Choose Destination…") {
        var options = HandoffOptions()
        options.prototypePDF = prototype
        options.notesPDF = notes
        options.copy = copy
        options.approved = approved
        options.shortlisted = shortlisted
        options.productionCopy = includeProductionCopy
        options.psd = includePSD
        options.inDesign = includeInDesign
        options.psdCropToFrames = psdCropToFrames
        options.acceptChangedSources = acceptChanged
        options.selectedSlideIDs = scope == "current" ? Set([controller.selectedSlideID ?? ""]) : scope == "selected" ? selectedIDs : nil
        controller.export(options)
      }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).disabled(
        (!prototype && !notes && !copy && !approved && !shortlisted && !includeProductionCopy && !includePSD) || exportCount == 0 || !controller.canExport)
    }.nativeSheetFrame(width: 640, height: 720)
      .disabled(controller.exportChoosingDestination)
  }
  private func item(_ title: String, _ detail: String, _ systemImage: String, _ isOn: Binding<Bool>) -> some View {
    Toggle(isOn: isOn) {
      Label {
        VStack(alignment: .leading, spacing: 1) {
          Text(title)
          Text(detail).workbenchText(.caption).foregroundStyle(.secondary)
        }
      } icon: { Image(systemName: systemImage).foregroundStyle(.tint) }
    }.accessibilityLabel("\(title) · \(detail.lowercased())")
  }
  private func caption(_ text: String) -> some View {
    Text(text).workbenchText(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
  }
}
/// What the designer will find missing, before the handoff is made. Export
/// stays available; each line jumps to the slide.
struct NativeExportReadiness: View {
  @ObservedObject var controller: NativeWorkbenchController
  @ObservedObject var thumbnails: NativeSlideThumbnails
  let slideIDs: Set<String>
  private var exported: [DeckSlide] { controller.slides.filter { slideIDs.contains($0.id) } }
  private var missing: [DeckSlide] { exported.filter { NativeSlideReadiness($0).needsImage } }
  private var overflowing: [DeckSlide] { exported.filter { thumbnails.overflowing.contains($0.id) } }
  var body: some View {
    Section {
      if missing.isEmpty && overflowing.isEmpty {
        Label(exported.isEmpty ? "Choose at least one included slide." : "Every slide in this handoff has its images, and its copy fits.",
          systemImage: exported.isEmpty ? "info.circle" : "checkmark.seal.fill")
          .foregroundStyle(exported.isEmpty ? Color.secondary : NativeDesign.ready)
      }
      ForEach(missing) { slide in row(slide, problem: NativeSlideReadiness(slide).label, systemImage: "photo.badge.plus", phase: "curate") }
      ForEach(overflowing) { slide in row(slide, problem: "Copy doesn’t fit its layout", systemImage: "text.badge.xmark", phase: "assemble") }
    } header: {
      Text("Before you hand off")
    } footer: {
      if !missing.isEmpty || !overflowing.isEmpty {
        Text("You can still export: empty slots stay empty and the notes PDF and Copy.md carry the complete writing.")
          .workbenchText(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
    }
  }
  private func row(_ slide: DeckSlide, problem: String, systemImage: String, phase: String) -> some View {
    HStack(spacing: 10) {
      Image(systemName: systemImage).foregroundStyle(NativeDesign.attention).frame(width: 18)
      Text(String(format: "%02d", controller.slideOrdinals[slide.id] ?? 0)).workbenchText(.data).foregroundStyle(.secondary)
      VStack(alignment: .leading, spacing: 1) {
        Text(slide.title).lineLimit(1)
        Text(problem).workbenchText(.caption).foregroundStyle(.secondary)
      }
      Spacer(minLength: 8)
      Button("Show") {
        controller.showExport = false
        controller.selectSlide(slide.id)
        controller.phase = phase
      }.controlSize(.small).accessibilityLabel("Show \(slide.title)")
    }
  }
}

struct NativeImportSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  let imported: ImportedCopyDocument
  @State private var matching = false
  private var canvasID: String { controller.imported?.canvasID ?? imported.canvasID }
  var body: some View {
    NativeSheetScaffold(title: "Import \(imported.title)",
      subtitle: "\(imported.slides.count) slides · \(NativeCanvasChoice.name(canvasID)) · copy locked by default",
      systemImage: "square.and.arrow.down") {
      VStack(alignment: .leading, spacing: 0) {
        if let error = controller.importError {
          Label(error, systemImage: "exclamationmark.triangle.fill").workbenchText(.bodyCompact).foregroundStyle(NativeDesign.attention)
            .textSelection(.enabled).padding(.horizontal, 24).padding(.top, 14)
        }
        if matching {
          NativeReplacementPanel(controller: controller, imported: imported).padding(24)
        } else {
          HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
              NativeEyebrow("New deck canvas")
              ScrollView {
                VStack(spacing: 6) {
                  ForEach(NativeCanvasChoice.all) { choice in
                    canvasOption(choice)
                  }
                }
              }
              Text("Choose the size before creating a deck. Copy replacement retains the open deck’s canvas.")
                .workbenchText(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }.padding(20).frame(width: 250 * min(1.25, controller.interfaceScale))
            Divider()
            VStack(alignment: .leading, spacing: 10) {
              NativeEyebrow("\(imported.slides.count) slides")
              ScrollView {
                LazyVStack(spacing: 8) {
                  ForEach(Array(imported.slides.enumerated()), id: \.element.id) { index, slide in
                    HStack(alignment: .top, spacing: 12) {
                      Text(String(format: "%02d", index + 1)).workbenchText(.data).foregroundStyle(.secondary)
                      VStack(alignment: .leading, spacing: 4) {
                        Text(slide.title).workbenchText(.label)
                        Text(slide.blocks.map(\.text).joined(separator: "\n")).lineLimit(4).workbenchText(.caption)
                          .foregroundStyle(.secondary)
                      }
                      Spacer(minLength: 0)
                    }.nativeCard(padding: 12, radius: 8)
                  }
                }.padding(.bottom, 4)
              }
            }.padding(20)
          }
        }
      }
    } footer: {
      Button("Cancel") { controller.imported = nil }.keyboardShortcut(.cancelAction)
      if controller.document != nil {
        Button(matching ? "Show import" : "Preview replacement…") { matching.toggle() }
      }
      Text("No text is rewritten. Slide boundaries and optional copy fields come from the file.")
        .workbenchText(.caption).foregroundStyle(.secondary).lineLimit(2)
      Spacer()
      Button("Create New Deck…") { controller.createImported() }.buttonStyle(.borderedProminent)
        .keyboardShortcut(matching ? nil : KeyboardShortcut.defaultAction)
    }.nativeSheetFrame(width: 820, height: 680)
      .disabled(controller.replacementSaving || controller.lifecycleBusy)
      .interactiveDismissDisabled(controller.replacementSaving || controller.lifecycleBusy)
  }
  private func canvasOption(_ choice: NativeCanvasChoice) -> some View {
    let selected = canvasID == choice.id
    return Button { controller.imported?.canvasID = choice.id } label: {
      HStack(spacing: 10) {
        ZStack {
          RoundedRectangle(cornerRadius: 2).fill(selected ? Color.accentColor.opacity(0.35) : Color.primary.opacity(0.12))
            .aspectRatio(choice.aspect, contentMode: .fit)
        }.frame(width: 34, height: 24)
        VStack(alignment: .leading, spacing: 1) {
          Text(choice.name).workbenchText(.bodyCompact)
          Text(choice.size).workbenchText(.caption).foregroundStyle(.secondary)
        }
        Spacer(minLength: 0)
        if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint) }
      }.padding(8)
        .background(selected ? Color.accentColor.opacity(0.1) : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(selected ? Color.accentColor.opacity(0.7) : NativeDesign.stroke))
        .contentShape(Rectangle())
    }.buttonStyle(.plain).accessibilityLabel("\(choice.name), \(choice.size)").accessibilityAddTraits(selected ? .isSelected : [])
  }
}
struct NativeSettingsView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    NativeSheetScaffold(title: "Settings", subtitle: "Interface size does not change the canvas or exported deck.", systemImage: "gearshape") {
      Form {
        Section("Interface") {
          Picker("Appearance", selection: $controller.theme) {
            Text("System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }.pickerStyle(.segmented).fixedSize()
          Picker("Interface size", selection: $controller.interfaceScale) {
            ForEach([0.9, 1.0, 1.1, 1.25, 1.5, 1.75], id: \.self) { Text("\(Int($0*100))%").tag($0) }
          }
          Toggle("Advance after choosing, shortlisting or rejecting", isOn: $controller.autoAdvance)
        }
        Section {
          ForEach([(NativeAdobeAutomation.inDesignID, "Connect InDesign"), (NativeAdobeAutomation.photoshopID, "Connect Photoshop")], id: \.0) { id, title in
            VStack(alignment: .leading, spacing: 6) {
              Button(title) { controller.setUpAdobe(id) }.disabled(controller.adobeSetupBusy || controller.exportRunning)
              if let status = controller.adobeStatus[id] {
                Text(status).workbenchText(.caption).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
              }
            }
          }
          Button("Open Automation permissions") {
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") { NSWorkspace.shared.open(url) }
          }
          VStack(alignment: .leading, spacing: 6) {
            Button("Save complete starter kit…") { controller.saveStarterKit() }.disabled(controller.adobeSetupBusy || controller.exportRunning)
            if let status = controller.adobeStatus["kit"] { Text(status).workbenchText(.caption) }
          }
        } header: {
          Text("Adobe setup & starter kit")
        } footer: {
          Text("Connect the apps you use before a handoff. Each button may open that app and ask for macOS permission. File access comes from the folders you choose.")
            .workbenchText(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
      }.formStyle(.grouped)
    } footer: {
      // The form scrolls inside the sheet, so Done stays reachable at large
      // interface sizes; Escape closes it.
      Spacer(); Button("Done") { controller.showSettings = false }.keyboardShortcut(.cancelAction)
    }
    .nativeSheetFrame(width: 560 * controller.interfaceScale, height: 640 * controller.interfaceScale)
  }
}
