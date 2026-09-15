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
  }
}
