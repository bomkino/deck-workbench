import AppKit
import SwiftUI

extension View {
  func nativeSheetFrame(width: CGFloat, height: CGFloat) -> some View {
    let screen = NativeSheetMetrics.screenSize ?? (NSApp.keyWindow?.screen ?? NSScreen.main)?.visibleFrame.size ?? CGSize(width: 1280, height: 800)
    return frame(width: min(width, max(360, screen.width - 100)), height: min(height, max(340, screen.height - 140)))
  }
}

struct NativeContextPanel: View {
  @ObservedObject var controller: NativeWorkbenchController
  @AppStorage("native.copyExpanded") private var copyExpanded = true
  var body: some View {
    if let slide = controller.selectedSlide {
      Form {
        if controller.phase == "assemble" && !controller.previewOpen && !controller.compareOpen {
          NativeAssemblyInspector(controller: controller, slide: slide)
        }
        if !slide.imageRoles.isEmpty {
          Section("Chosen for this slide") {
            ForEach(slide.imageRoles, id: \.self) { role in
              NativeChosenSlot(controller: controller, slide: slide, role: role)
            }
          }
        }
        if !slide.settings.shortlist.isEmpty {
          Section("Shortlist · \(slide.settings.shortlist.count)") {
            ForEach(slide.settings.shortlist, id: \.self) { id in
              HStack(spacing: 10) {
                Button { controller.previewCandidate(id) } label: {
                  NativeAssetImage(source: controller.sources[id], longestSide: 512).frame(width: 64, height: 42)
                    .background(Color.black.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                }.buttonStyle(.plain).help("Preview candidate").accessibilityLabel("Preview \(controller.assetIndex[id]?.filename ?? "candidate")")
                VStack(alignment: .leading, spacing: 5) {
                  Text(controller.assetIndex[id]?.filename ?? "Reconnect media").workbenchText(.caption).lineLimit(2)
                  HStack(spacing: 6) {
                    Button("Use") { controller.decide("use", assetID: id) }
                      .disabled(slide.imageRoles.isEmpty)
                    Button("Remove") { controller.decide("remove-shortlist", assetID: id) }
                      .help("Remove candidate; keep any chosen assignment")
                  }.controlSize(.small)
                }
                Spacer(minLength: 0)
              }
            }
          }
        }
        Section {
          TextEditor(text: Binding(get: { controller.notes(for: slide.id) }, set: { controller.setNotes($0, slideID: slide.id) }))
            .id(slide.id) // A text editor's undo history never crosses slide boundaries.
            .workbenchText(.bodyCompact).scrollContentBackground(.hidden).frame(minHeight: 96, maxHeight: 200)
            .accessibilityLabel("Designer notes for \(slide.title)")
        } header: {
          Text("Designer notes")
        } footer: {
          Text("Direction, not on-slide copy. Included when exporting notes or Copy.md.")
            .workbenchText(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        Section {
          DisclosureGroup(isExpanded: $copyExpanded) {
            VStack(alignment: .leading, spacing: 12) {
              ForEach(slide.copyBlocks) { block in
                VStack(alignment: .leading, spacing: 4) {
                  HStack {
                    NativeEyebrow(block.role)
                    Spacer()
                    Button {
                      NSPasteboard.general.clearContents()
                      NSPasteboard.general.setString(block.text, forType: .string)
                    } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.borderless).help("Copy \(block.role)")
                    .accessibilityLabel("Copy \(block.role)")
                  }
                  Text(block.text.isEmpty ? "—" : block.text).textSelection(.enabled)
                    .workbenchText(block.role == "headline" ? .label : .bodyCompact).fixedSize(horizontal: false, vertical: true)
                }
              }
            }.padding(.top, 8)
          } label: {
            HStack {
              Text("Slide copy").workbenchText(.label)
              Spacer()
              Button("Edit Copy…") { controller.beginEditCopy(slide.id) }.controlSize(.small)
            }
          }
          Toggle("Include in handoff", isOn: Binding(get: { slide.settings.included }, set: { controller.patchSlide(["included": $0]) }))
        }
      }.formStyle(.grouped)
    } else {
      NativeEmptyState(systemImage: "rectangle.on.rectangle", title: "Choose a slide.", message: "Its media, layout, notes and copy appear here.") { EmptyView() }
    }
  }
}

struct NativeChosenSlot: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slide: DeckSlide
  let role: String
  private var assetID: String? { slide.mediaAssignments?.first { $0.role == role }?.assetReferenceId }
  private var active: Bool { controller.curateRole == role }
  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Group {
        if let id = assetID {
          Button { controller.previewCandidate(id) } label: {
            NativeAssetImage(source: controller.sources[id], longestSide: 512).frame(width: 72, height: 48)
              .background(Color.black.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
          }.buttonStyle(.plain).accessibilityLabel("Preview chosen image")
        } else {
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .strokeBorder(Color.secondary.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .overlay(Image(systemName: "photo.badge.plus").foregroundStyle(.secondary))
            .frame(width: 72, height: 48).accessibilityHidden(true)
        }
      }
      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 6) {
          Text("Image \((slide.imageRoles.firstIndex(of: role) ?? 0) + 1)").workbenchText(.label)
          if active && slide.imageRoles.count > 1 { Image(systemName: "scope").foregroundStyle(.tint).accessibilityLabel("Active destination slot") }
        }
        Text(assetID.map { controller.assetIndex[$0]?.filename ?? "Original unavailable" } ?? "No image chosen")
          .workbenchText(.caption).foregroundStyle(.secondary).lineLimit(2)
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 6) { slotButtons }
          VStack(alignment: .leading, spacing: 4) { slotButtons }
        }.controlSize(.small)
      }
      Spacer(minLength: 0)
    }.padding(.vertical, 2)
  }
  @ViewBuilder private var slotButtons: some View {
    if let id = assetID {
      Button("Remove") { controller.decide("unassign", assetID: id, role: role) }
        .help("Remove; keep shortlisted").accessibilityLabel("Remove; keep shortlisted")
    }
    Button(assetID == nil ? "Find image…" : "Replace…") {
      controller.curateRole = role
      controller.phase = "curate"
      controller.previewOpen = false
    }.help("Choose candidates for this slot").accessibilityLabel("Choose candidates for this slot")
  }
}

