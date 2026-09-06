import AppKit
import SwiftUI

struct NativeLayoutChoice: Identifiable {
  let id: String
  let name: String
  static let all: [NativeLayoutChoice] = [
    .init(id: "auto", name: "Default"), .init(id: "left", name: "Text left"),
    .init(id: "right", name: "Text right"), .init(id: "lower", name: "Text lower"),
    .init(id: "wide", name: "Wide text"), .init(id: "text-only", name: "Text only"),
    .init(id: "image-only", name: "Image only"), .init(id: "two-images", name: "Two images"),
    .init(id: "three-images", name: "Three images"),
  ]
}
struct NativeLayoutPicker: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slide: DeckSlide
  var body: some View {
    Picker("Layout", selection: Binding(get: { slide.settings.layout.preset },
      set: { controller.chooseLayout($0, id: slide.id) })) {
      ForEach(NativeLayoutChoice.all) { choice in Text(choice.name).tag(choice.id) }
      if slide.settings.layout.preset == "legacy" { Text("Preserved legacy").tag("legacy") }
    }.disabled(!controller.slideEditingAvailable)
      .accessibilityIdentifier("slide-layout-picker")
      .help("Change this slide’s prototype layout. Displaced images stay shortlisted. Undo restores the arrangement.")
  }
}
struct NativeSlideEditingBar: View {
  @ObservedObject var controller: NativeWorkbenchController
  var body: some View {
    if let slide = controller.selectedSlide {
      HStack(spacing: 12) {
        Text(slide.title).font(.headline).lineLimit(1)
          .frame(minWidth: 60, maxWidth: .infinity, alignment: .leading)
        NativeLayoutPicker(controller: controller, slide: slide).frame(width: 200)
        Button { controller.beginEditCopy() } label: { Label("Edit Copy", systemImage: "pencil") }
          .disabled(!controller.slideEditingAvailable).help("Edit this slide’s writing (Command-E)")
          .accessibilityIdentifier("edit-slide-copy")
        Menu { NativeSlideActions(controller: controller, slideID: slide.id) }
          label: { Label("Slide", systemImage: "rectangle.stack") }
          .accessibilityIdentifier("slide-actions")
      }.padding(.horizontal, 14).padding(.vertical, 10)
    }
  }
}
struct NativeSlideActions: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slideID: String?
  var body: some View {
    Group {
      Button("Add Slide After This") { controller.addSlide(after: slideID) }
      Button("Duplicate Slide") { controller.duplicateSlide(slideID) }
      Button("Rename Slide…") { controller.renameSlide(slideID) }
      Button("Edit Copy…") { controller.beginEditCopy(slideID) }
      Divider()
      Button("Move Earlier") { controller.reorderSlide(-1, id: slideID) }
        .disabled(!controller.canReorderSlide(slideID, by: -1))
      Button("Move Later") { controller.reorderSlide(1, id: slideID) }
        .disabled(!controller.canReorderSlide(slideID, by: 1))
      Divider()
      Button("Delete Slide…", role: .destructive) { controller.removeSlide(slideID) }
        .disabled(controller.slides.count <= 1)
    }.disabled(!controller.slideEditingAvailable || slideID == nil)
  }
}
struct NativeCopyEditor: View {
  @ObservedObject var controller: NativeWorkbenchController
  let slideID: String
  let initialIDs: Set<String>
  @State private var title: String
  @State private var blocks: [DeckCopyBlock]
  init(controller: NativeWorkbenchController, slide: DeckSlide) {
    self.controller = controller
    slideID = slide.id
    initialIDs = Set(slide.copyBlocks.map(\.id))
    _title = State(initialValue: slide.title)
    var fields = slide.copyBlocks
    // A heading-only import must still have somewhere to enter a body.
    for role in ["headline", "subheadline", "body"] where !fields.contains(where: { $0.role == role }) {
      let block = Self.blank(role)
      if role == "headline" { fields.insert(block, at: 0) }
      else if role == "subheadline", let i = fields.firstIndex(where: { $0.role == "headline" }) { fields.insert(block, at: i + 1) }
      else { fields.append(block) }
    }
    _blocks = State(initialValue: fields)
  }
  private static func blank(_ role: String) -> DeckCopyBlock {
    let id = UUID().uuidString.lowercased()
    return DeckCopyBlock(id: id, semanticKey: "\(role).\(id)", role: role, value: RichCopy(""))
  }
  private var validTitle: Bool {
    let value = title.trimmingCharacters(in: .whitespacesAndNewlines)
    return !value.isEmpty && value.utf16.count <= 500
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Edit Slide Copy").font(.title2)
      TextField("Slide name (sidebar and handoff)", text: $title).textFieldStyle(.roundedBorder)
        .accessibilityLabel("Slide name")
      Text("The name above is not the on-slide headline. Saving keeps this slide’s media and notes. Undo restores the whole edit.")
        .font(.callout).foregroundStyle(.secondary)
      if let error = controller.copyEditorError { Text(error).foregroundStyle(.orange).textSelection(.enabled) }
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          ForEach(blocks.indices, id: \.self) { index in
            VStack(alignment: .leading, spacing: 6) {
              Text(blocks[index].role.capitalized).font(.headline)
              TextEditor(text: Binding(get: { blocks[index].text }, set: { blocks[index].setText($0) }))
                .font(.system(size: 14 * controller.interfaceScale)).frame(minHeight: blocks[index].role == "body" ? 150 : 80)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.secondary.opacity(0.25)))
                .accessibilityLabel("\(blocks[index].role) copy")
            }
          }
          Menu("Add Text Field") {
            ForEach(["body", "caption", "credit"], id: \.self) { role in
              Button(role.capitalized) { blocks.append(Self.blank(role)) }
            }
          }
        }
      }
      HStack {
        Button("Cancel") { controller.cancelEditCopy() }.keyboardShortcut(.cancelAction)
        Spacer()
        if controller.copyEditorSaving { ProgressView().controlSize(.small) }
        Button("Save Copy") {
          let kept = blocks.filter { initialIDs.contains($0.id) || !$0.text.isEmpty }
          controller.editCopy(kept, title: title.trimmingCharacters(in: .whitespacesAndNewlines))
        }.buttonStyle(.borderedProminent).keyboardShortcut("s", modifiers: [.command])
          .disabled(!validTitle)
      }
    }.padding(24).nativeSheetFrame(width: 680, height: 710)
      .disabled(controller.copyEditorSaving).interactiveDismissDisabled()
  }
}
