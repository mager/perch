import AppKit
import SwiftUI
import PerchCore

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private var item: NSStatusItem!
    private let popover = NSPopover()
    private var window: NSWindow?
    private var state: AppState!
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appMenuItem = NSMenuItem(); menu.addItem(appMenuItem)
        let appMenu = NSMenu(); appMenuItem.submenu = appMenu
        let show = appMenu.addItem(withTitle: "Show Perch", action: #selector(togglePopover), keyEquivalent: "p")
        show.keyEquivalentModifierMask = [.command, .shift]; show.target = self
        let settings = appMenu.addItem(withTitle: "Settings…", action: #selector(showSettings), keyEquivalent: ",")
        settings.target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Perch", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        NSApp.mainMenu = menu
        state = AppState(preview: CommandLine.arguments.contains("--preview"))
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = Bird.image()
        item.button?.toolTip = "Perch · Your Mini. Within reach."
        item.button?.setAccessibilityLabel("Perch")
        item.button?.target = self; item.button?.action = #selector(togglePopover)
        popover.behavior = .transient
        let panel = NSHostingController(rootView: MenuPanel(state: state, monitor: state.monitor, settings: { [weak self] in self?.showSettings() }, quit: { NSApp.terminate(nil) }))
        panel.sizingOptions = [.preferredContentSize]
        popover.contentViewController = panel
        popover.contentSize = panel.view.fittingSize
        popover.animates = false
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(woke), name: NSWorkspace.didWakeNotification, object: nil)
        if state.configuration == nil { showSettings() }
    }
    @objc private func togglePopover() {
        if popover.isShown { popover.performClose(nil) }
        else {
            NSApp.activate(ignoringOtherApps: true)
            // Defer until a menu command has finished tracking, then focus the panel.
            DispatchQueue.main.async { [weak self] in
                guard let self, let button = self.item.button else { return }
                self.popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
                self.popover.contentViewController?.view.window?.makeKey()
            }
        }
    }
    @objc private func showSettings() {
        popover.performClose(nil)
        state.loginStatus = SMAppService.mainApp.status
        if let window, window.isVisible { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); return }
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 540, height: 660), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Perch · Connect this Mac"
        window.isReleasedWhenClosed = false
        window.contentViewController = NSHostingController(rootView: ConnectionView(state: state, connected: { [weak self] in
            self?.window?.close(); self?.togglePopover()
        }))
        window.center(); window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc private func woke() { state.monitor.sendNow() }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !popover.isShown { showSettings() }
        return true
    }
    func applicationWillTerminate(_ notification: Notification) { state.monitor.pause() }
}

import ServiceManagement
@main
struct PerchMain {
    @MainActor static func main() throws {
if CommandLine.arguments.contains("--sample-heartbeat") {
    FileHandle.standardOutput.write(try JSONEncoder().encode(Snapshot.sample))
    return
}
if CommandLine.arguments.contains("--check-keychain") {
    let config = try Configuration(origin: "https://perch-keychain-test.invalid", machineID: "test-" + UUID().uuidString.lowercased().prefix(30))
    let token = UUID().uuidString + UUID().uuidString
    try TokenStore.save(token, for: config)
    defer { try? TokenStore.delete(config) }
    guard try TokenStore.read(config) == token else { throw PerchError.keychain }
    try TokenStore.save(token + "updated", for: config)
    guard try TokenStore.read(config) == token + "updated" else { throw PerchError.keychain }
    try TokenStore.delete(config)
    do { _ = try TokenStore.read(config); throw PerchError.configuration("Test token still present") }
    catch PerchError.keychain { print("Keychain write/read/update/delete passed (temporary test credential).") }
    return
}
let app = NSApplication.shared
if let index = CommandLine.arguments.firstIndex(of: "--render-icon"), CommandLine.arguments.count > index + 1 {
    let directory = URL(fileURLWithPath: CommandLine.arguments[index + 1])
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    for size in [16, 32, 128, 256, 512] {
        for scale in [1, 2] {
            let pixels = size * scale
            let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
            let inset = CGFloat(pixels) * 0.07
            NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.93, alpha: 1).setFill()
            NSBezierPath(roundedRect: NSRect(x: inset, y: inset, width: CGFloat(pixels) - 2 * inset, height: CGFloat(pixels) - 2 * inset), xRadius: CGFloat(pixels) * 0.20, yRadius: CGFloat(pixels) * 0.20).fill()
            let bird = Bird.image(size: CGFloat(pixels) * 0.8)
            bird.isTemplate = false
            bird.draw(in: NSRect(x: CGFloat(pixels) * 0.10, y: CGFloat(pixels) * 0.12, width: CGFloat(pixels) * 0.8, height: CGFloat(pixels) * 0.8))
            NSGraphicsContext.restoreGraphicsState()
            let suffix = scale == 2 ? "@2x" : ""
            try bitmap.representation(using: .png, properties: [:])!.write(to: directory.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
        }
    }
    exit(0)
}
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

    }
}
