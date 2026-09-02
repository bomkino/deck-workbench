import Foundation

enum WritingImportSeedBuilder {
    private static let payloadByteLimit = 786_432
    private static let deckTitleLimit = 240
    private static let partTitleLimit = 240
    private static let slideTitleLimit = 240
    private static let purposeLimit = 4_096
    private static let copyFieldLimit = 262_144
    private static let partLimit = 200
    private static let slideLimit = 1_000

    private static let canvasIDs: Set<String> = [
        "cinemascope-2576x1080",
        "widescreen-1920x1080",
        "square-2160x2160",
        "standard-1920x1440",
        "a4-portrait",
        "letter-portrait",
    ]
    private static let styleIDs: Set<String> = [
        "undecided",
        "text-only",
        "full-bleed",
        "full-bleed-overlay",
        "image-text",
        "diptych",
        "triptych",
        "gallery",
        "custom",
    ]
    private static let contentPatternIDs: Set<String> = [
        "simple-copy",
        "quote",
        "repeater",
        "comparison",
        "gallery-captions",
        "no-on-slide-text",
        "custom",
    ]
    private static let copyStates: Set<String> = ["present", "intentionally-blank", "unreviewed"]

    static func validate(_ rawValue: Any) throws -> [String: Any] {
        let raw = try object(rawValue, field: "writingImport")
        try exactKeys(raw, expected: ["format", "title", "canvas", "parts"], field: "writingImport")
        let encoded = try JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys, .withoutEscapingSlashes])
        guard encoded.count <= payloadByteLimit else {
            throw invalid("writingImport exceeds payload byte limit of \(payloadByteLimit)")
        }
        guard raw["format"] as? String == "workbench-markdown/1" else {
            throw invalid("writingImport format must be workbench-markdown/1")
        }
        let title = try text(raw["title"], field: "writingImport title", limit: deckTitleLimit)
        guard let canvas = raw["canvas"] as? String, canvasIDs.contains(canvas) else {
            throw invalid("writingImport canvas is unsupported")
        }
        guard let rawParts = raw["parts"] as? [Any], !rawParts.isEmpty else {
            throw invalid("writingImport must contain at least one Part")
        }
        guard rawParts.count <= partLimit else {
            throw invalid("writingImport exceeds Part limit of \(partLimit)")
        }

        var slideCount = 0
        let parts: [[String: Any]] = try rawParts.enumerated().map { partIndex, rawPart in
            let partNumber = partIndex + 1
            let part = try object(rawPart, field: "writingImport Part \(partNumber)")
            try exactKeys(part, expected: ["title", "purpose", "slides"], field: "writingImport Part \(partNumber)")
            let partTitle = try text(part["title"], field: "writingImport Part \(partNumber) title", limit: partTitleLimit)
            let purpose = try text(part["purpose"], field: "writingImport Part \(partNumber) purpose", limit: purposeLimit)
            guard let rawSlides = part["slides"] as? [Any], !rawSlides.isEmpty else {
                throw invalid("writingImport Part \(partNumber) must contain at least one Slide")
            }
            let slides: [[String: Any]] = try rawSlides.map { rawSlide in
                slideCount += 1
                guard slideCount <= slideLimit else {
                    throw invalid("writingImport exceeds Slide limit of \(slideLimit)")
                }
                let slide = try object(rawSlide, field: "writingImport Slide \(slideCount)")
                try exactKeys(
                    slide,
                    expected: ["title", "purpose", "style", "contentPattern", "copies"],
                    field: "writingImport Slide \(slideCount)"
                )
                let slideTitle = try text(slide["title"], field: "writingImport Slide \(slideCount) title", limit: slideTitleLimit)
                let slidePurpose = try text(slide["purpose"], field: "writingImport Slide \(slideCount) purpose", limit: purposeLimit)
                guard let style = slide["style"] as? String, styleIDs.contains(style) else {
                    throw invalid("writingImport Slide \(slideCount) Style is unsupported")
                }
                guard let contentPattern = slide["contentPattern"] as? String,
                      contentPatternIDs.contains(contentPattern)
                else {
                    throw invalid("writingImport Slide \(slideCount) Content pattern is unsupported")
                }
                let rawCopies = try object(slide["copies"], field: "writingImport Slide \(slideCount) copies")
                try exactKeys(rawCopies, expected: ["headline", "subheadline", "body"], field: "writingImport Slide \(slideCount) copies")
                let headline = try validatedCopy(rawCopies["headline"], role: "headline")
                let subheadline = try validatedCopy(rawCopies["subheadline"], role: "subheadline")
                let body = try validatedCopy(rawCopies["body"], role: "body")
                return [
                    "title": slideTitle,
                    "purpose": slidePurpose,
                    "style": style,
                    "contentPattern": contentPattern,
                    "copies": ["headline": headline, "subheadline": subheadline, "body": body],
                ]
            }
            return ["title": partTitle, "purpose": purpose, "slides": slides]
        }

        return [
            "format": "workbench-markdown/1",
            "title": title,
            "canvas": canvas,
            "parts": parts,
        ]
    }

    static func seed(_ writingImport: [String: Any]) throws -> [String: Any] {
        guard let rawParts = writingImport["parts"] as? [[String: Any]] else {
            throw invalid("Validated writingImport Parts are invalid")
        }
        let parts: [[String: Any]] = try rawParts.map { part in
            guard let partTitle = part["title"] as? String,
                  let partPurpose = part["purpose"] as? String,
                  let slides = part["slides"] as? [[String: Any]]
            else {
                throw invalid("Validated writingImport Slides are invalid")
            }
            return [
                "id": identity(),
                "title": partTitle,
                "purpose": partPurpose,
                "slides": try slides.map { slide in
                    guard let slideTitle = slide["title"] as? String,
                          let slidePurpose = slide["purpose"] as? String,
                          let style = slide["style"] as? String,
                          let contentPattern = slide["contentPattern"] as? String,
                          let copies = slide["copies"] as? [String: [String: Any]],
                          var headline = copies["headline"],
                          var subheadline = copies["subheadline"],
                          var body = copies["body"]
                    else { throw invalid("Validated writingImport copies are invalid") }
                    headline["blockId"] = identity()
                    if subheadline["state"] as? String == "present" { subheadline["blockId"] = identity() }
                    if body["state"] as? String == "present" { body["blockId"] = identity() }
                    return [
                        "id": identity(),
                        "title": slideTitle,
                        "purpose": slidePurpose,
                        "style": style,
                        "contentPattern": contentPattern,
                        "planBlockId": identity(),
                        "copies": ["headline": headline, "subheadline": subheadline, "body": body],
                    ]
                },
            ]
        }
        return ["deckId": identity(), "writingImport": writingImport.merging(["parts": parts]) { _, new in new }]
    }

    private static func validatedCopy(_ rawValue: Any?, role: String) throws -> [String: Any] {
        let copy = try object(rawValue, field: "writingImport \(role)")
        try exactKeys(copy, expected: ["state", "value"], field: "writingImport \(role)")
        guard let state = copy["state"] as? String, copyStates.contains(state) else {
            throw invalid("writingImport \(role) state is unsupported")
        }
        guard let value = copy["value"] as? String else {
            throw invalid("writingImport \(role) value must be a string")
        }
        guard value.utf16.count <= copyFieldLimit else {
            throw invalid("writingImport \(role) exceeds copy-field limit")
        }
        if state == "present" && value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw invalid("writingImport \(role) is present but empty")
        }
        if state != "present" && !value.isEmpty {
            throw invalid("writingImport \(role) \(state) state cannot contain copy")
        }
        return ["state": state, "value": value]
    }

    private static func object(_ value: Any?, field: String) throws -> [String: Any] {
        guard let value = value as? [String: Any] else { throw invalid("\(field) must be an object") }
        return value
    }

    private static func exactKeys(_ value: [String: Any], expected: Set<String>, field: String) throws {
        guard Set(value.keys) == expected else {
            let unknown = Set(value.keys).subtracting(expected).sorted().first
            if let unknown { throw invalid("\(field) contains unknown field \(unknown)") }
            throw invalid("\(field) is missing a required field")
        }
    }

    private static func text(_ value: Any?, field: String, limit: Int) throws -> String {
        guard let value = value as? String, !value.isEmpty else {
            throw invalid("\(field) must be a non-empty string")
        }
        guard value.utf16.count <= limit else { throw invalid("\(field) exceeds \(limit) characters") }
        return value
    }

    private static func identity() -> String { UUID().uuidString.lowercased() }

    private static func invalid(_ message: String) -> WorkbenchFailure {
        WorkbenchFailure(name: "InvalidCommand", message: message)
    }
}
