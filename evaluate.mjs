import { search } from "./src/retrieval.mjs";
import { writeFileSync } from "node:fs";
const docs = [
  {
    id: "retention",
    title: "Fictional IT policy",
    version: 1,
    sha: "fixture",
    pages: [
      "Backups are retained for 30 days. Recovery requests require the project name.",
      "Lost devices must be reported within 24 hours. Access reviews take place every semester.",
    ],
  },
  {
    id: "events",
    title: "Fictional event handbook",
    version: 1,
    sha: "fixture",
    pages: [
      "Workshop registration closes on Friday. Each workshop admits 40 students.",
      "Projector reservations require approval from the club secretary.",
    ],
  },
];
const cases = [
  ["How long are backups retained?", "retention", 1],
  ["What do recovery requests require?", "retention", 1],
  ["When must lost devices be reported?", "retention", 2],
  ["When are access reviews?", "retention", 2],
  ["When does workshop registration close?", "events", 1],
  ["Who approves projector reservations?", "events", 2],
  ["quantum entanglement", null, null],
  ["scholarship eligibility", null, null],
  ["What is the?", null, null],
  ["How many days do we keep copies?", "retention", 1],
];
const rows = cases.map(([question, id, page]) => {
  const start = performance.now();
  const result = search(docs, question);
  const first = result.passages[0];
  return {
    question,
    expected: { id, page },
    observed: first ? { id: first.documentId, page: first.page } : null,
    status: result.status,
    correct:
      id === null
        ? result.status === "insufficient_evidence"
        : first?.documentId === id && first?.page === page,
    latency_ms: performance.now() - start,
  };
});
const report = {
  description:
    "Authored ten-question diagnostic; not an independent benchmark. Last question intentionally uses synonyms to expose lexical retrieval limitations.",
  correct: rows.filter((r) => r.correct).length,
  total: rows.length,
  rows,
};
writeFileSync(
  "artifacts/retrieval-evaluation.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ correct: report.correct, total: report.total }));
