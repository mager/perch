# Perch

A private lookout for your Mac mini. Check whether it is reporting, see system
resources and tmux sessions, and keep the last snapshot when the connection goes
quiet. Self-hosted, MIT-licensed, and designed for one owner with up to ten machines.

**Implemented:** landing page, responsive dashboard, SVG identity, backend, and Mac
agent. Local unit/API tests and browser checks are included. The sample dashboard
is usable now. Real Google sign-in, Upstash, and launchd still need end-to-end
verification. Running the demo creates no accounts or agent services.

The [project landing page](https://perch-mac-app.vercel.app) is deployed on Vercel.
Its dashboard currently shows setup guidance because hosted owner authentication
and storage are not configured. Use the local demo below for the interactive preview.

## What it reports

- Server-received heartbeat time, with overdue status after three minutes.
- CPU utilization sampled over one second, uptime, hostname, and OS family.
- Memory allocated (includes cache; this is not macOS Activity Monitor's pressure metric).
- Root filesystem disk capacity and available space.
- tmux session names, window counts, attached clients, and foreground `codex` pane counts.
- Optional Tailscale client state, this machine's MagicDNS name, and private IPs.

Perch does **not** read terminal output, files, prompts, credentials, or conversation
history. A foreground Codex process does not tell us whether a task is working,
finished, blocked, or awaiting input. The UI must never infer those states from tmux.
Monitoring is for machines you own or are authorized to administer.

## Architecture

```text
Your Mac → HTTPS heartbeat → Vercel function → Your Upstash Redis
                                               ↑
Your browser → Google sign-in → Owner-only API ──┘
```

The Mac makes outbound requests only. Perch opens no inbound ports on the Mac.
The hosted page remains reachable during a Mac/network outage and labels old data.
Each installation uses its own Google client, Redis database, owner, and agent tokens.
There is no central Perch service or telemetry.
Other people cannot register for access to your installation: every status read
must authenticate as its configured owner. Storage and sessions are also bound to
that installation's origin, Google client, and owner. Use separate databases and
secrets for separate owners; the namespace is not a replacement for database
permissions. See [security boundaries and verification limits](SECURITY.md).

## Local development

Requires Node.js 22 and npm. The Mac agent uses Node built-ins only.

```sh
npm ci
npm test
npm run check
```

`npm run demo` starts a local-only preview:

- Landing page: `http://localhost:8787/`
- Interactive sample dashboard: `http://localhost:8787/app`
- Sample API: `http://localhost:8787/api/machines`

The dashboard uses fictional machines. Switch machines or use **Explore a state**
to inspect stale snapshots, first-heartbeat onboarding, unavailable metrics, and
connection errors. It does not monitor the Mac running the demo.
Demo mode refuses to run on Vercel or with `NODE_ENV=production`, and its heartbeat
endpoint cannot ingest real machine information.

For browser checks, run `npx playwright install chromium` once, then `npm run test:ui`.
The tests cover desktop/tablet/mobile layouts, state changes, authentication expiry,
HTML injection handling, and automated accessibility checks. Google sign-in is stubbed
in browser tests; it is not a verified live integration.

For authenticated development, copy `.env.example` to `.env.local`, configure the
values below with `PERCH_ORIGIN=http://localhost:8787`, and run `npm run dev`.

## Deploy on Vercel

1. Import your fork as a Vercel project. Use Node.js 22, framework **Other**, output
   directory `public`, and no build command. `vercel.json` supplies API routing.
2. Create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` as server environment variables. Use the free plan
   explicitly; paid plans have different billing rules.
3. In Google Cloud, configure Google Auth Platform and create a **Web application**
   OAuth client. Set its authorized JavaScript origin to your final HTTPS Vercel
   origin. Add yourself as a test user if the consent application is in testing.
4. Set `GOOGLE_CLIENT_ID`, `PERCH_ORIGIN` (exact origin, no trailing slash), and
   `OWNER_EMAIL` (verified Gmail or Google Workspace account). For Google accounts
   using other email providers, pin the stable account ID with `OWNER_GOOGLE_SUB`.
   Pinning `OWNER_GOOGLE_SUB` is recommended for all owners because email addresses
   can change or be reassigned. A configured subject takes precedence over email. Never accept an arbitrary email
   domain or all Google accounts.
5. Generate a random `SESSION_SECRET`, then a separate random token for each Mac:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

6. Set `PERCH_MACHINES` to a JSON object:

   ```json
   {"studio-mini":{"name":"Studio mini","token":"your-unique-random-agent-token"}}
   ```

7. Redeploy. Visit the portal and sign in. An unregistered account must be denied.
   Check `/api/machines` without a cookie: it must return HTTP 401.
8. Install the agent on the Mac. Confirm a heartbeat arrives, then stop the agent
   for more than three minutes to verify the overdue state.

The app shell and Google client ID are public; machine data is always authorized
server-side. Vercel Deployment Protection can block unattended heartbeats and
Google login during testing. Use the intended production deployment with Perch's
application authentication. Do not make agent tokens into protection-bypass tokens.
Do not set `PERCH_DEMO` on hosted deployments.

Google Identity Services uses a short-lived signed nonce bound to the browser.
The server verifies Google's signature, issuer, audience, expiry, owner identity,
and nonce before issuing an eight-hour HttpOnly, Secure, SameSite=Strict cookie.
All status APIs return `Cache-Control: no-store, private`.

## Install the Mac agent

On **the Mac being monitored**, clone your fork and copy `.env.agent.example` to a
private location such as `~/.config/perch/agent.env`. Set the deployed URL, machine
ID, matching machine token, and optionally the absolute tmux path.

```sh
chmod 600 ~/.config/perch/agent.env
node --env-file="$HOME/.config/perch/agent.env" agent/agent.mjs --once
```

Only after the one-shot heartbeat succeeds, install the background LaunchAgent:

```sh
node scripts/install-agent.mjs "$HOME/.config/perch/agent.env"
```

This user LaunchAgent starts at login and restarts after process exit. It does not
survive logout or run before the first login after reboot. Keep the Mini awake if
you need continuous heartbeats. The installer uses the current Node executable's
absolute path; reinstall after moving/removing that Node version. It refuses to
overwrite an existing plist. Logs are in `~/Library/Logs/Perch/`; rotate them as needed.

To stop it:

```sh
launchctl bootout "gui/$(id -u)/dev.perch.agent"
```

To remove it, stop it first and delete only
`~/Library/LaunchAgents/dev.perch.agent.plist`. Remove the private agent config and
rotate/remove its token from Vercel. To reinstall after a Node upgrade, unload and
remove that plist before running the installer again.

## Tailscale

Perch can include Tailscale in the same owner-only snapshot. The dashboard shows
the local client's last reported state and copyable MagicDNS, IPv4, and IPv6
addresses. It labels old or interrupted snapshots as unknown, and does not infer
that your browser can reach the Mac.

1. Install and sign in to Tailscale on the monitored Mac using
   [Tailscale's macOS guide](https://tailscale.com/docs/install/mac).
2. Update the Perch checkout on that Mac and set `PERCH_TAILSCALE=1` in its private
   agent environment file. This opts in to storing that machine's private addresses
   in your hosted Redis snapshot. No Tailscale API key or admin token is needed.
3. Restart the agent, or run the one-shot heartbeat above. The next snapshot
   includes Tailscale. The collector tries `tailscale` in PATH and, on macOS, the
   app's bundled CLI. Set `PERCH_TAILSCALE_PATH` for a custom executable location.
4. From your laptop or phone, join the appropriate tailnet and follow its access
   rules when using an address. Copying an address grants no access and starts no
   remote command. Perch does not enable SSH, Serve, Funnel, or new network ports.

The collector runs `tailscale status --json --peers=false` with a short timeout.
Only state, `Self.DNSName`, and `Self.TailscaleIPs` are retained; peer devices,
account profiles, keys, login URLs, and diagnostic text are discarded. The server
validates the allowlist again. Missing or failed CLI access remains unavailable
without blocking the rest of the heartbeat. Older agents remain compatible and
show “Not reported.” The local demo includes clearly fictional Tailscale addresses.
Set `PERCH_TAILSCALE=0` and restart the agent to stop collecting this information;
the next successful heartbeat replaces its Tailscale fields with disabled status.

This integration **does not make the Vercel portal tailnet-only**. Google owner
authentication still protects every status read. Vercel receives HTTPS heartbeats
without joining your tailnet, so the dashboard stays independent of the Mini.
Perch never trusts incoming `Tailscale-User-*` headers on its public API.

A future private hosting mode could put a separate, always-on Perch host behind
[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve). Serve makes
a local service available within a tailnet; its identity headers are trustworthy
only behind a properly isolated proxy. Hosting that portal on the monitored Mini
would lose the outage visibility we want. A tailnet-only hosting/authentication
mode is not implemented by the status integration.

Implementation reference: [Tailscale CLI and macOS scripting](https://tailscale.com/docs/reference/tailscale-cli?tab=macos).
The local collector was checked against an installed client without uploading its
addresses. Hosted heartbeat ingestion, Google sign-in, and real tailnet access
still need end-to-end verification.

## Cost and retention

One machine sends about 43,200 heartbeats in a 30-day month. Each stores the latest
snapshot, adds a compact history sample, and trims history to 60 samples: roughly
129,600 Redis commands plus reads and transaction overhead. An open dashboard adds
polling reads; ten machines can exceed free-tier quotas. Polling should pause in
hidden tabs. There is no perpetual server process on Vercel.

Upstash currently lists 500,000 monthly commands and 256 MB on its free plan.
Vercel Hobby is free for eligible personal, non-commercial use. This is a small
personal deployment target, not a guaranteed dollar cap or an availability SLA.
Check provider limits before deploying for multiple machines or commercial use.

Latest snapshots persist until deleted; history is bounded to 60 samples per
machine. Remove `perch:v2:<scope>:<machine-id>:latest` and
`perch:v2:<scope>:<machine-id>:history` from your Redis database when retiring a
machine. The scope is a SHA-256 identifier derived from the configured origin,
Google client, and owner. Changing those settings starts an empty namespace;
the next heartbeat fills it. Rotating a session secret or machine token keeps
the namespace. Upgrades do not import legacy `perch:v1:*` keys; remove those old
records yourself when no longer needed. See [SECURITY.md](SECURITY.md).

## Development and contributions

Use `npm test` for API/auth/schema tests and `npm run check` for syntax checks.
Never commit `.env` files or real machine telemetry. Keep the dashboard useful on
a phone, label stale data, and do not add terminal capture or remote execution
without a separate permission and threat-model design.

Contributions are welcome under the MIT license. Submit a focused issue or patch
with the problem, behavior change, and relevant tests. The next milestones are
verified hosted onboarding, agent packaging, and optional structured Codex events.
A native Mac menu bar companion is a possible follow-up.

## References

- [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Upstash pricing](https://upstash.com/pricing/redis)
- [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
