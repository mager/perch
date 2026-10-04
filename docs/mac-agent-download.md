# Perch Mac agent

An early, source-based Mac agent for [Perch](https://github.com/mager/perch).
It reports heartbeats, system resources, and tmux metadata to your own installation.
Optional Tailscale reporting includes only this machine's state and addresses.

This ZIP is **not a native Mac app or a signed installer**. It requires Node.js 22
and a configured Perch server. No npm install is needed: the agent uses Node
built-ins. Downloading or extracting it does not install a background service.

## Before you start

1. Set up your own hosted Perch installation using the
   [deployment guide](https://github.com/mager/perch#deploy-on-vercel). Configure
   your Google owner, Redis, and a unique write token for this machine.
2. Install Node.js 22 on the Mac you want to monitor. Check `node --version` in
   Terminal. The archive works with either Apple silicon or Intel Node.js.
3. Extract the ZIP and move the `perch-mac-agent` folder to a permanent location
   before installing the optional background service. In Terminal, change into
   that folder. You can type `cd ` and drag the folder into the Terminal window.

## Connect your Mac

Create a private configuration file. The copy command preserves an existing file:

```sh
mkdir -p "$HOME/.config/perch"
chmod 700 "$HOME/.config/perch"
cp -n .env.agent.example "$HOME/.config/perch/agent.env"
chmod 600 "$HOME/.config/perch/agent.env"
open -e "$HOME/.config/perch/agent.env"
```

Set `PERCH_URL` to **your** hosted Perch origin, `PERCH_MACHINE_ID` to the machine
ID configured there, and `PERCH_AGENT_TOKEN` to its matching token. Keep this file
private. Do not paste credentials into chat or public issues. The project's public
landing page is not a shared monitoring service.

If you use tmux, adjust `PERCH_TMUX_PATH` to its executable location. Tailscale
reporting is disabled by default; set `PERCH_TAILSCALE=1` to include this machine's
private addresses in your hosted snapshot. No Tailscale admin token is needed.

Save the file, then test a single heartbeat:

```sh
node --env-file="$HOME/.config/perch/agent.env" agent/agent.mjs --once
```

Only continue after Terminal says **Heartbeat accepted** and your private dashboard
shows that heartbeat. A failed command does not install anything.

## Optional background service

From the same permanent agent folder:

```sh
node scripts/install-agent.mjs "$HOME/.config/perch/agent.env"
```

This installs a user LaunchAgent, not a menu bar app. It runs while your macOS user
is logged in and starts at login. It does not run before the first login after a
reboot. The installer refuses to overwrite an existing service. The source folder
and Node executable must remain at their installed paths. Logs are under
`~/Library/Logs/Perch/` and contain heartbeat success/failure messages.

## Stop or remove

Stop the service:

```sh
launchctl bootout "gui/$(id -u)/dev.perch.agent"
```

To uninstall after stopping it, remove
`~/Library/LaunchAgents/dev.perch.agent.plist` and the extracted agent folder.
Remove its private environment file when no longer needed, and remove or rotate
the matching machine token on your server. For an upgrade, stop the service,
remove its old plist, replace the agent files, test one heartbeat, then reinstall.
Keep your private configuration outside the downloaded folder.

## Privacy and verification

The agent makes outbound HTTPS requests. It does not read terminal output, source
files, prompts, or conversation history, and provides no remote execution.
Missing heartbeats mean the current state is unknown. Tailscale addresses do not
grant access or prove that the Mac is reachable from your browser.

The package is assembled from an explicit source-file allowlist. `manifest.json`
records the included files and their SHA-256 hashes. The adjacent `.zip.sha256`
download can check transfer integrity; it is not an Apple signature or independent
proof of trust. Review the source and [security notes](https://github.com/mager/perch/blob/main/SECURITY.md).

Local automated checks cover the code and downloadable package. Google sign-in,
hosted Redis, and installation of the LaunchAgent still need end-to-end verification.
This preview is MIT-licensed; see `LICENSE`.
