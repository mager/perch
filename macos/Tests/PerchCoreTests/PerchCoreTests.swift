import Foundation
import Testing
@testable import PerchCore

struct PerchCoreTests {
    @Test func testConfigurationRejectsUnsafeDestinationsAndTokens() throws {
        for address in ["http://example.com", "https://user:secret@example.com", "https://example.com/app", "https://example.com?token=x", "https://example.com#fragment", "file:///tmp/test", "https://", "https://example.com:0"] {
            expectThrows(try Configuration(origin: address, machineID: "studio-mini"), address)
        }
        for id in ["", "../another", "Studio Mini", "-mini", String(repeating: "a", count: 41)] {
            expectThrows(try Configuration(origin: "https://example.com", machineID: id))
        }
        for token in ["short", String(repeating: "a", count: 32) + "\r\nX: injected", String(repeating: "a", count: 513), String(repeating: " ", count: 40)] {
            expectThrows(try Configuration.validateToken(token))
        }
        let config = try Configuration(origin: " https://example.com/ ", machineID: "studio-mini")
        expectFalse(config.includeTmux); expectFalse(config.includeTailscale)
        try Configuration.validateToken(String(repeating: "a", count: 32))
    }
    @Test func testHeartbeatRequestUsesOnlyMachineWriteCredential() throws {
        let config = try Configuration(origin: "https://example.com", machineID: "mini")
        let token = String(repeating: "t", count: 32)
        let request = try HeartbeatClient().request(configuration: config, token: token, snapshot: .sample)
        expectEqual(request.url?.absoluteString, "https://example.com/api/heartbeat")
        expectEqual(request.httpMethod, "POST")
        expectEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer " + token)
        expectEqual(request.value(forHTTPHeaderField: "X-Perch-Machine"), "mini")
        expectNil(request.value(forHTTPHeaderField: "Cookie"))
        expectFalse(request.url!.absoluteString.contains(token))
        expectFalse(String(decoding: request.httpBody!, as: UTF8.self).contains(token))
        expectLess(request.httpBody!.count, 16384)
    }
    @Test func testReceiptRejectsHTMLAndFalseSuccess() throws {
        try HeartbeatClient.validateReceipt(Data("{\"ok\":true}".utf8))
        for raw in ["<html>Sign in</html>", "{}", "{\"ok\":false}", "{\"ok\":1}", "{\"ok\":\"true\"}", String(repeating: "x", count: 1025)] {
            expectThrows(try HeartbeatClient.validateReceipt(Data(raw.utf8)))
        }
    }
    @Test func testUnavailablePaneCountIsNullAndMalformedSessionsAreUnavailable() throws {
        let sessions = try require(Collector.parseSessions("project\t2\t1\n", panes: nil))
        expectNil(sessions[0].codexPanes)
        let data = try JSONEncoder().encode(sessions)
        expectTrue(String(decoding: data, as: UTF8.self).contains("\"codexPanes\":null"))
        expectNil(Collector.parseSessions("project\tbad\t1", panes: ""))
        expectEqual(Collector.parseSessions("project\t2\t0", panes: "project\tcodex\nproject\tzsh\n")?.first?.codexPanes, 1)
    }
    @Test func testTailnetOnlyRetainsSelfFieldsAndValidPrivateAddresses() {
        let data = Data(#"{"BackendState":"Running","Self":{"DNSName":"Mini.Example.ts.net.","TailscaleIPs":["100.64.0.1","fd7a:115c:a1e0::1"]},"Peer":{"private":"secret"},"AuthURL":"secret"}"#.utf8)
        let status = Collector.parseTailnet(data)
        expectEqual(status.state, "running"); expectEqual(status.dnsName, "mini.example.ts.net")
        expectEqual(status.ips.count, 2)
        expectFalse(String(decoding: try! JSONEncoder().encode(status), as: UTF8.self).contains("secret"))
        expectEqual(Collector.parseTailnet(Data(#"{"BackendState":"NeedsLogin","Self":{"DNSName":"old.ts.net","TailscaleIPs":["100.64.0.1"]}}"#.utf8)).ips, [])
        for ip in ["8.8.8.8", "127.0.0.1", "100.63.0.1", "100.128.0.1", "fd7a:115c:a1e0::1%en0", "garbage"] { expectFalse(Collector.isTailnetIP(ip), ip) }
        expectEqual(Collector.parseTailnet(Data(#"{"BackendState":"Running","Self":{"DNSName":"bad.example.com"}}"#.utf8)).state, "unavailable")
    }
    @Test func testMetadataCommandsAreBounded() throws {
        expectEqual(try Command.run("/usr/bin/printf", ["hello"]).output, "hello")
        expectNotEqual(try Command.run("/usr/bin/yes", []).status, 0)
        let start = Date()
        expectNotEqual(try Command.run("/bin/sleep", ["5"], timeout: 0.1).status, 0)
        expectLess(Date().timeIntervalSince(start), 2)
    }
    @Test func testNativeCollectorProducesBoundedMetricsWithoutOptionalMetadata() async throws {
        let config = try Configuration(origin: "https://example.com", machineID: "test")
        let value = try await Collector.collect(config)
        expectEqual(value.platform, "darwin"); expectTrue((0...100).contains(value.cpu))
        expectGreater(value.memoryTotal, 0); expectAtMost(value.memoryUsed, value.memoryTotal)
        expectEqual(value.tmuxStatus, "unavailable"); expectTrue(value.sessions.isEmpty)
        expectEqual(value.tailscale.state, "disabled")
        expectLess(try JSONEncoder().encode(value).count, 16384)
        // Never print or persist the real machine snapshot.
    }
    @Test @MainActor func testPauseDiscardsAnInFlightReceipt() async throws {
        let monitor = Monitor(collect: { _ in .sample }, send: { _, _, _ in
            try? await Task.sleep(nanoseconds: 150_000_000)
        })
        monitor.configure(try Configuration(origin: "https://example.com", machineID: "test"), token: String(repeating: "a", count: 32), start: true)
        try await Task.sleep(nanoseconds: 30_000_000)
        monitor.pause()
        try await Task.sleep(nanoseconds: 200_000_000)
        expectNil(monitor.lastAccepted); expectFalse(monitor.enabled); expectFalse(monitor.busy)
    }
    @Test @MainActor func testFailureRecoveryAndDisconnect() async throws {
        actor Attempts {
            var count = 0
            func send() throws { count += 1; if count == 1 { throw PerchError.rejected(503) } }
        }
        let attempts = Attempts()
        let monitor = Monitor(interval: 60_000_000, collect: { _ in .sample }, send: { _, _, _ in try await attempts.send() })
        monitor.configure(try Configuration(origin: "https://example.com", machineID: "test"), token: String(repeating: "a", count: 32), start: true)
        try await Task.sleep(nanoseconds: 30_000_000)
        expectNotNil(monitor.message); expectNil(monitor.lastAccepted)
        try await Task.sleep(nanoseconds: 100_000_000)
        expectNotNil(monitor.lastAccepted); expectNil(monitor.message)
        monitor.disconnect(); expectNil(monitor.snapshot); expectNil(monitor.lastAccepted)
        expectFalse(monitor.enabled)
    }
}

private func expectEqual<T: Equatable>(_ lhs: T, _ rhs: T, _ message: String = "") { #expect(lhs == rhs, Comment(rawValue: message)) }
private func expectNotEqual<T: Equatable>(_ lhs: T, _ rhs: T) { #expect(lhs != rhs) }
private func expectTrue(_ value: Bool) { #expect(value) }
private func expectFalse(_ value: Bool, _ message: String = "") { #expect(!value, Comment(rawValue: message)) }
private func expectNil<T>(_ value: T?) { #expect(value == nil) }
private func expectNotNil<T>(_ value: T?) { #expect(value != nil) }
private func expectLess<T: Comparable>(_ lhs: T, _ rhs: T) { #expect(lhs < rhs) }
private func expectAtMost<T: Comparable>(_ lhs: T, _ rhs: T) { #expect(lhs <= rhs) }
private func expectGreater<T: Comparable>(_ lhs: T, _ rhs: T) { #expect(lhs > rhs) }
private func require<T>(_ value: T?) throws -> T { try #require(value) }
private func expectThrows<T>(_ expression: @autoclosure () throws -> T, _ message: String = "") {
    #expect(throws: (any Error).self, Comment(rawValue: message)) { _ = try expression() }
}

private final class ReceiptProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let id = request.value(forHTTPHeaderField: "X-Perch-Machine") ?? ""
        let status = id == "rejected" ? 401 : 200
        let body = id == "html" ? "<html>Login</html>" : "{\"ok\":true}"
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": id == "html" ? "text/html" : "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
struct TransportTests {
    @Test func receiptsThroughURLSession() async throws {
        for id in ["accepted", "rejected", "html"] {
            let options = URLSessionConfiguration.ephemeral
            options.protocolClasses = [ReceiptProtocol.self]
            let config = try Configuration(origin: "https://fixture.invalid", machineID: id)
            do {
                try await HeartbeatClient().send(configuration: config, token: String(repeating: "t", count: 32), snapshot: .sample, options: options)
                #expect(id == "accepted")
            } catch {
                #expect(id != "accepted")
                #expect(error is PerchError)
            }
        }
    }
    @Test func redirectsAreNeverFollowed() async {
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let source = URL(string: "https://owner.invalid/api/heartbeat")!
        let redirect = URLRequest(url: URL(string: "https://other.invalid/steal")!)
        let response = HTTPURLResponse(url: source, statusCode: 307, httpVersion: "HTTP/1.1", headerFields: ["Location": redirect.url!.absoluteString])!
        NoRedirect().urlSession(session, task: session.dataTask(with: source), willPerformHTTPRedirection: response, newRequest: redirect) { next in #expect(next == nil) }
    }
}
