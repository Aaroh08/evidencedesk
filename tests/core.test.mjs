import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { application } from "../src/server.mjs";
import { harness } from "./harness.mjs";
test("workspace validates input and requires invite capability", () =>
  harness(async (call) => {
    assert.equal((await call("/rooms", { name: "" })).status, 400);
    const r = await call("/rooms", { name: "Study room" });
    assert.equal(r.status, 201);
    assert.equal(r.body.token.length, 64);
    assert.equal((await call("/rooms/" + r.body.id)).status, 404);
    assert.equal(
      (await call("/rooms/" + r.body.id, undefined, "wrong")).status,
      404,
    );
    assert.equal(
      (await call("/rooms/" + r.body.id, undefined, r.body.token)).body.name,
      "Study room",
    );
  }));
test("cross-origin mutations are denied", () =>
  harness(async (call) => {
    assert.equal(
      (
        await call("/rooms", { name: "No" }, null, {
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
  }));
test("concurrent offline text and tasks converge without losing independent edits", () =>
  harness(async (call) => {
    const { body: r } = await call("/rooms", { name: "Offline" });
    const a = new Y.Doc(),
      b = new Y.Doc();
    a.getText("notes").insert(0, "Base");
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    a.getText("notes").insert(4, " Alice");
    b.getText("notes").insert(4, " Bob");
    a.getMap("tasks").set("a", "one");
    b.getMap("tasks").set("b", "two");
    const path = "/rooms/" + r.id + "/sync";
    for (const d of [a, b])
      assert.equal(
        (
          await call(
            path,
            { state: Buffer.from(Y.encodeStateAsUpdate(d)).toString("base64") },
            r.token,
          )
        ).status,
        200,
      );
    const merged = (await call("/rooms/" + r.id, undefined, r.token)).body;
    for (const d of [a, b])
      Y.applyUpdate(d, new Uint8Array(Buffer.from(merged.state, "base64")));
    assert.equal(a.getText("notes").toString(), b.getText("notes").toString());
    assert.match(a.getText("notes").toString(), /Alice/);
    assert.match(a.getText("notes").toString(), /Bob/);
    assert.equal(a.getMap("tasks").size, 2);
    a.destroy();
    b.destroy();
  }));
test("sync is idempotent, malformed updates rejected, history records real checkpoints", () =>
  harness(async (call) => {
    const { body: r } = await call("/rooms", { name: "History" });
    const d = new Y.Doc();
    d.getText("notes").insert(0, "hello");
    const update = {
      state: Buffer.from(Y.encodeStateAsUpdate(d)).toString("base64"),
    };
    const path = "/rooms/" + r.id;
    const first = await call(path + "/sync", update, r.token);
    const second = await call(path + "/sync", update, r.token);
    assert.equal(first.body.revision, second.body.revision);
    assert.equal(
      (await call(path + "/sync", { state: "not a valid update" }, r.token))
        .status,
      400,
    );
    const h = await call(path + "/history", undefined, r.token);
    assert.equal(h.body.length, 1);
    assert.equal(
      (await call(path + "/history", undefined, "other")).status,
      404,
    );
    d.destroy();
  }));
test("rotating an invite revokes the prior capability", () =>
  harness(async (call) => {
    const { body: r } = await call("/rooms", { name: "Rotate" });
    const path = "/rooms/" + r.id;
    const { body: newKey } = await call(path + "/rotate", {}, r.token);
    assert.equal((await call(path, undefined, r.token)).status, 404);
    assert.equal((await call(path, undefined, newKey.token)).status, 200);
  }));
