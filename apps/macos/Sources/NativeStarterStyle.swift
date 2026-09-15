import AppKit
import Foundation

struct NativeTypeRole: Codable, Equatable, Sendable {
  var fontName: String = "System"
  var step: Int
  var alignment: String = "left"
  var colorRole: String = "text"
  var isSystemFont: Bool { fontName == "System" || fontName == "System Serif" }
  var stepLabel: String { step > 0 ? "Step +\(step)" : "Step \(step)" }
  func resolvedFont(size: Double, headline: Bool = false) -> NSFont? {
    let system = NSFont.systemFont(ofSize: size, weight: headline ? .semibold : .regular)
    if fontName == "System" { return system }
    if fontName == "System Serif" {
      return system.fontDescriptor.withDesign(.serif).flatMap { NSFont(descriptor: $0, size: size) }
    }
    return NSFont(name: fontName, size: size)
  }
}
struct NativeStarterType: Codable, Equatable, Sendable {
  var head = NativeTypeRole(step: 5)
  var sub = NativeTypeRole(step: 5)
  var body = NativeTypeRole(step: 0, alignment: "justified")
  static let standard = NativeStarterType()
  func role(_ name: String) -> NativeTypeRole { name == "headline" ? head : name == "subheadline" ? sub : body }
  var unavailableFonts: [String] {
    Array(Set([head, sub, body].filter { $0.resolvedFont(size: 32) == nil }.map(\.fontName))).sorted()
  }
  mutating func useFonts(head: String, sub: String, body: String) {
    self.head.fontName = head
    self.sub.fontName = sub
    self.body.fontName = body
  }
}
struct NativeTypeSize: Sendable {
  let size: Double
  let leading: Double
  // Size/leading presets from the studio's editable InDesign starter.
  static func preset(role: String, step: Int) -> NativeTypeSize {
    let pairs: [(Double, Double)]
    switch role {
    case "headline": pairs = [(20.27,24),(23.4,28),(27.01,32),(31.19,36),(36.01,40),(41.57,44),(48,52),(63.98,68),(73.87,80),(85.29,92),(98.47,104),(113.69,120),(131.26,140),(151.55,160),(174.98,184),(202.02,212)]
    case "subheadline": pairs = [(23.15,28),(25.36,32),(27.78,32),(30.43,36),(33.33,40),(36.51,44),(40,48),(48,56),(52.58,60),(57.6,68),(63.1,72),(69.12,80),(75.72,88),(82.94,96),(90.86,104),(99.53,112)]
    default: pairs = [(16.38,32),(18.32,32),(20.48,32),(22.9,40),(25.6,40),(28.62,48),(32,48),(40,64),(44.72,72),(50,72),(55.9,80),(62.5,96),(69.88,104),(78.13,112),(87.35,128),(97.66,144)]
    }
    let pair = pairs[max(0, min(15, step + 6))]
    return NativeTypeSize(size: pair.0, leading: pair.1)
  }
}
struct NativePalettePair: Codable, Equatable, Sendable {
  var dark: String
  var light: String
}
struct NativeStarterPalette: Codable, Equatable, Sendable {
  var colors: [String: NativePalettePair] = [
    "background": .init(dark: "#24171D", light: "#FFF8EE"),
    "text": .init(dark: "#FFF8EE", light: "#24171D"),
    "muted": .init(dark: "#C7BBC1", light: "#6F5B63"),
    "accent1": .init(dark: "#FF97B7", light: "#A12652"),
    "accent2": .init(dark: "#C1AAFF", light: "#6540C7"),
    "accent3": .init(dark: "#8EBEFF", light: "#204FA4"),
    "accent4": .init(dark: "#81DED1", light: "#006E65"),
    "mono": .init(dark: "#C7C7C7", light: "#555555")
  ]
  static let standard = NativeStarterPalette()
  static let roles = ["background", "text", "muted", "accent1", "accent2", "accent3", "accent4", "mono"]
  static func label(_ role: String) -> String {
    if role == "mono" { return "Monochrome" }
    if role.hasPrefix("accent") { return "Accent \(role.suffix(1))" }
    return role.capitalized
  }
  func hex(_ role: String, appearance: String) -> String {
    let pair = colors[role] ?? Self.standard.colors[role] ?? Self.standard.colors["text"]!
    return appearance == "light" ? pair.light : pair.dark
  }
}
