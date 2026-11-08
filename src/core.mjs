import express from "express";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";
const hash = (x) => createHash("sha256").update(x).digest("hex");
export function createApp({
  file = process.env.DATA_FILE || "data/app.sqlite",
  publicOrigin = process.env.PUBLIC_ORIGIN,
  maxRooms = Number(process.env.MAX_ROOMS || 50),
  config = JSON.parse(readFileSync("config.json")),
} = {}) {
  if (!Number.isInteger(maxRooms) || maxRooms < 1 || maxRooms > 10000)
    throw Error("MAX_ROOMS must be an integer between 1 and 10000");
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== publicOrigin
    )
      throw Error("PUBLIC_ORIGIN must be an HTTP(S) origin without a path");
  }
  if (file !== ":memory:") mkdirSync(resolve(file, ".."), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000",
  );
  db.exec(`CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,name TEXT NOT NULL,secret TEXT NOT NULL,state BLOB,revision INTEGER DEFAULT 0,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,room TEXT REFERENCES rooms(id),revision INTEGER,state BLOB,created TEXT);
 CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,room TEXT REFERENCES rooms(id),title TEXT,version INTEGER,sha TEXT,pages TEXT,created TEXT);
 CREATE INDEX IF NOT EXISTS docs_room ON documents(room);`);
  const app = express();
  app.disable("x-powered-by");
  const hits = new Map();
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    const expected = publicOrigin || `${req.protocol}://${req.get("host")}`;
    const hostname = req.hostname;
    if (
      publicOrigin
        ? req.get("host") !== new URL(publicOrigin).host
        : !["127.0.0.1", "localhost", "[::1]"].includes(hostname)
    )
      return res.status(403).json({ error: "Host not allowed" });
    if (req.headers.origin && req.headers.origin !== expected)
      return res.status(403).json({ error: "Cross-origin request denied" });
    if (req.path.startsWith("/api/")) {
      const key = req.socket.remoteAddress;
      const now = Date.now();
      let bucket = hits.get(key);
      if (!bucket || now - bucket.start > 60000) {
        bucket = { start: now, n: 0 };
        hits.set(key, bucket);
      }
      if (++bucket.n > 600)
        return res
          .status(429)
          .json({ error: "Too many requests; retry in a minute" });
      if (hits.size > 10000) hits.clear();
    }
    next();
  });
  app.use(express.json({ limit: "6mb" }));
  app.use("/api", (req, res, next) => {
    if (
      ["POST", "PUT", "PATCH"].includes(req.method) &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    )
      return res.status(400).json({ error: "Provide a JSON object" });
    next();
  });
  app.get("/api/config", (_, res) => res.json(config));
  app.get("/api/health", (_, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ready", service: config.slug });
  });
  app.post("/api/rooms", (req, res) => {
    const name = req.body.name;
    if (typeof name !== "string" || !name.trim() || name.length > 80)
      return res
        .status(400)
        .json({ error: "Name must contain 1–80 characters" });
    if (db.prepare("SELECT count(*) n FROM rooms").get().n >= maxRooms)
      return res
        .status(507)
        .json({ error: "Workspace capacity reached; contact the operator" });
    const id = randomUUID(),
      token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO rooms(id,name,secret,created) VALUES(?,?,?,?)").run(
      id,
      name.trim(),
      hash(token),
      new Date().toISOString(),
    );
    res.status(201).json({ id, token, name: name.trim() });
  });
  app.use("/api/rooms/:id", (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const room = db
      .prepare("SELECT * FROM rooms WHERE id=?")
      .get(req.params.id);
    if (!room || !token || hash(token) !== room.secret)
      return res
        .status(404)
        .json({ error: "Workspace not found or invite is invalid" });
    req.room = room;
    next();
  });
  app.get("/api/rooms/:id", (req, res) =>
    res.json({
      id: req.room.id,
      name: req.room.name,
      revision: req.room.revision,
      state: req.room.state
        ? Buffer.from(req.room.state).toString("base64")
        : null,
    }),
  );
  app.post("/api/rooms/:id/sync", (req, res) => {
    const encoded = req.body.state;
    if (typeof encoded !== "string" || encoded.length > 1400000)
      return res.status(400).json({ error: "Invalid or oversized update" });
    const doc = new Y.Doc();
    try {
      if (req.room.state) Y.applyUpdate(doc, new Uint8Array(req.room.state));
      Y.applyUpdate(doc, new Uint8Array(Buffer.from(encoded, "base64")));
      const state = Buffer.from(Y.encodeStateAsUpdate(doc));
      if (state.length > 1000000)
        return res.status(413).json({
          error:
            "Workspace storage limit reached; export and create another workspace",
        });
      if (req.room.state && Buffer.from(req.room.state).equals(state))
        return res.json({
          revision: req.room.revision,
          state: state.toString("base64"),
        });
      const revision = req.room.revision + 1;
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE rooms SET state=?,revision=? WHERE id=?").run(
          state,
          revision,
          req.room.id,
        );
        db.prepare(
          "INSERT INTO history(room,revision,state,created) VALUES(?,?,?,?)",
        ).run(req.room.id, revision, state, new Date().toISOString());
        db.prepare(
          "DELETE FROM history WHERE room=? AND id NOT IN (SELECT id FROM history WHERE room=? ORDER BY id DESC LIMIT 100)",
        ).run(req.room.id, req.room.id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      res.json({ revision, state: state.toString("base64") });
    } catch (e) {
      if (!res.headersSent)
        res.status(400).json({ error: "Invalid collaboration update" });
    } finally {
      doc.destroy();
    }
  });
  app.get("/api/rooms/:id/history", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT revision,state,created FROM history WHERE room=? ORDER BY revision DESC LIMIT 100",
        )
        .all(req.room.id)
        .map((x) => ({ ...x, state: Buffer.from(x.state).toString("base64") })),
    ),
  );
  app.post("/api/rooms/:id/rotate", (req, res) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("UPDATE rooms SET secret=? WHERE id=?").run(
      hash(token),
      req.room.id,
    );
    res.json({ token });
  });
  app.get("/api/rooms/:id/export", (req, res) => {
    res.json({
      format: 1,
      name: req.room.name,
      exported: new Date().toISOString(),
      state: req.room.state
        ? Buffer.from(req.room.state).toString("base64")
        : null,
      documents: db
        .prepare(
          "SELECT id,title,version,sha,pages,created FROM documents WHERE room=?",
        )
        .all(req.room.id)
        .map((d) => ({ ...d, pages: JSON.parse(d.pages) })),
    });
  });
  return { app, db, config };
}
export function finish({ app }, publicDir = "public") {
  app.use(express.static(publicDir, { etag: true }));
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      error:
        err.status === 413
          ? "Request too large"
          : "Request could not be processed",
    });
  });
}
