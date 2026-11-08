import { createApp, finish } from "./core.mjs";
import { createHash, randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { search } from "./retrieval.mjs";
function parsePDF(base64) {
  return new Promise((resolve, reject) => {
    const child = fork(new URL("./pdf-worker.mjs", import.meta.url), [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: ["--max-old-space-size=160"],
    });
    let done = false;
    const end = (err, pages) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      err ? reject(Error(err)) : resolve(pages);
    };
    const timer = setTimeout(
      () => end("PDF processing exceeded 15 seconds"),
      15000,
    );
    child.on("message", (r) => end(r.error, r.pages));
    child.on("error", () => end("PDF processing failed"));
    child.on("exit", () => end("PDF worker stopped"));
    child.send({ base64 });
  });
}
export function application(options) {
  const s = createApp(options),
    { app, db } = s;
  let parsing = false;
  app.get("/api/rooms/:id/documents", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT id,title,version,sha,created FROM documents WHERE room=? ORDER BY created DESC",
        )
        .all(req.room.id),
    ),
  );
  app.post("/api/rooms/:id/documents", async (req, res) => {
    const { title, text, pdf } = req.body;
    if (typeof title !== "string" || !title.trim() || title.length > 120)
      return res
        .status(400)
        .json({ error: "Document title must contain 1–120 characters" });
    if (
      db
        .prepare("SELECT count(*) n FROM documents WHERE room=?")
        .get(req.room.id).n >= 40
    )
      return res
        .status(413)
        .json({ error: "Collection limit is 40 document versions" });
    let pages;
    try {
      if (pdf !== undefined) {
        if (typeof pdf !== "string" || pdf.length > 2800000)
          return res.status(413).json({ error: "PDF limit is 2 MB" });
        if (parsing)
          return res
            .status(429)
            .json({ error: "Another PDF is being processed; retry shortly" });
        parsing = true;
        try {
          pages = await parsePDF(pdf);
        } finally {
          parsing = false;
        }
      } else {
        if (typeof text !== "string" || !text.trim() || text.length > 500000)
          return res
            .status(400)
            .json({ error: "Provide 1–500,000 characters of text" });
        pages = text.split("\f");
        if (pages.length > 80)
          return res.status(400).json({ error: "Maximum 80 pages" });
      }
      const sha = createHash("sha256")
        .update(JSON.stringify(pages))
        .digest("hex");
      const old = db
        .prepare("SELECT id FROM documents WHERE room=? AND sha=?")
        .get(req.room.id, sha);
      if (old) return res.json({ id: old.id, duplicate: true });
      const version = db
        .prepare(
          "SELECT COALESCE(MAX(version),0)+1 v FROM documents WHERE room=? AND title=?",
        )
        .get(req.room.id, title.trim()).v;
      const id = randomUUID();
      db.prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?)").run(
        id,
        req.room.id,
        title.trim(),
        version,
        sha,
        JSON.stringify(pages),
        new Date().toISOString(),
      );
      res.status(201).json({ id, version, pages: pages.length, sha });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/rooms/:id/documents/:doc", (req, res) => {
    const d = db
      .prepare("SELECT * FROM documents WHERE id=? AND room=?")
      .get(req.params.doc, req.room.id);
    if (!d) return res.status(404).json({ error: "Source not found" });
    res.json({ ...d, pages: JSON.parse(d.pages) });
  });
  app.post("/api/rooms/:id/search", (req, res) => {
    const q = req.body.question;
    if (typeof q !== "string" || q.trim().length < 3 || q.length > 500)
      return res
        .status(400)
        .json({ error: "Question must contain 3–500 characters" });
    let docs = db
      .prepare("SELECT * FROM documents WHERE room=? ORDER BY version DESC")
      .all(req.room.id);
    if (!req.body.includeHistory) {
      const titles = new Set();
      docs = docs.filter((d) => {
        if (titles.has(d.title)) return false;
        titles.add(d.title);
        return true;
      });
    }
    res.json(
      search(
        docs.map((d) => ({ ...d, pages: JSON.parse(d.pages) })),
        q,
      ),
    );
  });
  finish(s);
  return s;
}
if (process.argv[1]?.endsWith("server.mjs")) {
  const s = application();
  s.app.listen(s.config.port, "127.0.0.1", () =>
    console.log("EvidenceDesk http://127.0.0.1:" + s.config.port),
  );
}
