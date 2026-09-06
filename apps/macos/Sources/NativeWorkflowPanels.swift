import AppKit
import SwiftUI

extension View {
  func nativeSheetFrame(width: CGFloat, height: CGFloat) -> some View {
    let screen = (NSApp.keyWindow?.screen ?? NSScreen.main)?.visibleFrame.size ?? CGSize(width: 1280, height: 800)
    return frame(width: min(width, max(360, screen.width - 100)), height: min(height, max(340, screen.height - 140)))
  }
}

struct NativeContextPanel: View {
  @ObservedObject var controller: NativeWorkbenchController
  @AppStorage("native.copyExpanded") private var copyExpanded = true
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        if let slide = controller.selectedSlide {
          if controller.phase == "assemble" && !controller.previewOpen && !controller.compareOpen {
            NativeAssemblyInspector(controller: controller, slide: slide)
            Divider()
          }
          if !slide.imageRoles.isEmpty {
            Text("Chosen for this slide").font(.headline)
            ForEach(slide.imageRoles, id: \.self) { role in
              NativeChosenSlot(controller: controller, slide: slide, role: role)
            }
            Divider()
          }
          Text("Designer notes").font(.headline)
          TextEditor(text: Binding(get: { controller.notes(for: slide.id) }, set: { controller.setNotes($0, slideID: slide.id) }))
            .id(slide.id) // A text editor's undo history never crosses slide boundaries.
            .font(.system(size: 13 * controller.interfaceScale)).frame(minHeight: 110, maxHeight: 200)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.secondary.opacity(0.25)))
            .accessibilityLabel("Designer notes for \(slide.title)")
          Text("Direction, not on-slide copy. Included when exporting notes or Copy.md.")
            .font(.caption).foregroundStyle(.secondary)
          Divider()
          DisclosureGroup(isExpanded: $copyExpanded) {
            VStack(alignment: .leading, spacing: 14) {
              HStack {
                Label("Copy", systemImage: "text.alignleft").font(.caption)
                Spacer()
                Button("Edit Copy…") { controller.beginEditCopy(slide.id) }.controlSize(.small)
              }
              ForEach(slide.copyBlocks) { block in
                VStack(alignment: .leading, spacing: 5) {
                  HStack {
                    Text(block.role.uppercased()).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button {
                      NSPasteboard.general.clearContents()
                      NSPasteboard.general.setString(block.text, forType: .string)
                    } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.plain).help("Copy \(block.role)")
                    .accessibilityLabel("Copy \(block.role)")
                  }
                  Text(block.text.isEmpty ? "—" : block.text).textSelection(.enabled)
                    .font(.system(size: 13 * controller.interfaceScale))
                }
              }
            }.padding(.top, 10)
          } label: { Text("Slide copy").font(.headline) }
          Toggle("Include in handoff", isOn: Binding(get: { slide.settings.included }, set: { controller.patchSlide(["included": $0]) }))
          if !slide.settings.shortlist.isEmpty {
            Divider()
            Text("Shortlist · \(slide.settings.shortlist.count)").font(.headline)
            LazyVStack(alignment: .leading, spacing: 10) {
              ForEach(slide.settings.shortlist, id: \.self) { id in
                HStack(spacing: 8) {
                  Button { controller.previewCandidate(id) } label: {
                    NativeAssetImage(source: controller.sources[id], longestSide: 512).frame(width: 64, height: 42)
                  }.buttonStyle(.plain).help("Preview candidate")
                  VStack(alignment: .leading, spacing: 4) {
                    Text(controller.assetIndex[id]?.filename ?? "Reconnect media").font(.caption).lineLimit(2)
                    HStack {
                      Button("Use") { controller.decide("use", assetID: id) }
                        .disabled(slide.imageRoles.isEmpty)
                      Button("Remove") { controller.decide("remove-shortlist", assetID: id) }
                        .help("Remove candidate; keep any chosen assignment")
                    }.controlSize(.small)
                  }
                }
              }
            }
          }
        } else { Text("Choose a slide.").foregroundStyle(.secondary) }
      }.padding(16)
    }
  }
}

struct NativeChosenSlot: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slide: DeckSlide
  let role: String
  private var assetID: String? { slide.mediaAssignments?.first { $0.role == role }?.assetReferenceId }
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("Image \((slide.imageRoles.firstIndex(of: role) ?? 0) + 1)").font(.caption).fontWeight(.semibold)
        Spacer()
        if controller.curateRole == role { Image(systemName: "scope").accessibilityLabel("Active destination slot") }
      }
      HStack(alignment: .top, spacing: 8) {
        if let id = assetID {
          Button { controller.previewCandidate(id) } label: {
            NativeAssetImage(source: controller.sources[id], longestSide: 512).frame(width: 82, height: 58)
          }.buttonStyle(.plain).accessibilityLabel("Preview chosen image")
          VStack(alignment: .leading, spacing: 6) {
            Text(controller.assetIndex[id]?.filename ?? "Original unavailable").font(.caption).lineLimit(2)
            Button("Remove; keep shortlisted") { controller.decide("unassign", assetID: id, role: role) }.controlSize(.small)
          }
        } else { Text("No image chosen").font(.caption).foregroundStyle(.secondary) }
      }
      Button("Choose candidates for this slot") {
        controller.curateRole = role
        controller.phase = "curate"
        controller.previewOpen = false
      }.controlSize(.small)
    }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
      .background(controller.curateRole == role ? Color.accentColor.opacity(0.08) : Color.secondary.opacity(0.04))
      .clipShape(RoundedRectangle(cornerRadius: 5))
  }
}

