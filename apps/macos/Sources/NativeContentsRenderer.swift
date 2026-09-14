import AppKit
import CoreGraphics
import CoreText

/// Coordinates are relative to the scene's text region, including during a drag preview.
struct PrototypeDottedLine {
  let start: CGPoint
  let end: CGPoint
  let color: CGColor
  let weight: CGFloat
  let spacing: CGFloat
}

enum NativeContentsRenderer {
  struct Layout {
    var placements: [PrototypeTextPlacement] = []
    var leaders: [PrototypeDottedLine] = []
    var overflow = 0
    var height: CGFloat = 0
  }
  private struct Row {
    let title: NSAttributedString
    let number: NSAttributedString
    let titleWidth: CGFloat
    let titleHeight: CGFloat
    let numberWidth: CGFloat
    let numberHeight: CGFloat
    let spacing: CGFloat
    let font: NSFont
    let color: CGColor
    var height: CGFloat { max(titleHeight, numberHeight) }
  }

  /// The derived body remains title + tab + page number. Leaders are graphics;
  /// numbers get their own right edge so a wrapped title cannot displace them.
  static func layout(_ text: NSAttributedString, in region: CGRect, gutter: CGFloat,
    bodySize: CGFloat) -> Layout
  {
    var result = Layout()
    guard text.length > 0 else { return result }
    guard region.width > gutter + 2, region.height > 1 else {
      result.overflow = text.length
      return result
    }
    let width = (region.width - gutter) / 2
    var offset = 0
    let rows = text.string.components(separatedBy: "\n").map { line -> Row in
      let length = (line as NSString).length
      let attributes = text.attributes(at: min(offset, text.length - 1), effectiveRange: nil)
      let font = attributes[.font] as? NSFont ?? NSFont.systemFont(ofSize: bodySize)
      let color = (attributes[.foregroundColor] as? NSColor ?? .white).cgColor
      let paragraph = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy()
        as? NSMutableParagraphStyle ?? NSMutableParagraphStyle()
      let spacing = paragraph.paragraphSpacing
      // A contents label is aligned to its column, even when body prose is justified.
      paragraph.alignment = .left
      paragraph.lineBreakMode = .byWordWrapping
      paragraph.paragraphSpacing = 0
      var rowAttributes = attributes
      rowAttributes[.paragraphStyle] = paragraph
      let tab = (line as NSString).range(of: "\t", options: .backwards)
      let titleText = tab.location == NSNotFound ? line : (line as NSString).substring(to: tab.location)
      let numberText = tab.location == NSNotFound ? "" : (line as NSString).substring(from: tab.location + 1)
      let title = NSAttributedString(string: titleText, attributes: rowAttributes)
      let number = NSAttributedString(string: numberText, attributes: rowAttributes)
      let numberWidth = number.length == 0 ? 0 : ceil(CGFloat(CTLineGetTypographicBounds(
        CTLineCreateWithAttributedString(number), nil, nil, nil))) + 1
      let titleWidth = max(1, width - numberWidth - (number.length == 0 ? 0 : bodySize * 0.7))
      let numberHeight = measuredHeight(number, width: max(1, numberWidth))
      let titleHeight = title.length == 0 ? numberHeight : measuredHeight(title, width: titleWidth)
      offset += length + 1
      return Row(title: title, number: number, titleWidth: titleWidth,
        titleHeight: titleHeight, numberWidth: numberWidth, numberHeight: numberHeight,
        spacing: spacing, font: font, color: color)
    }

    // Balance measured row heights, not character counts. Keep each entry in one
    // column and preserve reading order from the left column into the right.
    var sums: [CGFloat] = [0]
    for row in rows { sums.append(sums.last! + row.height + row.spacing) }
    func columnHeight(_ start: Int, _ end: Int) -> CGFloat {
      end > start ? sums[end] - sums[start] - rows[end - 1].spacing : 0
    }
    var split = (rows.count + 1) / 2
    var tallest = max(columnHeight(0, split), columnHeight(split, rows.count))
    if rows.count > 1 {
      for candidate in 1..<rows.count {
        let height = max(columnHeight(0, candidate), columnHeight(candidate, rows.count))
        if height < tallest { split = candidate; tallest = height }
      }
    }
    result.height = min(region.height, tallest)
    for (column, range) in [0..<split, split..<rows.count].enumerated() {
      let x = region.minX + CGFloat(column) * (width + gutter)
      var y = region.minY
      for index in range {
        let row = rows[index]
        let available = max(0, region.maxY - y)
        guard available > 1 else {
          result.overflow += max(1, row.title.length + row.number.length)
          continue
        }
        guard row.numberWidth <= width else {
          result.overflow += row.title.length + row.number.length
          y += row.height + row.spacing
          continue
        }
        var baseline: CGFloat?
        var titleEnd: CGFloat?
        var titleComplete = true
        if row.title.length > 0 {
          let item = NativeSlideRenderer.textPlacement(row.title,
            range: CFRange(location: 0, length: 0),
            rect: CGRect(x: x, y: y, width: row.titleWidth,
              height: min(row.titleHeight, available)))
          result.placements.append(item)
          titleComplete = item.visible.length == row.title.length
          result.overflow += max(0, row.title.length - item.visible.length)
          if let last = lastLine(item) {
            baseline = last.baseline
            titleEnd = last.end
          }
        }
        if row.number.length > 0 && titleComplete {
          let numberRect = CGRect(x: x + width - row.numberWidth, y: y,
            width: row.numberWidth, height: row.numberHeight)
          let probe = NativeSlideRenderer.textPlacement(row.number,
            range: CFRange(location: 0, length: 0), rect: numberRect)
          let numberOffset = lastLine(probe).map { $0.baseline - y } ?? 0
          let numberY = baseline.map { $0 - numberOffset } ?? y
          if numberY + row.numberHeight <= region.maxY + 0.01,
            probe.visible.length == row.number.length {
            let item = PrototypeTextPlacement(frame: numberRect.offsetBy(dx: 0, dy: numberY - y),
              content: probe.content, textFrame: probe.textFrame, visible: probe.visible)
            result.placements.append(item)
            if let baseline, let titleEnd {
              let pad = bodySize * 0.22
              let start = titleEnd + pad, end = numberRect.minX - pad
              if end - start >= bodySize * 0.65 {
                result.leaders.append(PrototypeDottedLine(
                  start: CGPoint(x: start, y: baseline - row.font.xHeight * 0.18),
                  end: CGPoint(x: end, y: baseline - row.font.xHeight * 0.18),
                  color: row.color, weight: max(0.7, bodySize * 0.035),
                  spacing: max(2, bodySize * 0.2)))
              }
            }
          } else { result.overflow += row.number.length }
        } else if row.number.length > 0 { result.overflow += row.number.length }
        y += row.height + row.spacing
      }
    }
    return result
  }

  private static func measuredHeight(_ text: NSAttributedString, width: CGFloat) -> CGFloat {
    guard text.length > 0 else { return 0 }
    let measured = CTFramesetterSuggestFrameSizeWithConstraints(
      CTFramesetterCreateWithAttributedString(text), CFRange(location: 0, length: 0), nil,
      CGSize(width: width, height: CGFloat.greatestFiniteMagnitude), nil)
    return ceil(measured.height) + 3
  }

  private static func lastLine(_ item: PrototypeTextPlacement) -> (baseline: CGFloat, end: CGFloat)? {
    let lines = CTFrameGetLines(item.textFrame) as! [CTLine]
    guard let line = lines.last else { return nil }
    var origin = CGPoint.zero
    CTFrameGetLineOrigins(item.textFrame, CFRange(location: lines.count - 1, length: 1), &origin)
    let width = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    return (item.frame.maxY - origin.y, item.frame.minX + origin.x + width)
  }
}