struct NativeApplyLayoutSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State private var selected: Set<String> = []
  var body: some View {
    NativeSheetScaffold(title: "Apply this arrangement",
      subtitle: "Copies the prototype layout, text region, columns and gradient. Copy, notes and image crops stay with each slide. Choices that no longer have a slot stay shortlisted. Undo reverses the complete operation.",
      systemImage: "square.on.square") {
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Button("Select included slides") { selected = Set(controller.slides.filter { $0.settings.included && $0.id != controller.selectedSlideID }.map(\.id)) }
          Button("Clear") { selected = [] }
          Spacer()
          Text("\(selected.count) selected").workbenchText(.caption).foregroundStyle(.secondary)
        }.controlSize(.small)
        List(controller.slides.filter { $0.id != controller.selectedSlideID }) { slide in
          Toggle(isOn: Binding(get: { selected.contains(slide.id) }, set: { if $0 { selected.insert(slide.id) } else { selected.remove(slide.id) } })) {
            HStack(spacing: 8) {
              Text(String(format: "%02d", controller.slideOrdinals[slide.id] ?? 0)).workbenchText(.data).foregroundStyle(.secondary)
              Text(slide.title)
            }
          }.accessibilityLabel(slide.title)
        }.listStyle(.bordered(alternatesRowBackgrounds: true))
      }.padding(20)
    } footer: {
      Button("Cancel") { controller.showApplyLayout = false }.keyboardShortcut(.cancelAction)
      Spacer()
      Button("Apply to \(selected.count) slides") { controller.applyArrangement(to: controller.slides.map(\.id).filter { selected.contains($0) }) }
        .buttonStyle(.borderedProminent).disabled(selected.isEmpty)
    }.nativeSheetFrame(width: 640, height: 600)
  }
}

