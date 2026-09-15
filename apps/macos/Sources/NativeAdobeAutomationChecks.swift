import Foundation

enum NativeAdobeAutomationChecks {
  static func run() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("Workbench-adobe-wait-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: root) }
    let marker = root.appendingPathComponent("cancel")
    let normal = try await NativeAdobeAutomation.waitForBuild(cancellation: marker) { [2, 4] }
    guard normal == [2, 4], !FileManager.default.fileExists(atPath: marker.path) else {
      throw WorkbenchFailure(name: "AcceptanceFailure", message: "A completed Adobe build was cancelled or lost its result")
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
