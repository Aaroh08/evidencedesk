# Five-minute demo

1. Start EvidenceDesk, create a named workspace, and explain who can use an invite.
2. Create a research collection. Load the fictional sample and add it to the collection. Ask how long backups are retained, inspect the cited page, then ask about an unrelated topic. Add an edited source with the same title and compare current versus historical versions.
3. Show the recorded tests and one failure case instead of only the happy path.
4. Explain local persistence, the synchronization interval and a tradeoff.
5. Finish with the actual limitations and the next engineering improvement.

## Questions to prepare for

1. Why use Yjs? Concurrent text updates need deterministic merging across disconnected clients.
2. Why use SQLite? It makes a single-instance demo reproducible; it does not solve distributed scaling.
3. Are invite links user accounts? No. They are shared bearer capabilities with equal permissions.
4. What happens on reconnect? The local CRDT state merges with the persisted server state; retrying an identical update adds no new revision.
5. What if two users modify one task field? Yjs resolves competing map values deterministically; both user intentions are not necessarily preserved.
6. What does persistence protect against? Process restart after a completed commit. It does not protect against disk failure or browser storage eviction.
7. Why keep checkpoints? They make prior server states inspectable, bounded to 100 to limit storage growth.
8. What does a passing test establish? Only the specified behavior under the test conditions; it is not a security or uptime guarantee.
9. What is your largest project-specific limitation? Retrieval is lexical and extractive, not semantic or generative. It can miss synonyms and may return passages that mention a topic without answering the question. Query term coverage is a heuristic, not calibrated confidence. The tool does not determine truth, reconcile contradictions or guarantee answer support. OCR, web crawling, embeddings and external AI APIs are not implemented. Research search requires the server; only the notebook supports offline editing.
10. What would you improve before launch? Named-user access, resource enforcement, operational monitoring and deployment testing.

## Exercises

- Explain a CRDT merge using two conflicting edits and show the final state.
- Add a meaningful regression test for a new bug without copying implementation details.
- Measure synchronization bytes as a document grows and propose a state-vector improvement.
- Practice restoring a database backup into a separate local copy.
- Implement one missing production requirement and document its failure modes.

## CV wording

Built EvidenceDesk, a evidence-based research workspace application with persistent workspaces, capability-based access and tested synchronization behavior.

Only add usage, latency or scale numbers after measuring them. Do not describe this project as production deployed or used by real customers unless that becomes true. Built with AI assistance; understand and be able to modify the code before presenting it in an interview.
