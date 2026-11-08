import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness.mjs";
function fixturePDF() {
  const content =
    "BT /F1 12 Tf 50 750 Td (Backups are retained for 30 days.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text).toString("base64");
}
test("real PDF text extraction retains page attribution through search", () =>
  harness(async (call) => {
    const { body: r } = await call("/rooms", { name: "PDF test" });
    const base = "/rooms/" + r.id;
    const uploaded = await call(
      base + "/documents",
      { title: "Generated test PDF", pdf: fixturePDF() },
      r.token,
    );
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.pages, 1);
    const result = await call(
      base + "/search",
      { question: "backups retained" },
      r.token,
    );
    assert.equal(result.body.passages[0].page, 1);
    assert.match(result.body.passages[0].quote, /30 days/);
  }));
