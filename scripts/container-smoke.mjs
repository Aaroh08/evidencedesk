// HTTP/process integration only; this does not simulate or certify browser behavior.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as Y from "yjs";
const config = JSON.parse(readFileSync("config.json"));
const origin = `http://127.0.0.1:${config.port}`;
async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(origin + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Container did not become healthy");
}
async function api(path, data, token) {
  const result = await fetch(origin + "/api" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.ok(result.ok, `HTTP ${result.status} at ${path}`);
  return result.json();
}
await ready();
assert.equal((await fetch(origin)).status, 200);
const room = await api("/rooms", { name: "Container persistence check" });
const path = `/rooms/${room.id}`;
const doc = new Y.Doc();
doc.getText("notes").insert(0, "Survives container recreation");
await api(
  path + "/sync",
  { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") },
  room.token,
);
if (config.slug === "coderoom") {
  const result = await api(
    path + "/run",
    {
      code: "function solve(a,b){return a+b}",
      cases: [{ args: [2, 3], expected: 5 }],
    },
    room.token,
  );
  assert.equal(result.results[0].pass, true);
}
if (config.slug === "evidencedesk") {
  await api(
    path + "/documents",
    { title: "Deployment policy", text: "Backups retained for thirty days." },
    room.token,
  );
}
execFileSync("docker", ["compose", "up", "-d", "--force-recreate", "--wait"], {
  stdio: "inherit",
});
await ready();
const restored = await api(path, undefined, room.token);
const copy = new Y.Doc();
Y.applyUpdate(copy, Buffer.from(restored.state, "base64"));
assert.equal(copy.getText("notes").toString(), doc.getText("notes").toString());
if (config.slug === "evidencedesk") {
  const evidence = await api(
    path + "/search",
    { question: "backups retained" },
    room.token,
  );
  assert.equal(evidence.status, "evidence_found");
  const archive = await api(path + "/export", undefined, room.token);
  assert.equal(archive.documents.length, 1);
}
doc.destroy();
copy.destroy();
console.log(
  `${config.name}: container health, HTTP workflow and volume persistence passed`,
);
