# Architecture and operations

## Request flow

Create a workspace with POST /api/rooms and a name. The returned id and token are placed in a URL fragment. All subsequent workspace requests send Authorization: Bearer TOKEN. GET /api/rooms/:id returns the merged Yjs snapshot and revision. POST /api/rooms/:id/sync accepts a base64 Yjs update. POST /api/rooms/:id/rotate replaces the shared capability. GET /api/rooms/:id/history returns up to 100 checkpoints.

Invalid or missing capabilities deliberately return the same 404 response. Cross-origin browser requests return 403, oversized requests 413, and rate-limited requests 429. Health is available at GET /api/health. State is never transferred through cookies.

## Design decisions

PDF.js extracts text in a child process with a 15-second timeout. Limits are 2 MB input PDF, 80 pages, 500,000 extracted characters and 40 versions per collection. Text is split into overlapping 140-word chunks with 100-word stride, ranked with BM25, filtered at 50% query-term coverage and deduplicated by page. Latest versions are used by default. The stored hash covers normalized extracted pages, not the original PDF bytes. Original PDFs are not retained.

SQLite WAL persists data without a separate database service. Synchronous queries simplify transaction handling but can block the event loop on large workloads. Full-state polling is straightforward and robust for small workspaces; a production multi-user system should use state-vector diffs and push transport after measuring workload. The project does not claim WebSocket transport.

## Operations

Run from the repository root. Use npm ci to match the lockfile. Rebuild after changing browser code. If a port is occupied, stop the prior project instance or change config.json and restart. Service-worker assets are cached for offline fallback; a normal online reload fetches current assets. Changing ports creates a different browser storage origin.

Keep data/ outside source control. Stop the process before a simple full-directory backup, and test restoring into a separate copy of the application. Do not copy a live SQLite file alone while WAL is active. The test suite verifies reopening stored data but does not replace an operational backup exercise.

## Production work still required

Named users and membership roles; explicit deployment configuration; OS-level resource quotas for workers; database migration/version strategy; retention and deletion UI; structured redacted monitoring; SLOs; accessibility audit; browser automation in CI; independently designed adversarial tests; multi-device network testing; and capacity measurement. These are documented gaps rather than completed features.
