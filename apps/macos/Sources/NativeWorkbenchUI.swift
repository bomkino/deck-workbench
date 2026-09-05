import AppKit
import SwiftUI

struct NativeWorkbenchRoot: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State private var columns: NavigationSplitViewVisibility = .all
  var body: some View {
    NavigationSplitView(columnVisibility: $columns) {
      NativeSlideSidebar(controller: controller)
    } detail: {
      VStack(spacing: 0) {
        if let failure = controller.failure {
          VStack(alignment: .leading, spacing: 8) {
            Text(failure).font(.callout).textSelection(.enabled)
            HStack {
              if !controller.failedCommands.isEmpty {
                Button("Retry Pending Actions") { controller.retryPending() }
                Button("Save Pending Actions…") { controller.savePending() }
                Button("Discard Unsaved Actions…") { controller.discardPending() }
              }
              Spacer()
              Button("Dismiss") { controller.failure = nil }
            }
          }.padding(12).background(Color.orange.opacity(0.14))
          Divider()
        }
        if controller.document == nil {
          VStack(alignment: .leading, spacing: 20) {
            Text("Copy. Images. Intent.").font(.custom("pd-head-500", size: 36))
            Text(
              "Bring in the final writing. Choose the media. Give the designer a clear starting point."
            ).font(.title3).foregroundStyle(.secondary).frame(maxWidth: 500, alignment: .leading)
            HStack {
              Button("Import Final Copy…") { controller.importFile() }.buttonStyle(
                .borderedProminent)
              Button("Open Deck…") { controller.openPanel() }
            }
            if !controller.recentDocuments.isEmpty {
              Divider()
              Text("Recent decks").font(.headline)
              ForEach(controller.recentDocuments.prefix(5), id: \.path) { url in
                Button(url.deletingPathExtension().lastPathComponent) {
                  Task { await controller.open(url) }
                }.buttonStyle(.link)
              }
            }
          }.padding(48).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else {
          HSplitView {
            Group {
              if controller.phase == "curate" {
                NativeCurateView(controller: controller)
              } else {
                NativeAssembleView(controller: controller)
              }
            }.frame(minWidth: 390)
            NativeContextPanel(controller: controller).frame(
              minWidth: 230, idealWidth: 300, maxWidth: 400)
          }
        }
        Divider()
        HStack(spacing: 12) {
          Text(
            controller.pendingCount > 0
              ? "Saving \(controller.pendingCount) action\(controller.pendingCount==1 ? "" : "s")…"
              : controller.status
          ).font(.caption).lineLimit(2)
          Spacer()
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
          }.help("Keyboard Shortcuts (Command-/)")
        }.padding(.horizontal, 14).padding(.vertical, 9)
      }.navigationTitle(controller.document?.deck.title ?? "Workbench")
        .toolbar {
          ToolbarItemGroup(placement: .navigation) {
            Button {
              controller.importFile()
            } label: {
              Label("Import copy", systemImage: "square.and.arrow.down")
            }
            Button {
              controller.openPanel()
            } label: {
              Label("Open deck", systemImage: "folder")
            }
          }
          ToolbarItem(placement: .principal) {
            Picker("Workspace", selection: $controller.phase) {
              Text("Curate").tag("curate")
              Text("Assemble").tag("assemble")
            }.pickerStyle(.segmented).frame(width: 200).disabled(controller.document == nil)
          }
          ToolbarItemGroup(placement: .primaryAction) {
            Button {
              controller.undo()
            } label: {
              Label("Undo", systemImage: "arrow.uturn.backward")
            }.disabled(controller.document?.history.canUndo != true)
            Button("Export Handoff…") { controller.showExport = true }.disabled(
              controller.document == nil || controller.exportRunning)
          }
        }
    }
    .font(.system(size: 14 * controller.interfaceScale))
    .background(NativeKeyboardRouter(controller: controller).frame(width: 0, height: 0))
    .background(NativeWindowGuard(controller: controller).frame(width: 0, height: 0))
    .sheet(isPresented: $controller.previewOpen) { NativePreviewView(controller: controller) }
    .sheet(isPresented: $controller.showShortcuts) { NativeShortcutSheet(controller: controller) }
    .sheet(isPresented: $controller.showExport) { NativeExportSheet(controller: controller) }
    .sheet(isPresented: $controller.showSettings) { NativeSettingsView(controller: controller) }
    .sheet(isPresented: $controller.copyEditorOpen) {
      if let slide = controller.selectedSlide {
        NativeCopyEditor(controller: controller, blocks: slide.copyBlocks)
      }
    }
    .sheet(isPresented: $controller.compareOpen) { NativeCompareView(controller: controller) }
    .sheet(
      isPresented: Binding(
        get: { controller.imported != nil }, set: { if !$0 { controller.imported = nil } })
    ) {
      if let imported = controller.imported {
        NativeImportSheet(controller: controller, imported: imported)
      }
    }
    .frame(minWidth: 900, minHeight: 600)
  }
  private func ordinal(_ slide: DeckSlide) -> String {
    guard let index = controller.document?.deck.slides.firstIndex(where: { $0.id == slide.id })
    else { return "" }
    return String(format: "%02d", index + 1)
  }
}

