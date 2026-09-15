import SwiftUI

struct NativeMoodboardSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State private var selected: [String] = []
  @State private var query = ""
  private var candidates: [NativeMediaAsset] {
    controller.assets.filter { asset in
      (asset.mediaKind == "image" || asset.mediaKind == "gif") && asset.availability == "available"
        && (query.isEmpty || (asset.filename + " " + asset.folder).localizedCaseInsensitiveContains(query))
    }.sorted { $0.filename.localizedStandardCompare($1.filename) == .orderedAscending }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Add a moodboard").workbenchText(.sectionTitle)
      Text("Choose up to 12 images. Selection order sets the initial grid; drag frames and crop images in Assemble.").foregroundStyle(.secondary)
      HStack {
        TextField("Search media", text: $query).textFieldStyle(.roundedBorder)
        Button("Add Media Folder…") { controller.addMediaFolder() }
      }
      ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 12)], spacing: 12) {
          ForEach(candidates) { asset in
            Button {
              if let index = selected.firstIndex(of: asset.id) { selected.remove(at: index) }
              else if selected.count < 12 { selected.append(asset.id) }
            } label: {
              VStack(alignment: .leading, spacing: 6) {
                NativeAssetImage(source: controller.sources[asset.id], longestSide: 384).frame(height: 90).clipped()
                Text(asset.filename).lineLimit(2).workbenchText(.caption).frame(maxWidth: .infinity, alignment: .leading)
                Text(selected.firstIndex(of: asset.id).map { "Selected · \($0 + 1)" } ?? "Choose").workbenchText(.caption).foregroundStyle(.secondary)
              }.padding(8).background(selected.contains(asset.id) ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.07)).clipShape(RoundedRectangle(cornerRadius: 8))
            }.buttonStyle(.plain).disabled(selected.count == 12 && !selected.contains(asset.id))
              .accessibilityLabel("\(asset.filename), \(selected.contains(asset.id) ? "selected" : "not selected")")
          }
        }
        if candidates.isEmpty { Text("Add a media folder to choose images, or create a blank moodboard and fill its slots later.").foregroundStyle(.secondary).padding() }
      }
      HStack {
        Button("Cancel") { controller.showMoodboard = false }.keyboardShortcut(.cancelAction)
        Text("\(selected.count) / 12 images").workbenchText(.caption).foregroundStyle(.secondary)
        Spacer()
        Button(selected.isEmpty ? "Add blank moodboard" : "Add moodboard") { controller.addSpecialSlide("moodboard", assetIDs: selected) }.buttonStyle(.borderedProminent)
      }
    }.padding(24).nativeSheetFrame(width: 770, height: 720)
  }
}
