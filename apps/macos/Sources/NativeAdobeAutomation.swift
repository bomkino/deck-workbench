import AppKit
import CryptoKit
import Foundation

enum NativeStarterKit {
  private struct Receipt: Decodable {
    struct Entry: Decodable { let path: String; let sha256: String }
    let files: [Entry]
  }

  static func bundled() throws -> URL {
    guard let url = Bundle.main.resourceURL?.appendingPathComponent("StarterKit"),
      FileManager.default.fileExists(atPath: url.appendingPathComponent("manifest.json").path) else {
      throw WorkbenchFailure(name: "StarterKitMissing", message: "The starter kit is missing from this app. Reinstall the complete Workbench app.")
    }
    return url
  }

  static func verify(_ root: URL) throws {
    let root = root.resolvingSymlinksInPath()
    let receipt = try JSONDecoder().decode(Receipt.self, from: Data(contentsOf: root.appendingPathComponent("manifest.json")))
    guard !receipt.files.isEmpty else { throw WorkbenchFailure(name: "StarterKitInvalid", message: "The starter kit is empty.") }
    for entry in receipt.files {
      try Task.checkCancellation()
      let file = root.appendingPathComponent(entry.path).standardizedFileURL
      guard file.path.hasPrefix(root.standardizedFileURL.path + "/"),
        file.resolvingSymlinksInPath().path == file.path else {
        throw WorkbenchFailure(name: "StarterKitInvalid", message: "The starter kit contains an invalid file path.")
      }
      let handle = try FileHandle(forReadingFrom: file)
      defer { try? handle.close() }
      var hash = SHA256()
      while let bytes = try handle.read(upToCount: 262_144), !bytes.isEmpty { hash.update(data: bytes) }
      let actual = hash.finalize().map { String(format: "%02x", $0) }.joined()
      guard actual == entry.sha256 else {
        throw WorkbenchFailure(name: "StarterKitInvalid", message: "The bundled starter file did not pass verification: \(entry.path). Reinstall Workbench.")
      }
    }
  }

  static func copy(to destination: URL) throws {
    let source = try bundled()
    try verify(source)
    try FileManager.default.copyItem(at: source, to: destination)
    try verify(destination)
  }
}

enum NativeAdobeAutomation {
  // Adobe scripting is serial. In particular, setup cannot interrupt a running build.
  private static let lock = NSLock()
  static let inDesignID = "com.adobe.InDesign"
  static let photoshopID = "com.adobe.Photoshop"

  static func installed(_ id: String) -> Bool {
    NSWorkspace.shared.urlForApplication(withBundleIdentifier: id) != nil
  }

  private static func quoted(_ value: String) -> String {
    "\"" + value.replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
      .replacingOccurrences(of: "\r", with: "\\r")
      .replacingOccurrences(of: "\n", with: "\\n")
      .replacingOccurrences(of: "\t", with: "\\t") + "\""
  }

  @discardableResult
  private static func execute(_ source: String) throws -> String {
    var error: NSDictionary?
    guard let script = NSAppleScript(source: source) else {
      throw WorkbenchFailure(name: "AdobeScriptInvalid", message: "Workbench could not prepare the Adobe connection.")
    }
    let value = script.executeAndReturnError(&error)
    if let error {
      let code = error[NSAppleScript.errorNumber] as? Int ?? 0
      let detail = error[NSAppleScript.errorMessage] as? String ?? "Adobe did not finish the request."
      if code == -1743 {
        throw WorkbenchFailure(name: "AdobePermissionDenied", message: "Allow Deck Workbench to control Adobe in System Settings → Privacy & Security → Automation, then export again. The completed handoff is safe.\n\(detail)")
      }
      throw WorkbenchFailure(name: "AdobeAutomationFailed", message: "Adobe connection (\(code)): \(detail)")
    }
    return value.stringValue ?? ""
  }

  static func setUp(_ id: String) throws -> String {
    lock.lock(); defer { lock.unlock() }
    guard [inDesignID, photoshopID].contains(id), installed(id) else {
      throw WorkbenchFailure(name: "AdobeNotInstalled", message: "This Adobe app was not found. Install it, then try setup again.")
    }
    let version = try execute("with timeout of 90 seconds\n tell application id \(quoted(id))\n get version\n end tell\nend timeout")
    return "Connected · version \(version). macOS may ask again after an app update."
  }

