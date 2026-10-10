import Foundation

public struct Disk: Codable, Sendable { public let total: UInt64; public let free: UInt64 }
public struct Session: Codable, Sendable {
    public let name: String
    public let windows: Int
    public let attached: Int
    public let codexPanes: Int?
    // The server requires an explicit null when pane discovery is unavailable.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name); try c.encode(windows, forKey: .windows)
        try c.encode(attached, forKey: .attached); try c.encode(codexPanes, forKey: .codexPanes)
    }
}
public struct Tailnet: Codable, Sendable {
    public let state: String
    public let dnsName: String?
    public let ips: [String]
    public init(state: String, dnsName: String? = nil, ips: [String] = []) {
        self.state = state; self.dnsName = dnsName; self.ips = ips
    }
}
public struct Snapshot: Codable, Sendable {
    public var sampledAt: Double
    public let platform: String
    public let hostname: String
    public let uptime: Double
    public let cpu: Double
    public let memoryTotal: UInt64
    public let memoryUsed: UInt64
    public let disk: Disk?
    public let tmuxStatus: String
    public let sessions: [Session]
    public let tailscale: Tailnet
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(sampledAt, forKey: .sampledAt); try c.encode(platform, forKey: .platform)
        try c.encode(hostname, forKey: .hostname); try c.encode(uptime, forKey: .uptime)
        try c.encode(cpu, forKey: .cpu); try c.encode(memoryTotal, forKey: .memoryTotal)
        try c.encode(memoryUsed, forKey: .memoryUsed); try c.encode(disk, forKey: .disk)
        try c.encode(tmuxStatus, forKey: .tmuxStatus); try c.encode(sessions, forKey: .sessions)
        try c.encode(tailscale, forKey: .tailscale)
    }
    public static var sample: Snapshot {
        Snapshot(sampledAt: Date().timeIntervalSince1970 * 1000, platform: "darwin", hostname: "Sample Mac mini", uptime: 86400, cpu: 14, memoryTotal: 16_000_000_000, memoryUsed: 6_200_000_000, disk: Disk(total: 512_000_000_000, free: 182_000_000_000), tmuxStatus: "unavailable", sessions: [], tailscale: Tailnet(state: "disabled"))
    }
}
