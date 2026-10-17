import CryptoKit
import Foundation

enum NativeAdobeAutomationChecks {
  static func run() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("Workbench-adobe-wait-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: root) }
    let marker = root.appendingPathComponent("cancel")
    // Repeat the quick completion boundary because yield and finish run on the
    // worker while the consumer resumes independently. Empty overflow is valid.
    for index in 0..<64 {
      let expected = index.isMultiple(of: 2) ? [Int]() : [2, 4]
      let normal = try await NativeAdobeAutomation.waitForBuild(cancellation: marker) { expected }
      await Task.yield()
      guard normal == expected, !FileManager.default.fileExists(atPath: marker.path) else {
        throw WorkbenchFailure(name: "AcceptanceFailure", message: "A completed Adobe build was cancelled or lost its result")
      }
    }
    do {
      _ = try await NativeAdobeAutomation.waitForBuild(cancellation: marker) {
        throw WorkbenchFailure(name: "AdobeProbe", message: "Expected worker failure")
      }
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "An Adobe worker error was swallowed")
    } catch let error as WorkbenchFailure where error.name == "AdobeProbe" {
      guard !FileManager.default.fileExists(atPath: marker.path) else {
        throw WorkbenchFailure(name: "AcceptanceFailure", message: "An Adobe worker error was mislabeled as cancellation")
      }
    }
    let entered = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0), finished = DispatchSemaphore(value: 0)
    // A zero-time probe never blocks the async executor.
    func signalled(_ semaphore: DispatchSemaphore) -> Bool { semaphore.wait(timeout: .now()) == .success }
    defer { release.signal() }
    let waiting = Task {
      try await NativeAdobeAutomation.waitForBuild(cancellation: marker) {
        entered.signal()
        _ = release.wait(timeout: .now() + 5)
        finished.signal()
        return []
      }
    }
    let deadline = Date().addingTimeInterval(3)
    while !signalled(entered) {
      guard Date() < deadline else {
        waiting.cancel()
        throw WorkbenchFailure(name: "AcceptanceFailure", message: "The Adobe wait check did not start")
      }
      try await Task.sleep(for: .milliseconds(10))
    }
    waiting.cancel()
    let result = await waiting.result
    guard case .failure(let error) = result, error is CancellationError,
      !signalled(finished),
      (try? String(contentsOf: marker, encoding: .utf8)) == "cancel\n" else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "Cancelling a blocked Adobe request did not return control and mark safe cleanup")
    }
    release.signal()
    try kitVerification(root)
  }

  /// A handoff's starter kit is checked against the app's own manifest: an
  /// added file, or a changed file with a rewritten kit manifest, is refused.
  private static func kitVerification(_ root: URL) throws {
    func refused(_ kit: URL, reference: URL? = nil) -> Bool {
      do { try NativeStarterKit.verify(kit, reference: reference); return false }
      catch { return (error as? WorkbenchFailure)?.name == "StarterKitInvalid" }
    }
    let bundled = try NativeStarterKit.bundled()
    let reference = bundled.appendingPathComponent("manifest.json")
    let kit = root.appendingPathComponent("Starter Kit", isDirectory: true)
    try NativeStarterKit.copy(to: kit)
    try NativeStarterKit.verify(kit, reference: reference)
    let extra = kit.appendingPathComponent("Automation/InDesign/Extra.jsx")
    try Data("// not shipped\n".utf8).write(to: extra)
    guard refused(kit, reference: reference) else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "An unlisted starter-kit file was accepted")
    }
    try FileManager.default.removeItem(at: extra)
    let runner = kit.appendingPathComponent("Automation/InDesign/Build Handoff.jsx")
    let changed = Data("// changed\n".utf8)
    try changed.write(to: runner)
    let manifestURL = kit.appendingPathComponent("manifest.json")
    var manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as! [String: Any]
    let digest = SHA256.hash(data: changed).map { String(format: "%02x", $0) }.joined()
    manifest["files"] = (manifest["files"] as! [[String: Any]]).map { entry in
      entry["path"] as? String == "Automation/InDesign/Build Handoff.jsx" ? ["path": entry["path"]!, "sha256": digest] : entry
    }
    try JSONSerialization.data(withJSONObject: manifest).write(to: manifestURL)
    guard !refused(kit), refused(kit, reference: reference) else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "A changed starter kit with a rewritten manifest was accepted")
    }
  }
}
