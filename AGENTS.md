# Perch

Perch is an MIT-licensed, self-hosted status portal for an owner's Mac mini and
other authorized machines. Its preferred host is Vercel, with Upstash Redis for
snapshots and owner-restricted Google sign-in. This repository is separate from
the owner's blog and from their Python/Pydantic Codex harness project.

## Current state

Backend, collector, launchd installer, responsive dashboard, landing page, and brand
assets exist. Optional Tailscale reporting collects only the local machine's state
and addresses, enabled with PERCH_TAILSCALE=1. It does not change authentication
or make the Vercel portal tailnet-only. Local unit/API and browser tests cover the sample UI and authentication
boundaries. Hosted Google and Redis configuration now exists. Public login metadata returns 200;
unauthenticated and machine-token status reads return 401. An owner-signed-in
browser has read a real Mac heartbeat through Redis, and the Node.js user
LaunchAgent is installed on that Mac. A live stop of more than three minutes showed overdue/unknown with the retained
snapshot, and resuming the Node agent restored fresh data. Native app cloud
integration, login-item relaunch, and real second-account denial remain unverified.
The landing page and owner-restricted dashboard are deployed at
`https://perch-mac-app.vercel.app`; live routes and the hero asset were checked.
Distinguish the verified Node agent path from the native developer preview.

## Commands

- `npm ci`
- `npm test`
- `npm run check`
- `npm run package:agent` rebuilds the public agent source ZIP (Python 3 required
  for maintainer packaging only). Run it after changing any packaged file.
- `npm run check:agent` verifies source/archive parity and extracted runtime imports.
- `npm run demo` serves the landing page at `/`, sample dashboard at `/app`, and
  sample API at `/api/machines` on port 8787.
- `npm run test:ui` runs Playwright browser and accessibility checks. Install Chromium
  first with `npx playwright install chromium`.

Use Node.js 22 for the web and Terminal agent. The native app uses Swift 6+ in
Swift 5 language mode with macOS 13+ APIs. `swift test --package-path macos` tests
its core; `macos/scripts/package.sh --development` builds an app and DMG. Use a
consistent Xcode 16+ toolchain. Never change system SDK files to work around a
local compiler problem. Public releases use `--release` with Developer ID and a
Keychain notarytool profile. Generated binaries remain ignored by Git.

## Boundaries

- Do not commit credentials, personal configuration, or real machine snapshots.
- Public source must work with each user's own accounts, machines, and secrets.
- Authorize every status read server-side; agent tokens only write their own machine.
- Demo mode remains local-only and cannot accept real heartbeats.
- Do not infer Codex task status from tmux foreground processes.
- A missing heartbeat means unknown current state, not proof that a Mac is off.
- Do not add remote execution or terminal capture to the monitoring agent implicitly.
- Keep UI usable on phones, keyboard accessible, and respectful of reduced motion.

The selected brand is Perch: a perched bird, an Apple-inspired white canvas, bold
centered typography, and restrained green status signals. The owner approved the
bird-on-Mini hero artwork. Read PRODUCT.md and DESIGN.md for context. Keep the
wordmark and identity independent of monitoring functionality. A native SwiftUI/AppKit menu bar app now exists in `macos/`, with Keychain tokens
and a universal developer-preview DMG. Developer ID signing, notarization, login-item
relaunch, and real hosted heartbeat integration still need verification.
The homepage links a GitHub developer-preview DMG prerelease and a separate
Terminal agent ZIP requiring Node.js 22 and a configured server. Do not describe this source archive as a native app or signed installer. The native
app is separate; do not promote a developer DMG as a signed public release.

## Running build log

The owner requested one evolving blog post about Perch. When the sibling
`../magerblog` checkout is available, its canonical draft is
`src/content/blog/2026-10-04-perch.md`. Read that repository's instructions before
editing it. After meaningful Perch milestones, update the current-state prose,
`updatedDate`, and dated build log using verified results. Distinguish implemented,
locally tested, deployed, and integration-verified work. Keep personal configuration,
credentials, and real machine snapshots out of the post. Preserve its draft status
unless publication is requested; do not publish or schedule updates automatically.
