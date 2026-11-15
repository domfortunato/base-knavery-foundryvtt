#!/usr/bin/env node
/**
 * The Babele template (localization plan, Phase 2, 2026-11-15): every translatable entry of the
 * system's compendia, in Babele's format, with the English as the starting text. A translator copies
 * babele-template/ into a Babele translation module (TRANSLATING.md), translates the values, and
 * Babele rewrites the compendia in place for that language.
 *
 * Entries are keyed by their English names, Babele's default. Those names are frozen with the ids
 * (tools/dev/ids-check.mjs: the generator hashes the ids from them), and the system finds what it
 * needs by key flags (module/keys.js), so a translated name breaks nothing.
 *
 * What goes in: names; item and career descriptions; each table's description and rows (by range);
 * the bestiary's names, attacks text and attack names; the Guide's pages. No Knave 2e text exists
 * in the packs (its tables ship empty), so none can reach a template.
 *
 *   node tools/content/build-babele-template.mjs           write babele-template/
 *   node tools/content/build-babele-template.mjs --check   fail when babele-template/ is out of date
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const yaml = createRequire(import.meta.url)("js-yaml");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
const outDir = path.join(root, "babele-template");
const check = process.argv.includes("--check");

const docsOf = (pack) => {
  const dir = path.join(root, "src/packs", pack);
  return fs.readdirSync(dir).filter((f) => f.endsWith(".yml")).sort()
    .map((f) => yaml.load(fs.readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "en"));
};
const range = (r) => `${r.range[0]}-${r.range[1]}`;
const put = (o, k, v) => { if (typeof v === "string" && v.trim()) o[k] = v; };

/** The fields Babele maps beyond its defaults, per document type (Babele's `mapping`). */
const MAPPING = {
  Item: { description: "system.description" },
  Actor: { description: "system.description", attacksText: "system.attacksText" },
};

const entryOf = (type, d) => {
  const e = { name: d.name };
  if (type === "Item") put(e, "description", d.system?.description);
  if (type === "Actor") {
    put(e, "description", d.system?.description);
    put(e, "attacksText", d.system?.attacksText);
    const items = {};
    for (const i of d.items ?? []) items[i.name] = { name: i.name };
    if (Object.keys(items).length) e.items = items;
  }
  if (type === "RollTable") {
    put(e, "description", d.description);
    const results = {};
    // Rows that link a document take its name from the document (translated in its own pack).
    // A row with a description (a Knave 1e spell's effect) gives both, as an object; check it against
    // the Babele version of the first real translation (TRANSLATING.md).
    for (const r of d.results ?? []) {
      if (r.type === "document" || !r.name) continue;
      results[range(r)] = r.description?.trim() ? { name: r.name, description: r.description } : r.name;
    }
    if (Object.keys(results).length) e.results = results;
  }
  if (type === "JournalEntry") {
    const pages = {};
    for (const p of d.pages ?? []) pages[p.name] = { name: p.name, text: p.text?.content ?? "" };
    e.pages = pages;
  }
  return e;
};

const files = new Map();
for (const p of manifest.packs ?? []) {
  const entries = {};
  for (const d of docsOf(p.name)) entries[d.name] = entryOf(p.type, d);
  const body = { label: p.label, ...(MAPPING[p.type] ? { mapping: MAPPING[p.type] } : {}), entries };
  files.set(`${manifest.id}.${p.name}.json`, `${JSON.stringify(body, null, 2)}\n`);
}

if (check) {
  const stale = [...files].filter(([f, text]) => {
    const file = path.join(outDir, f);
    return !fs.existsSync(file) || fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") !== text;
  }).map(([f]) => f);
  if (stale.length) {
    console.error(`babele: babele-template/ is out of date (${stale.join(", ")}); run npm run build:babele`);
    process.exit(1);
  }
  console.log(`babele: the template matches the packs (${files.size} files).`);
} else {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [f, text] of files) fs.writeFileSync(path.join(outDir, f), text);
  console.log(`babele: wrote ${files.size} files to babele-template/.`);
}
