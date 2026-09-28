#!/usr/bin/env node
/** system.json sanity: files it names exist, packs have sources, ids are consistent. */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "..");
const m = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
const errors = [];
if (m.id !== "base-knavery") errors.push(`id is "${m.id}"`);
for (const f of [...(m.esmodules ?? []), ...(m.styles ?? []).map((s) => s.src ?? s), ...(m.languages ?? []).map((l) => l.path)]) {
  if (!fs.existsSync(path.join(root, f))) errors.push(`missing file ${f}`);
}
const names = new Set();
for (const p of m.packs ?? []) {
  if (names.has(p.name)) errors.push(`duplicate pack ${p.name}`);
  names.add(p.name);
  if (p.path !== `packs/${p.name}`) errors.push(`pack ${p.name}: path should be packs/${p.name}`);
  if (!fs.existsSync(path.join(root, "src/packs", p.name))) errors.push(`pack ${p.name}: no src/packs/${p.name}`);
}
for (const f of m.packFolders ?? []) for (const p of f.packs ?? []) if (!names.has(p)) errors.push(`packFolders names unknown pack ${p}`);
if (errors.length) { errors.forEach((e) => console.error(`  ${e}`)); process.exit(1); }
console.log(`manifest: ok (${names.size} packs).`);
