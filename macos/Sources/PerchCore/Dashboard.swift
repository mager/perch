import Foundation

/// A browser destination, never a monitoring credential or an authenticated session.
public struct Dashboard: Equatable, Sendable {
    public let origin: URL
    public var url: URL { origin.appendingPathComponent("app") }

    public init(address: String) throws {
        let text = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.utf8.count <= 2048, var parts = URLComponents(string: text),
              parts.scheme == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              ["", "/", "/app", "/app/"].contains(parts.path),
              parts.port.map({ (1...65535).contains($0) }) ?? true else {
            throw PerchError.configuration("Paste your dashboard’s HTTPS address, without a query, fragment, or credentials.")
        }
        parts.path = ""
        guard let url = parts.url else { throw PerchError.configuration("Check the dashboard address.") }
        origin = url
    }

    /// Deep links only propose a destination. The app must ask the user to save it.
    public init(link: URL) throws {
        guard link.absoluteString.utf8.count <= 4096,
              let parts = URLComponents(url: link, resolvingAgainstBaseURL: false),
              parts.scheme == "perch", parts.host == "dashboard", parts.path.isEmpty,
              parts.user == nil, parts.password == nil, parts.port == nil, parts.fragment == nil,
              let items = parts.queryItems, items.count == 1,
              items[0].name == "origin", let value = items[0].value else {
            throw PerchError.configuration("This Perch link isn’t valid. Open your dashboard and choose Keep in menu bar again.")
        }
        try self.init(address: value)
    }
}
