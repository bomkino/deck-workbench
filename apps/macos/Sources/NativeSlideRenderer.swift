import AppKit
import CoreGraphics
import CoreText
import Foundation
import ImageIO

struct PrototypeImageLayer {
  let role: String
  let assetID: String?
  let frame: CGRect
  let crop: PrototypeCrop
  let fit: String
}
struct PrototypeTextPlacement {
  let frame: CGRect
  let content: NSAttributedString
  let textFrame: CTFrame
  let visible: CFRange
}
struct ResolvedPrototype {
  let slideID: String
  let canvas: DeckCanvas
  var imageLayers: [PrototypeImageLayer]
  var gradient: PrototypeGradient?
  var gradientFrame: CGRect
  var textRegion: CGRect
  var texts: [PrototypeTextPlacement]
  var overflowCharacters: Int
  var effectiveBodySize: Double
  var legacy: Bool
}

enum NativeSlideRenderer {
  static func defaultTextRegion(canvas: DeckCanvas, preset: String) -> CGRect {
    let sx = canvas.width / 2576
    let sy = canvas.height / 1080
    let mx = 96 * sx
    let my = 64 * sy
    let usable = CGRect(x: mx, y: my, width: canvas.width - 2 * mx, height: canvas.height - 2 * my)
    if canvas.width / canvas.height < 1.3 || ["wide", "text-only"].contains(preset) {
      return usable
    }
    if preset == "lower" {
      return CGRect(x: mx, y: 544 * sy, width: usable.width, height: 472 * sy)
    }
    if preset == "right" {
      return CGRect(x: 1296 * sx, y: my, width: 1184 * sx, height: usable.height)
    }
    if ["two-images", "three-images"].contains(preset) {
      return CGRect(x: mx, y: 704 * sy, width: usable.width, height: 312 * sy)
    }
    return CGRect(x: mx, y: my, width: 1184 * sx, height: usable.height)
  }
  static func resolvedPreset(slide: DeckSlide) -> String {
    let preset = slide.settings.layout.preset
    if preset != "auto" { return preset }
    if slide.intent == "text-only" { return "text-only" }
    if slide.intent == "diptych" { return "two-images" }
    if slide.intent == "triptych" { return "three-images" }
    return "left"
  }
  static func resolve(slide: DeckSlide, canvas: DeckCanvas) -> ResolvedPrototype {
    let layout = slide.settings.layout
    let preset = resolvedPreset(slide: slide)
    let full = CGRect(x: 0, y: 0, width: canvas.width, height: canvas.height)
    let region = layout.textFrame?.rect ?? defaultTextRegion(canvas: canvas, preset: preset)
    var scene = ResolvedPrototype(
      slideID: slide.id, canvas: canvas, imageLayers: [], gradient: nil, gradientFrame: full,
      textRegion: region, texts: [], overflowCharacters: 0, effectiveBodySize: layout.bodySize,
      legacy: preset == "legacy")
    if preset == "legacy", let composition = slide.legacyComposition {
      var represented = Set<String>()
      for element in composition.elements {
        if element.kind == "image", let role = element.mediaRole {
          scene.imageLayers.append(
            PrototypeImageLayer(
              role: role,
              assetID: slide.mediaAssignments?.first { $0.role == role }?.assetReferenceId,
              frame: layout.frames[role]?.rect ?? element.frame.rect,
              crop: layout.crops[role] ?? element.crop ?? .full,
              fit: layout.imageFits[role] ?? element.imageFit ?? "fill"))
        } else if element.kind == "text", let id = element.contentBlockId,
          let block = slide.copyBlocks.first(where: { $0.id == id })
        {
          represented.insert(id)
          let body =
            (element.textSize == "small" ? 19.0 : element.textSize == "large" ? 30 : 24)
            * canvas.width / 1088
          let attributed = attributedBlocks([block], bodySize: body)
          let placement = textPlacement(
            attributed, range: CFRange(location: 0, length: 0),
            rect: layout.frames[id]?.rect ?? element.frame.rect)
          scene.texts.append(placement)
          scene.overflowCharacters += max(0, attributed.length - placement.visible.length)
        } else if let gradient = element.gradient {
          scene.gradient = layout.gradient ?? gradient
          scene.gradientFrame = element.frame.rect
        }
      }
      scene.overflowCharacters += slide.copyBlocks.filter { !represented.contains($0.id) }.reduce(0)
      { $0 + $1.text.utf16.count }
      return scene
    }
    let showImages = preset != "text-only"
    let roles = slide.imageRoles
    if showImages {
      let multiple = roles.count > 1
      let gap = 16 * canvas.width / 2576
      let height = multiple && preset != "image-only" ? canvas.height * 0.61 : canvas.height
      for (index, role) in roles.enumerated() {
        let width = (canvas.width - gap * Double(roles.count - 1)) / Double(roles.count)
        let frame = CGRect(x: Double(index) * (width + gap), y: 0, width: width, height: height)
        scene.imageLayers.append(
          PrototypeImageLayer(
            role: role,
            assetID: slide.mediaAssignments?.first { $0.role == role }?.assetReferenceId,
            frame: layout.frames[role]?.rect ?? frame, crop: layout.crops[role] ?? .full,
            fit: layout.imageFits[role] ?? "fill"))
      }
      if !multiple && preset != "image-only" {
        var gradient = PrototypeGradient()
        if preset == "right" {
          gradient.start = PrototypePoint(x: 1, y: 0.5)
          gradient.end = PrototypePoint(x: 0.28, y: 0.5)
        }
        if preset == "lower" {
          gradient.start = PrototypePoint(x: 0.5, y: 1)
          gradient.end = PrototypePoint(x: 0.5, y: 0.25)
        }
        if preset == "wide" {
          gradient.opacity = 0.82
          gradient.end = PrototypePoint(x: 1, y: 0.5)
        }
        scene.gradient = layout.gradient ?? gradient
      }
    }
    if preset == "image-only" { return scene }
    // Empty optional fields take no space. Every non-metadata block is accounted for.
    let blocks = slide.copyBlocks.filter { !$0.text.isEmpty }
    let unitScale = min(canvas.width / 2576, canvas.height / 1080)
    let targetSize = layout.bodySize * unitScale
    var result = flow(blocks: blocks, region: region, columns: layout.columns, bodySize: targetSize)
    var chosenSize = targetSize
    if result.overflow > 0 && layout.fitCopy {
      var low = min(20 * unitScale, targetSize)
      var high = targetSize
      var lowResult = flow(blocks: blocks, region: region, columns: layout.columns, bodySize: low)
      if lowResult.overflow == 0 {
        for _ in 0..<8 {
          let mid = (low + high) / 2
          let attempt = flow(blocks: blocks, region: region, columns: layout.columns, bodySize: mid)
          if attempt.overflow == 0 {
            low = mid
            lowResult = attempt
          } else {
            high = mid
          }
        }
      }
      result = lowResult
      chosenSize = low
    }
    scene.texts = result.placements
    scene.overflowCharacters = result.overflow
    scene.effectiveBodySize = chosenSize / max(unitScale, 0.001)
    return scene
  }
  private static func flow(blocks: [DeckCopyBlock], region: CGRect, columns: Int, bodySize: Double)
    -> (placements: [PrototypeTextPlacement], overflow: Int)
  {
    guard region.width > 1, region.height > 1 else {
      return ([], blocks.reduce(0) { $0 + $1.text.utf16.count })
    }
    var headers: [DeckCopyBlock] = []
    var body: [DeckCopyBlock] = []
    for block in blocks {
      if ["headline", "subheadline"].contains(block.role)
        && !headers.contains(where: { $0.role == block.role }) && body.isEmpty
      {
        headers.append(block)
      } else {
        body.append(block)
      }
    }
    var placements: [PrototypeTextPlacement] = []
    var y = region.minY
    var overflow = 0
    if !headers.isEmpty {
      let text = attributedBlocks(headers, bodySize: bodySize)
      let setter = CTFramesetterCreateWithAttributedString(text)
      let measured = CTFramesetterSuggestFrameSizeWithConstraints(
        setter, CFRange(location: 0, length: 0), nil,
        CGSize(width: region.width, height: CGFloat.greatestFiniteMagnitude), nil)
      let height = min(region.height, ceil(measured.height) + 3)
      let item = textPlacement(
        text, range: CFRange(location: 0, length: 0),
        rect: CGRect(x: region.minX, y: y, width: region.width, height: height))
      placements.append(item)
      overflow += max(0, text.length - item.visible.length)
      y += height + (body.isEmpty ? 0 : bodySize * 0.7)
    }
    if !body.isEmpty {
      let text = attributedBlocks(body, bodySize: bodySize)
      let n = max(1, min(3, columns))
      let gutter = bodySize * 1.25
      let width = max(1, (region.width - gutter * Double(n - 1)) / Double(n))
      let height = max(0, region.maxY - y)
      var offset = 0
      if height > 1 {
        for column in 0..<n where offset < text.length {
          let item = textPlacement(
            text, range: CFRange(location: offset, length: 0),
            rect: CGRect(
              x: region.minX + Double(column) * (width + gutter), y: y, width: width, height: height
            ))
          placements.append(item)
          offset += item.visible.length
        }
      }
      overflow += max(0, text.length - offset)
    }
    return (placements, overflow)
  }
  static func attributedBlocks(_ blocks: [DeckCopyBlock], bodySize: Double, dark: Bool = false)
    -> NSAttributedString
  {
    let result = NSMutableAttributedString(string: "")
    for (index, block) in blocks.enumerated() {
      let factor: Double =
        block.role == "headline"
        ? 2.125
        : block.role == "subheadline"
          ? 1.1875 : ["caption", "credit"].contains(block.role) ? 0.82 : 1
      let font = NSFont.systemFont(
        ofSize: bodySize * factor, weight: block.role == "headline" ? .semibold : .regular)
      let paragraph = NSMutableParagraphStyle()
      paragraph.lineSpacing = bodySize * 0.2
      paragraph.paragraphSpacing = bodySize * 0.45
      let attributes: [NSAttributedString.Key: Any] = [
        .font: font, .foregroundColor: dark ? NSColor.black : NSColor.white,
        .paragraphStyle: paragraph,
      ]
      if index > 0 { result.append(NSAttributedString(string: "\n\n", attributes: attributes)) }
      result.append(NSAttributedString(string: block.text, attributes: attributes))
    }
    return result
  }
  static func textPlacement(_ text: NSAttributedString, range: CFRange, rect: CGRect)
    -> PrototypeTextPlacement
  {
    let setter = CTFramesetterCreateWithAttributedString(text)
    let path = CGPath(
      rect: CGRect(x: 0, y: 0, width: max(1, rect.width), height: max(1, rect.height)),
      transform: nil)
    let frame = CTFramesetterCreateFrame(setter, range, path, nil)
    return PrototypeTextPlacement(
      frame: rect, content: text, textFrame: frame, visible: CTFrameGetVisibleStringRange(frame))
  }
  /// Both AppKit and PDF contexts call this same top-left canvas transform.
  static func draw(
    _ scene: ResolvedPrototype, in context: CGContext, rect: CGRect, images: [String: CGImage]
  ) {
    context.saveGState()
    defer { context.restoreGState() }
    context.translateBy(x: rect.minX, y: rect.maxY)
    context.scaleBy(x: rect.width / scene.canvas.width, y: -rect.height / scene.canvas.height)
    let bounds = CGRect(x: 0, y: 0, width: scene.canvas.width, height: scene.canvas.height)
    context.clip(to: bounds)
    context.setFillColor(CGColor(gray: 0.035, alpha: 1))
    context.fill(bounds)
    for layer in scene.imageLayers {
      guard let id = layer.assetID, let image = images[id] else { continue }
      drawImage(image, layer: layer, context: context)
    }
    if let gradient = scene.gradient,
      let overlay = gradientImage(gradient, size: scene.gradientFrame.size)
    {
      // Quartz PDF axial shadings omit varying alpha. Rasterize only this
      // overlay, not the source image or selectable text, for screen/PDF parity.
      let frame = scene.gradientFrame
      context.saveGState()
      context.clip(to: frame)
      context.translateBy(x: frame.minX, y: frame.maxY)
      context.scaleBy(x: 1, y: -1)
      context.draw(overlay, in: CGRect(origin: .zero, size: frame.size))
      context.restoreGState()
    }
    for item in scene.texts { drawText(item, context: context) }
  }
  private static let gradientCache: NSCache<NSString, CGImage> = {
    let cache = NSCache<NSString, CGImage>()
    cache.totalCostLimit = 32 * 1024 * 1024
    cache.countLimit = 24
    return cache
  }()
  private static func gradientImage(_ gradient: PrototypeGradient, size: CGSize) -> CGImage? {
    guard size.width > 0, size.height > 0 else { return nil }
    let scale = min(1, 2048 / max(size.width, size.height))
    let width = max(1, Int(ceil(size.width * scale)))
    let height = max(1, Int(ceil(size.height * scale)))
    let startColor = gradient.colors?.start ?? "#000000"
    let endColor = gradient.colors?.end ?? "#000000"
    let key = "\(width):\(height):\(gradient.start.x):\(gradient.start.y):\(gradient.end.x):\(gradient.end.y):\(gradient.opacity):\(startColor):\(endColor)" as NSString
    if let image = gradientCache.object(forKey: key) { return image }
    guard let bitmap = CGContext(data: nil, width: width, height: height,
      bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
      let fill = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [color(startColor, alpha: gradient.opacity), color(endColor, alpha: 0)] as CFArray,
        locations: [0, 1]) else { return nil }
    bitmap.translateBy(x: 0, y: CGFloat(height))
    bitmap.scaleBy(x: 1, y: -1)
    bitmap.drawLinearGradient(fill,
      start: CGPoint(x: gradient.start.x * Double(width), y: gradient.start.y * Double(height)),
      end: CGPoint(x: gradient.end.x * Double(width), y: gradient.end.y * Double(height)),
      options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    guard let image = bitmap.makeImage() else { return nil }
    gradientCache.setObject(image, forKey: key, cost: width * height * 4)
    return image
  }
  static func drawText(_ item: PrototypeTextPlacement, context: CGContext) {
    context.saveGState()
    context.translateBy(x: item.frame.minX, y: item.frame.maxY)
    context.scaleBy(x: 1, y: -1)
    context.textMatrix = .identity
    CTFrameDraw(item.textFrame, context)
    context.restoreGState()
  }
  static func imageRect(
    sourceWidth: Double, sourceHeight: Double, frame: CGRect, crop: PrototypeCrop, fit: String
  ) -> CGRect {
    let crop = fit == "fit" ? PrototypeCrop.full : crop
    let scale =
      fit == "fit"
      ? min(frame.width / sourceWidth, frame.height / sourceHeight)
      : max(frame.width / (sourceWidth * crop.width), frame.height / (sourceHeight * crop.height))
    let width = sourceWidth * scale
    let height = sourceHeight * scale
    var x = frame.midX - (crop.x + crop.width / 2) * width
    var y = frame.midY - (crop.y + crop.height / 2) * height
    if fit != "fit" {
      x = min(frame.minX, max(frame.maxX - width, x))
      y = min(frame.minY, max(frame.maxY - height, y))
    }
    return CGRect(x: x, y: y, width: width, height: height)
  }
  private static func drawImage(_ image: CGImage, layer: PrototypeImageLayer, context: CGContext) {
    let rect = imageRect(
      sourceWidth: Double(image.width), sourceHeight: Double(image.height), frame: layer.frame,
      crop: layer.crop, fit: layer.fit)
    context.saveGState()
    context.clip(to: layer.frame)
    context.interpolationQuality = .high
    context.translateBy(x: rect.minX, y: rect.maxY)
    context.scaleBy(x: 1, y: -1)
    context.draw(image, in: CGRect(origin: .zero, size: rect.size))
    context.restoreGState()
  }
  static func color(_ hex: String, alpha: Double = 1) -> CGColor {
    let value = UInt64(hex.dropFirst(), radix: 16) ?? 0
    return CGColor(
      red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255,
      blue: Double(value & 255) / 255, alpha: alpha)
  }
  static func decodedImage(_ data: Data) -> CGImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
  }
  static func imageFromStagedURL(_ url: URL, longestSide: Int = 3072) -> CGImage? {
    guard
      let source = CGImageSourceCreateWithURL(
        url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary)
    else { return nil }
    return CGImageSourceCreateThumbnailAtIndex(
      source, 0,
      [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: longestSide,
        kCGImageSourceShouldCacheImmediately: true,
      ] as CFDictionary)
  }
}
