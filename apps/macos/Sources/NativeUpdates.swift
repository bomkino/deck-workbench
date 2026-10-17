import Combine
import Foundation
import Sparkle
import SwiftUI

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

  override init() {
    super.init()
    guard Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") != nil else { return }
    let updater = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: delegate, userDriverDelegate: nil)
    controller = updater
    updater.updater.publisher(for: \.canCheckForUpdates).receive(on: RunLoop.main).assign(to: &$canCheck)
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
