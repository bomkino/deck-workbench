import Foundation

struct WorkbenchFailure: LocalizedError, Codable {
    let name: String
    let message: String
    /// Machine-readable context for a recovery choice, e.g. the digest of the
    /// exact lock or journal the user is being asked about.
    var detail: String? = nil

    // The name is a stable code for checks and logs; people read the message.
    var errorDescription: String? { message }

    static func unexpected(_ error: Error) -> WorkbenchFailure {
        if let failure = error as? WorkbenchFailure { return failure }
        return WorkbenchFailure(name: "UnexpectedFailure", message: error.localizedDescription)
    }
}

struct PresentedWorkbenchFailure: Identifiable {
    let id = UUID()
    let failure: WorkbenchFailure
}
