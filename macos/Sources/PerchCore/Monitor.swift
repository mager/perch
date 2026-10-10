import Foundation
import Combine

@MainActor public final class Monitor: ObservableObject {
    @Published public private(set) var enabled = false
    @Published public private(set) var busy = false
    @Published public private(set) var snapshot: Snapshot?
    @Published public private(set) var lastAccepted: Date?
    @Published public private(set) var message: String?
    private var task: Task<Void, Never>?
    private var generation = UUID()
    private var configuration: Configuration?
    private var token = ""
    private let collect: @Sendable (Configuration) async throws -> Snapshot
    private let send: @Sendable (Configuration, String, Snapshot) async throws -> Void
    private let interval: UInt64

    public init(interval: UInt64 = 60_000_000_000,
                collect: @escaping @Sendable (Configuration) async throws -> Snapshot = { try await Collector.collect($0) },
                send: @escaping @Sendable (Configuration, String, Snapshot) async throws -> Void = { config, token, snapshot in
                    try await HeartbeatClient().send(configuration: config, token: token, snapshot: snapshot)
                }) {
        self.interval = interval; self.collect = collect; self.send = send
    }
    public func configure(_ configuration: Configuration, token: String, start: Bool) {
        pause()
        self.configuration = configuration; self.token = token
        snapshot = nil; lastAccepted = nil; message = nil
        if start { resume() }
    }
    public func disconnect() {
        pause(); configuration = nil; token = ""; snapshot = nil; lastAccepted = nil; message = nil
    }
    public func pause() {
        generation = UUID(); task?.cancel(); task = nil; enabled = false; busy = false
    }
    public func resume() {
        guard configuration != nil else { return }
        enabled = true; launch()
    }
    public func sendNow() { if enabled && !busy { launch() } }
    private func launch() {
        task?.cancel()
        let generation = UUID(); self.generation = generation
        guard let configuration else { return }
        let token = self.token, collect = self.collect, send = self.send, interval = self.interval
        task = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.generation == generation, self.enabled else { return }
                self.busy = true
                do {
                    let worker = Task.detached { try await collect(configuration) }
                    let value = try await withTaskCancellationHandler(operation: { try await worker.value }, onCancel: { worker.cancel() })
                    try Task.checkCancellation()
                    guard self.generation == generation else { return }
                    self.snapshot = value
                    try await send(configuration, token, value)
                    try Task.checkCancellation()
                    guard self.generation == generation else { return }
                    self.lastAccepted = Date(); self.message = nil
                } catch {
                    guard self.generation == generation, !Task.isCancelled else { return }
                    self.message = (error as? PerchError)?.localizedDescription ?? PerchError.network.localizedDescription
                }
                self.busy = false
                do { try await Task.sleep(nanoseconds: interval) } catch { return }
            }
        }
    }
}
