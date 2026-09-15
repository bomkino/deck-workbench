import AppKit
import SwiftUI

struct NativeStarterStyleSheet: View {
  @ObservedObject var controller: NativeWorkbenchController
  @State private var type = NativeStarterType.standard
  @State private var palette = NativeStarterPalette.standard
  @State private var library: NativeColourLibrary?
  @State private var libraryError: String?
  @State private var tab = "type"
  @State private var typeAllSlides = false
  @State private var colourAllSlides = true
  private var allSlides: Bool { tab == "type" ? typeAllSlides : colourAllSlides }
  private var scope: Binding<Bool> {
    Binding(get: { allSlides }, set: { if tab == "type" { typeAllSlides = $0 } else { colourAllSlides = $0 } })
  }
  private var validPalette: Bool {
    palette.colors.values.allSatisfy { pair in [pair.dark, pair.light].allSatisfy(NativeColourLibrary.validHex) }
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
            NativePaletteEditor(palette: $palette, library: library, libraryError: libraryError)
          }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 4)
      }
      Divider()
      Toggle(tab == "type" ? "Apply type to every slide" : "Apply colours to every slide", isOn: scope)
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
      .onAppear {
        type = controller.selectedSlide?.settings.layout.starterType ?? .standard
        palette = controller.selectedSlide?.settings.layout.palette ?? .standard
        do { library = try NativeColourLibrary.bundled() }
        catch { libraryError = "The colour library could not be loaded. Your saved colours and custom hex editing are available." }
      }
  }
}

private struct NativePaletteEditor: View {
  @Binding var palette: NativeStarterPalette
  let library: NativeColourLibrary?
  let libraryError: String?
  @Environment(\.workbenchInterfaceScale) private var interfaceScale
  private var roleLabelWidth: CGFloat { 95 * max(1, interfaceScale) }
  private var valid: Bool { palette.colors.values.allSatisfy { NativeColourLibrary.validHex($0.dark) && NativeColourLibrary.validHex($0.light) } }
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Choose a neutral base and a main accent. Add secondary, third or fourth accents only if needed. Mono is always available; unused accents never appear automatically.").foregroundStyle(.secondary)
      if let library {
        Picker("Neutral base", selection: Binding(get: { library.bases.first(where: { $0.matches(palette) })?.id ?? "custom" }, set: { id in
          if let base = library.bases.first(where: { $0.id == id }) { palette.use(base) }
        })) {
          Text("Current / custom").tag("custom")
          ForEach(library.bases) { base in
            Label { Text(base.label) } icon: { Image(nsImage: menuSwatch(base.dark.background)) }.tag(base.id)
          }
        }
        pairedSamples("text")
        ForEach(["accent1", "accent2", "accent3", "accent4", "mono"], id: \.self) { role in familyPicker(role, library: library) }
        Text("Text samples show contrast against this base. 4.5:1 is the normal-text target. Image backgrounds need a separate check.").workbenchText(.caption).foregroundStyle(.secondary)
      }
      if let libraryError { Text(libraryError).workbenchText(.caption).foregroundStyle(.secondary) }
      DisclosureGroup("Custom hex colours") {
        VStack(alignment: .leading, spacing: 10) {
          HStack { Text("Role").frame(width: roleLabelWidth, alignment: .leading); Text("On dark slides").frame(maxWidth: .infinity); Text("On light slides").frame(maxWidth: .infinity) }.workbenchText(.caption)
          ForEach(NativeStarterPalette.roles, id: \.self) { role in
            HStack {
              Text(NativeStarterPalette.label(role)).frame(width: roleLabelWidth, alignment: .leading)
              colourField(role, light: false); colourField(role, light: true)
            }
          }
          if palette.colors.keys.contains(where: { !NativeStarterPalette.roles.contains($0) }) {
            DisclosureGroup("Fills, text on fills and lines") {
              ForEach(palette.colors.keys.filter { !NativeStarterPalette.roles.contains($0) }.sorted(), id: \.self) { role in
                VStack(alignment: .leading, spacing: 5) {
                  Text(NativeStarterPalette.label(role)).workbenchText(.caption)
                  HStack { colourField(role, light: false); colourField(role, light: true) }
                  if role.hasSuffix(".onSolid") || role.hasSuffix(".onSoft") {
                    let fillRole = role.replacingOccurrences(of: ".onSolid", with: ".solid").replacingOccurrences(of: ".onSoft", with: ".soft")
                    HStack {
                      NativeContrastLabel(foreground: palette.hex(role, appearance: "dark"), background: palette.hex(fillRole, appearance: "dark"), prefix: "Dark")
                      NativeContrastLabel(foreground: palette.hex(role, appearance: "light"), background: palette.hex(fillRole, appearance: "light"), prefix: "Light")
                    }
                  }
                }.padding(.vertical, 3)
              }
            }
          }
        }.padding(.top, 8)
      }
      if !valid { Text("Use # followed by six hex digits, for example #24171D.").foregroundStyle(.orange) }
      Text("Nothing changes until Apply. Saved decks keep their exact colours, including custom edits, when the library is updated. Fill pairs travel with the production handoff.").workbenchText(.caption).foregroundStyle(.secondary)
      Button("Restore starter palette") { palette = .standard }.controlSize(.small)
    }
  }
  private func pairedSamples(_ role: String) -> some View {
    HStack(spacing: 12) {
      NativePaletteSample(palette: palette, role: role, appearance: "dark", label: "On dark")
      NativePaletteSample(palette: palette, role: role, appearance: "light", label: "On light")
    }
  }
  private func familyPicker(_ role: String, library: NativeColourLibrary) -> some View {
    let families = role == "mono" ? library.families.filter(\.isNeutral) : library.families
    let title = ["accent1": "Primary · main accent", "accent2": "Secondary · optional", "accent3": "Third · optional", "accent4": "Fourth · optional", "mono": "Monochrome"][role] ?? NativeStarterPalette.label(role)
    return VStack(alignment: .leading, spacing: 7) {
      Picker(title, selection: Binding(get: { families.first(where: { $0.matches(palette, role: role) })?.id ?? "custom" }, set: { id in
        if let family = families.first(where: { $0.id == id }) { palette.use(family, role: role) }
      })) {
        Text("Current / custom").tag("custom")
        ForEach(families) { family in
          Label { Text(family.label) } icon: { Image(nsImage: menuSwatch(family.dark.solid)) }.tag(family.id)
        }
      }
      pairedSamples(role)
    }
  }
  private func menuSwatch(_ hex: String) -> NSImage {
    let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { bounds in
      let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 4, yRadius: 4)
      (NSColor(cgColor: NativeSlideRenderer.color(hex)) ?? .clear).setFill()
      path.fill()
      NSColor.separatorColor.setStroke()
      path.lineWidth = 1
      path.stroke()
      return true
    }
    image.isTemplate = false
    return image
  }
  private func colourField(_ role: String, light: Bool) -> some View {
    let hex = palette.hex(role, appearance: light ? "light" : "dark")
    return HStack(spacing: 6) {
      RoundedRectangle(cornerRadius: 4).fill(Color(nsColor: NSColor(cgColor: NativeSlideRenderer.color(hex)) ?? .clear)).frame(width: 24, height: 24)
      TextField(light ? "Light \(role)" : "Dark \(role)", text: Binding(get: { palette.hex(role, appearance: light ? "light" : "dark") }, set: {
        var pair = palette.colors[role] ?? NativeStarterPalette.standard.colors[role] ?? .init(dark: hex, light: hex)
        if light { pair.light = $0.uppercased() } else { pair.dark = $0.uppercased() }
        palette.colors[role] = pair
      })).textFieldStyle(.roundedBorder)
        .accessibilityLabel("\(light ? "Light" : "Dark") slide \(NativeStarterPalette.label(role)) hex colour")
    }
  }
}

