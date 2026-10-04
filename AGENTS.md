# Perch

Perch is an MIT-licensed, self-hosted status portal for an owner's Mac mini and
other authorized machines. Its preferred host is Vercel, with Upstash Redis for
snapshots and owner-restricted Google sign-in. This repository is separate from
the owner's blog and from their Python/Pydantic Codex harness project.

## Current state

Backend, collector, launchd installer, and API tests exist. The dashboard and logo
are unfinished. Do not describe the application as deployed or end-to-end verified.
Google sign-in, hosted Redis, Vercel routing, and launchd require integration testing.

## Commands

- `npm ci`
- `npm test`
- `npm run check`
- `npm run demo` exposes local sample data at `/api/machines` on port 8787.

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

The selected brand name is Perch. A bird/wing mark was proposed, but final brand
direction has not been chosen. Keep the wordmark and identity separate from
monitoring functionality so both can evolve.
