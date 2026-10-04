# Perch

A private lookout for your Mac mini. Check whether it is reporting, see system
resources and tmux sessions, and keep the last snapshot when the connection goes
quiet. Self-hosted, MIT-licensed, and designed for one owner with up to ten machines.

**Initial implementation: backend and agent.** The dashboard and brand assets are
still in progress. Local API tests are included. Google sign-in, Upstash,
Vercel deployment, and the launchd installer still need verification against a real
deployment. No accounts, infrastructure, or agent services are created automatically.

## What it reports

- Server-received heartbeat time, with overdue status after three minutes.
- CPU utilization sampled over one second, uptime, hostname, and OS family.
- Memory allocated (includes cache; this is not macOS Activity Monitor's pressure metric).
- Root filesystem disk capacity and available space.
- tmux session names, window counts, attached clients, and foreground `codex` pane counts.

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

## Local development

Requires Node.js 22 and npm. The Mac agent uses Node built-ins only.

```sh
npm ci
npm test
npm run check
```

`npm run demo` starts a local-only sample-data API at
`http://localhost:8787/api/machines`. The dashboard entry page is still in progress.
Demo mode refuses to run on Vercel or with `NODE_ENV=production`, and its heartbeat
endpoint cannot ingest real machine information.

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
   A configured subject takes precedence over email. Never accept an arbitrary email
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
machine. Remove `perch:v1:<machine-id>:latest` and `perch:v1:<machine-id>:history`
from your Redis database when retiring a machine.

## Development and contributions

Use `npm test` for API/auth/schema tests and `npm run check` for syntax checks.
Never commit `.env` files or real machine telemetry. Keep the dashboard useful on
a phone, label stale data, and do not add terminal capture or remote execution
without a separate permission and threat-model design.

Contributions are welcome under the MIT license. Submit a focused issue or patch
with the problem, behavior change, and relevant tests. The next milestones are
verified hosted onboarding, agent packaging, and optional structured Codex events.

## References

- [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Upstash pricing](https://upstash.com/pricing/redis)
- [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
