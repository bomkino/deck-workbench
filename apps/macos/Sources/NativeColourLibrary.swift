import Foundation

/// Library choices are copied into the document as hex values. Opening a deck
/// never re-resolves those values against a newer library.
struct NativeColourLibrary: Decodable, Sendable {
  struct Accent: Decodable, Sendable {
    let text: String
    let solid: String
    let onSolid: String
    let soft: String
    let onSoft: String
    let line: String
    var values: [String: String] { ["": text, ".solid": solid, ".onSolid": onSolid, ".soft": soft, ".onSoft": onSoft, ".line": line] }
  }
  struct Family: Decodable, Identifiable, Sendable {
    let id: String
    let label: String
    let group: String?
    let dark: Accent
    let light: Accent
    var isNeutral: Bool { ["gray", "mauve", "slate", "sage", "olive", "sand"].contains(id) }
    var pairs: [String: NativePalettePair] {
      Dictionary(uniqueKeysWithValues: dark.values.map { ($0.key, .init(dark: $0.value, light: light.values[$0.key]!)) })
    }
    func matches(_ palette: NativeStarterPalette, role: String) -> Bool {
      pairs.allSatisfy { palette.colors[role + $0.key] == $0.value }
    }
  }
  struct Base: Decodable, Identifiable, Sendable {
    struct Surface: Decodable, Sendable {
      let background: String
      let text: String
      let muted: String
      let raised: String
      let line: String
      var values: [String: String] { ["background": background, "text": text, "muted": muted, "raised": raised, "line": line] }
    }
    let id: String
    let label: String
    let dark: Surface
    let light: Surface
    var pairs: [String: NativePalettePair] {
      Dictionary(uniqueKeysWithValues: dark.values.map { ($0.key, .init(dark: $0.value, light: light.values[$0.key]!)) })
    }
    func matches(_ palette: NativeStarterPalette) -> Bool { pairs.allSatisfy { palette.colors[$0.key] == $0.value } }
  }
  let schema: String
  let version: String
  let families: [Family]
  let bases: [Base]
  static func load(from url: URL) throws -> NativeColourLibrary {
    let library = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    let allPairs = library.families.flatMap { $0.pairs.values } + library.bases.flatMap { $0.pairs.values }
    guard library.schema == "pitchdog-colours/1", !library.families.isEmpty, !library.bases.isEmpty,
      Set(library.families.map(\.id)).count == library.families.count,
      Set(library.bases.map(\.id)).count == library.bases.count,
      allPairs.allSatisfy({ Self.validHex($0.dark) && Self.validHex($0.light) }) else {
      throw WorkbenchFailure(name: "ColourLibraryInvalid", message: "The bundled colour library is incomplete. Custom hex colours are still available.")
    }
    return library
  }
  static func bundled() throws -> NativeColourLibrary {
    try load(from: NativeStarterKit.bundled().appendingPathComponent("Colour System/pitchdog-colours-v1.json"))
  }
  static func validHex(_ value: String) -> Bool { value.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil }
  static func contrast(_ first: String, _ second: String) -> Double? {
    func luminance(_ hex: String) -> Double? {
      guard validHex(hex), let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
      func linear(_ channel: UInt32) -> Double {
        let value = Double(channel) / 255
        return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * linear((value >> 16) & 255) + 0.7152 * linear((value >> 8) & 255) + 0.0722 * linear(value & 255)
    }
    guard let a = luminance(first), let b = luminance(second) else { return nil }
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)
  }
}

extension NativeStarterPalette {
  mutating func use(_ family: NativeColourLibrary.Family, role: String) {
    guard ["accent1", "accent2", "accent3", "accent4", "mono"].contains(role) else { return }
    for (suffix, pair) in family.pairs { colors[role + suffix] = pair }
  }
  mutating func use(_ base: NativeColourLibrary.Base) {
    for (role, pair) in base.pairs { colors[role] = pair }
  }
}
