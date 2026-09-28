#!/usr/bin/env node
/**
 * Every static KNAVERY.* key used in module/ and templates/ must exist in
 * lang/en.json. Keys built at runtime (`KNAVERY.Ability.${k}`) are checked
 * through the DYNAMIC table below.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "..");
const en = JSON.parse(fs.readFileSync(path.join(root, "lang/en.json"), "utf8"));
const has = (key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), en) !== undefined;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = [...walk(path.join(root, "module")), ...walk(path.join(root, "templates"))]
  .filter((f) => /\.(js|mjs|html|hbs)$/.test(f));
const missing = new Map();
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/KNAVERY\.[A-Za-z0-9_.]+/g)) {
    const key = m[0].replace(/\.$/, "");
    // Prefixes followed by a ${…} template are dynamic, checked below.
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (after.startsWith("${") || after.startsWith("\"") && m[0].endsWith(".")) continue;
    if (m[0].endsWith(".")) continue;
    if (!has(key)) missing.set(key, path.relative(root, f));
  }
}
const DYNAMIC = {
  "KNAVERY.Ability": ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
  "KNAVERY.AbilityShort": ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
  "KNAVERY.Save": ["paralysis", "blast", "poison", "device", "spell"],
  "KNAVERY.LevelTitle": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  "KNAVERY.Role": ["monster", "npc", "hireling", "companion"],
  "KNAVERY.Offer.State": ["open", "accepted", "declined", "cancelled", "lapsed"],
  "KNAVERY.Hazard.Face": ["encounter", "fatigue", "depletion", "burn", "shift", "sign", "free"],
  "KNAVERY.Hazard": ["dungeon", "travel"],
  "KNAVERY.FeatureType": ["text", "number", "checkbox", "track", "die"],
  "KNAVERY.ArmorType": ["shield", "helmet", "gambeson", "mail", "breastplate", "armPlate", "legPlate", "other"],
  "KNAVERY.Trait": ["physique", "face", "skin", "hair", "clothing", "virtue", "vice", "speech", "background", "misfortune"],
};
for (const [prefix, keys] of Object.entries(DYNAMIC)) {
  for (const k of keys) if (!has(`${prefix}.${k}`)) missing.set(`${prefix}.${k}`, "(dynamic)");
}
// Settings: every registered label needs name + hint.
const settings = fs.readFileSync(path.join(root, "module/settings.js"), "utf8");
for (const m of settings.matchAll(/label: "([A-Za-z]+)"/g)) {
  for (const k of [`KNAVERY.Settings.${m[1]}`, `KNAVERY.Settings.${m[1]}Hint`]) if (!has(k)) missing.set(k, "settings.js");
}
if (missing.size) {
  for (const [k, f] of missing) console.error(`  missing ${k}   (${f})`);
  console.error(`\n${missing.size} missing i18n keys.`);
  process.exit(1);
}
console.log("i18n: every key resolves.");
