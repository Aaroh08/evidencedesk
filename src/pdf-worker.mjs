import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
process.once("message", async ({ base64 }) => {
  let doc;
  try {
    doc = await getDocument({
      data: new Uint8Array(Buffer.from(base64, "base64")),
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
    if (doc.numPages > 80) throw Error("PDF exceeds 80 pages");
    const pages = [];
    let total = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((i) => i.str || "").join(" ");
      total += text.length;
      if (total > 500000) throw Error("Extracted text exceeds 500k characters");
      pages.push(text);
    }
    if (!pages.some((p) => p.trim()))
      throw Error("No extractable text; scanned PDFs need OCR");
    process.send({ pages });
  } catch (e) {
    process.send({ error: String(e.message).slice(0, 300) });
  } finally {
    await doc?.destroy();
    process.disconnect();
  }
});
