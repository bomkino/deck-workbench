import AppKit
import SwiftUI

/// Shared interface tokens. The work (slides and media) carries the colour;
/// chrome stays quiet, rounded and native. See DESIGN.md.
enum NativeDesign {
  static let radiusSmall: CGFloat = 6
  static let radius: CGFloat = 10
  static let radiusLarge: CGFloat = 14
  /// The neutral behind slides and media: dark enough that light slides read
  /// as paper, light enough in Light mode that dark slides keep their edges.
  static let pasteboardNS = NSColor(name: nil) { appearance in
    appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
      ? NSColor(srgbRed: 0.105, green: 0.108, blue: 0.118, alpha: 1)
      : NSColor(srgbRed: 0.905, green: 0.908, blue: 0.918, alpha: 1)
  }
  static let pasteboard = Color(nsColor: pasteboardNS)
  static let card = Color(nsColor: NSColor(name: nil) { appearance in
    appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
      ? NSColor(white: 1, alpha: 0.055) : NSColor(white: 1, alpha: 0.92)
  })
  static let stroke = Color.primary.opacity(0.09)
  static let strongStroke = Color.primary.opacity(0.16)
  static let ready = Color(nsColor: .systemGreen)
  static let attention = Color(nsColor: .systemOrange)
  static let muted = Color.secondary
}

extension View {
  /// A raised surface for grouped content.
  func nativeCard(padding: CGFloat = 14, radius: CGFloat = NativeDesign.radius) -> some View {
    self.padding(padding)
      .background(NativeDesign.card, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(NativeDesign.stroke))
  }
  /// Floating controls over a canvas or image.
  func nativeFloatingBar() -> some View {
    self.padding(.horizontal, 12).padding(.vertical, 7)
      .background(.regularMaterial, in: Capsule())
      .overlay(Capsule().strokeBorder(NativeDesign.stroke))
      .shadow(color: .black.opacity(0.18), radius: 14, y: 4)
  }
}

/// A small eyebrow heading used above grouped content.
struct NativeEyebrow: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text.uppercased()).workbenchText(.eyebrow).tracking(0.7)
      .foregroundStyle(.secondary).accessibilityAddTraits(.isHeader)
  }
}

/// A keyboard key, shown next to the action it triggers.
struct NativeKeycap: View {
  let key: String
  init(_ key: String) { self.key = key }
  var body: some View {
    Text(key).font(.system(size: 10.5, weight: .semibold, design: .rounded)).monospacedDigit()
      .padding(.horizontal, 5).frame(minWidth: 18, minHeight: 17)
      .background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(Color.primary.opacity(0.12)))
      .foregroundStyle(.secondary).accessibilityHidden(true)
  }
}

/// A button label with its single-key shortcut.
struct NativeKeyedLabel: View {
  let title: String
  let systemImage: String
  let key: String
  var body: some View {
    HStack(spacing: 7) {
      Image(systemName: systemImage)
      Text(title)
      NativeKeycap(key)
    }
  }
}

/// A compact status capsule: icon, label and tint.
struct NativeBadge: View {
  let text: String
  let systemImage: String
  var tint: Color = .secondary
  var body: some View {
    Label { Text(text).lineLimit(1) } icon: { Image(systemName: systemImage) }
      .labelStyle(.titleAndIcon).workbenchText(.eyebrow)
      .padding(.horizontal, 7).padding(.vertical, 2.5)
      .foregroundStyle(tint)
      .background(tint.opacity(0.13), in: Capsule())
  }
}