  static func build(in handoff: URL, width: Int, slideCount: Int, cancellation: URL) throws -> [Int] {
    lock.lock(); defer { lock.unlock() }
    try Task.checkCancellation()
    guard installed(inDesignID) else {
      throw WorkbenchFailure(name: "InDesignNotInstalled", message: "InDesign was not found. Your PSDs and writing are ready; use the included starter and Build script on a Mac with InDesign installed.")
    }
    guard width == 1920 || width == 2576 else {
      throw WorkbenchFailure(name: "InDesignCanvasUnsupported", message: "Automatic InDesign needs 1920 × 1080 or 2576 × 1080.")
    }
    let kit = handoff.appendingPathComponent("Starter Kit", isDirectory: true)
    try NativeStarterKit.verify(kit)
    let manager = FileManager.default
    let logs = cancellation.deletingLastPathComponent()
    try manager.createDirectory(at: logs, withIntermediateDirectories: true)
    let runner = logs.appendingPathComponent("Build InDesign.jsx")
    try manager.copyItem(at: kit.appendingPathComponent("Automation/InDesign/Build Handoff.jsx"), to: runner)
    let runID = UUID().uuidString
    let job: [String: Any] = ["format": "pitchdog-indesign-job/1", "runID": runID, "width": width, "slideCount": slideCount]
    try JSONSerialization.data(withJSONObject: job, options: [.prettyPrinted, .sortedKeys])
      .write(to: logs.appendingPathComponent("job.json"), options: .atomic)
    try Task.checkCancellation()
    // The production folder has already reached its final path. Adobe links must
    // never point into the exporter's temporary staging directory.
    try execute("with timeout of 3600 seconds\n tell application id \(quoted(inDesignID))\n do script (POSIX file \(quoted(runner.path))) language javascript\n end tell\nend timeout")
    let resultURL = logs.appendingPathComponent("result.json")
    guard let result = try JSONSerialization.jsonObject(with: Data(contentsOf: resultURL)) as? [String: Any],
      result["runID"] as? String == runID else {
      throw WorkbenchFailure(name: "InDesignReceiptMissing", message: "InDesign did not return a matching build receipt. Review the Automation folder before retrying.")
    }
    guard result["ok"] as? Bool == true else {
      throw WorkbenchFailure(name: "InDesignBuildFailed", message: result["message"] as? String ?? "InDesign could not complete the deck. Your production handoff is still available.")
    }
    let deck = handoff.appendingPathComponent("InDesign/Deck.indd")
    let manifestURL = handoff.appendingPathComponent("InDesign/deck-production.json")
    let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as? [String: Any]
    guard result["slides"] as? Int == slideCount, result["psds"] as? Int == slideCount,
      result["placements"] as? Int == slideCount * 2,
      result["document"] as? String == deck.path,
      manifest?["status"] as? String == "ready", manifest?["slideCount"] as? Int == slideCount,
      (try deck.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) > 256 else {
      throw WorkbenchFailure(name: "InDesignVerificationFailed", message: "InDesign's saved deck did not match the expected pages and PSD links. Review the Automation receipt; the original handoff is safe.")
    }
    return result["overflow"] as? [Int] ?? []
  }

  static func withIssue(_ result: HandoffResult, _ issue: String) -> HandoffResult {
    let url = result.url.appendingPathComponent("Export issues.txt")
    let existing = (try? String(contentsOf: url, encoding: .utf8)) ?? "Handoff saved with exceptions\n"
    var issues = result.issues + [issue]
    do { try (existing + "\nInDesign: " + issue + "\n").write(to: url, atomically: true, encoding: .utf8) }
    catch { issues.append("The issue report could not be saved: \(error.localizedDescription)") }
    var produced = result.produced
    if FileManager.default.fileExists(atPath: url.path), !produced.contains("Export issues.txt") { produced.append("Export issues.txt") }
    return HandoffResult(url: result.url, slideCount: result.slideCount, originalCopies: result.originalCopies, issues: issues, produced: produced)
  }
}
