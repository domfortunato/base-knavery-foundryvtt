#!/usr/bin/env node
/**
 * The compendium ids are frozen (localization plan, Phase 0, 2026-11-15). The content
 * generator hashes each id from the English name, and translations (Babele) and every
 * @UUID link find documents by id, so renaming a document in the generator would break
 * them all. This check fails when an id in tools/content/ids.lock.json is gone from
 * src/packs; new ids are fine. `--update` adds the new ones to the lock (never removes).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const yaml = createRequire(import.meta.url)("js-yaml");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lockPath = path.join(root, "tools/content/ids.lock.json");
const packsDir = path.join(root, "src/packs");

/** Every id in a document, nested ones (pages, results, items) with their parent's. */
const idsOf = (doc, prefix, out) => {
  if (!doc || typeof doc !== "object") return;
  const here = typeof doc._id === "string" ? `${prefix}/${doc._id}` : prefix;
  if (here !== prefix) out.add(here);
  for (const v of Object.values(doc)) {
    if (Array.isArray(v)) for (const x of v) idsOf(x, here, out);
  }
};

const now = new Set();
for (const pack of fs.readdirSync(packsDir)) {
  const dir = path.join(packsDir, pack);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".yml"))) {
    idsOf(yaml.load(fs.readFileSync(path.join(dir, f), "utf8")), pack, now);
  }
}

const lock = fs.existsSync(lockPath) ? new Set(JSON.parse(fs.readFileSync(lockPath, "utf8"))) : new Set();
if (process.argv.includes("--update")) {
  const merged = [...new Set([...lock, ...now])].sort();
  fs.writeFileSync(lockPath, `${JSON.stringify(merged, null, 1)}\n`);
  console.log(`ids: lock holds ${merged.length} ids (${merged.length - lock.size} added).`);
  process.exit(0);
}
const gone = [...lock].filter((x) => !now.has(x));
if (gone.length) {
  console.error(`ids: ${gone.length} frozen compendium id(s) are gone from src/packs (a rename in the generator?):`);
  gone.slice(0, 20).forEach((x) => console.error(`  ${x}`));
  console.error("  Keep the generator's English names (they make the ids); translate through Babele or the language file.");
  process.exit(1);
}
const fresh = [...now].filter((x) => !lock.has(x)).length;
console.log(`ids: all ${lock.size} frozen ids present${fresh ? `; ${fresh} new (npm run check:ids -- --update to freeze them)` : ""}.`);
