# Perch

Perch is an MIT-licensed, self-hosted status portal for an owner's Mac mini and
other authorized machines. Its preferred host is Vercel, with Upstash Redis for
snapshots and owner-restricted Google sign-in. This repository is separate from
the owner's blog and from their Python/Pydantic Codex harness project.

## Current state

Backend, collector, launchd installer, responsive dashboard, landing page, and brand
assets exist. Local unit/API and browser tests cover the sample UI and authentication
boundaries. Hosted Google sign-in, Redis, and launchd still require integration testing.
The landing page and unconfigured app shell are deployed at
`https://perch-mac-app.vercel.app`; live routes and the hero asset were checked.
Do not describe real machine monitoring as end-to-end verified.

## Commands

- `npm ci`
- `npm test`
- `npm run check`
- `npm run demo` serves the landing page at `/`, sample dashboard at `/app`, and
  sample API at `/api/machines` on port 8787.
- `npm run test:ui` runs Playwright browser and accessibility checks. Install Chromium
  first with `npx playwright install chromium`.

Use Node.js 22. The remote Mac agent uses only Node built-ins.

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
wordmark and identity independent of monitoring functionality. A menu bar companion
is a future idea, not an implemented feature.

## Running build log

The owner requested one evolving blog post about Perch. When the sibling
`../magerblog` checkout is available, its canonical draft is
`src/content/blog/2026-10-04-perch.md`. Read that repository's instructions before
editing it. After meaningful Perch milestones, update the current-state prose,
`updatedDate`, and dated build log using verified results. Distinguish implemented,
locally tested, deployed, and integration-verified work. Keep personal configuration,
credentials, and real machine snapshots out of the post. Preserve its draft status
unless publication is requested; do not publish or schedule updates automatically.
