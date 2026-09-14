import AppKit
import CoreText
import SwiftUI

// Native control sizes are a consumer adaptation of the pinned v13 UI roles.
// See DESIGN.md. Canvas typography is independent of this interface scale.
enum NativeUIRole: CaseIterable {
  case display, pageTitle, sectionTitle, panelTitle, body, bodyCompact, label, action, input, caption, data, code

  var pointSize: CGFloat {
    switch self {
    case .display: return 38
    case .pageTitle: return 28
    case .sectionTitle: return 21
    case .panelTitle: return 17
    case .body, .input: return 14
    case .bodyCompact, .label, .action: return 13
    case .caption, .data, .code: return 12
    }
  }
  var fontName: String? {
    switch self {
    case .display: return "pd-head-Medium"
    case .pageTitle: return "pd-body-700"
    case .sectionTitle, .panelTitle, .label, .action: return "pd-body-600"
    case .body, .bodyCompact, .input, .caption: return "pd-body-400"
    case .data, .code: return nil // Avoid v13 Eyebrow's conflicting native family names.
    }
  }
  func nativeFont(scale: Double = 1) -> NSFont {
    let size = pointSize * min(1.75, max(0.9, scale))
    guard let fontName else { return .monospacedSystemFont(ofSize: size, weight: .regular) }
    return NSFont(name: fontName, size: size) ?? .systemFont(ofSize: size)
  }
}

enum NativeTypography {
  static func registerBundledFonts() {
    for ext in ["otf", "ttf"] {
      for url in Bundle.main.urls(forResourcesWithExtension: ext, subdirectory: "Fonts") ?? [] {
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
      }
    }
  }
}

private struct NativeInterfaceScaleKey: EnvironmentKey { static let defaultValue = 1.0 }
extension EnvironmentValues {
  var workbenchInterfaceScale: Double {
    get { self[NativeInterfaceScaleKey.self] }
    set { self[NativeInterfaceScaleKey.self] = newValue }
  }
}
private struct NativeTextStyle: ViewModifier {
  @Environment(\.workbenchInterfaceScale) private var scale
  let role: NativeUIRole
  func body(content: Content) -> some View { content.font(Font(role.nativeFont(scale: scale))) }
}
extension View {
  func workbenchText(_ role: NativeUIRole) -> some View { modifier(NativeTextStyle(role: role)) }
}
