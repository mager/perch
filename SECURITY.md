# Security

Perch is an early self-hosted project, not a hardened remote administration service.
Do not file credentials, private logs, or live tokens in public issues. A private
reporting contact will be added when the public repository is established.

## Boundaries

- Only an explicitly configured Google owner can read machine records.
- Agent credentials can write only the configured machine's heartbeat. They
  cannot read status, issue commands, sign in, or act as another machine.
- Heartbeats use HTTPS, refuse redirects, and contain bounded, allowlisted fields.
- Raw terminal output, source files, and conversation history are not collected.
- Demo data is local-only and cannot be enabled on Vercel/production.
- Secrets remain server-side or in the Mac user's private environment file.
- Public static assets contain no user records. API responses are never cached.

## Operational limits

Google sign-in, TLS, Vercel, Redis, the agent host, and administrator credentials
are trusted dependencies. An agent token thief could falsify that machine's metrics
or consume your write quota; rotate the token in Vercel and on the Mac. Sessions
are signed and stateless, valid for eight hours. Rotate SESSION_SECRET to revoke
all sessions; changing owner configuration also rejects old owners immediately.

There is not yet a distributed rate limiter. Apply provider firewall/rate limits
before operating at scale. A heartbeat outage does not prove that the Mac is off.
The cloud status record is private to the configured account, but is stored on
your chosen hosting/database providers. Provider plan guarantees still apply.
