import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness.mjs";
import { search } from "../src/retrieval.mjs";
test("citations refer to exact source text and page", () => {
  const docs = [
    {
      id: "a",
      title: "Policy",
      version: 1,
      sha: "abc",
      pages: ["Access is restricted.", "Backups are retained for 30 days."],
    },
  ];
  const r = search(docs, "How long are backups retained?");
  assert.equal(r.status, "evidence_found");
  assert.equal(r.passages[0].page, 2);
  assert.equal(r.passages[0].quote, docs[0].pages[1]);
});
test("unrelated and stopword-only questions abstain", () => {
  const docs = [{ id: "a", pages: ["Bicycles have two wheels."] }];
  assert.equal(
    search(docs, "quantum entanglement").status,
    "insufficient_evidence",
  );
  assert.equal(search(docs, "what is the").status, "insufficient_evidence");
});
test("source versioning, duplicate detection, isolation and latest-version retrieval", () =>
  harness(async (call) => {
    const { body: a } = await call("/rooms", { name: "A" }),
      { body: b } = await call("/rooms", { name: "B" });
    const path = "/rooms/" + a.id;
    const first = await call(
      path + "/documents",
      { title: "Policy", text: "Backups retained for 30 days." },
      a.token,
    );
    assert.equal(first.status, 201);
    assert.equal(
      (
        await call(
          path + "/documents",
          { title: "Policy", text: "Backups retained for 30 days." },
          a.token,
        )
      ).body.duplicate,
      true,
    );
    assert.equal(
      (
        await call(
          path + "/documents",
          { title: "Policy", text: "Backups retained for 60 days." },
          a.token,
        )
      ).body.version,
      2,
    );
    const r = await call(
      path + "/search",
      { question: "backups retained" },
      a.token,
    );
    assert.equal(r.body.passages[0].version, 2);
    assert.match(r.body.passages[0].quote, /60/);
    assert.equal(
      (
        await call(
          "/rooms/" + b.id + "/documents/" + first.body.id,
          undefined,
          b.token,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          "/rooms/" + b.id + "/search",
          { question: "backups retained" },
          b.token,
        )
      ).body.status,
      "insufficient_evidence",
    );
  }));
test("invalid PDFs and oversized source text fail clearly", () =>
  harness(async (call) => {
    const { body: r } = await call("/rooms", { name: "PDF" });
    assert.equal(
      (
        await call(
          "/rooms/" + r.id + "/documents",
          { title: "broken", pdf: Buffer.from("not pdf").toString("base64") },
          r.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/rooms/" + r.id + "/documents",
          { title: "huge", text: "a".repeat(500001) },
          r.token,
        )
      ).status,
      400,
    );
  }));
