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
    NativeSheetScaffold(title: "Add a moodboard",
      subtitle: "Choose up to 12 images. Selection order sets the initial grid; drag frames and crop images in Assemble.",
      systemImage: "square.grid.3x2") {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          TextField("Search media", text: $query).textFieldStyle(.roundedBorder)
          Button("Add Media Folder…") { controller.addMediaFolder() }
        }
        ScrollView {
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 12)], spacing: 12) {
            ForEach(candidates) { asset in
              let order = selected.firstIndex(of: asset.id)
              Button {
                if let index = selected.firstIndex(of: asset.id) { selected.remove(at: index) }
                else if selected.count < 12 { selected.append(asset.id) }
              } label: {
                VStack(alignment: .leading, spacing: 0) {
                  ZStack {
                    Color.black.opacity(0.07)
                    NativeAssetImage(source: controller.sources[asset.id], longestSide: 384)
                  }.frame(height: 92).clipped()
                    .overlay(alignment: .topTrailing) {
                      if let order {
                        Text("\(order + 1)").font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(.white)
                          .frame(width: 22, height: 22).background(Color.accentColor, in: Circle()).padding(6)
                      }
                    }
                  VStack(alignment: .leading, spacing: 2) {
                    Text(asset.filename).lineLimit(1).truncationMode(.middle).workbenchText(.caption)
                    Text(order.map { "Selected · \($0 + 1)" } ?? "Choose").workbenchText(.caption).foregroundStyle(.secondary)
                  }.padding(8).frame(maxWidth: .infinity, alignment: .leading)
                }.background(NativeDesign.card)
                  .clipShape(RoundedRectangle(cornerRadius: NativeDesign.radius, style: .continuous))
                  .overlay(RoundedRectangle(cornerRadius: NativeDesign.radius, style: .continuous)
                    .strokeBorder(order != nil ? Color.accentColor : NativeDesign.stroke, lineWidth: order != nil ? 2.5 : 1))
              }.buttonStyle(.plain).disabled(selected.count == 12 && !selected.contains(asset.id))
                .accessibilityLabel("\(asset.filename), \(selected.contains(asset.id) ? "selected" : "not selected")")
            }
          }.padding(2)
          if candidates.isEmpty { Text("Add a media folder to choose images, or create a blank moodboard and fill its slots later.").foregroundStyle(.secondary).padding() }
        }
      }.padding(20)
    } footer: {
      Button("Cancel") { controller.showMoodboard = false }.keyboardShortcut(.cancelAction)
      Text("\(selected.count) / 12 images").workbenchText(.caption).foregroundStyle(.secondary)
      Spacer()
      Button(selected.isEmpty ? "Add blank moodboard" : "Add moodboard") { controller.addSpecialSlide("moodboard", assetIDs: selected) }.buttonStyle(.borderedProminent)
    }.nativeSheetFrame(width: 790, height: 720)
  }
}
