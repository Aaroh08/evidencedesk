import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, openSync, closeSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function snapshot(source, destination) {
  const target = resolve(destination);
  if (resolve(source) === target)
    throw Error("Backup must use a different file");
  const db = new DatabaseSync(source, { readOnly: true });
  let reserved = false;
  try {
    mkdirSync(dirname(target), { recursive: true });
    // Exclusive creation prevents overwriting a prior backup or live database.
    closeSync(openSync(target, "wx", 0o600));
    reserved = true;
    await backup(db, target);
    const check = new DatabaseSync(target, { readOnly: true });
    try {
      if (
        check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
      )
        throw Error("Backup integrity check failed");
    } finally {
      check.close();
    }
    return target;
  } catch (error) {
    if (reserved) unlinkSync(target);
    throw error;
  } finally {
    db.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const destination = process.argv[2] || `backups/${Date.now()}.sqlite`;
  console.log(
    await snapshot(process.env.DATA_FILE || "data/app.sqlite", destination),
  );
}
