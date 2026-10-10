import SwiftUI
import ServiceManagement
import PerchCore

private let perchGreen = Color(red: 0.22, green: 0.40, blue: 0.25)

struct ConnectionView: View {
    @ObservedObject var state: AppState
    var connected: () -> Void
    @State private var origin = ""
    @State private var machineID = ""
    @State private var token = ""
    @State private var tmux = false
    @State private var tailscale = false
    @State private var showAdvanced = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack(alignment: .center, spacing: 16) {
                    Image(nsImage: Bird.image(size: 64)).foregroundStyle(perchGreen).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Your Mini. Within reach.").font(.system(size: 26, weight: .semibold)).tracking(-0.7)
                        Text("A little bird looking out for this Mac.").foregroundStyle(.secondary)
                    }
                }
                if state.preview { Label("Preview only. Nothing is collected or sent.", systemImage: "eye").font(.callout).foregroundStyle(perchGreen) }
                Text("Connect this Mac to your own Perch server. The bird stays in your menu bar and sends a heartbeat every minute while reporting is on.")
                    .font(.body).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 16) {
                    field("Your Perch server", hint: "Your own deployment, not the project’s public landing page.") {
                        TextField("https://your-perch.vercel.app", text: $origin)
                    }
                    field("Machine ID", hint: "Use the ID you added to your server’s machine configuration.") {
                        TextField("studio-mini", text: $machineID)
                    }
                    field("Machine token", hint: "Stored in this Mac’s Keychain. Never synced or included in the dashboard link.") {
                        SecureField(state.configuration == nil ? "Paste your machine’s write-only token" : "Leave empty to keep the saved token", text: $token)
                    }
                }.textFieldStyle(.roundedBorder)
                DisclosureGroup("Optional metadata", isExpanded: $showAdvanced) {
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle("Include tmux session names and process counts", isOn: $tmux)
                        Text("Session names can be sensitive. Perch never reads terminal output or infers task progress.").font(.caption).foregroundStyle(.secondary)
                        Toggle("Include this Mac’s Tailscale name and addresses", isOn: $tailscale)
                        Text("Only this device, never your peer list. These private addresses will be stored on your server.").font(.caption).foregroundStyle(.secondary)
                    }.padding(.top, 10)
                }
                Divider()
                Label("Sends hostname, CPU, allocated memory, disk space, and uptime to the server above.", systemImage: "lock.shield")
                    .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if let message = state.setupMessage {
                    Label(message, systemImage: "exclamationmark.circle").font(.callout).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
                }
                HStack {
                    Link("Server setup guide ↗", destination: URL(string: "https://github.com/mager/perch#deploy-on-vercel")!)
                    Spacer()
                    Button("Connect this Mac") {
                        if state.connect(origin: origin, machineID: machineID, token: token, tmux: tmux, tailscale: tailscale) {
                            token = ""; connected()
                        }
                    }.buttonStyle(.borderedProminent).controlSize(.large).disabled(state.preview)
                }
                Text("Already using the Terminal agent? Stop it before connecting here to avoid duplicate heartbeats.")
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if state.configuration != nil {
                    Divider()
                    Toggle("Open Perch at login", isOn: Binding(get: { state.loginStatus == .enabled }, set: state.setLogin))
                        .disabled(state.preview)
                    if state.loginStatus == .requiresApproval {
                        Button("Review Login Items in System Settings") { SMAppService.openSystemSettingsLoginItems() }
                    }
                    Text("Perch runs while you’re logged in. Sleep, logout, or quitting stops heartbeats; the dashboard then shows an aging snapshot.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button("Disconnect and remove this Mac’s saved token", role: .destructive) { state.disconnect(); token = "" }
                        .disabled(state.preview)
                }
            }.padding(32)
        }
        .frame(width: 540, height: 700)
        .background(Color(nsColor: .windowBackgroundColor))
        .tint(perchGreen)
        .onAppear {
            if let config = state.configuration {
                origin = config.origin.absoluteString; machineID = config.machineID
                tmux = config.includeTmux; tailscale = config.includeTailscale
            }
        }
    }
    private func field<Content: View>(_ title: String, hint: String, @ViewBuilder input: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.callout.weight(.medium))
            input().accessibilityLabel(title).controlSize(.large)
            Text(hint).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct MenuPanel: View {
    @ObservedObject var state: AppState
    @ObservedObject var monitor: Monitor
    var settings: () -> Void
    var quit: () -> Void
    private var sample: Snapshot? { state.preview ? Snapshot.sample : monitor.snapshot }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Image(nsImage: Bird.image(size: 30)).foregroundStyle(perchGreen).accessibilityHidden(true)
                Text("perch").font(.system(size: 23, weight: .semibold)).tracking(0.5)
                Spacer()
                if state.preview { Text("SAMPLE").font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
                else if monitor.busy { ProgressView().controlSize(.small).accessibilityLabel("Sending heartbeat") }
            }
            TimelineView(.periodic(from: .now, by: 10)) { timeline in
                VStack(alignment: .leading, spacing: 7) {
                    Label(status(at: timeline.date), systemImage: statusIcon(at: timeline.date))
                        .font(.headline).foregroundStyle(isFresh(at: timeline.date) ? perchGreen : .primary)
                    if let accepted = monitor.lastAccepted {
                        Text("Last accepted \(accepted.formatted(date: .omitted, time: .shortened)) · \(age(accepted, now: timeline.date)) ago")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Text(detail(at: timeline.date)).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            if let value = sample {
                Divider()
                HStack {
                    metric("CPU", value: String(format: "%.0f%%", value.cpu))
                    Spacer()
                    metric("Memory", value: ByteCountFormatter.string(fromByteCount: Int64(value.memoryUsed), countStyle: .memory))
                    Spacer()
                    metric("Disk free", value: value.disk.map { ByteCountFormatter.string(fromByteCount: Int64($0.free), countStyle: .file) } ?? "Unavailable")
                }
                Text(state.preview ? "Fictional metrics. Preview sends nothing." : "Local sample at \(Date(timeIntervalSince1970: value.sampledAt / 1000).formatted(date: .omitted, time: .shortened)). Memory includes cache.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let message = state.setupMessage { Text(message).font(.caption).foregroundStyle(.red) }
            Divider()
            if state.configuration != nil {
                Button("Open dashboard") { state.openDashboard() }.buttonStyle(.borderedProminent).controlSize(.large)
                HStack {
                    Button(monitor.enabled ? "Pause reporting" : "Resume reporting") { state.toggleReporting() }
                    Spacer()
                    Button("Send now") { monitor.sendNow() }.disabled(!monitor.enabled || monitor.busy)
                }.disabled(state.preview)
            } else {
                Button("Connect this Mac…", action: settings).buttonStyle(.borderedProminent).controlSize(.large)
            }
            HStack {
                Button("Settings…", action: settings)
                Spacer()
                Button("Quit Perch", action: quit)
            }.buttonStyle(.plain).font(.callout).foregroundStyle(.secondary)
        }
        .padding(24).frame(width: 360).background(Color(nsColor: .windowBackgroundColor)).tint(perchGreen)
    }
    private func metric(_ name: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(name).font(.caption).foregroundStyle(.secondary); Text(value).font(.system(size: 18, weight: .medium)).monospacedDigit() }
    }
    private func isFresh(at date: Date) -> Bool { monitor.enabled && monitor.message == nil && monitor.lastAccepted.map { date.timeIntervalSince($0) <= 180 } == true }
    private func status(at date: Date) -> String {
        if state.preview { return "A little peace of mind." }
        if state.configuration == nil { return "Ready when you are." }
        if !monitor.enabled { return "Reporting paused" }
        if monitor.message != nil { return "Heartbeat not confirmed" }
        if isFresh(at: date) { return "Heartbeats are arriving" }
        if monitor.lastAccepted != nil { return "Heartbeat overdue" }
        return monitor.busy ? "Sending the first hello…" : "Waiting for a heartbeat"
    }
    private func statusIcon(at date: Date) -> String { isFresh(at: date) ? "checkmark.circle.fill" : monitor.message != nil ? "exclamationmark.circle" : "circle.dotted" }
    private func detail(at date: Date) -> String {
        if state.preview { return "The bird lives here. Your private dashboard stays within reach." }
        if state.configuration == nil { return "Set up your server, then connect this Mac. Nothing is collected or sent before you connect." }
        if !monitor.enabled { return "No new heartbeats are being sent. The dashboard keeps the last snapshot with its age." }
        if let message = monitor.message { return message }
        if isFresh(at: date) { return "Your server accepted this Mac’s last heartbeat." }
        if monitor.lastAccepted != nil { return "The dashboard’s current state is unknown. Perch will try again." }
        return "A successful server receipt will appear here."
    }
    private func age(_ date: Date, now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(date)))
        return seconds < 60 ? "\(seconds)s" : "\(seconds / 60)m"
    }
}
