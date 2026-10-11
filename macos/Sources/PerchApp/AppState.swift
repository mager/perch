import AppKit
import SwiftUI
import ServiceManagement
import PerchCore

@MainActor final class AppState: ObservableObject {
    let monitor: Monitor
    let preview: Bool
    @Published var configuration: Configuration?
    @Published var dashboard: Dashboard?
    @Published var dashboardDraft = ""
    @Published var dashboardMessage: String?
    @Published var showingMonitor = false
    @Published var setupMessage: String?
    @Published var loginStatus = SMAppService.mainApp.status
    private let defaults = UserDefaults.standard

    init(preview: Bool) {
        self.preview = preview
        monitor = Monitor()
        if !preview, let data = defaults.data(forKey: "connection"),
           let decoded = try? JSONDecoder().decode(Configuration.self, from: data), let config = try? decoded.validated() {
            configuration = config
            do { monitor.configure(config, token: try TokenStore.read(config), start: defaults.bool(forKey: "reportingEnabled")) }
            catch { setupMessage = PerchError.keychain.localizedDescription }
        }
        if !preview {
            dashboard = defaults.string(forKey: "dashboardOrigin").flatMap { try? Dashboard(address: $0) }
            // Existing collectors already have a known portal; viewing is independent from now on.
            if defaults.object(forKey: "dashboardOrigin") == nil, let configuration { dashboard = try? Dashboard(address: configuration.origin.absoluteString) }
            dashboardDraft = dashboard?.origin.absoluteString ?? ""
        }
    }
    func proposeDashboard(_ url: URL) {
        guard !preview else { return }
        showingMonitor = false
        do {
            let proposed = try Dashboard(link: url)
            dashboardDraft = proposed.origin.absoluteString
            dashboardMessage = "Check this address, then choose Save and open. Monitoring settings will stay as they are."
        } catch { dashboardMessage = error.localizedDescription }
    }
    func saveDashboard() -> Bool {
        guard !preview else { return false }
        do {
            let destination = try Dashboard(address: dashboardDraft)
            dashboard = destination
            defaults.set(destination.origin.absoluteString, forKey: "dashboardOrigin")
            dashboardDraft = destination.origin.absoluteString
            dashboardMessage = nil
            openDashboard()
            return true
        } catch { dashboardMessage = error.localizedDescription; return false }
    }
    func forgetDashboard() {
        guard !preview else { return }
        defaults.set("", forKey: "dashboardOrigin")
        dashboard = nil; dashboardDraft = ""; dashboardMessage = nil
    }
    func connect(origin: String, machineID: String, token: String, tmux: Bool, tailscale: Bool) -> Bool {
        guard !preview else { return false }
        do {
            let config = try Configuration(origin: origin, machineID: machineID, includeTmux: tmux, includeTailscale: tailscale)
            let secret: String
            if token.isEmpty, let previous = configuration, previous.origin == config.origin, previous.machineID == config.machineID {
                secret = try TokenStore.read(previous)
            } else { secret = token }
            try Configuration.validateToken(secret)
            let encoded = try JSONEncoder().encode(config)
            try TokenStore.save(secret, for: config)
            monitor.pause()
            setupMessage = nil
            if let previous = configuration, previous.origin != config.origin || previous.machineID != config.machineID {
                // A failed cleanup is visible; don't claim the old credential was removed.
                do { try TokenStore.delete(previous) } catch { setupMessage = "Connected settings saved, but the previous Keychain entry could not be removed." }
            } else { setupMessage = nil }
            defaults.set(encoded, forKey: "connection"); defaults.set(true, forKey: "reportingEnabled")
            configuration = config
            if dashboard == nil {
                dashboard = try Dashboard(address: config.origin.absoluteString)
                dashboardDraft = config.origin.absoluteString
                defaults.set(dashboardDraft, forKey: "dashboardOrigin")
            }
            monitor.configure(config, token: secret, start: true)
            return true
        } catch { setupMessage = (error as? PerchError)?.localizedDescription ?? "Couldn’t save your connection."; return false }
    }
    func toggleReporting() {
        guard !preview else { return }
        if monitor.enabled { monitor.pause() } else if let config = configuration {
            do { monitor.configure(config, token: try TokenStore.read(config), start: true); setupMessage = nil }
            catch { setupMessage = PerchError.keychain.localizedDescription }
        }
        defaults.set(monitor.enabled, forKey: "reportingEnabled")
    }
    func disconnect() {
        monitor.disconnect(); defaults.set(false, forKey: "reportingEnabled")
        guard let configuration else { return }
        do {
            try TokenStore.delete(configuration)
            defaults.removeObject(forKey: "connection"); self.configuration = nil; setupMessage = nil
        } catch { setupMessage = "Reporting stopped, but Keychain couldn’t remove the token. Unlock it and try Disconnect again." }
    }
    func setLogin(_ enabled: Bool) {
        guard !preview else { return }
        do {
            if enabled {
                guard Bundle.main.bundleURL.path.hasPrefix("/Applications/") || Bundle.main.bundleURL.path.hasPrefix(NSHomeDirectory() + "/Applications/") else {
                    setupMessage = "Move Perch to Applications before turning on Open at login."; return
                }
                try SMAppService.mainApp.register()
            } else { try SMAppService.mainApp.unregister() }
            setupMessage = nil
        } catch { setupMessage = "macOS couldn’t change Open at login. Check System Settings → General → Login Items." }
        loginStatus = SMAppService.mainApp.status
    }
    func openDashboard() {
        guard !preview, let dashboard else { return }
        NSWorkspace.shared.open(dashboard.url)
    }
}
