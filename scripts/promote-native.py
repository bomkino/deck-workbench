from pathlib import Path
p = Path('apps/macos/Sources/NativeWorkbenchUI.swift')
s = p.read_text()
old = '''  @State private var prototype = true, notes = true, copy = true, approved = true,
    shortlisted = true, acceptChanged = false, onlyCurrent = false'''
assert s.count(old) == 1
s = s.replace(old, '''  @State private var prototype = true
  @State private var notes = true
  @State private var copy = true
  @State private var approved = true
  @State private var shortlisted = true
  @State private var acceptChanged = false
  @State private var onlyCurrent = false''')
start = s.index('      List(\n')
end = s.index('\n    } detail:', start)
s = s[:start] + '      NativeSlideSidebar(controller: controller)' + s[end:]
start = s.index('        GeometryReader { geometry in\n')
end = s.index('\n      }\n      Divider()\n      NativeCurateActions', start)
s = s[:start] + '''        GeometryReader { geometry in
          NativeMediaGrid(controller: controller, width: geometry.size.width)
        }''' + s[end:]
helpers = '''struct NativeSlideSidebar: View {
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
    return "\\(chosen) chosen · \\(shortlisted) shortlisted"
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

'''
s = s.replace('struct NativeCurateView: View {', helpers + 'struct NativeCurateView: View {', 1)
p.write_text(s)
Path('scripts/promote-native.py').unlink()
print('Fixed individual State storage and bounded SwiftUI sidebar/grid type checking.')