struct NativeHandoffResultSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    if let result = controller.exportResult {
      NativeSheetScaffold(title: result.issues.isEmpty ? "Handoff saved" : "Handoff saved with exceptions",
        subtitle: "\(result.slideCount) slides · \(result.originalCopies) original-media copies",
        systemImage: result.issues.isEmpty ? "checkmark.seal.fill" : "exclamationmark.triangle.fill") {
        ScrollView {
          VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
              ForEach(Array(result.produced.enumerated()), id: \.offset) { index, name in
                if index > 0 { Divider().padding(.leading, 40) }
                Button { NSWorkspace.shared.open(result.url.appendingPathComponent(name)) } label: {
                  HStack(spacing: 10) {
                    Image(systemName: name.hasSuffix("/") || !name.contains(".") ? "folder.fill" : "doc.fill").foregroundStyle(.tint).frame(width: 20)
                    Text(name).lineLimit(1).truncationMode(.middle)
                    Spacer()
                    Image(systemName: "arrow.up.forward.square").foregroundStyle(.tertiary)
                  }.padding(.horizontal, 12).padding(.vertical, 8).contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel("Open \(name)")
              }
            }.nativeCard(padding: 0)
            if !result.issues.isEmpty {
              NativeEyebrow("Review these exceptions")
              VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(result.issues.enumerated()), id: \.offset) { _, issue in
                  Label(issue, systemImage: "exclamationmark.triangle").workbenchText(.bodyCompact).textSelection(.enabled)
                    .foregroundStyle(.primary)
                }
              }.nativeCard(padding: 12)
            }
          }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
        }
      } footer: {
        Button("Reveal handoff folder") { NSWorkspace.shared.activateFileViewerSelecting([result.url]) }
        Spacer()
        Button("Done") { controller.showExportResult = false }.keyboardShortcut(.cancelAction).buttonStyle(.borderedProminent)
      }.nativeSheetFrame(width: 700, height: 560)
    }
  }
}

struct NativeReplacementPanel: View {
  @ObservedObject var controller: NativeWorkbenchController
  let imported: ImportedCopyDocument
  @State private var matches: [String: String] = [:]
  private var valid: Bool { !matches.isEmpty && Set(matches.values).count == matches.count }
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Map incoming copy to existing slides. Unmatched slides are left untouched; no match is guessed from page order. Notes, layouts and media stay with their existing slide.").workbenchText(.bodyCompact)
      if controller.slides.contains(where: { $0.settings.layout.contents == true }) {
        Text("Contents stays automatic and is left out of replacement. Rename or move slides to update its entries.")
          .workbenchText(.bodyCompact).foregroundStyle(.secondary)
      }
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          ForEach(controller.replacementSlides) { old in
            VStack(alignment: .leading, spacing: 6) {
              Text(old.title).workbenchText(.label)
              Picker("Incoming copy", selection: Binding(get: { matches[old.id] ?? "" }, set: { matches[old.id] = $0.isEmpty ? nil : $0 })) {
                Text("Leave unchanged").tag("")
                ForEach(imported.slides) { incoming in Text(incoming.title).tag(incoming.id) }
              }.accessibilityLabel("Incoming copy for \(old.title)")
              if let incoming = imported.slides.first(where: { $0.id == matches[old.id] }) {
                DisclosureGroup("Compare current and incoming writing") {
                  VStack(alignment: .leading, spacing: 8) {
                    Text("CURRENT").workbenchText(.caption).foregroundStyle(.secondary)
                    Text(old.copyBlocks.map(\.text).joined(separator: "\n\n")).textSelection(.enabled)
                    Divider()
                    Text("INCOMING").workbenchText(.caption).foregroundStyle(.secondary)
                    Text(incoming.blocks.map(\.text).joined(separator: "\n\n")).textSelection(.enabled)
                  }.workbenchText(.bodyCompact)
                }
              }
            }
          }
        }.padding(.vertical, 6)
      }
      if !valid && !matches.isEmpty { Text("Each incoming slide can be used once.").foregroundStyle(.orange).workbenchText(.caption) }
      Button("Replace copy on \(matches.count) mapped slides") { controller.replaceCopy(with: imported, matches: matches) }
        .buttonStyle(.borderedProminent).disabled(!valid)
    }.onAppear { matches = controller.replacementMatches(for: imported) }
  }
}

struct NativeCropZoomControls: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slideID: String
  let role: String
  @State private var zoom = 1.0
  @State private var editing = false
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      LabeledContent("Crop zoom") { Text("\(Int((zoom * 100).rounded()))%").monospacedDigit() }
      Slider(value: $zoom, in: 1...4, onEditingChanged: { active in
        editing = active
        if !active { controller.zoomCrop(zoom, role: role, slideID: slideID) }
      }).accessibilityLabel("Crop zoom").help("Zoom the image within its frame. Original media stays unchanged. Drag on the canvas to choose the focal point.")
      Button("Centre crop") { controller.centerCrop(role: role, slideID: slideID) }.controlSize(.small)
    }.onAppear { sync() }
      .onChange(of: controller.document?.revision) { _, _ in if !editing { sync() } }
  }
  private func sync() { zoom = min(4, max(1, controller.cropZoom(for: role) ?? 1)) }
}
