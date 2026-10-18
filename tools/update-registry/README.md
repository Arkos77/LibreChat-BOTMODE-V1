# BOT MODE — independent, optional update registry (DRAFT)

This is a **central mailing-list service** for volunteers who install or follow BOT MODE. It is **not** a second orchestrator, distributed user login, license server, analytics/telemetry service, upgrade daemon, or dependency of a running BOT MODE installation. No automatic installation registration, API keys, agent messages or local data are transmitted.

## Flow

1. Operator separately hosts a central HTTPS URL (e.g. `https://updates.example.org`).
2. The visitor opens the opt-in page and explicitly subscribes with email + a checked consent box.
3. The service sends a single-use email confirmation, valid for 48 hours; the user explicitly confirms by POST. An emailed GET link alone never confirms.
4. MongoDB stores **only** normalized email, opt-in state, creation/confirmation dates, and hashed confirmation/unsubscribe tokens. Expired pending subscriptions are removed by a MongoDB TTL index; unsubscribe deletes the email record.
5. Admin can query a count/export with a strong private bearer token and manually send an **official release notification**; each release is idempotent per recipient. Delivery failure stays retryable.
6. This module is completely optional. Users who never register continue to install, run and update BOT MODE normally. Release notifications are informational only, not an automatic `git pull`/image change.

## Install separately (not on a user installation)

Requires Node.js 22+, an operator-owned central MongoDB, HTTPS reverse proxy, and an SMTP account supporting STARTTLS (587) or TLS (465). Do **not** reuse the MongoDB credentials, database or secrets from any BOT MODE installation.

```bash
cd tools/update-registry
npm ci --omit=dev --ignore-scripts
# Supply environment through an access-controlled service manager, not a committed file.
# See .env.example for required environment variable names.
node src/server.mjs
```

The server listens exclusively on `127.0.0.1:${REGISTRY_PORT:-8789}`. Configure TLS at the reverse proxy and expose only the intended service URL. Production refuses plain HTTP public URLs, short/identical secrets or an invalid SMTP configuration. Run with unprivileged OS credentials, restrict the admin bearer token, isolate MongoDB credentials and configure backup/restore. Disable public indexing of admin URLs; do not add cross-origin registration APIs or embed the admin token in client code. Apply a reverse-proxy rate limit; the built-in memory guard is only a second line of defense.

### Admin read API

```bash
curl -H "Authorization: Bearer $REGISTRY_ADMIN_TOKEN" https://updates.example.org/admin/stats
curl -H "Authorization: Bearer $REGISTRY_ADMIN_TOKEN" https://updates.example.org/admin/subscribers.csv -o subscribers.csv
```

Exports contain only email, signup date and confirmation date, are escaped against spreadsheet-formula injection, and must be handled as private records. Bulk CSV export is capped at 100,000 subscribers with an explicit error above this threshold (no silent truncation). Never include the admin token in public URLs.

### Notify about an existing release

```bash
# Dry run by default: counts confirmed subscribers, sends no email.
npm run announce -- --version v1.0.0 --release-url https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.0

# Explicitly send after the official release exists and the dry run looks correct.
REGISTRY_CONFIRM_SEND=YES npm run announce -- --send --version v1.0.0 --release-url https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.0
```

Mail is intentionally throttled and contains a one-click unsubscribe link requiring user confirmation. Re-running the same version will not resend successful deliveries; failed ones can be retried. This script neither creates a GitHub release nor publishes a Docker image.

## Development / acceptance

```bash
npm ci --ignore-scripts
npm test
```

`test/core.test.mjs` uses injected fake storage and SMTP, sends no real email. `test/storage.integration.test.mjs` requires **explicit** `REGISTRY_TEST_MONGODB_URI` pointing to a disposable MongoDB on `127.0.0.1`; it only creates/drops a randomly named isolated test database. GitHub Actions provisions its own throwaway MongoDB and runs the complete suite. Do not point tests at a personal or production MongoDB.

## V1 release boundary

The dedicated registry branch is for **post-V1 adoption** and remains Draft / NO MERGE until separately reviewed. It does not change existing `install.sh`, `update.sh`, GitHub release tags, GHCR images or PR #29. The sign-up link can be placed on the download page or in Settings only when the operator supplies a verified central HTTPS hostname. No unknown domain or fabricated public URL is hard-coded into the installer.

Before public activation: host/domain, dedicated MongoDB and SMTP credentials, legal notice identifying the list operator and use of email, consent proof, unsubscribe test through a real mailbox, backups, abuse controls and admin access review. Keep security announcements operationally distinct from automatic updater logic; avoid sending marketing material unless separately authorized.
