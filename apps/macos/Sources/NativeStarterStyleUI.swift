import AppKit
import SwiftUI

struct NativeStarterStyleSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State private var type = NativeStarterType.standard
  @State private var palette = NativeStarterPalette.standard
  @State private var tab = "type"
  @State private var allSlides = false
  private var validPalette: Bool {
    palette.colors.values.allSatisfy { pair in [pair.dark, pair.light].allSatisfy { $0.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil } }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Type & colours").workbenchText(.sectionTitle)
      Picker("Edit", selection: $tab) { Text("Type").tag("type"); Text("Colours").tag("colours") }.pickerStyle(.segmented)
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          if tab == "type" {
            Text("Choose each font yourself. Smaller / larger changes size and line spacing together.").foregroundStyle(.secondary)
            Menu("Choose a font pair") {
              Button("New York + SF Pro") { type.useFonts(head: "System Serif", sub: "System", body: "System") }
              Button("pitch.dog Head + Body") { type.useFonts(head: "pd-head-Medium", sub: "pd-body-600", body: "pd-body-400") }
              Button("SF Pro throughout") { type.useFonts(head: "System", sub: "System", body: "System") }
            }.workbenchText(.action).help("Sets the three font faces. Your size steps, alignment and colours stay as chosen.")
            NativeTypeRoleEditor(title: "Head", roleName: "headline", role: $type.head)
            NativeTypeRoleEditor(title: "Sub", roleName: "subheadline", role: $type.sub)
            NativeTypeRoleEditor(title: "Body", roleName: "body", role: $type.body)
            Text("Step 0 is Head 48, Sub 40 and Body 32. The same sizes apply at both slide widths. Review wrapping after changing fonts; Fit copy can reduce the rendered size.").workbenchText(.caption).foregroundStyle(.secondary)
            if !type.unavailableFonts.isEmpty { Text("Choose installed replacements for: " + type.unavailableFonts.joined(separator: ", ")).foregroundStyle(.orange) }
          } else {
            Text("Four accents and a monochrome option. Each role has a dark-slide and a light-slide colour. Set each slide’s appearance in the inspector.").foregroundStyle(.secondary)
            HStack { Text("Role").frame(width: 95, alignment: .leading); Text("On dark slides").frame(maxWidth: .infinity); Text("On light slides").frame(maxWidth: .infinity) }.workbenchText(.caption)
            ForEach(NativeStarterPalette.roles, id: \.self) { role in
              HStack {
                Text(role).frame(width: 95, alignment: .leading)
                colourField(role, light: false)
                colourField(role, light: true)
              }
            }
            if !validPalette { Text("Use # followed by six hex digits, for example #24171D.").foregroundStyle(.orange) }
            Text("Colour changes apply to role-based text and slide backgrounds. Image contrast still needs a visual check.").workbenchText(.caption).foregroundStyle(.secondary)
            Button("Restore starter palette") { palette = .standard }.controlSize(.small)
          }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 4)
      }
      Divider()
      Toggle("Apply to every slide", isOn: $allSlides)
      Text("Saving starter features requires Workbench 0.2 or later. Older decks keep a recovery copy before upgrading.").workbenchText(.caption).foregroundStyle(.secondary)
      Text(allSlides ? "One Undo restores the previous settings. Each slide keeps its dark or light appearance." : "Changes apply to the current slide. One Undo restores its previous settings.").workbenchText(.caption).foregroundStyle(.secondary)
      HStack {
        Button("Cancel") { controller.showStarterStyle = false }.keyboardShortcut(.cancelAction)
        Spacer()
        Button(tab == "type" ? "Apply type" : "Apply colours") {
          do {
            let patch: [String: Any] = tab == "type" ? ["starterType": try nativeObject(type)] : ["palette": try nativeObject(palette)]
            controller.applyStarterStyle(patch, allSlides: allSlides)
          } catch { controller.failure = error.localizedDescription }
        }.buttonStyle(.borderedProminent).disabled(tab == "type" ? !type.unavailableFonts.isEmpty : !validPalette)
      }.workbenchText(.action)
    }.padding(24).nativeSheetFrame(width: 670, height: 770)
      .onAppear { type = controller.selectedSlide?.settings.layout.starterType ?? .standard; palette = controller.selectedSlide?.settings.layout.palette ?? .standard }
  }
  private func colourField(_ role: String, light: Bool) -> some View {
    let hex = light ? palette.colors[role]!.light : palette.colors[role]!.dark
    return HStack(spacing: 6) {
      RoundedRectangle(cornerRadius: 4).fill(Color(nsColor: NSColor(cgColor: NativeSlideRenderer.color(hex)) ?? .clear)).frame(width: 24, height: 24)
      TextField(light ? "Light \(role)" : "Dark \(role)", text: Binding(get: { light ? palette.colors[role]!.light : palette.colors[role]!.dark }, set: { if light { palette.colors[role]!.light = $0.uppercased() } else { palette.colors[role]!.dark = $0.uppercased() } })).textFieldStyle(.roundedBorder)
    }
  }
}

private struct NativeTypeRoleEditor: View {
  let title: String
  let roleName: String
  @Binding var role: NativeTypeRole
  private var family: String { role.isSystemFont ? role.fontName : NSFont(name: role.fontName, size: 32)?.familyName ?? role.fontName }
  private var faces: [(String, String)] {
    (NSFontManager.shared.availableMembers(ofFontFamily: family) ?? []).compactMap { row in
      guard row.count >= 2, let name = row[0] as? String, let face = row[1] as? String else { return nil }
      return (name, face)
    }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack {
        Text(title).workbenchText(.panelTitle)
        Spacer()
        Text(role.stepLabel).workbenchText(.caption).foregroundStyle(.secondary)
      }
      HStack {
        Picker("Family", selection: Binding(get: { family }, set: { value in
          if value == "System" || value == "System Serif" { role.fontName = value }
          else if let font = NSFontManager.shared.font(withFamily: value, traits: [], weight: 5, size: 32) { role.fontName = font.fontName }
        })) {
          Text("SF Pro (system)").tag("System")
          Text("New York (system serif)").tag("System Serif")
          ForEach(NSFontManager.shared.availableFontFamilies.sorted(), id: \.self) { Text($0).tag($0) }
        }
        if !role.isSystemFont {
          Picker("Face", selection: $role.fontName) { ForEach(faces, id: \.0) { Text($0.1).tag($0.0) } }.frame(maxWidth: 220)
        }
      }
      HStack {
        Button("Smaller") { role.step = max(-6, role.step - 1) }.disabled(role.step <= -6).accessibilityLabel("Smaller \(title)")
        Picker("Step / size / leading", selection: $role.step) {
          ForEach(-6...9, id: \.self) { step in
            let size = NativeTypeSize.preset(role: roleName, step: step)
            Text(String(format: "\(step > 0 ? "+" : "")\(step) · %.2f / %.0f", size.size, size.leading)).tag(step)
          }
        }.labelsHidden().accessibilityLabel("\(title) step, size and leading")
        Button("Larger") { role.step = min(9, role.step + 1) }.disabled(role.step >= 9).accessibilityLabel("Larger \(title)")
      }.workbenchText(.action)
      HStack {
        Picker("Alignment", selection: $role.alignment) {
          Text("Left").tag("left"); Text("Centre").tag("center"); Text("Right").tag("right"); Text("Justified").tag("justified")
        }
        Picker("Colour", selection: $role.colorRole) {
          ForEach(NativeStarterPalette.roles.filter { $0 != "background" }, id: \.self) { Text($0).tag($0) }
        }
      }
    }
  }
}
