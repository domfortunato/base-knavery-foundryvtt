#!/usr/bin/env node
/**
 * Every HTMLField in module/data-models.js must be listed under htmlFields in
 * system.json (the server never loads the data models, so an unlisted HTML
 * field is never sanitized), and every listed field must exist.
 * Static parse: the models build HTML fields only through `html()`.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
const src = fs.readFileSync(path.join(root, "module/data-models.js"), "utf8");

// Map each class to the html() fields it declares (including universal()).
const universalHtml = [...(src.match(/const universal = \(\) => \(\{([\s\S]*?)\}\);/)?.[1] ?? "").matchAll(/(\w+): html\(\)/g)].map((m) => m[1]);
const classes = {};
for (const m of src.matchAll(/export class (\w+) extends [\s\S]*?static defineSchema\(\) \{([\s\S]*?)\n  \}/g)) {
  const body = m[2];
  const own = [...body.matchAll(/(\w+): html\(\)/g)].map((x) => x[1]);
  classes[m[1]] = [...new Set([...own, ...(body.includes("...universal()") ? universalHtml : [])])];
}
const map = {
  Actor: { character: "CharacterData", npc: "NpcData" },
  Item: { item: "ItemData", weapon: "WeaponData", armor: "ArmorData", spellbook: "SpellbookData", career: "CareerData", transport: "TransportData" },
};
let bad = 0;
for (const [doc, types] of Object.entries(map)) {
  for (const [type, cls] of Object.entries(types)) {
    const declared = new Set(manifest.documentTypes?.[doc]?.[type]?.htmlFields ?? []);
    const actual = new Set(classes[cls] ?? []);
    for (const f of actual) if (!declared.has(f)) { console.error(`  ${doc}.${type}: HTML field "${f}" missing from system.json htmlFields`); bad++; }
    for (const f of declared) if (!actual.has(f)) { console.error(`  ${doc}.${type}: htmlFields lists "${f}" but the model has no such HTML field`); bad++; }
  }
}
if (bad) process.exit(1);
console.log("fields: htmlFields match the data models.");
