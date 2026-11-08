import { $, boot, context, api, notice, escape, bindText } from "./shared.js";
boot(() => {
  const { session, doc } = context();
  const base = "/rooms/" + session.id;
  $("#mode").textContent = "Source-first · no API key";
  $("#content").innerHTML =
    `<div class="columns"><section><div class="panel"><h2>Ask your collection</h2><p class="muted">Local lexical retrieval with BM25 ranking. Answers are verbatim evidence passages, not AI-generated claims.</p><form id="search"><label>Research question<input id="question" required minlength="3" maxlength="500" placeholder="How long are backups retained?"></label><button class="primary">Find evidence →</button></form><label><input type="checkbox" id="history" style="width:auto"> Include superseded document versions</label><div id="answer" aria-live="polite"><p class="muted">Add a source, then ask a question.</p></div></div><div class="panel"><h2>Research notebook</h2><textarea id="notes" aria-label="Research notes" placeholder="Your conclusions and follow-up questions…"></textarea></div></section><section><div class="panel"><h2>Add a source</h2><p class="muted">Paste text or upload a text-based PDF (up to 2 MB / 80 pages). A repeated title creates a new version.</p><label>Source title<input id="title" maxlength="120" placeholder="Club handbook"></label><label>Source text<textarea id="text" placeholder="Paste text you have permission to use…"></textarea></label><label>Or PDF file<input type="file" id="pdf" accept="application/pdf"></label><div class="toolbar"><button class="primary" id="add">Add to collection</button><button id="sample">Load fictional sample</button></div></div><div class="panel"><h2>Source library</h2><div id="documents"></div></div></section></div><section class="panel" id="source-panel" hidden><h2 id="source-title"></h2><pre id="source-text"></pre></section>`;
  bindText($("#notes"), doc.getText("notes"));
  const list = async () => {
    try {
      const documents = await api(base + "/documents");
      $("#documents").innerHTML =
        documents
          .map(
            (d) =>
              `<div class="card"><strong>${escape(d.title)}</strong><p class="muted">Version ${d.version} · ${escape(d.created.slice(0, 10))}</p><button data-source="${d.id}">Inspect source</button></div>`,
          )
          .join("") || '<p class="muted">Your source library is empty.</p>';
    } catch (e) {
      notice(e.message);
    }
  };
  list();
  $("#sample").onclick = () => {
    $("#title").value = "Fictional Campus IT Handbook";
    $("#text").value =
      "Backup policy. Campus project backups are retained for 30 days. Backups run nightly at 02:00. Recovery requests must include the project name.\fAccess policy. Student contributors use individual accounts. Workspace owners review membership every semester. Lost devices must be reported within 24 hours.";
    $("#question").value = "How long are backups retained?";
  };
  $("#add").onclick = async () => {
    const b = $("#add");
    b.disabled = true;
    try {
      const data = { title: $("#title").value };
      const file = $("#pdf").files[0];
      if (file) {
        if (file.size > 2000000) throw Error("PDF limit is 2 MB");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let value = "";
        for (const n of bytes) value += String.fromCharCode(n);
        data.pdf = btoa(value);
      } else data.text = $("#text").value;
      const result = await api(base + "/documents", data);
      notice(
        result.duplicate
          ? "Identical source already exists."
          : "Source indexed successfully.",
      );
      await list();
    } catch (e) {
      notice(e.message);
    } finally {
      b.disabled = false;
    }
  };
  let last = null;
  $("#search").onsubmit = async (e) => {
    e.preventDefault();
    try {
      last = await api(base + "/search", {
        question: $("#question").value,
        includeHistory: $("#history").checked,
      });
      $("#answer").innerHTML =
        `<p>${escape(last.answer)}</p>` +
        last.passages
          .map(
            (p, i) =>
              `<article class="source"><strong>[${i + 1}] ${escape(p.title)} · v${p.version} · page ${p.page}</strong><p>${escape(p.quote)}</p><small>Query term coverage ${Math.round(p.coverage * 100)}% · SHA256 ${p.sha.slice(0, 12)}</small><div class="toolbar"><button data-source="${p.documentId}" data-page="${p.page}">Open cited page</button></div></article>`,
          )
          .join("");
    } catch (e) {
      notice(e.message);
    }
  };
  $("#content").addEventListener("click", async (e) => {
    if (!e.target.dataset.source) return;
    try {
      const d = await api(base + "/documents/" + e.target.dataset.source);
      const page = Number(e.target.dataset.page || 1);
      $("#source-panel").hidden = false;
      $("#source-title").textContent =
        d.title + " · version " + d.version + " · page " + page;
      $("#source-text").textContent = d.pages[page - 1];
      $("#source-panel").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      notice(e.message);
    }
  });
}).catch((e) => notice(e.message));