/// A centered message for an empty area, with the next useful action.
struct NativeEmptyState<Actions: View>: View {
  let systemImage: String
  let title: String
  let message: String
  @ViewBuilder var actions: Actions
  var body: some View {
    VStack(spacing: 14) {
      Image(systemName: systemImage).font(.system(size: 30, weight: .light)).foregroundStyle(.secondary)
        .frame(width: 72, height: 72)
        .background(Color.primary.opacity(0.05), in: Circle())
      Text(title).workbenchText(.panelTitle).multilineTextAlignment(.center)
      Text(message).workbenchText(.bodyCompact).foregroundStyle(.secondary).multilineTextAlignment(.center)
        .frame(maxWidth: 380).fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 10) { actions }.padding(.top, 4)
    }.padding(32).frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// The frame every sheet shares: a titled header, scrolling body and a
/// footer bar for its decisions.
struct NativeSheetScaffold<Content: View, Footer: View>: View {
  let title: String
  var subtitle: String? = nil
  var systemImage: String? = nil
  @ViewBuilder var content: Content
  @ViewBuilder var footer: Footer
  var body: some View {
    VStack(spacing: 0) {
      HStack(alignment: .center, spacing: 14) {
        if let systemImage {
          Image(systemName: systemImage).font(.system(size: 17, weight: .semibold)).foregroundStyle(.tint)
            .frame(width: 38, height: 38)
            .background(Color.accentColor.opacity(0.13), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 3) {
          Text(title).workbenchText(.sectionTitle).lineLimit(2)
          if let subtitle { Text(subtitle).workbenchText(.bodyCompact).foregroundStyle(.secondary).lineLimit(3) }
        }
        Spacer(minLength: 0)
      }.padding(.horizontal, 24).padding(.top, 22).padding(.bottom, 16)
      Divider()
      content.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      Divider()
      HStack(spacing: 10) { footer }.padding(.horizontal, 20).padding(.vertical, 14)
        .workbenchText(.action)
    }
  }
}

/// A schematic of a prototype layout: image areas and text lines.
struct NativeLayoutSchematic: View {
  let preset: String
  var selected = false
  var body: some View {
    Canvas { context, size in
      let r = CGRect(origin: .zero, size: size)
      let image = Color.primary.opacity(selected ? 0.32 : 0.22)
      let text = Color.primary.opacity(selected ? 0.85 : 0.6)
      context.fill(Path(roundedRect: r, cornerRadius: 3), with: .color(Color.primary.opacity(0.06)))
      func block(_ rect: CGRect) { context.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(image)) }
      func lines(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, count: Int = 3) {
        for i in 0..<count {
          let width = i == 0 ? w : w * (i == count - 1 ? 0.55 : 0.85)
          context.fill(Path(roundedRect: CGRect(x: x, y: y + CGFloat(i) * 4.5, width: width, height: i == 0 ? 2.6 : 1.8), cornerRadius: 1), with: .color(text))
        }
      }
      let w = size.width, h = size.height
      switch preset {
      case "right":
        block(CGRect(x: 3, y: 3, width: w * 0.58, height: h - 6)); lines(w * 0.66, h * 0.32, w * 0.28)
      case "lower":
        block(CGRect(x: 3, y: 3, width: w - 6, height: h - 6)); lines(w * 0.1, h * 0.6, w * 0.5)
      case "wide":
        block(CGRect(x: 3, y: 3, width: w - 6, height: h - 6)); lines(w * 0.1, h * 0.28, w * 0.78, count: 4)
      case "text-only":
        lines(w * 0.12, h * 0.3, w * 0.7, count: 4)
      case "image-only":
        block(CGRect(x: 3, y: 3, width: w - 6, height: h - 6))
      case "two-images":
        block(CGRect(x: 3, y: 3, width: w * 0.5 - 4.5, height: h - 6)); block(CGRect(x: w * 0.5 + 1.5, y: 3, width: w * 0.5 - 4.5, height: h - 6))
        lines(w * 0.08, h * 0.62, w * 0.3, count: 2)
      case "three-images":
        let third = (w - 12) / 3
        for i in 0..<3 { block(CGRect(x: 3 + CGFloat(i) * (third + 3), y: 3, width: third, height: h - 6)) }
      case "moodboard":
        let cw = (w - 15) / 4, ch = (h - 9) / 2
        for row in 0..<2 { for col in 0..<4 { block(CGRect(x: 3 + CGFloat(col) * (cw + 3), y: 3 + CGFloat(row) * (ch + 3), width: cw, height: ch)) } }
      case "auto":
        block(CGRect(x: 3, y: 3, width: w - 6, height: h - 6)); lines(w * 0.08, h * 0.32, w * 0.3)
        context.stroke(Path(roundedRect: r.insetBy(dx: 1, dy: 1), cornerRadius: 3), with: .color(text.opacity(0.5)), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
      case "legacy":
        block(CGRect(x: 3, y: 3, width: w * 0.45, height: h * 0.55)); lines(w * 0.55, h * 0.6, w * 0.38, count: 2)
      default: // "left" and "auto"
        block(CGRect(x: w * 0.4, y: 3, width: w * 0.6 - 3, height: h - 6)); lines(w * 0.08, h * 0.32, w * 0.28)
      }
    }.accessibilityHidden(true)
  }
}

/// Slide thumbnails for the navigator, rendered with the canvas renderer and
/// refreshed only for slides whose layout, copy or media changed.
@MainActor
final class NativeSlideThumbnails: ObservableObject {
  @Published private(set) var images: [String: NSImage] = [:]
  /// Slides whose copy does not fit their prototype layout.
  @Published private(set) var overflowing: Set<String> = []
  private var signatures: [String: Int] = [:]
  private var pending: Task<Void, Never>?
  private weak var controller: NativeWorkbenchController?
  static let pixelWidth: CGFloat = 400

  nonisolated init() {}

  func attach(_ controller: NativeWorkbenchController) { self.controller = controller }

