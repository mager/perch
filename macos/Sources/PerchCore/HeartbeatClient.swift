import Foundation

final class NoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
public struct HeartbeatClient: Sendable {
    public init() {}
    public func request(configuration: Configuration, token: String, snapshot: Snapshot) throws -> URLRequest {
        let config = try configuration.validated()
        try Configuration.validateToken(token)
        var request = URLRequest(url: config.origin.appendingPathComponent("api/heartbeat"))
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(config.machineID, forHTTPHeaderField: "X-Perch-Machine")
        request.httpBody = try JSONEncoder().encode(snapshot)
        guard request.httpBody!.count <= 16_384 else { throw PerchError.oversized }
        return request
    }
    public func send(configuration: Configuration, token: String, snapshot: Snapshot) async throws {
        try await send(configuration: configuration, token: token, snapshot: snapshot, options: .ephemeral)
    }
    func send(configuration: Configuration, token: String, snapshot: Snapshot, options: URLSessionConfiguration) async throws {
        let request = try request(configuration: configuration, token: token, snapshot: snapshot)
        options.httpCookieStorage = nil
        options.urlCredentialStorage = nil
        options.urlCache = nil
        options.timeoutIntervalForResource = 15
        let session = URLSession(configuration: options, delegate: NoRedirect(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse else { throw PerchError.invalidResponse }
            guard response.statusCode == 200 else { throw PerchError.rejected(response.statusCode) }
            guard response.mimeType == "application/json" else { throw PerchError.invalidResponse }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < 1024 else { throw PerchError.invalidResponse }
                data.append(byte)
            }
            try Self.validateReceipt(data)
        } catch is CancellationError { throw CancellationError() }
        catch let error as PerchError { throw error }
        catch { throw PerchError.network }
    }
    public static func validateReceipt(_ data: Data) throws {
        struct Receipt: Decodable { let ok: Bool }
        guard data.count <= 1024, let receipt = try? JSONDecoder().decode(Receipt.self, from: data), receipt.ok else {
            throw PerchError.invalidResponse
        }
    }
}
