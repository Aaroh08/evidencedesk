import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { request } from "node:http";
import { application } from "../src/server.mjs";
import { runtimeOptions } from "../src/runtime.mjs";
import { snapshot } from "../scripts/backup.mjs";
import { harness } from "./harness.mjs";

test("invalid JSON shapes return client errors instead of server errors", () =>
  harness(async (call) => {
    for (const body of [null, [], "wrong", 12])
      assert.equal((await call("/rooms", body)).status, 400);
  }));

function raw(url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: body ? "POST" : "GET", headers },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

test("unknown hosts are rejected even without Origin", async () => {
  const service = application({ file: ":memory:" });
  const server = service.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    assert.equal(
      await raw(`http://127.0.0.1:${server.address().port}/api/health`, {
        Host: "evil.example",
      }),
      403,
    );
  } finally {
    await new Promise((r) => server.close(r));
    service.db.close();
  }
});

test("workspace export is authenticated and never includes access secrets", () =>
  harness(async (call) => {
    const { body: room } = await call("/rooms", { name: "Export test" });
    const path = `/rooms/${room.id}/export`;
    assert.equal((await call(path)).status, 404);
    const result = await call(path, undefined, room.token);
    assert.equal(result.status, 200);
    assert.equal(result.body.name, room.name);
    assert.ok(Array.isArray(result.body.documents));
    assert.equal(JSON.stringify(result.body).includes(room.token), false);
    assert.equal(Object.hasOwn(result.body, "secret"), false);
  }));

test("deployment rejects invalid ports and requires an explicit external origin", () => {
  assert.throws(
    () => runtimeOptions({ port: 5071 }, { PORT: "invalid" }),
    /PORT/,
  );
  assert.throws(
    () => runtimeOptions({ port: 5071 }, { HOST: "0.0.0.0" }),
    /PUBLIC_ORIGIN/,
  );
  assert.deepEqual(runtimeOptions({ port: 5071 }, {}), {
    host: "127.0.0.1",
    port: 5071,
  });
  assert.throws(
    () => application({ file: ":memory:", maxRooms: 0 }),
    /MAX_ROOMS/,
  );
  assert.throws(
    () =>
      application({
        file: ":memory:",
        publicOrigin: "https://example.com/path",
      }),
    /PUBLIC_ORIGIN/,
  );
});

test("external TLS origin and workspace capacity are enforced", async () => {
  const service = application({
    file: ":memory:",
    maxRooms: 1,
    publicOrigin: "https://demo.example",
  });
  const server = service.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}/api/rooms`;
  const post = (origin) =>
    raw(
      url,
      {
        Host: "demo.example",
        Origin: origin,
        "Content-Type": "application/json",
      },
      JSON.stringify({ name: "Bounded" }),
    );
  try {
    assert.equal(await post("https://evil.example"), 403);
    assert.equal(await post("https://demo.example"), 201);
    assert.equal(await post("https://demo.example"), 507);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    service.db.close();
  }
});

test("online WAL backup restores source data and refuses overwrites", async () => {
  const folder = mkdtempSync(join(tmpdir(), "portfolio-backup-"));
  const source = join(folder, "source.sqlite");
  const target = join(folder, "snapshot.sqlite");
  const service = application({ file: source });
  try {
    service.db
      .prepare("INSERT INTO rooms(id,name,secret,created) VALUES(?,?,?,?)")
      .run(
        "backup-test",
        "Durable workspace",
        "test-hash",
        new Date().toISOString(),
      );
    service.db
      .prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?)")
      .run(
        "source-test",
        "backup-test",
        "Policy",
        1,
        "sha",
        '["Evidence survives backup"]',
        new Date().toISOString(),
      );
    await snapshot(source, target);
    const restored = new DatabaseSync(target, { readOnly: true });
    try {
      assert.equal(
        restored.prepare("SELECT name FROM rooms").get().name,
        "Durable workspace",
      );
      assert.equal(
        JSON.parse(
          restored.prepare("SELECT pages FROM documents").get().pages,
        )[0],
        "Evidence survives backup",
      );
    } finally {
      restored.close();
    }
    await assert.rejects(snapshot(source, target), /EEXIST/);
    await assert.rejects(snapshot(source, source), /different file/);
  } finally {
    service.db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
