import Foundation
import Darwin

public enum Collector {
    private static func cpuTicks() throws -> (UInt64, UInt64) {
        let host = mach_host_self()
        defer { mach_port_deallocate(mach_task_self_, host) }
        var info = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(host, HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { throw PerchError.collection }
        let t = info.cpu_ticks
        return (UInt64(t.0) + UInt64(t.1) + UInt64(t.2) + UInt64(t.3), UInt64(t.2))
    }
    public static func collect(_ config: Configuration) async throws -> Snapshot {
        let before = try cpuTicks()
        try await Task.sleep(nanoseconds: 1_000_000_000)
        let after = try cpuTicks()
        guard after.0 > before.0, after.1 >= before.1 else { throw PerchError.collection }
        let host = mach_host_self()
        defer { mach_port_deallocate(mach_task_self_, host) }
        var vm = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &vm) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(host, HOST_VM_INFO64, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { throw PerchError.collection }
        var pageSize: vm_size_t = 0
        guard host_page_size(host, &pageSize) == KERN_SUCCESS else { throw PerchError.collection }
        let memory = ProcessInfo.processInfo.physicalMemory
        let free = min(memory, UInt64(vm.free_count) * UInt64(pageSize))
        let attrs = try? FileManager.default.attributesOfFileSystem(forPath: "/")
        let disk: Disk?
        if let total = attrs?[.systemSize] as? NSNumber, let available = attrs?[.systemFreeSize] as? NSNumber,
           total.uint64Value > 0, available.uint64Value <= total.uint64Value {
            disk = Disk(total: total.uint64Value, free: available.uint64Value)
        } else { disk = nil }
        let tmux = config.includeTmux ? try readTmux() : ("unavailable", [Session]())
        let tailscale = config.includeTailscale ? try readTailnet() : Tailnet(state: "disabled")
        try Task.checkCancellation()
        return Snapshot(sampledAt: Date().timeIntervalSince1970 * 1000, platform: "darwin",
                        hostname: clean(ProcessInfo.processInfo.hostName, limit: 120), uptime: ProcessInfo.processInfo.systemUptime,
                        cpu: max(0, min(100, 100 * (1 - Double(after.1 - before.1) / Double(after.0 - before.0)))),
                        memoryTotal: memory, memoryUsed: memory - free, disk: disk, tmuxStatus: tmux.0,
                        sessions: tmux.1, tailscale: tailscale)
    }
    static func clean(_ text: String, limit: Int) -> String {
        var result = ""
        for scalar in text.unicodeScalars where !CharacterSet.controlCharacters.contains(scalar) {
            guard result.utf16.count + scalar.utf16.count <= limit else { break }
            result.unicodeScalars.append(scalar)
        }
        return result
    }
    private static func executable(_ paths: [String]) -> String? {
        paths.first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    private static func readTmux() throws -> (String, [Session]) {
        guard let path = executable(["/opt/homebrew/bin/tmux", "/usr/local/bin/tmux", "/usr/bin/tmux"]) else { return ("unavailable", []) }
        let sessions = try Command.run(path, ["list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_attached}"])
        guard sessions.status == 0 else {
            if sessions.error.contains("no server running") || sessions.error.contains("no sessions") || sessions.error.contains("No such file") {
                let version = try Command.run(path, ["-V"])
                if version.status == 0 { return ("ok", []) }
            }
            return ("unavailable", [])
        }
        let panes = try Command.run(path, ["list-panes", "-a", "-F", "#{session_name}\t#{pane_current_command}"])
        guard let parsed = parseSessions(sessions.output, panes: panes.status == 0 ? panes.output : nil) else { return ("unavailable", []) }
        return ("ok", parsed)
    }
    public static func parseSessions(_ output: String, panes: String?) -> [Session]? {
        var counts: [String: Int] = [:]
        for row in (panes ?? "").split(separator: "\n") {
            let parts = row.split(separator: "\t", omittingEmptySubsequences: false)
            if parts.count == 2, parts[1] == "codex" { counts[String(parts[0]), default: 0] += 1 }
        }
        var sessions: [Session] = []
        for row in output.split(separator: "\n").prefix(40) {
            let parts = row.split(separator: "\t", omittingEmptySubsequences: false)
            guard parts.count == 3, let windows = Int(parts[1]), let attached = Int(parts[2]),
                  (0...1000).contains(windows), (0...1000).contains(attached), (counts[String(parts[0])] ?? 0) <= 1000 else { return nil }
            sessions.append(Session(name: clean(String(parts[0]), limit: 100), windows: windows, attached: attached,
                                    codexPanes: panes == nil ? nil : counts[String(parts[0]), default: 0]))
        }
        return sessions
    }
    private static func readTailnet() throws -> Tailnet {
        guard let path = executable(["/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]) else { return Tailnet(state: "not-installed") }
        let result = try Command.run(path, ["status", "--json", "--peers=false"], extraEnvironment: ["TAILSCALE_BE_CLI": "1"])
        guard result.status == 0 else { return Tailnet(state: "unavailable") }
        return parseTailnet(Data(result.output.utf8))
    }
    public static func parseTailnet(_ data: Data) -> Tailnet {
        struct Status: Decodable {
            let BackendState: String
            let `Self`: Device?
            struct Device: Decodable { let DNSName: String?; let TailscaleIPs: [String]? }
        }
        guard data.count <= 65_536, let value = try? JSONDecoder().decode(Status.self, from: data) else { return Tailnet(state: "unavailable") }
        let states = ["Running": "running", "Stopped": "stopped", "NeedsLogin": "needs-login", "NeedsMachineAuth": "needs-approval", "Starting": "starting"]
        let state = states[value.BackendState] ?? "unavailable"
        guard ["running", "stopped", "starting"].contains(state) else { return Tailnet(state: state) }
        guard let device = value.Self else { return Tailnet(state: "unavailable") }
        var dns = device.DNSName?.lowercased()
        if dns?.hasSuffix(".") == true { dns?.removeLast() }
        if dns == "" { dns = nil }
        if let dns {
            guard dns.utf8.count <= 253, dns.hasSuffix(".ts.net"), dns.split(separator: ".", omittingEmptySubsequences: false).allSatisfy({ $0.range(of: "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", options: .regularExpression) != nil }) else { return Tailnet(state: "unavailable") }
        }
        let ips = device.TailscaleIPs ?? []
        guard ips.count <= 4, ips.allSatisfy(isTailnetIP) else { return Tailnet(state: "unavailable") }
        return Tailnet(state: state, dnsName: dns, ips: Array(Set(ips)).sorted())
    }
    public static func isTailnetIP(_ value: String) -> Bool {
        var v4 = in_addr(), v6 = in6_addr()
        if inet_pton(AF_INET, value, &v4) == 1 {
            let bytes = value.split(separator: ".").compactMap { Int($0) }
            return bytes.count == 4 && bytes[0] == 100 && (64...127).contains(bytes[1])
        }
        return !value.contains("%") && value.lowercased().hasPrefix("fd7a:115c:a1e0:") && inet_pton(AF_INET6, value, &v6) == 1
    }
}

// Runs only fixed, read-only metadata commands. No shell, terminal capture, or token in the environment.
enum Command {
    struct Result { let status: Int32; let output: String; let error: String }
    static func run(_ path: String, _ arguments: [String], extraEnvironment: [String: String] = [:], timeout: TimeInterval = 3) throws -> Result {
        let process = Process(), stdout = Pipe(), stderr = Pipe()
        process.executableURL = URL(fileURLWithPath: path); process.arguments = arguments
        process.environment = ["HOME": NSHomeDirectory(), "PATH": "/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin", "LANG": "en_US.UTF-8"].merging(extraEnvironment) { _, new in new }
        process.standardOutput = stdout; process.standardError = stderr; process.standardInput = FileHandle.nullDevice
        do { try process.run() } catch { return Result(status: -1, output: "", error: "") }
        let handles = [stdout.fileHandleForReading, stderr.fileHandleForReading]
        for handle in handles { _ = fcntl(handle.fileDescriptor, F_SETFL, O_NONBLOCK) }
        defer { handles.forEach { try? $0.close() }; try? stdout.fileHandleForWriting.close(); try? stderr.fileHandleForWriting.close() }
        var buffers = [Data(), Data()]
        let started = ProcessInfo.processInfo.systemUptime
        func drain() -> Bool {
            for (index, handle) in handles.enumerated() {
                var bytes = [UInt8](repeating: 0, count: 4096)
                while true {
                    let count = Darwin.read(handle.fileDescriptor, &bytes, bytes.count)
                    if count <= 0 { break }
                    if buffers[0].count + buffers[1].count + count > 65_536 { return false }
                    buffers[index].append(contentsOf: bytes.prefix(count))
                }
            }
            return true
        }
        var valid = true
        while process.isRunning {
            if !drain() || ProcessInfo.processInfo.systemUptime - started > timeout || Task.isCancelled {
                valid = false
                // Kill only the child we created; an installed tmux server is never targeted.
                if process.isRunning { kill(process.processIdentifier, SIGKILL) }
                break
            }
            usleep(10_000)
        }
        process.waitUntilExit()
        valid = drain() && valid
        try Task.checkCancellation()
        guard valid else { return Result(status: -1, output: "", error: "") }
        return Result(status: process.terminationStatus, output: String(decoding: buffers[0], as: UTF8.self), error: String(decoding: buffers[1], as: UTF8.self))
    }
}
