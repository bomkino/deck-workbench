import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Media catalogue behaviour on real files, with a private grant store so the
/// person's own folder permissions are never read or changed.
enum NativeMediaChecks {
  private static func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw WorkbenchFailure(name: "AcceptanceFailure", message: message) }
  }
  private static func png(_ url: URL, shade: CGFloat) throws {
    let context = CGContext(data: nil, width: 64, height: 48, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.setFillColor(CGColor(red: shade, green: 0.4, blue: 1 - shade, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, context.makeImage()!, nil)
    try require(CGImageDestinationFinalize(destination), "Could not write a synthetic image")
  }
  /// A sparse file larger than the fingerprint limit; no data is written.
  private static func large(_ url: URL, bytes: Int) throws {
    FileManager.default.createFile(atPath: url.path, contents: nil)
    let handle = try FileHandle(forWritingTo: url)
    try handle.truncate(atOffset: UInt64(bytes))
    try handle.close()
  }
  private static func scan(_ data: Data) throws -> [String: Any] {
    try require((try JSONSerialization.jsonObject(with: data) as? [String: Any])?["scan"] is [String: Any], "A scan returned no summary")
    return (try JSONSerialization.jsonObject(with: data) as! [String: Any])["scan"] as! [String: Any]
  }
  private static func failure(_ work: () async throws -> Void) async -> String? {
    do { try await work(); return nil } catch { return (error as? WorkbenchFailure)?.name ?? "\(error)" }
  }

  static func run() async throws {
    let files = FileManager.default
    let root = files.temporaryDirectory.appendingPathComponent("Workbench-media-\(UUID().uuidString)", isDirectory: true)
    let media = root.appendingPathComponent("Media", isDirectory: true)
    let locked = media.appendingPathComponent("Locked", isDirectory: true)
    try files.createDirectory(at: locked, withIntermediateDirectories: true)
    defer {
      try? files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path)
      try? files.removeItem(at: root)
    }
    let package = root.appendingPathComponent("Media check.pitchdeck", isDirectory: true)
    try files.createDirectory(at: package, withIntermediateDirectories: false)
    let session = try MediaCatalogSession(packageURL: package, deckId: "media-check",
      grantStoreURL: root.appendingPathComponent("Grants/media-grants.json"))
    defer { session.revoke() }
    try png(media.appendingPathComponent("a.png"), shade: 0.1)
    try png(media.appendingPathComponent("b.png"), shade: 0.5)
    try png(media.appendingPathComponent("c.png"), shade: 0.9)
    try png(locked.appendingPathComponent("kept.png"), shade: 0.3)
    try Data("not an image".utf8).write(to: media.appendingPathComponent("._a.png"))
    try files.createDirectory(at: media.appendingPathComponent("Tool.app"), withIntermediateDirectories: false)
    try png(media.appendingPathComponent("Tool.app/inside.png"), shade: 0.7)

    var result = try scan(await session.authorizeRootJSON(media))
    try require(result["discovered"] as? Int == 4, "Hidden companions or package contents were catalogued as media")
    try require(result["fingerprintsComputed"] as? Int == 4 && result["fingerprintsReused"] as? Int == 0, "A first scan did not read each original")
    let rootID = try await session.nativeCatalogUpdate(after: -1)!.catalog.roots[0].id
    result = try scan(await session.scanRootJSON(rootId: rootID))
    try require(result["fingerprintsReused"] as? Int == 4 && result["fingerprintsComputed"] as? Int == 0 && result["changed"] as? Bool == false,
      "An unchanged rescan read every original again")
    try png(media.appendingPathComponent("b.png"), shade: 0.6)
    result = try scan(await session.scanRootJSON(rootId: rootID))
    try require(result["fingerprintsComputed"] as? Int == 1, "A changed original was not read again")

    for nested in [locked, root] {
      try require(await failure { _ = try await session.authorizeRootJSON(nested) } == "NestedMediaRoot",
        "A folder overlapping an attached folder was attached again")
    }

    // An incomplete scan (one folder unreadable) still applies a confirmed
    // move and marks a confirmed-gone file missing, and leaves unreached files alone.
    var catalog = try await session.nativeCatalogUpdate(after: -1)!.catalog
    let ids = Dictionary(uniqueKeysWithValues: catalog.assets.map { ($0.relativePath, $0.id) })
    try files.moveItem(at: media.appendingPathComponent("a.png"), to: media.appendingPathComponent("a moved.png"))
    try files.removeItem(at: media.appendingPathComponent("c.png"))
    try files.setAttributes([.posixPermissions: 0], ofItemAtPath: locked.path)
    result = try scan(await session.scanRootJSON(rootId: rootID))
    try files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path)
    try require(result["status"] as? String == "incomplete", "An unreadable folder did not make the scan incomplete")
    catalog = try await session.nativeCatalogUpdate(after: -1)!.catalog
    let byID = Dictionary(uniqueKeysWithValues: catalog.assets.map { ($0.id, $0) })
    try require(byID[ids["a.png"]!]?.relativePath == "a moved.png" && byID[ids["a.png"]!]?.availability == "available",
      "A confirmed move in an incomplete scan changed the asset's identity")
    try require(byID[ids["c.png"]!]?.availability == "missing", "A confirmed-gone file stayed available")
    try require(byID[ids["Locked/kept.png"]!]?.availability == "available", "An unreached file was marked missing")

    // Originals over the fingerprint limit are checked by size and time.
    let big = media.appendingPathComponent("Large.mov")
    try large(big, bytes: 257 * 1024 * 1024)
    _ = try await session.scanRootJSON(rootId: rootID)
    catalog = try await session.nativeCatalogUpdate(after: -1)!.catalog
    let bigID = catalog.assets.first { $0.relativePath == "Large.mov" }!.id
    let source = try await session.nativeSources(assetIds: [bigID])[bigID]!
    try require(source.fingerprint.hasPrefix("unavailable:"), "A large original was fingerprinted")
    let staged = root.appendingPathComponent("staged.mov")
    _ = try NativeMediaIO.stageOriginal(source, to: staged, expectedFingerprint: source.fingerprint)
    try files.removeItem(at: staged)
    try files.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -86_400)], ofItemAtPath: big.path)
    var changed = false
    do { _ = try NativeMediaIO.stageOriginal(source, to: staged, expectedFingerprint: source.fingerprint) }
    catch { changed = (error as? WorkbenchFailure)?.name == "SourceChanged" }
    try require(changed && !files.fileExists(atPath: staged.path), "A changed large original was handed off as unchanged")

    // A folder of only large originals reconnects on matching names and sizes.
    let largeOnly = root.appendingPathComponent("Large only", isDirectory: true)
    try files.createDirectory(at: largeOnly, withIntermediateDirectories: false)
    try large(largeOnly.appendingPathComponent("One.mov"), bytes: 257 * 1024 * 1024)
    try large(largeOnly.appendingPathComponent("Two.mov"), bytes: 258 * 1024 * 1024)
    _ = try await session.authorizeRootJSON(largeOnly)
    let largeRoot = try await session.nativeCatalogUpdate(after: -1)!.catalog.roots.first { $0.label == "Large only" }!.id
    let impostor = root.appendingPathComponent("Impostor", isDirectory: true)
    try files.createDirectory(at: impostor, withIntermediateDirectories: false)
    try large(impostor.appendingPathComponent("One.mov"), bytes: 100)
    try require(await failure { _ = try await session.reconnectRootJSON(rootId: largeRoot, url: impostor) } == "MediaRootMismatch",
      "A folder without the saved originals was accepted as a reconnect")
    let copy = root.appendingPathComponent("Large copy", isDirectory: true)
    try files.createDirectory(at: copy, withIntermediateDirectories: false)
    try large(copy.appendingPathComponent("One.mov"), bytes: 257 * 1024 * 1024)
    try large(copy.appendingPathComponent("Two.mov"), bytes: 258 * 1024 * 1024)
    try require(await failure { _ = try await session.reconnectRootJSON(rootId: largeRoot, url: copy) } == nil,
      "A copy of a large-only folder could not be reconnected")
  }
}
