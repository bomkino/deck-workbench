import Foundation
import WebKit

final class WorkspaceSchemeHandler: NSObject, WKURLSchemeHandler {
    private let workspaceRoot: URL
    private let allowedFiles: Set<String> = [
        "index.html",
        "styles.css",
        "workspace.js",
        "bridge.generated.js",
        "scale-model.mjs",
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
        let name = url.lastPathComponent.isEmpty ? "index.html" : url.lastPathComponent
        guard allowedFiles.contains(name), !name.contains("..") else {
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
        return "text/javascript"
    }
}
