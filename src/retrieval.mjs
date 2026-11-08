const stop = new Set(
  "a an the is are was were of in on for to and or what how does do can with from it this that be as".split(
    " ",
  ),
);
export const tokens = (s) =>
  (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(
    (t) => t.length > 1 && !stop.has(t),
  );
export function search(documents, question) {
  const query = [...new Set(tokens(question))];
  if (!query.length)
    return {
      status: "insufficient_evidence",
      passages: [],
      answer: "Ask a more specific question.",
    };
  const chunks = [];
  for (const d of documents)
    for (let i = 0; i < d.pages.length; i++) {
      const words = d.pages[i].split(/\s+/);
      for (let start = 0; start < words.length; start += 100) {
        const quote = words.slice(start, start + 140).join(" ");
        if (quote.trim())
          chunks.push({
            documentId: d.id,
            title: d.title,
            version: d.version,
            sha: d.sha,
            page: i + 1,
            quote,
            terms: tokens(quote),
          });
      }
    }
  const avg =
    chunks.reduce((s, c) => s + c.terms.length, 0) / (chunks.length || 1);
  const df = new Map(
    query.map((t) => [t, chunks.filter((c) => c.terms.includes(t)).length]),
  );
  const scored = chunks
    .map((c) => {
      let score = 0,
        matched = 0;
      for (const term of query) {
        const tf = c.terms.filter((t) => t === term).length;
        if (tf) {
          matched++;
          const idf = Math.log(
            1 + (chunks.length - df.get(term) + 0.5) / (df.get(term) + 0.5),
          );
          score +=
            (idf * (tf * 2.2)) /
            (tf + 1.2 * (0.25 + (0.75 * c.terms.length) / (avg || 1)));
        }
      }
      const { terms, ...rest } = c;
      return { ...rest, score, coverage: matched / query.length };
    })
    .filter((c) => c.score > 0 && c.coverage >= 0.5)
    .sort((a, b) => b.score - a.score);
  const passages = [];
  for (const c of scored) {
    if (
      !passages.some((p) => p.documentId === c.documentId && p.page === c.page)
    )
      passages.push(c);
    if (passages.length === 5) break;
  }
  return passages.length
    ? {
        status: "evidence_found",
        answer:
          "Relevant source excerpts follow. They are retrieved evidence, not a generated conclusion. Check context and conflicting sources before drawing conclusions.",
        passages,
      }
    : {
        status: "insufficient_evidence",
        answer:
          "Insufficient evidence in this collection. Try different terms or add a relevant source.",
        passages: [],
      };
}
