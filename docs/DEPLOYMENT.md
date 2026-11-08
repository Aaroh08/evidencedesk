# Deployment and recovery

## Local operation

Use Node 24.13.1 and `npm ci && npm run build && npm start`. The default listener binds to 127.0.0.1. Set environment variables in your shell before starting:

| Variable | Default | Purpose |
| --- | --- | --- |
| HOST | 127.0.0.1 | Bind address; external interfaces require PUBLIC_ORIGIN |
| PORT | config.json port | Integer TCP port |
| PUBLIC_ORIGIN | unset | Exact origin such as https://research.example.com, without a trailing slash |
| DATA_FILE | data/app.sqlite | Persistent database path |
| MAX_ROOMS | 50 | Persistent global workspace capacity; 1–10000 |

The external Host header must match PUBLIC_ORIGIN and any browser Origin must match it exactly. A TLS reverse proxy must preserve the external Host. Forwarded headers are not trusted. The built-in server does not terminate TLS. The API limiter counts socket addresses, so users behind a reverse proxy share a rate bucket; an internet deployment needs deliberate identity-aware limits. Graceful SIGTERM/SIGINT closes HTTP connections and SQLite, with a ten-second shutdown deadline.

## Reproducible container

Run `docker compose up --build -d --wait` and open the normal local application URL from the README. Compose binds only to loopback. It uses a non-root user, read-only application filesystem, temporary /tmp, a persistent app-data volume, dropped capabilities, no-new-privileges, and limits of 512 MB, one CPU and 64 processes. The image contains the built browser bundle and production dependencies. The container health check probes SQLite through the HTTP health endpoint.

Use `docker compose logs --tail=100` for startup failures. `docker compose down` preserves the data volume. **Do not use `down -v` on your real deployment: it deletes the data volume.** CI uses that command only for its temporary test deployment. A whole-service container limit does not provide per-submission isolation for hostile code or hostile PDFs. See SECURITY.md before exposing anything publicly.

## Backup

For a local server, run `npm run backup`. This writes a timestamped file under ignored backups/, uses SQLite's online backup API, checks database integrity, and refuses to overwrite an existing destination. Supply a destination with `npm run backup -- backups/my-snapshot.sqlite`. It reads DATA_FILE when configured. A missing source fails instead of creating an empty database. See the [Node SQLite backup API](https://nodejs.org/download/release/v24.13.1/docs/api/sqlite.html#sqlitebackupsourceDb-path-options).

For Compose, create a snapshot in the writable volume:

```sh
docker compose exec app node scripts/backup.mjs /app/data/snapshot.sqlite
docker compose cp app:/app/data/snapshot.sqlite ./snapshot.sqlite
```

Choose a fresh filename for every backup. Protect the copy as private data; it includes document content and access hashes. The app does not encrypt backups or send them to cloud storage. Retain backups according to your own data policy.

## Restore drill

1. Keep the original deployment and backup unchanged. Copy the snapshot to a separate directory such as `restore-check/app.sqlite`.
2. Start a second local application process with DATA_FILE pointing to that copy and PORT set to an unused port. If PUBLIC_ORIGIN is set, update it to the new origin too.
3. Reopen a saved invite using the new local origin, keeping its room/key fragment. Verify notes and, for EvidenceDesk, source versions and exact cited text.
4. Stop the separate process when finished. The original database has not been replaced.

The automated suite performs a separate-file backup/restore with an open WAL database and compares saved workspace/source contents. CI also recreates the container and confirms the persistent volume. Neither check replaces recovery timing and off-device backup exercises for a real deployment.

## Remaining production work

These applications use shared capability links, not named accounts or owner/editor/viewer roles. Public service operation still requires that product decision, TLS and secure hosting, account quotas, monitoring, retention/deletion controls, capacity testing and independent security review. Browser and mobile acceptance checks are documented separately in VERIFICATION.md. No public hosted application or uptime guarantee is claimed.