struct NativeApplyLayoutSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State private var selected: Set<String> = []
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Apply this arrangement").font(.title2)
      Text("Copies the prototype layout, text region, columns and gradient. Copy, notes and image crops stay with each slide. Choices that no longer have a slot stay shortlisted. Undo reverses the complete operation.")
        .font(.callout).foregroundStyle(.secondary)
      HStack {
        Button("Select included slides") { selected = Set(controller.slides.filter { $0.settings.included && $0.id != controller.selectedSlideID }.map(\.id)) }
        Button("Clear") { selected = [] }
      }
      List(controller.slides.filter { $0.id != controller.selectedSlideID }) { slide in
        Toggle(slide.title, isOn: Binding(get: { selected.contains(slide.id) }, set: { if $0 { selected.insert(slide.id) } else { selected.remove(slide.id) } }))
      }
      HStack {
        Button("Cancel") { controller.showApplyLayout = false }.keyboardShortcut(.cancelAction)
        Spacer()
        Button("Apply to \(selected.count) slides") { controller.applyArrangement(to: controller.slides.map(\.id).filter { selected.contains($0) }) }
          .buttonStyle(.borderedProminent).disabled(selected.isEmpty)
      }
    }.padding(24).nativeSheetFrame(width: 630, height: 580)
  }
}

struct NativeHandoffResultSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if let result = controller.exportResult {
        Text(result.issues.isEmpty ? "Handoff saved" : "Handoff saved with exceptions").font(.title2)
        Text("\(result.slideCount) slides · \(result.originalCopies) original-media copies").foregroundStyle(.secondary)
        ScrollView {
          VStack(alignment: .leading, spacing: 12) {
            ForEach(result.produced, id: \.self) { name in
              Button(name) { NSWorkspace.shared.open(result.url.appendingPathComponent(name)) }.buttonStyle(.link)
            }
            if !result.issues.isEmpty {
              Divider()
              Text("Review these exceptions").font(.headline)
              ForEach(Array(result.issues.enumerated()), id: \.offset) { _, issue in
                Text(issue).font(.callout).textSelection(.enabled)
              }
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }
        HStack {
          Button("Reveal handoff folder") { NSWorkspace.shared.activateFileViewerSelecting([result.url]) }
          Spacer()
          Button("Done") { controller.showExportResult = false }.keyboardShortcut(.cancelAction)
        }
      }
    }.padding(24).nativeSheetFrame(width: 700, height: 540)
  }
}

struct NativeReplacementPanel: View {
  @ObservedObject var controller: NativeWorkbenchController
  let imported: ImportedCopyDocument
  @State private var matches: [String: String] = [:]
  private var valid: Bool { !matches.isEmpty && Set(matches.values).count == matches.count }
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Map incoming copy to existing slides. Unmatched slides are left untouched; no match is guessed from page order. Notes, layouts and media stay with their existing slide.").font(.callout)
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          ForEach(controller.slides) { old in
            VStack(alignment: .leading, spacing: 6) {
              Text(old.title).font(.headline)
              Picker("Incoming copy", selection: Binding(get: { matches[old.id] ?? "" }, set: { matches[old.id] = $0.isEmpty ? nil : $0 })) {
                Text("Leave unchanged").tag("")
                ForEach(imported.slides) { incoming in Text(incoming.title).tag(incoming.id) }
              }
              if let incoming = imported.slides.first(where: { $0.id == matches[old.id] }) {
                DisclosureGroup("Compare current and incoming writing") {
                  VStack(alignment: .leading, spacing: 8) {
                    Text("CURRENT").font(.caption).foregroundStyle(.secondary)
                    Text(old.copyBlocks.map(\.text).joined(separator: "\n\n")).textSelection(.enabled)
                    Divider()
                    Text("INCOMING").font(.caption).foregroundStyle(.secondary)
                    Text(incoming.blocks.map(\.text).joined(separator: "\n\n")).textSelection(.enabled)
                  }.font(.callout)
                }
              }
            }
          }
        }.padding(.vertical, 6)
      }
      if !valid && !matches.isEmpty { Text("Each incoming slide can be used once.").foregroundStyle(.orange).font(.caption) }
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
      HStack { Text("Crop zoom"); Spacer(); Text("\(Int((zoom * 100).rounded()))%").monospacedDigit() }.font(.caption)
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
