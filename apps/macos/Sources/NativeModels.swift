import AppKit
import Foundation

struct DeckDocumentSnapshot: Codable, Sendable {
  let revision: Int
  var deck: DeckDocument
  let history: HistoryAvailability
}
struct HistoryAvailability: Codable, Sendable {
  let canUndo: Bool
  let canRedo: Bool
}
struct DeckDocument: Codable, Sendable {
  let deckId: String
  var title: String
  let canvasPreset: DeckCanvas
  var sections: [DeckSection]
  var assetReferences: [DeckAssetReference]?
  var workbenchCurate: LegacyCurateEnvelope?
  var slides: [DeckSlide] { sections.flatMap(\.slides) }
  var includedSlides: [DeckSlide] { slides.filter { $0.native?.included != false } }
}
struct DeckCanvas: Codable, Sendable {
  let id: String
  let width: Double
  let height: Double
}
struct DeckSection: Codable, Sendable, Identifiable {
  let id: String
  var title: String
  var purpose: String?
  var slides: [DeckSlide]
}
struct DeckSlide: Codable, Sendable, Identifiable {
  let id: String
  var intent: String
  var internalTitle: String?
  var contentBlocks: [DeckCopyBlock]
  var mediaAssignments: [DeckMediaAssignment]?
  var designOptions: [LegacyDesignOption]?
  var activeDesignOptionId: String?
  var native: NativeSlideSettings?
  var settings: NativeSlideSettings { native ?? .initial }
  var copyBlocks: [DeckCopyBlock] { contentBlocks.filter { !$0.isMetadata } }
  var title: String {
    if let internalTitle, !internalTitle.isEmpty { return internalTitle }
    for block in contentBlocks where block.isMetadata {
      if let data = block.text.data(using: .utf8),
        let plan = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let title = plan["internalTitle"] as? String, !title.isEmpty
      {
        return title
      }
    }
    return copyBlocks.first(where: { $0.role == "headline" })?.text.nonempty ?? "Untitled slide"
  }
  var legacyComposition: LegacyComposition? {
    designOptions?.first { $0.id == activeDesignOptionId }?.composition
  }
  var chosenIDs: Set<String> { Set((mediaAssignments ?? []).map(\.assetReferenceId)) }
  var imageRoles: [String] {
    let assigned = (mediaAssignments ?? []).map(\.role)
    let preset = settings.layout.preset
    let count =
      preset == "three-images" || intent == "triptych"
      ? 3 : preset == "two-images" || intent == "diptych" ? 2 : 1
    let defaults = (0..<count).map { $0 == 0 ? "primary" : "primary:\($0 + 1)" }
    return Array(Set(assigned + defaults)).sorted { a, b in
      if a == "primary" { return true }
      if b == "primary" { return false }
      return a.localizedStandardCompare(b) == .orderedAscending
    }
  }
}
struct DeckCopyBlock: Codable, Sendable, Identifiable {
  let id: String
  var semanticKey: String
  var role: String
  var value: RichCopy
  var text: String { value.content.map { $0.content.map(\.text).joined() }.joined(separator: "\n") }
  var isMetadata: Bool { role.hasPrefix("workbench-") || semanticKey.hasPrefix("workbench.") }
  mutating func setText(_ text: String) { value = RichCopy(text) }
}
struct RichCopy: Codable, Sendable {
  var type: String = "doc"
  var content: [CopyParagraph]
  init(_ text: String) {
    content = text.components(separatedBy: "\n").map {
      CopyParagraph(content: $0.isEmpty ? [] : [CopyText(text: $0)])
    }
  }
}
struct CopyParagraph: Codable, Sendable {
  var type: String = "paragraph"
  var content: [CopyText]
}
struct CopyText: Codable, Sendable {
  var type: String = "text"
  var text: String
}
struct DeckAssetReference: Codable, Sendable {
  let id: String
  let label: String
  let mediaKind: String
  let availability: String
}
struct DeckMediaAssignment: Codable, Sendable, Identifiable {
  let id: String
  let role: String
  let assetReferenceId: String
}
struct LegacyCurateEnvelope: Codable, Sendable { var projectJudgments: [String: AssetJudgment]? }
struct AssetJudgment: Codable, Sendable {
  var rating: Int
  var review: String
  var projectPick: Bool
}
struct LegacyDesignOption: Codable, Sendable {
  let id: String
  let name: String
  let composition: LegacyComposition
}
struct LegacyComposition: Codable, Sendable {
  let id: String
  let elements: [LegacyElement]
}
struct LegacyElement: Codable, Sendable {
  let id: String
  let kind: String
  let frame: PrototypeFrame
  let contentBlockId: String?
  let mediaRole: String?
  let crop: PrototypeCrop?
  let imageFit: String?
  let gradient: PrototypeGradient?
  let textSize: String?
}
struct NativeSlideSettings: Codable, Sendable {
  var version: Int = 1
  var copyLocked: Bool = true
  var notes: String = ""
  var included: Bool = true
  var shortlist: [String] = []
  var rejected: [String] = []
  var sourceFingerprints: [String: String] = [:]
  var layout: PrototypeLayout = .initial
  static let initial = NativeSlideSettings()
}
struct PrototypeLayout: Codable, Sendable {
  var preset: String = "auto"
  var columns: Int = 1
  var bodySize: Double = 32
  var fitCopy: Bool = true
  var textFrame: PrototypeFrame?
  var frames: [String: PrototypeFrame] = [:]
  var crops: [String: PrototypeCrop] = [:]
  var imageFits: [String: String] = [:]
  var gradient: PrototypeGradient?
  static let initial = PrototypeLayout()
}
struct PrototypeFrame: Codable, Equatable, Sendable {
  var x: Double
  var y: Double
  var width: Double
  var height: Double
  var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
  init(_ rect: CGRect) {
    x = rect.minX
    y = rect.minY
    width = rect.width
    height = rect.height
  }
  init(x: Double, y: Double, width: Double, height: Double) {
    self.x = x
    self.y = y
    self.width = width
    self.height = height
  }
}
struct PrototypeCrop: Codable, Equatable, Sendable {
  var x: Double = 0
  var y: Double = 0
  var width: Double = 1
  var height: Double = 1
  static let full = PrototypeCrop()
}
struct PrototypePoint: Codable, Equatable, Sendable {
  var x: Double
  var y: Double
}
struct PrototypeColors: Codable, Equatable, Sendable {
  var start = "#000000"
  var end = "#000000"
}
struct PrototypeGradient: Codable, Equatable, Sendable {
  var type: String = "linear"
  var start = PrototypePoint(x: 0, y: 0.5)
  var end = PrototypePoint(x: 0.72, y: 0.5)
  var opacity: Double = 0.78
  var colors: PrototypeColors? = PrototypeColors()
}
struct NativeCatalogSnapshot: Codable, Sendable {
  let revision: Int
  let roots: [NativeMediaRoot]
  let assets: [NativeMediaAsset]
}
struct NativeMediaRoot: Codable, Sendable, Identifiable {
  let id: String
  let label: String
}
struct NativeMediaAsset: Codable, Sendable, Identifiable {
  let id: String
  let sourceRevisionId: String
  let rootId: String
  let relativePath: String
  let filename: String
  let folder: String
  let title: String
  let note: String
  let mediaKind: String
  let orientation: String?
  let availability: String
  let previewCapability: String
  let width: Int?
  let height: Int?
  let byteSize: Int
  let fingerprint: String
  let previewReason: String?
  var reference: DeckAssetReference {
    DeckAssetReference(
      id: id, label: filename, mediaKind: mediaKind,
      availability: availability == "available" ? "available" : "missing")
  }
}
struct NativeMediaSource: Codable, Sendable {
  let assetId: String
  let sourceRevisionId: String
  let rootPath: String
  let relativePath: String
  let filename: String
  let fingerprint: String
  let byteSize: Int
  let mediaKind: String
  let rootDevice: String
  let rootInode: String
  var bookmark: Data?
  var url: URL {
    URL(fileURLWithPath: rootPath, isDirectory: true).appendingPathComponent(relativePath)
  }
  var cacheKey: String { "\(assetId):\(sourceRevisionId):\(fingerprint)" }
}
extension String { var nonempty: String? { isEmpty ? nil : self } }
func nativeJSON<T: Encodable>(_ value: T) throws -> Data { try JSONEncoder().encode(value) }
func nativeObject<T: Encodable>(_ value: T) throws -> Any {
  try JSONSerialization.jsonObject(with: nativeJSON(value))
}
