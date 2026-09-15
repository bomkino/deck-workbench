import AppKit
import Foundation

/// Runs only the new export path, without opening a user's deck or an Adobe app.
@MainActor
final class NativeParityProbeDelegate: NSObject, NSApplicationDelegate {
  let output: URL
  init(output: URL) { self.output = output }
  func applicationDidFinishLaunching(_ notification: Notification) {
    Task {
      do {
        try await NativeCompatibilityChecks.run()
        try NativeProductionCopyChecks.run(output: output)
        try NativeStarterStyleChecks.run()
        try await Task.detached(priority: .utility) { [output] in
          try NativePSDChecks.run(output: output)
        }.value
        print("NATIVE_PARITY_PROBE_PASSED")
        fflush(stdout)
        exit(0)
      } catch {
        fputs("NATIVE_PARITY_PROBE_FAILED: \(error)\n", stderr)
        fflush(stderr)
        exit(1)
      }
    }
  }
}
