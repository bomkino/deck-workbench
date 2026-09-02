import AppKit
import Foundation
import ImageIO
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
                guard let encodedPath = URLComponents(
                    url: url,
                    resolvingAgainstBaseURL: false
                )?.percentEncodedPath else {
                    Self.finishUnavailable(urlSchemeTask, status: 404)
                    return
                }
                let components = encodedPath
                    .split(separator: "/", omittingEmptySubsequences: false)
                    .map(String.init)
                guard components.count == 3,
                      components[0].isEmpty,
                      !components[1].isEmpty,
                      !components[2].isEmpty,
                      !Self.containsEncodedSlash(components[1]),
                      !Self.containsEncodedSlash(components[2]),
                      let assetId = components[1].removingPercentEncoding,
                      let profile = components[2].removingPercentEncoding,
                      ["grid_standard", "preview_standard"].contains(profile)
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
                let png = try Self.previewPNG(source, profile: profile)
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

    private static func containsEncodedSlash(_ component: String) -> Bool {
        component.range(of: "%2f", options: .caseInsensitive) != nil
    }

    @MainActor
    private static func previewPNG(_ data: Data, profile: String) throws -> Data {
        let maximumLongestSide: Int
        let maximumOutputBytes: Int
        switch profile {
        case "grid_standard":
            maximumLongestSide = 512
            maximumOutputBytes = 8 * 1024 * 1024
        case "preview_standard":
            maximumLongestSide = 2048
            maximumOutputBytes = 32 * 1024 * 1024
        default:
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Unknown media preview profile")
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
              width > 0,
              height > 0,
              width <= 32_768,
              height <= 32_768,
              width <= 64_000_000 / height
        else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Image decoding failed")
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maximumLongestSide,
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              thumbnail.width > 0,
              thumbnail.height > 0,
              max(thumbnail.width, thumbnail.height) <= maximumLongestSide,
              let png = NSBitmapImageRep(cgImage: thumbnail).representation(using: .png, properties: [:]),
              !png.isEmpty,
              png.count <= maximumOutputBytes
        else {
            throw WorkbenchFailure(name: "UnsupportedMediaPreview", message: "Image rendering failed or exceeded output limits")
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
