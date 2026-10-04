# Security

Perch is an early self-hosted project, not a hardened remote administration service.
Do not file credentials, private logs, or live tokens in public issues. A private
reporting contact will be added when the public repository is established.

## Boundaries

- Only an explicitly configured Google owner can read machine records. Every
  status read checks the signed session and owner before accessing storage.
- Each installation is for one owner, with their own Google client, Redis database,
  session secret, and machine tokens. Perch is not a shared multi-user service.
- Sessions, login nonces, and Redis keys are scoped to the configured web origin,
  Google client, and owner identity. Two installations using the same machine ID
  cannot accidentally select each other's records through the app.
- Agent credentials can write only the configured machine's heartbeat. They
  cannot read status, issue commands, sign in, or act as another machine.
- Heartbeats use HTTPS, refuse redirects, and contain bounded, allowlisted fields.
- Raw terminal output, source files, and conversation history are not collected.
- Demo data is local-only and cannot be enabled on Vercel/production.
- Secrets remain server-side or in the Mac user's private environment file.
- Public static assets contain no user records. API responses are never cached.
- The dashboard keeps snapshots in memory, not localStorage. Sign-out clears the
  displayed snapshot immediately and invalidates pending UI responses. A successful
  sign-out notifies other same-origin tabs through BroadcastChannel where supported.
  Session rejection and back/forward page restoration also clear the private view.

## Identity and database isolation

Prefer `OWNER_GOOGLE_SUB`, Google's stable account identifier, over email-based
access. Email-only access requires a verified Gmail or Google Workspace identity;
an administrator could reassign a Workspace address. A pinned subject takes
precedence over email. See [Google's verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

The storage namespace is an extra guard against configuration mistakes, **not a
database access-control system**. Anyone with Redis credentials can read its keys;
never share a database or its credentials between people who should be isolated.
The origin and owner used for scoping come from server configuration, never a
browser-supplied owner ID. Changing origin, Google client, or configured owner
starts a separate namespace and rejects previous sessions on the updated deployment.

Upgrades from unscoped `perch:v1:*` storage deliberately do not import old snapshots.
The next heartbeat populates the new `perch:v2:<scope>:<machine-id>:*` namespace.
Old cookies require sign-in again. Delete old keys yourself when no longer needed;
they are not automatically erased. There is no real-machine data in the current
project deployment to migrate.

## Operational limits

Google sign-in, TLS, Vercel, Redis, the agent host, and administrator credentials
are trusted dependencies. An agent token thief could falsify that machine's metrics
or consume your write quota; rotate the token in Vercel and on the Mac. Sessions
are signed and stateless, valid for eight hours. Signing out clears the browser
cookie; it does not revoke an already stolen copy or sign out another device.
Rotate SESSION_SECRET and redeploy to reject existing sessions. Remove or protect
older deployments that still have the old configuration. A stolen session can read
status until expiry or revocation; a compromised hosting account or Redis credential
can access the data. The installation namespace does not provide encryption.

There is not yet a distributed rate limiter. Apply provider firewall/rate limits
before operating at scale. A heartbeat outage does not prove that the Mac is off.
The cloud status record is private to the configured account, but is stored on
your chosen hosting/database providers. Provider plan guarantees still apply.
Hostnames and tmux session names can themselves be sensitive. Avoid putting secrets
in these names. Perch sends no telemetry to the project maintainer; Google sign-in
and your chosen hosting/database providers still process requests.

## Verification status — October 4, 2026

This is a source review with automated regression tests, not an independent
penetration test or a security certification.

- 28 local unit/API/storage tests pass: unauthorized requests never read storage,
  other Google identities cannot log in, agent tokens cannot read or write another
  machine, sessions/nonces cannot cross installation boundaries, and overlapping
  machine IDs do not mix snapshots or history in a shared test store.
- 14 browser checks pass, including a reproduced/fixed late-refresh-after-logout
  race, sign-out across tabs, session expiry, restored-page handling, and HTML
  injection. Google and API authentication flows are stubbed in browser tests.
- Dependency audit reported no known npm vulnerabilities at review time. This
  cannot establish that dependencies or application code have no vulnerabilities.
- Hosted Google and Redis are not configured. The public deployment fails closed
  with HTTP 503 for unconfigured APIs; that is not proof of successful authentication.

Before connecting a real machine, verify on the configured production deployment:

1. Owner A can sign in; a separate Google account B is denied. Requests without a
   session, with a tampered session, and with only an agent token return 401.
2. A separate installation owned by B cannot accept A's cookies or machine tokens,
   and neither installation's API returns the other's records. Use distinct secrets
   and databases, even when the machine IDs match.
3. A real heartbeat is readable only by its owner; an invalid token or another
   machine's token cannot write it. Confirm interruption and recovery without
   mistaking an old snapshot for current state.
4. Sign-out, session expiry, and secret rotation behave as documented on desktop
   and mobile. Review old Vercel deployments before treating rotation as complete.