private struct NativePaletteSample: View {
  let palette: NativeStarterPalette
  let role: String
  let appearance: String
  let label: String
  private var foreground: String { palette.hex(role, appearance: appearance) }
  private var background: String { palette.hex("background", appearance: appearance) }
  var body: some View {
    HStack(spacing: 9) {
      Text("Aa").workbenchText(.panelTitle)
        .foregroundStyle(Color(nsColor: NSColor(cgColor: NativeSlideRenderer.color(foreground)) ?? .clear))
        .frame(width: 58, height: 38)
        .background(Color(nsColor: NSColor(cgColor: NativeSlideRenderer.color(background)) ?? .clear), in: RoundedRectangle(cornerRadius: 6))
      VStack(alignment: .leading, spacing: 2) {
        Text(label).workbenchText(.caption)
        NativeContrastLabel(foreground: foreground, background: background)
      }
      Spacer(minLength: 0)
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct NativeContrastLabel: View {
  let foreground: String
  let background: String
  var prefix = ""
  var body: some View {
    let ratio = NativeColourLibrary.contrast(foreground, background)
    Text((prefix.isEmpty ? "" : prefix + " · ") + (ratio.map { String(format: "%.2f:1 · %@", $0, $0 >= 4.5 ? "Pass" : "Below 4.5") } ?? "Check hex"))
      .workbenchText(.caption).foregroundStyle((ratio ?? 0) >= 4.5 ? Color.secondary : Color.orange)
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
          ForEach(NativeStarterPalette.roles.filter { $0 != "background" }, id: \.self) { Text(NativeStarterPalette.label($0)).tag($0) }
        }
      }
    }
  }
}