struct NativeSlideSidebar: View {
  @ObservedObject var controller: NativeWorkbenchController
  private var selection: Binding<String?> {
    Binding(get: { controller.selectedSlideID },
            set: { if let id = $0 { controller.selectSlide(id) } })
  }
  var body: some View {
    List(selection: selection) {
      ForEach(controller.document?.deck.sections ?? []) { section in
        Section(section.title) {
          ForEach(section.slides) { slide in
            NativeSlideRow(slide: slide, ordinal: ordinal(slide)).tag(slide.id)
          }
        }
      }
    }.navigationTitle("Slides")
      .navigationSplitViewColumnWidth(min: 170, ideal: 220, max: 360)
  }
  private func ordinal(_ slide: DeckSlide) -> String {
    guard let index = controller.document?.deck.slides.firstIndex(where: { $0.id == slide.id })
    else { return "" }
    return String(format: "%02d", index + 1)
  }
}
struct NativeSlideRow: View {
  let slide: DeckSlide
  let ordinal: String
  private var summary: String {
    guard slide.settings.included else { return "Excluded from export" }
    let chosen: Int = slide.chosenIDs.count
    let shortlisted: Int = slide.settings.shortlist.count
    return "\(chosen) chosen · \(shortlisted) shortlisted"
  }
  var body: some View {
    HStack(alignment: .top) {
      Text(ordinal).font(.system(.caption, design: .monospaced))
        .foregroundStyle(.secondary).frame(width: 28)
      VStack(alignment: .leading, spacing: 4) {
        Text(slide.title).lineLimit(2)
        Text(summary).font(.caption).foregroundStyle(.secondary)
      }
    }.padding(.vertical, 5)
  }
}
struct NativeMediaGrid: View {
  @ObservedObject var controller: NativeWorkbenchController
  let width: CGFloat
  private var columns: [GridItem] {
    [GridItem(.adaptive(minimum: CGFloat(controller.gridSize)), spacing: 10)]
  }
  var body: some View {
    ScrollViewReader { scroll in
      ScrollView {
        LazyVGrid(columns: columns, spacing: 10) {
          ForEach(controller.filteredAssets) { asset in
            NativeAssetTile(controller: controller, asset: asset).id(asset.id)
          }
        }.padding(12)
      }.onChange(of: controller.focusedAssetID) { _, id in
        if !controller.previewOpen, let id { scroll.scrollTo(id, anchor: .center) }
      }
    }.onAppear { updateColumns() }
      .onChange(of: width) { _, _ in updateColumns() }
      .onChange(of: controller.gridSize) { _, _ in updateColumns() }
  }
  private func updateColumns() {
    let available = max(0.0, Double(width) - 24.0)
    let tileWidth = controller.gridSize + 10.0
    controller.gridColumns = max(1, Int(available / tileWidth))
  }
}

