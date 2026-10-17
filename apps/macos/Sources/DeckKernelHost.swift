import Foundation
import JavaScriptCore

final class DeckKernelHost {
    private let context: JSContext
    private let adapter: JSValue
    // A custom exception handler replaces JSContext.exception, so the last
    // exception is kept here for the call that raised it.
    private let lastException = ExceptionBox()

    private final class ExceptionBox {
        var message: String?
    }

    init(kernelURL: URL) throws {
        guard let context = JSContext() else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "JavaScriptCore context could not start")
        }
        self.context = context
        let box = lastException
        context.exceptionHandler = { _, exception in
            box.message = exception?.toString() ?? "Unknown JavaScriptCore exception"
        }
        let source = try String(contentsOf: kernelURL, encoding: .utf8)
        context.evaluateScript(source, withSourceURL: kernelURL)
        if let message = box.message {
            throw WorkbenchFailure(name: "KernelUnavailable", message: message)
        }
        guard let adapter = context.objectForKeyedSubscript("DeckKernelJSON"), !adapter.isUndefined else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Bundled Deck kernel did not expose its typed host adapter")
        }
        self.adapter = adapter
    }

    func createInitialCheckpoint(seed: [String: Any]) throws -> Data {
        let object = try call("createInitialCheckpoint", arguments: [try jsonString(seed)])
        return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .prettyPrinted])
    }

    func open(checkpoint: Data) throws {
        let result = try call("open", arguments: [try utf8(checkpoint)])
        guard result["ok"] as? Bool == true else {
            throw kernelFailure(result)
        }
    }

    func query(_ name: String, params: [String: Any] = [:]) throws -> [String: Any] {
        try call("query", arguments: [name, try jsonString(params)])
    }

    func prepare(command: [String: Any]) throws -> [String: Any] {
        try call("prepare", arguments: [try jsonString(command)])
    }

    func prepareUndo() throws -> [String: Any] {
        try call("prepareUndo", arguments: [])
    }

    func prepareRedo() throws -> [String: Any] {
        try call("prepareRedo", arguments: [])
    }

    func commit(_ prepared: [String: Any]) throws -> [String: Any] {
        try call("commit", arguments: [try jsonString(prepared)])
    }

    func replay(_ record: [String: Any]) throws {
        _ = try call("replay", arguments: [try jsonString(record)])
    }

    func serialize() throws -> Data {
        let object = try call("serialize", arguments: [])
        return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .prettyPrinted])
    }

    /// The query's JSON text as returned, for decoding straight into Swift
    /// types: no dictionary, no re-encoding, so it can be decoded off the
    /// main thread in one pass.
    func queryData(_ name: String, params: [String: Any] = [:]) throws -> Data {
        try callData("query", arguments: [name, try jsonString(params)])
    }

    private func call(_ name: String, arguments: [Any]) throws -> [String: Any] {
        let data = try callData(name, arguments: arguments)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "\(name) returned an invalid object")
        }
        if object["ok"] as? Bool == false {
            throw kernelFailure(object)
        }
        return object
    }

    /// A failure reported inside JSON that did not decode as the expected type.
    func failure(in data: Data) -> WorkbenchFailure? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              object["ok"] as? Bool == false else { return nil }
        return kernelFailure(object)
    }

    private func callData(_ name: String, arguments: [Any]) throws -> Data {
        guard let function = adapter.objectForKeyedSubscript(name), !function.isUndefined else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "Kernel adapter method \(name) is missing")
        }
        lastException.message = nil
        guard let value = function.call(withArguments: arguments), !value.isUndefined, lastException.message == nil else {
            let exception = lastException.message ?? context.exception?.toString() ?? "No result"
            lastException.message = nil
            context.exception = nil
            throw WorkbenchFailure(name: "KernelUnavailable", message: "\(name) failed: \(exception)")
        }
        guard let json = value.toString(), let data = json.data(using: .utf8) else {
            throw WorkbenchFailure(name: "KernelUnavailable", message: "\(name) returned non-JSON data")
        }
        return data
    }

    private func kernelFailure(_ object: [String: Any]) -> WorkbenchFailure {
        let error = object["error"] as? [String: Any]
        return WorkbenchFailure(
            name: error?["name"] as? String ?? "KernelUnavailable",
            message: error?["message"] as? String ?? "Deck kernel rejected the operation"
        )
    }

    private func jsonString(_ object: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        return try utf8(data)
    }

    private func utf8(_ data: Data) throws -> String {
        guard let value = String(data: data, encoding: .utf8) else {
            throw WorkbenchFailure(name: "InvalidCommand", message: "Expected UTF-8 JSON")
        }
        return value
    }
}
