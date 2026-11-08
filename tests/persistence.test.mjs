import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import { application } from "../src/server.mjs";
import { harness } from "./harness.mjs";

test("SQLite state survives closing and reopening the application", () => {
  const folder = mkdtempSync(join(tmpdir(), "portfolio-persistence-"));
  let service;
  try {
    const file = join(folder, "state.sqlite");
    service = application({ file });
    const doc = new Y.Doc();
    doc.getText("notes").insert(0, "Persistent test content");
    service.db
      .prepare(
        "INSERT INTO rooms(id,name,secret,state,created) VALUES(?,?,?,?,?)",
      )
      .run(
        "test-id",
        "Persistence",
        createHash("sha256").update("test").digest("hex"),
        Buffer.from(Y.encodeStateAsUpdate(doc)),
        new Date().toISOString(),
      );
    service.db.close();
    service = application({ file });
    const row = service.db
      .prepare("SELECT * FROM rooms WHERE id=?")
      .get("test-id");
    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(row.state));
    assert.equal(
      restored.getText("notes").toString(),
      "Persistent test content",
    );
    doc.destroy();
    restored.destroy();
  } finally {
    service?.db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("ten independently edited clients merge and duplicate retries do not erase work", () =>
  harness(async (call) => {
    const { body: r } = await call("/rooms", { name: "Concurrent test" });
    const docs = Array.from({ length: 10 }, (_, i) => {
      const d = new Y.Doc();
      d.getMap("tasks").set("task-" + i, "independent task " + i);
      return d;
    });
    const updates = docs.map((d) => ({
      state: Buffer.from(Y.encodeStateAsUpdate(d)).toString("base64"),
    }));
    const responses = await Promise.all(
      updates.map((u) => call("/rooms/" + r.id + "/sync", u, r.token)),
    );
    assert.ok(responses.every((r) => r.status === 200));
    for (const u of updates.slice().reverse())
      await call("/rooms/" + r.id + "/sync", u, r.token);
    const result = await call("/rooms/" + r.id, undefined, r.token);
    const merged = new Y.Doc();
    Y.applyUpdate(
      merged,
      new Uint8Array(Buffer.from(result.body.state, "base64")),
    );
    assert.equal(merged.getMap("tasks").size, 10);
    docs.forEach((d) => d.destroy());
    merged.destroy();
  }));
