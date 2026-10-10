# Perch for Mac

A native SwiftUI/AppKit menu bar companion for macOS 13 or later, on Apple silicon
and Intel. It collects and sends heartbeats itself; Node.js is not required.
The hosted portal remains independent of this app and this Mac.

## First connection

Open `Perch.app`. The bird appears in your menu bar and opens a connection window.
Enter your own server's HTTPS origin, the machine ID configured on that server,
and its matching write-only machine token. Choose **Connect this Mac** to start
collecting and sending. There is no automatic connection to the public Perch site.
The app does not create a server, Google OAuth client, or Redis account for you.

The menu shows server acknowledgement separately from the most recent local
resource sample. Pause, send now, open the owner-authenticated web dashboard, or
change the connection in Settings. Quit stops reporting. A missing heartbeat is
unknown current state, not proof that a machine is powered off.

Tokens are stored in a non-synchronizing Keychain entry scoped to the server and
machine ID. Connection preferences are in UserDefaults. Snapshots stay in memory.
The app never adds the token to a dashboard URL, opens a shell, or executes a
command received from the server. HTTPS is required and redirects are refused.
Only an HTTP 200 JSON `{ "ok": true }` receipt counts as accepted.

Optional tmux names/process counts and this device's Tailscale addresses are off
by default. The app checks standard Homebrew locations for these executables;
Tailscale also supports the installed `/Applications/Tailscale.app` CLI. Custom
CLI paths and custom tmux sockets are not supported in this preview. Missing or
failed collection is unavailable, never an invented zero or task status.

**Stop an existing Perch Terminal agent/LaunchAgent before connecting the app.**
The two collectors use the same write protocol and would otherwise send duplicate
heartbeats. The app does not stop another process or install a LaunchAgent for you.

Open at login is optional, managed by macOS Login Items after you move Perch to
Applications. It is not a system daemon: logout, sleep, and quitting can interrupt
heartbeats. Disconnect removes the saved token and stops reporting; it does not
delete server history. An already transmitted request may still arrive after pause.

## Build and test

Use a consistent Xcode 16+ toolchain with Swift 6+ and the macOS SDK. The package
uses Swift 5 language mode and Swift Testing; no third-party dependencies.

```sh
swift test --package-path macos
macos/scripts/package.sh --development
```

The packaging script builds both architectures and writes an ad-hoc-signed
`macos/dist/Perch.app`, `Perch-0.2.0-developer-preview.dmg`, and a SHA-256 file.
Move an earlier `macos/dist/Perch.app` aside before packaging again. Generated
binaries are ignored by Git. The DMG contains the app, an Applications shortcut,
and installation notes. CI builds and retains the developer DMG as an artifact.

A developer build is **not Developer ID signed or notarized**. It is for local
validation, not a finished public installation experience. Do not instruct users
to disable Gatekeeper. Build the public release only with the signing workflow below.

For a UI-only preview with fictional metrics and all collection, connection, and
Keychain access disabled:

```sh
open macos/dist/Perch.app --args --preview
```

Quit an existing Perch process first; Launch Services reuses an already running app.
Normal launch opens unconfigured onboarding until a connection is saved.

## Sign and notarize a release

Install a Developer ID Application certificate in your login Keychain. Save Apple
notarization credentials as a `notarytool` Keychain profile, outside the repository.
Set `PERCH_SIGNING_IDENTITY` to the certificate identity and `PERCH_NOTARY_PROFILE`
to that saved profile name, then run:

```sh
macos/scripts/package.sh --release
```

This enables hardened runtime, signs the app, submits it to Apple, staples the
receipt, verifies Gatekeeper acceptance, and builds and notarizes the DMG. Release
mode refuses to proceed without both signing settings. Never commit signing keys,
Apple credentials, connection preferences, or machine snapshots.

References: [Apple Developer ID](https://developer.apple.com/developer-id/),
[notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution),
[login items](https://developer.apple.com/documentation/servicemanagement/smappservice/mainapp).

Before public distribution, verify a clean downloaded installation, Keychain
persistence across signed updates, login-item registration/relaunch, a configured
owner-only server, and a real heartbeat interruption and recovery on the Mini.
