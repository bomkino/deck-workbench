import Foundation
import WebKit

final class WorkspaceSchemeHandler: NSObject, WKURLSchemeHandler {
    private let workspaceRoot: URL
    private let allowedFiles: [String: String] = [
        "/": "index.html",
        "/index.html": "index.html",
        "/styles.css": "styles.css",
        "/workspace.js": "workspace.js",
        "/bridge.generated.js": "bridge.generated.js",
        "/scale-model.mjs": "scale-model.mjs",
        "/workbench-mark.svg": "workbench-mark.svg",
        "/fonts/v13/pd-head.woff2": "fonts/v13/pd-head.woff2",
        "/fonts/v13/pd-head-alt.woff2": "fonts/v13/pd-head-alt.woff2",
        "/fonts/v13/pd-body-roman.woff2": "fonts/v13/pd-body-roman.woff2",
        "/fonts/v13/pd-body-italic.woff2": "fonts/v13/pd-body-italic.woff2",
        "/fonts/v13/pd-body-alt-roman.woff2": "fonts/v13/pd-body-alt-roman.woff2",
        "/fonts/v13/pd-body-alt-italic.woff2": "fonts/v13/pd-body-alt-italic.woff2",
        "/fonts/v13/pd-eyebrow-site.woff2": "fonts/v13/pd-eyebrow-site.woff2",
        "/icons/phosphor/Phosphor.woff2": "icons/phosphor/Phosphor.woff2",
    ]

    init(bundle: Bundle = .main) throws {
        guard let root = bundle.resourceURL?.appendingPathComponent("Workspace", isDirectory: true) else {
            throw WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace resources are missing")
        }
        workspaceRoot = root
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              url.scheme == "pitchdog-ui",
              url.host == "app"
        else {
            urlSchemeTask.didFailWithError(WorkbenchFailure(name: "WorkspaceUnavailable", message: "Invalid workspace resource identity"))
            return
        }
        let path = url.path.isEmpty ? "/" : url.path
        guard let name = allowedFiles[path], !path.contains("..") else {
            urlSchemeTask.didFailWithError(WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace resource is not authorised"))
            return
        }
        let resourceURL = workspaceRoot.appendingPathComponent(name)
        do {
            let data = try Data(contentsOf: resourceURL, options: [.mappedIfSafe])
            let response = URLResponse(
                url: url,
                mimeType: mimeType(for: name),
                expectedContentLength: data.count,
                textEncodingName: name.hasSuffix(".html") || name.hasSuffix(".js") || name.hasSuffix(".mjs") || name.hasSuffix(".css") ? "utf-8" : nil
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(WorkbenchFailure(name: "WorkspaceUnavailable", message: "Workspace resource could not load"))
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func mimeType(for name: String) -> String {
        if name.hasSuffix(".html") { return "text/html" }
        if name.hasSuffix(".css") { return "text/css" }
        if name.hasSuffix(".svg") { return "image/svg+xml" }
        if name.hasSuffix(".woff2") { return "font/woff2" }
        return "text/javascript"
    }
}
