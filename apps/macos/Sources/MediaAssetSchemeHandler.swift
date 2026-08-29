import AppKit
import Foundation
import WebKit

final class MediaAssetSchemeHandler: NSObject, WKURLSchemeHandler {
    private weak var controller: DeckSessionController?
    private let lock = NSLock()
    private var tasks: [ObjectIdentifier: Task<Void, Never>] = [:]

    @MainActor
    init(controller: DeckSessionController) {
        self.controller = controller
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let key = ObjectIdentifier(urlSchemeTask as AnyObject)
        let task = Task { @MainActor [weak self] in
            defer { self?.removeTask(key) }
            guard let self, let controller = self.controller else {
                Self.finishUnavailable(urlSchemeTask, status: 410)
                return
            }
            do {
                guard urlSchemeTask.request.httpMethod == "GET",
                      let url = urlSchemeTask.request.url,
                      url.scheme == "pitchdog-asset",
                      url.user == nil,
                      url.password == nil,
                      url.port == nil,
                      url.query == nil,
                      url.fragment == nil,
                      let nonce = url.host
                else {
                    Self.finishUnavailable(urlSchemeTask, status: 404)
                    return
                }
                let components = url.path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
                guard components.count == 2,
                      let assetId = components[0].removingPercentEncoding,
                      let profile = components[1].removingPercentEncoding,
                      profile == "grid_standard"
                else {
                    Self.finishUnavailable(urlSchemeTask, status: 404)
                    return
                }
                let source = try await controller.mediaResourceData(
                    nonce: nonce,
                    assetId: assetId,
                    profile: profile
                )
                try Task.checkCancellation()
                let png = try Self.gridPNG(source)
                guard let response = HTTPURLResponse(
                    url: url,
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: [
                        "Cache-Control": "private, no-store",
                        "Content-Security-Policy": "default-src 'none'",
                        "Content-Type": "image/png",
                        "X-Content-Type-Options": "nosniff",
                    ]
                ) else {
                    throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Preview response could not be created")
                }
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(png)
                urlSchemeTask.didFinish()
            } catch is CancellationError {
                // WebKit stopped this request; no callback is valid after cancellation.
            } catch {
                let failure = WorkbenchFailure.unexpected(error)
                let status: Int
                switch failure.name {
                case "StaleMediaSession": status = 410
                case "UnsupportedMediaPreview": status = 415
                default: status = 404
                }
                Self.finishUnavailable(urlSchemeTask, status: status)
            }
        }
        lock.lock()
        tasks[key] = task
        lock.unlock()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        let key = ObjectIdentifier(urlSchemeTask as AnyObject)
        lock.lock()
        let task = tasks.removeValue(forKey: key)
        lock.unlock()
        task?.cancel()
    }

    private func removeTask(_ key: ObjectIdentifier) {
        lock.lock()
        tasks.removeValue(forKey: key)
        lock.unlock()
    }

    @MainActor
    private static func gridPNG(_ source: Data) throws -> Data {
        guard let image = NSImage(data: source),
              image.isValid,
              image.size.width > 0,
              image.size.height > 0,
              !image.representations.isEmpty,
              image.representations.allSatisfy({ representation in
                  let width = representation.pixelsWide
                  let height = representation.pixelsHigh
                  return width > 0
                      && height > 0
                      && width <= 32_768
                      && height <= 32_768
                      && width <= 64_000_000 / height
              })
        else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Image decoding failed")
        }
        let scale = min(1, 512 / max(image.size.width, image.size.height))
        let targetSize = NSSize(
            width: max(1, round(image.size.width * scale)),
            height: max(1, round(image.size.height * scale))
        )
        let rendition = NSImage(size: targetSize)
        rendition.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .high
        image.draw(
            in: NSRect(origin: .zero, size: targetSize),
            from: NSRect(origin: .zero, size: image.size),
            operation: .copy,
            fraction: 1
        )
        rendition.unlockFocus()
        guard let tiff = rendition.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:]),
              !png.isEmpty,
              png.count <= 8 * 1024 * 1024
        else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Image rendering failed")
        }
        return png
    }

    @MainActor
    private static func finishUnavailable(_ task: WKURLSchemeTask, status: Int) {
        guard let url = task.request.url,
              let response = HTTPURLResponse(
                url: url,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: [
                    "Cache-Control": "private, no-store",
                    "Content-Type": "text/plain; charset=utf-8",
                    "X-Content-Type-Options": "nosniff",
                ]
              )
        else {
            task.didFailWithError(WorkbenchFailure(name: "MissingMedia", message: "Media preview unavailable"))
            return
        }
        task.didReceive(response)
        task.didReceive(Data("Media preview unavailable".utf8))
        task.didFinish()
    }
}