  /// Coalesces bursts (a scan publishing sources, several queued edits).
  func schedule() {
    pending?.cancel()
    pending = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(120))
      guard !Task.isCancelled else { return }
      await self?.refresh()
    }
  }

  private func signature(_ slide: DeckSlide, canvas: DeckCanvas, controller: NativeWorkbenchController) -> Int {
    var hash = Hasher()
    hash.combine(canvas.id); hash.combine(slide.intent)
    hash.combine(try? nativeJSON(slide.settings.layout)); hash.combine(try? nativeJSON(slide.copyBlocks))
    hash.combine(try? nativeJSON(slide.mediaAssignments)); hash.combine(try? nativeJSON(slide.legacyComposition))
    for id in slide.chosenIDs.sorted() { hash.combine(id); hash.combine(controller.sources[id]?.cacheKey) }
    return hash.finalize()
  }

  private func refresh() async {
    guard let controller, let canvas = controller.document?.deck.canvasPreset else {
      images = [:]; signatures = [:]; overflowing = []; return
    }
    let slides = controller.slides
    let live = Set(slides.map(\.id))
    if images.keys.contains(where: { !live.contains($0) }) {
      images = images.filter { live.contains($0.key) }
      signatures = signatures.filter { live.contains($0.key) }
    }
    if !overflowing.isSubset(of: live) { overflowing = overflowing.intersection(live) }
    // Finished thumbnails are published in small batches: every row observes
    // this store, so one publish per slide would redraw the list per slide.
    var batch: [String: NSImage] = [:]
    var overflow = overflowing
    var lastFlush = Date()
    func flush() {
      if !batch.isEmpty { images.merge(batch) { $1 }; batch = [:] }
      if overflow != overflowing { overflowing = overflow }
      lastFlush = Date()
    }
    defer { flush() }
    for slide in slides {
      guard !Task.isCancelled else { return }
      let key = signature(slide, canvas: canvas, controller: controller)
      guard signatures[slide.id] != key else { continue }
      var decoded: [String: CGImage] = [:]
      var sizes: [String: CGSize] = [:]
      for id in slide.chosenIDs {
        guard let source = controller.sources[id] else { continue }
        if let data = await NativeThumbnailService.shared.data(for: source, longestSide: 512),
          let image = NativeSlideRenderer.decodedImage(data) { decoded[id] = image }
        if let asset = controller.assetIndex[id], let width = asset.width, let height = asset.height {
          sizes[id] = CGSize(width: width, height: height)
        }
      }
      guard !Task.isCancelled, let current = controller.slides.first(where: { $0.id == slide.id }),
        signature(current, canvas: canvas, controller: controller) == key else { continue }
      // Typesetting shares Core Text state that is used on the main actor.
      let scene = NativeSlideRenderer.resolve(slide: current, canvas: canvas)
      if scene.overflowCharacters > 0 { overflow.insert(slide.id) } else { overflow.remove(slide.id) }
      let width = Self.pixelWidth, height = max(1, (width * canvas.height / canvas.width).rounded())
      guard let context = CGContext(data: nil, width: Int(width), height: Int(height), bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
      NativeSlideRenderer.draw(scene, in: context, rect: CGRect(x: 0, y: 0, width: width, height: height),
        images: decoded, sourceSizes: sizes, rasterizeGradient: false)
      guard let image = context.makeImage() else { continue }
      batch[slide.id] = NSImage(cgImage: image, size: NSSize(width: width / 2, height: height / 2))
      signatures[slide.id] = key
      if Date().timeIntervalSince(lastFlush) > 0.15 { flush() }
      await Task.yield()
    }
  }
}

/// The divider before a side panel: drag to resize, double-click to reset.
struct NativePanelResizeHandle: View {
  @Binding var width: Double
  let range: ClosedRange<Double>
  @State private var start: Double?
  @State private var hovering = false
  var body: some View {
    Rectangle().fill(Color(nsColor: .separatorColor)).frame(width: 1)
      .overlay {
        Color.clear.frame(width: 9).contentShape(Rectangle())
          .onHover { inside in
            guard inside != hovering else { return }
            hovering = inside
            if inside { NSCursor.resizeLeftRight.push() } else { NSCursor.pop() }
          }
          .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .global)
            .onChanged { value in
              let base = start ?? width
              if start == nil { start = width }
              width = min(range.upperBound, max(range.lowerBound, base - value.translation.width))
            }
            .onEnded { _ in start = nil })
          .onTapGesture(count: 2) { width = 320 }
      }
      .onDisappear { if hovering { NSCursor.pop(); hovering = false } }
      .accessibilityHidden(true)
  }
}

/// Sheet sizes follow the screen; the UI gallery fixes them so captures
/// on a small CI display match a normal Mac.
enum NativeSheetMetrics {
  @MainActor static var screenSize: CGSize?
}
