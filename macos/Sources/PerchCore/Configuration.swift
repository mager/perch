import Foundation

public struct Configuration: Codable, Equatable, Sendable {
    public let origin: URL
    public let machineID: String
    public let includeTmux: Bool
    public let includeTailscale: Bool

    public init(origin: String, machineID: String, includeTmux: Bool = false, includeTailscale: Bool = false) throws {
        let text = origin.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parts = URLComponents(string: text), parts.scheme == "https",
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil, ["", "/"].contains(parts.path),
              let url = parts.url, parts.port.map({ (1...65535).contains($0) }) ?? true else {
            throw PerchError.configuration("Enter your Perch server’s HTTPS address, without a path, query, or credentials.")
        }
        guard machineID.range(of: "^[a-z0-9][a-z0-9-]{0,39}$", options: .regularExpression) != nil else {
            throw PerchError.configuration("Use the machine ID from your server: up to 40 lowercase letters, numbers, or hyphens.")
        }
        self.origin = url
        self.machineID = machineID
        self.includeTmux = includeTmux
        self.includeTailscale = includeTailscale
    }
    public func validated() throws -> Configuration {
        try Configuration(origin: origin.absoluteString, machineID: machineID, includeTmux: includeTmux, includeTailscale: includeTailscale)
    }
    public static func validateToken(_ token: String) throws {
        guard (32...512).contains(token.utf8.count), token.utf8.allSatisfy({ (33...126).contains($0) }) else {
            throw PerchError.configuration("Use the matching machine token from your server, 32–512 characters with no spaces.")
        }
    }
}

public enum PerchError: Error, LocalizedError {
    case configuration(String), collection, rejected(Int), invalidResponse, network, keychain, oversized
    public var errorDescription: String? {
        switch self {
        case .configuration(let message): return message
        case .collection: return "Couldn’t read this Mac’s resources. No heartbeat was sent."
        case .rejected(401), .rejected(403): return "The server rejected this machine. Check the machine ID and token."
        case .rejected(503): return "Your server isn’t ready. Finish its Google and Redis configuration first."
        case .rejected(429): return "The server is limiting requests. Perch will retry in a minute."
        case .rejected: return "The server didn’t accept the heartbeat. Check your Perch deployment."
        case .invalidResponse: return "That address didn’t return a Perch heartbeat receipt. Check your server URL."
        case .network: return "Couldn’t reach your server. The dashboard’s current state is unknown."
        case .keychain: return "Couldn’t access the machine token in Keychain. Unlock your keychain and try again."
        case .oversized: return "The snapshot exceeded the heartbeat limit. Try disabling optional metadata."
        }
    }
}
