# Verification record

Recorded automated results are in artifacts/verification.txt. Tests are reproducible using npm run check. The local runtime is Node 24.13.1 on Windows.

Browser observations completed during development: all three landing pages and workspace creation were exercised; CodeRoom loaded the CodeMirror editor and ran the two Two Sum cases successfully; CampusSync accepted shared notes and a task; EvidenceDesk indexed the fictional handbook and listed its source version.

Remaining browser verification: cross-profile collaboration, server-unavailable reload/recovery, mobile layout review, citation-page navigation and screenshots. Automatic browser approval review stopped this verification because the workspace spending cap was reached. No screenshots or completed end-to-end browser results are fabricated. The automated HTTP/CRDT tests are separate evidence and do not establish browser offline behavior by themselves.

## Hardening verification (2026-11-08)

18/18 local automated tests pass. Added checks cover malformed JSON shapes, unknown Host rejection, explicit TLS-origin validation, persistent workspace capacity, authenticated export, deployment configuration validation, and restoring a consistent live-WAL backup without overwriting existing files. These are HTTP/database tests, not browser tests.

The CI workflow now builds a non-root constrained Docker container, exercises an HTTP workflow, recreates the container, and verifies that the named volume preserves workspaces and their invite authentication. The matching GitHub Actions run is the source of truth for deployment pass/fail status.

Browser changes awaiting hands-on verification: request deadlines, cache migration after invite rotation, old service-worker cache cleanup, and source-inclusive workspace export. Browser access remains blocked by the workspace spending cap.