struct NativeCurateView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        TextField("Search filenames and folders", text: $controller.query).textFieldStyle(
          .roundedBorder)
        Picker("Collection", selection: $controller.collection) {
          Text("All media").tag("all")
          Text("Shortlist").tag("shortlist")
          Text("Chosen").tag("chosen")
          Text("Rejected").tag("rejected")
        }.frame(width: 135)
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
          Label("Folders", systemImage: "folder.badge.plus")
        }
      }.padding(12)
      HStack {
        Text("\(controller.filteredAssets.count) images").font(.caption).foregroundStyle(.secondary)
        Spacer()
        if !controller.compareIDs.isEmpty {
          Button("Compare \(controller.compareIDs.count)") { controller.compareOpen = true }
        }
        Slider(value: $controller.gridSize, in: 100...240).frame(width: 110).help("Thumbnail size")
      }.padding(.horizontal, 14).padding(.bottom, 8)
      Divider()
      if controller.assets.isEmpty {
        VStack(spacing: 12) {
          Image(systemName: "photo.on.rectangle.angled").font(.system(size: 36)).foregroundStyle(
            .secondary)
          Text(controller.scanRunning ? "Reading your media folder…" : "Choose a folder of media.")
            .font(.headline)
          Text("Originals stay where they are. Decisions are saved with the deck.").foregroundStyle(
            .secondary)
          Button("Add Media Folder…") { controller.addMediaFolder() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        GeometryReader { geometry in
          NativeMediaGrid(controller: controller, width: geometry.size.width)
        }
      }
      Divider()
      NativeCurateActions(controller: controller).padding(12)
    }
  }
}
struct NativeAssetTile: View {
  @ObservedObject var controller: NativeWorkbenchController
  let asset: NativeMediaAsset
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      NativeAssetImage(source: controller.sources[asset.id], longestSide: 512).frame(
        height: controller.gridSize * 0.66
      ).frame(maxWidth: .infinity).background(Color.black.opacity(0.10)).clipped()
      Text(asset.filename).font(.caption).lineLimit(1).truncationMode(.middle)
      HStack(spacing: 7) {
        if controller.selectedSlide?.chosenIDs.contains(asset.id) == true {
          Label("Chosen", systemImage: "checkmark.circle.fill")
        }
        if controller.selectedSlide?.settings.shortlist.contains(asset.id) == true {
          Label("Shortlisted", systemImage: "bookmark.fill")
        }
        if controller.compareIDs.contains(asset.id) { Image(systemName: "square.split.2x1") }
      }
      .font(.system(size: 10)).foregroundStyle(.secondary).frame(height: 14, alignment: .leading)
    }.padding(7).background(
      controller.focusedAssetID == asset.id ? Color.accentColor.opacity(0.12) : Color.clear
    )
    .overlay(
      RoundedRectangle(cornerRadius: 5).stroke(
        controller.focusedAssetID == asset.id ? Color.accentColor : Color.primary.opacity(0.12),
        lineWidth: controller.focusedAssetID == asset.id ? 2 : 1)
    )
    .contentShape(Rectangle()).onTapGesture(count: 2) { controller.preview(asset.id) }.onTapGesture
    { controller.focusAsset(asset.id) }
    .accessibilityElement(children: .combine).accessibilityAddTraits(
      controller.focusedAssetID == asset.id ? .isSelected : []
    )
    .contextMenu {
      Button("Choose for Slide") { controller.decide("use", assetID: asset.id) }
      Button("Add to Shortlist") { controller.decide("shortlist", assetID: asset.id) }
      Button("Remove from Shortlist") { controller.decide("remove-shortlist", assetID: asset.id) }
      Button("Reject for This Slide") { controller.decide("reject", assetID: asset.id) }
      Divider()
      Button("Add to Comparison") { controller.toggleCompare(asset.id) }
      Button("Reveal in Finder") {
        controller.focusedAssetID = asset.id
        controller.revealFocused()
      }
    }
  }
}
struct NativeAssetImage: View {
  let source: NativeMediaSource?
  var longestSide: Int = 2048
  @State private var data: Data?
  @State private var loading = true
  var body: some View {
    Group {
      if let data, let image = NSImage(data: data) {
        Image(nsImage: image).resizable().aspectRatio(contentMode: .fit)
      } else {
        VStack(spacing: 8) {
          if loading {
            ProgressView().controlSize(.small)
          } else {
            Image(systemName: "photo")
            Text(source == nil ? "Reconnect media" : "Original available; preview unsupported")
              .font(.caption).multilineTextAlignment(.center)
          }
        }.foregroundStyle(.secondary).padding(12)
      }
    }
    .task(id: "\(source?.cacheKey ?? "missing"):\(longestSide)") {
      loading = true
      data = nil
      if let source {
        data = await NativeThumbnailService.shared.data(for: source, longestSide: longestSide)
      }
      loading = false
    }
  }
}
struct NativeCurateActions: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    HStack(spacing: 10) {
      if let slide = controller.selectedSlide, slide.imageRoles.count > 1 {
        Picker("Image role", selection: $controller.curateRole) {
          ForEach(slide.imageRoles, id: \.self) { Text($0).tag($0) }
        }.frame(maxWidth: 160)
      }
      Button("Choose · M") { controller.decide("use") }.buttonStyle(.borderedProminent)
      Button("Shortlist · S") { controller.decide("shortlist") }
      Button("Reject · X") { controller.decide("reject") }
      Spacer()
      Button {
        controller.preview()
      } label: {
        Image(systemName: "arrow.up.left.and.arrow.down.right")
      }.help("Preview (Space)")
    }.disabled(controller.focusedAssetID == nil)
  }
}
struct NativePreviewView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    VStack(spacing: 12) {
      HStack {
        VStack(alignment: .leading) {
          Text(controller.focusedAsset?.filename ?? "Preview").font(.headline)
          Text(controller.selectedSlide?.title ?? "").font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        Text(position).font(.caption)
        Button("Done · Esc") { controller.previewOpen = false }
      }
      NativeAssetImage(source: controller.focusedAssetID.flatMap { controller.sources[$0] }).frame(
        maxWidth: .infinity, maxHeight: .infinity
      ).background(Color.black.opacity(0.9))
      HStack {
        Button {
          controller.focusNext(-1)
        } label: {
          Image(systemName: "chevron.left")
        }
        NativeCurateActions(controller: controller)
        Button {
          controller.focusNext(1)
        } label: {
          Image(systemName: "chevron.right")
        }
      }
      Text("← → Browse this collection · S Shortlist · M Choose · X Reject · C Compare · Esc Close")
        .font(.caption).foregroundStyle(.secondary)
    }.padding(18).frame(minWidth: 850, idealWidth: 1100, minHeight: 650, idealHeight: 780)
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
    VStack {
      HStack {
        Text("Compare for \(controller.selectedSlide?.title ?? "slide")").font(.headline)
        Spacer()
        Button("Done") { controller.compareOpen = false }
      }
      HStack {
        ForEach(Array(controller.compareIDs).sorted(), id: \.self) { id in
          VStack {
            NativeAssetImage(source: controller.sources[id])
            Text(controller.assets.first { $0.id == id }?.filename ?? id).font(.caption).lineLimit(
              1)
            Button("Choose this image") { controller.decide("use", assetID: id) }
          }
        }
      }
      Button("Clear comparison") {
        controller.compareIDs = []
        controller.compareOpen = false
      }
    }.padding(20).frame(width: 1000, height: 650)
  }
}
struct NativeAssembleView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text(controller.selectedSlide?.title ?? "").font(.headline).lineLimit(1)
        Spacer()
        Toggle("Guides", isOn: $controller.showGuides).toggleStyle(.button)
        Button("Fit") { controller.zoom = 1 }
        Slider(value: $controller.zoom, in: 0.25...3).frame(width: 110).help(
          "Canvas zoom; does not change export")
      }.padding(12)
      Divider()
      NativeCanvas(controller: controller)
      Divider()
      Text(
        "Drag text to move · Drag image to crop · Command-drag image to move its frame · Space-drag to pan · Escape cancels"
      ).font(.caption).foregroundStyle(.secondary).padding(10)
    }
  }
}
struct NativeContextPanel: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        if let slide = controller.selectedSlide {
          HStack {
            Text("Approved copy").font(.headline)
            Spacer()
            Image(systemName: "lock.fill").foregroundStyle(.secondary)
            Button("Edit…") { controller.copyEditorOpen = true }.controlSize(.small)
          }
          ForEach(slide.copyBlocks) { block in
            VStack(alignment: .leading, spacing: 5) {
              HStack {
                Text(block.role.uppercased()).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button {
                  NSPasteboard.general.clearContents()
                  NSPasteboard.general.setString(block.text, forType: .string)
                } label: {
                  Image(systemName: "doc.on.doc")
                }.buttonStyle(.plain).help("Copy \(block.role)")
              }
              Text(block.text.isEmpty ? "—" : block.text).textSelection(.enabled).font(
                .system(size: 13 * controller.interfaceScale))
            }
          }
          Divider()
          if controller.phase == "assemble" {
            NativeAssemblyInspector(controller: controller, slide: slide)
            Divider()
          }
          Text("Designer notes").font(.headline)
          TextEditor(text: Binding(get: { controller.notes }, set: { controller.setNotes($0) }))
            .font(.system(size: 13 * controller.interfaceScale)).frame(minHeight: 150).overlay(
              RoundedRectangle(cornerRadius: 4).stroke(Color.secondary.opacity(0.25)))
          Text("Direction, not on-slide copy. Included in the notes PDF and Copy.md.").font(
            .caption
          ).foregroundStyle(.secondary)
          Toggle(
            "Include in handoff",
            isOn: Binding(
              get: { slide.settings.included }, set: { controller.patchSlide(["included": $0]) }))
          if !slide.settings.shortlist.isEmpty {
            Divider()
            Text("Shortlist").font(.headline)
            ForEach(slide.settings.shortlist, id: \.self) { id in
              HStack {
                NativeAssetImage(source: controller.sources[id], longestSide: 512).frame(
                  width: 64, height: 42)
                Text(controller.assets.first { $0.id == id }?.filename ?? "Reconnect media").font(
                  .caption
                ).lineLimit(2)
                Spacer()
                Button("Use") { controller.decide("use", assetID: id) }.controlSize(.small)
              }.onTapGesture { controller.focusedAssetID = id }
            }
          }
        } else {
          Text("Choose a slide.").foregroundStyle(.secondary)
        }
      }.padding(16)
    }
  }
}
struct NativeAssemblyInspector: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slide: DeckSlide
  @State private var bodySize: Double = 32
  @State private var opacity: Double = 0.78
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Prototype layout").font(.headline)
      Picker(
        "Layout",
        selection: Binding(
          get: { slide.settings.layout.preset }, set: { controller.chooseLayout($0) })
      ) {
        Text("Default · text left").tag("auto")
        Text("Text left").tag("left")
        Text("Text right").tag("right")
        Text("Text lower").tag("lower")
        Text("Wide text").tag("wide")
        Text("Text only").tag("text-only")
        Text("Image only").tag("image-only")
        Text("Two images").tag("two-images")
        Text("Three images").tag("three-images")
        if slide.settings.layout.preset == "legacy" {
          Text("Preserved legacy layout").tag("legacy")
        }
      }
      Picker(
        "Columns",
        selection: Binding(
          get: { slide.settings.layout.columns }, set: { controller.patchLayout(["columns": $0]) })
      ) { ForEach(1...3, id: \.self) { Text(String($0)).tag($0) } }.pickerStyle(.segmented)
      Toggle(
        "Fit copy within readable limits",
        isOn: Binding(
          get: { slide.settings.layout.fitCopy }, set: { controller.patchLayout(["fitCopy": $0]) }))
      HStack {
        Text("Provisional size")
        Spacer()
        Text("\(Int(bodySize))")
      }.font(.caption)
      Slider(
        value: $bodySize, in: 20...48, step: 1,
        onEditingChanged: { editing in
          if !editing { controller.patchLayout(["bodySize": bodySize]) }
        })
      Picker("Adjust", selection: $controller.selectionTarget) {
        Text("Text region").tag("text")
        ForEach(slide.imageRoles, id: \.self) { Text("Image · \($0)").tag($0) }
        Text("Gradient").tag("gradient")
      }
      if controller.selectionTarget == "gradient" {
        HStack {
          Text("Gradient strength")
          Spacer()
          Text("\(Int(opacity*100))%")
        }.font(.caption)
        Slider(
          value: $opacity, in: 0...1,
          onEditingChanged: { editing in
            if !editing {
              var g = slide.settings.layout.gradient ?? PrototypeGradient()
              g.opacity = opacity
              setGradient(g)
            }
          })
        HStack {
          Button("Left") { setGradient(PrototypeGradient()) }
          Button("Right") {
            var g = PrototypeGradient()
            g.start = PrototypePoint(x: 1, y: 0.5)
            g.end = PrototypePoint(x: 0.28, y: 0.5)
            setGradient(g)
          }
          Button("Bottom") {
            var g = PrototypeGradient()
            g.start = PrototypePoint(x: 0.5, y: 1)
            g.end = PrototypePoint(x: 0.5, y: 0.25)
            setGradient(g)
          }
        }.controlSize(.small)
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
        Button("Reset crop") {
          controller.patchLayout([
            "crops": [controller.selectionTarget: ["x": 0, "y": 0, "width": 1, "height": 1]]
          ])
        }.controlSize(.small)
      }
      if let canvas = controller.document?.deck.canvasPreset {
        let resolved = NativeSlideRenderer.resolve(slide: slide, canvas: canvas)
        Text(
          "Fit size: \(Int(resolved.effectiveBodySize)) · \(Int(canvas.width)) × \(Int(canvas.height))"
        ).font(.caption).foregroundStyle(.secondary)
        if resolved.overflowCharacters > 0 {
          Text(
            "Some copy does not fit this rough layout. Export remains available; the companion contains all writing."
          ).font(.caption).foregroundStyle(.orange)
        }
      }
    }.onAppear {
      bodySize = slide.settings.layout.bodySize
      opacity = slide.settings.layout.gradient?.opacity ?? 0.78
    }.onChange(of: slide.id) { _ in
      bodySize = slide.settings.layout.bodySize
      opacity = slide.settings.layout.gradient?.opacity ?? 0.78
    }
  }
  private func setGradient(_ gradient: PrototypeGradient) {
    do { controller.patchLayout(["gradient": try nativeObject(gradient)]) } catch {
      controller.failure = error.localizedDescription
    }
  }
}
struct NativeExportSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State private var prototype = true
  @State private var notes = true
  @State private var copy = true
  @State private var approved = true
  @State private var shortlisted = true
  @State private var acceptChanged = false
  @State private var onlyCurrent = false
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("Export designer handoff").font(.title2)
      Text("A new folder. Original source files stay untouched.").foregroundStyle(.secondary)
      Toggle("Prototype.pdf · clean visual guide", isOn: $prototype)
      Toggle("Prototype with notes.pdf · complete copy and direction", isOn: $notes)
      Toggle("Copy.md · editable writing", isOn: $copy)
      Toggle("Approved Media · original files per slide", isOn: $approved)
      Toggle("Shortlisted Media · candidates per slide", isOn: $shortlisted)
      Divider()
      Toggle("Export only the current slide", isOn: $onlyCurrent)
      Toggle("Accept externally changed source files", isOn: $acceptChanged)
      Text(
        "Leave this off to detect originals that changed after selection. Missing media and layout warnings are reported, not hidden."
      ).font(.caption).foregroundStyle(.secondary)
      HStack {
        Button("Cancel") { controller.showExport = false }
        Spacer()
        Button("Choose Destination…") {
          var options = HandoffOptions()
          options.prototypePDF = prototype
          options.notesPDF = notes
          options.copy = copy
          options.approved = approved
          options.shortlisted = shortlisted
          options.acceptChangedSources = acceptChanged
          options.selectedSlideIDs = onlyCurrent ? Set([controller.selectedSlideID ?? ""]) : nil
          controller.export(options)
        }.buttonStyle(.borderedProminent).disabled(
          !prototype && !notes && !copy && !approved && !shortlisted)
      }
    }.padding(28).frame(width: 530)
  }
}
struct NativeImportSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  let imported: ImportedCopyDocument
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("Import \(imported.title)").font(.title2)
      Text("\(imported.slides.count) slides · \(imported.canvasID) · copy locked by default")
        .foregroundStyle(.secondary)
      List(imported.slides) { slide in
        VStack(alignment: .leading, spacing: 5) {
          Text(slide.title).font(.headline)
          Text(slide.blocks.map(\.text).joined(separator: "\n")).lineLimit(4).font(.caption)
        }
      }.frame(height: 350)
      Text("No text is rewritten. Slide boundaries and optional copy fields come from the file.")
        .font(.caption).foregroundStyle(.secondary)
      HStack {
        Button("Cancel") { controller.imported = nil }
        if controller.document != nil {
          Button("Replace Matching Copy") { controller.replaceCopy(with: imported) }
        }
        Spacer()
        Button("Create New Deck…") { controller.createImported() }.buttonStyle(.borderedProminent)
      }
    }.padding(24).frame(width: 700)
  }
}
struct NativeCopyEditor: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State var blocks: [DeckCopyBlock]
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Correct approved copy").font(.title2)
      Text(
        "Saving replaces this slide’s writing and locks it again. The whole correction is one undo action."
      ).foregroundStyle(.secondary)
      ScrollView {
        VStack(alignment: .leading) {
          ForEach(blocks.indices, id: \.self) { index in
            Text(blocks[index].role.capitalized).font(.headline)
            TextEditor(
              text: Binding(get: { blocks[index].text }, set: { blocks[index].setText($0) })
            ).frame(minHeight: 110).border(Color.secondary.opacity(0.2))
          }
        }
      }
      HStack {
        Button("Cancel") { controller.copyEditorOpen = false }
        Spacer()
        Button("Save and Lock Copy") { controller.editCopy(blocks) }.buttonStyle(.borderedProminent)
      }
    }.padding(24).frame(width: 650, height: 700)
  }
}
struct NativeSettingsView: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    Form {
      Picker("Appearance", selection: $controller.theme) {
        Text("System").tag("system")
        Text("Light").tag("light")
        Text("Dark").tag("dark")
      }
      Picker("Interface size", selection: $controller.interfaceScale) {
        ForEach([0.9, 1.0, 1.1, 1.25, 1.5, 1.75], id: \.self) { Text("\(Int($0*100))%").tag($0) }
      }
      Text("Interface size does not change the canvas or exported deck.").font(.caption)
        .foregroundStyle(.secondary)
      Button("Done") { controller.showSettings = false }
    }.padding(28).frame(width: 450)
  }
}
