import Combine
import Foundation
import Sparkle
import SwiftUI

private struct NativeUpdatesKey: EnvironmentKey { static let defaultValue: NativeUpdates? = nil }
extension EnvironmentValues {
  /// The app's updater; absent in the self-test and UI gallery, which never update.
  var workbenchUpdates: NativeUpdates? {
    get { self[NativeUpdatesKey.self] }
    set { self[NativeUpdatesKey.self] = newValue }
  }
}

/// Settings → Updates: Sparkle's own preferences and the current version.
struct NativeUpdateSettings: View {
  @ObservedObject var updates: NativeUpdates
  var body: some View {
    Toggle("Check for updates automatically", isOn: Binding(get: { updates.automaticallyChecks }, set: { updates.automaticallyChecks = $0 }))
    Toggle("Download and install updates automatically", isOn: Binding(get: { updates.automaticallyInstalls }, set: { updates.automaticallyInstalls = $0 }))
      .disabled(!updates.automaticallyChecks)
    LabeledContent {
      Button("Check for Updates…") { updates.checkForUpdates() }.disabled(!updates.canCheck)
    } label: {
      Text(updates.lastCheck.map { "Last checked " + $0.formatted(.relative(presentation: .named)) } ?? "Not checked yet")
        .workbenchText(.caption).foregroundStyle(.secondary)
    }
  }
}

/// In-app updates from this repository's GitHub releases, through Sparkle.
///
/// Each release carries an `appcast.xml` beside its ZIP; the app reads the one
/// on the Latest release (`SUFeedURL` in Info.plist) and installs an update
/// only when its EdDSA signature matches the public key built into the app
/// (`SUPublicEDKey`). Apple code signing is not needed for that check. Only the
/// interactive app starts the updater: the self-test and parity probe never do.
@MainActor
final class NativeUpdates: NSObject, ObservableObject {
  private var controller: SPUStandardUpdaterController?
  private let delegate = Delegate()
  @Published private(set) var canCheck = false
  @Published private(set) var lastCheck: Date?
  /// Sparkle's own preferences, so Settings and the update window agree.
  var automaticallyChecks: Bool {
    get { controller?.updater.automaticallyChecksForUpdates ?? false }
    set { objectWillChange.send(); controller?.updater.automaticallyChecksForUpdates = newValue }
  }
  var automaticallyInstalls: Bool {
    get { controller?.updater.automaticallyDownloadsUpdates ?? false }
    set { objectWillChange.send(); controller?.updater.automaticallyDownloadsUpdates = newValue }
  }
  var available: Bool { controller != nil }

  override init() {
    super.init()
    guard Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") != nil else { return }
    let updater = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: delegate, userDriverDelegate: nil)
    controller = updater
    updater.updater.publisher(for: \.canCheckForUpdates).receive(on: RunLoop.main).assign(to: &$canCheck)
    updater.updater.publisher(for: \.lastUpdateCheckDate).receive(on: RunLoop.main).assign(to: &$lastCheck)
    if ProcessInfo.processInfo.environment["STUDIO_UPDATE_TEST"] != nil {
      // Release testing: look now, and install as soon as an update is ready.
      updater.updater.automaticallyDownloadsUpdates = true
      updater.updater.checkForUpdatesInBackground()
    }
    if let ready = UserDefaults.standard.string(forKey: "UpdateTestReadyFile") {
      // Release testing: once it is up, the running copy writes its version and
      // process, so a test can tell the new version relaunching from its files
      // merely changing on disk. A relaunch keeps defaults, not the environment.
      DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        try? "\(version) \(getpid())\n".write(toFile: ready, atomically: true, encoding: .utf8)
      }
    }
  }

  func checkForUpdates() { controller?.checkForUpdates(nil) }

  static var versionDescription: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
    return "\(version) (\(build))"
  }

  final class Delegate: NSObject, SPUUpdaterDelegate {
    /// A local test feed in place of the published one, for release testing only.
    func feedURLString(for updater: SPUUpdater) -> String? {
      ProcessInfo.processInfo.environment["STUDIO_UPDATE_FEED"]
    }

    func updater(_ updater: SPUUpdater, willInstallUpdateOnQuit item: SUAppcastItem,
                 immediateInstallationBlock immediateInstallHandler: @escaping () -> Void) -> Bool {
      guard ProcessInfo.processInfo.environment["STUDIO_UPDATE_TEST"] != nil else { return false }
      immediateInstallHandler()
      return true
    }
  }
}
