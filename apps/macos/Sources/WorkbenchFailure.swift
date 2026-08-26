import Foundation

struct WorkbenchFailure: LocalizedError, Codable {
    let name: String
    let message: String

    var errorDescription: String? { "\(name): \(message)" }

    static func unexpected(_ error: Error) -> WorkbenchFailure {
        if let failure = error as? WorkbenchFailure { return failure }
        return WorkbenchFailure(name: "UnexpectedFailure", message: error.localizedDescription)
    }
}
