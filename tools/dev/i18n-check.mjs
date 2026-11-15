#!/usr/bin/env node
/**
 * The i18n gate.
 *   - Every static KNAVERY.* key used in module/ and templates/ resolves to a
 *     STRING in lang/en.json (a key naming a section would print raw).
 *   - Keys built at runtime (`KNAVERY.Ability.${k}`) are checked against the
 *     arrays they are built from, imported from module/config.js rather than
 *     copied, so a new armor type or role without its key fails here.
 *   - TYPES.<Doc>.<type> exists for every sub-type in system.json documentTypes.
 *   - game.i18n.format("KEY", { … }) and {{localize "KEY" a=…}} pass every
 *     {placeholder} the string has (a missing one prints "undefined").
 *   - The disclaimer is the same sentence in en.json, README.md and LICENSE.txt.
 *   - Plural keys (module/i18n.js P) are sections of plural forms with an `other`; one is used
 *     only through P("KEY", n …) or {{knPlural "KEY" n}} (localize would print the key).
 *   - Every other lang/*.json (translations): no key English lacks (plural forms aside), no
 *     {placeholder} English lacks, the same HTML tags, and listed in system.json. Missing keys
 *     are not errors (Foundry falls back to English): the coverage is printed, and
 *     `--status` lists each language's missing keys for its translator.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const en = JSON.parse(fs.readFileSync(path.join(root, "lang/en.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
const config = await import(pathToFileURL(path.join(root, "module/config.js")).href);

const lookup = (key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), en);
const has = (key) => typeof lookup(key) === "string";
const PLURAL_FORMS = ["zero", "one", "two", "few", "many", "other"];
/** A plural section: only plural forms, all strings, `other` among them. */
const isPluralSection = (v) => !!v && typeof v === "object" && typeof v.other === "string"
  && Object.entries(v).every(([k, s]) => PLURAL_FORMS.includes(k) && typeof s === "string");
const isPlural = (key) => isPluralSection(lookup(key));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = [...walk(path.join(root, "module")), ...walk(path.join(root, "templates"))]
  .filter((f) => /\.(js|mjs|html|hbs)$/.test(f));

const missing = new Map();
const problems = [];

/* Static keys */
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/KNAVERY\.[A-Za-z0-9_.]+/g)) {
    const key = m[0].replace(/\.$/, "");
    // Prefixes followed by a ${…} template are dynamic, checked below.
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (after.startsWith("${") || after.startsWith("\"") && m[0].endsWith(".")) continue;
    if (m[0].endsWith(".")) continue;
    if (isPlural(key)) {
      const before = text.slice(Math.max(0, m.index - 12), m.index);
      if (!/(\bP\(\s*"|knPlural\s+"|\? "|: ")$/.test(before)) problems.push(`${path.relative(root, f)}: ${key} is a plural; use P("${key}", n) or knPlural`);
      continue;
    }
    if (!has(key)) missing.set(key, path.relative(root, f));
  }
}

/* Dynamic keys, from the arrays the code builds them from */
const { ABILITIES, ARMOR_TYPES, NPC_ROLES, FEATURE_TYPES, HAZARD_DICE, SAVE_CATEGORIES, LEVELS, TABLES } = config;
// HIRELINGS lives in npc-generator.js, which needs Foundry to load: read its keys from the source.
const npcSource = fs.readFileSync(path.join(root, "module/npc-generator.js"), "utf8");
const hirelingKeys = [...(npcSource.match(/export const HIRELINGS = \{([\s\S]*?)^\};/m)?.[1] ?? "").matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
if (hirelingKeys.length < 2) problems.push("i18n-check: could not read HIRELINGS from module/npc-generator.js");
const DYNAMIC = {
  "KNAVERY.Ability": ABILITIES,
  "KNAVERY.AbilityShort": ABILITIES,
  "KNAVERY.AbilityHint": ABILITIES,
  "KNAVERY.Save": Object.keys(SAVE_CATEGORIES),
  "KNAVERY.LevelTitle": LEVELS.map((r) => String(r.level)),
  "KNAVERY.Role": NPC_ROLES,
  "KNAVERY.Offer.State": ["open", "accepted", "declined", "cancelled", "lapsed"],
  "KNAVERY.Hazard.Face": [...new Set(Object.values(HAZARD_DICE).flat())],
  "KNAVERY.Hazard": Object.keys(HAZARD_DICE),
  "KNAVERY.Hazard.Hint": [...new Set(Object.values(HAZARD_DICE).flat())],
  "KNAVERY.Hazard.Apply": ["fatigue", "burn", "depletion"],
  "KNAVERY.FeatureType": FEATURE_TYPES,
  "KNAVERY.ArmorType": ARMOR_TYPES,
  "KNAVERY.RulebookTables.Status": ["new", "replace", "keep"],
  "KNAVERY.Trait": Object.keys(TABLES.traits),
  "KNAVERY.Npc.Hireling": hirelingKeys,
  "KNAVERY.Npc.Hint": ["monster", "person", "hireling"],
  "KNAVERY.RulebookSpells": ["Spellbooks", "Scrolls"],
  "KNAVERY.Roll": ["Advantage", "Disadvantage"],
  "KNAVERY.ItemKind": config.ITEM_KINDS,
  "KNAVERY.Badge": ["weapon", "armor", "spellbook", "scroll", "magic", "relic", "potion"],
};
for (const [prefix, keys] of Object.entries(DYNAMIC)) {
  for (const k of keys) if (!has(`${prefix}.${k}`)) missing.set(`${prefix}.${k}`, "(dynamic)");
}

/* TYPES.<Doc>.<type> for every declared sub-type */
for (const [doc, types] of Object.entries(manifest.documentTypes ?? {})) {
  for (const type of Object.keys(types)) if (!has(`TYPES.${doc}.${type}`)) missing.set(`TYPES.${doc}.${type}`, "system.json");
}

/* Settings: every registered label needs a name; its hint key is optional (settings.js shows no hint when it is absent). */
const settings = fs.readFileSync(path.join(root, "module/settings.js"), "utf8");
for (const m of settings.matchAll(/label: "(\w+)"/g)) {
  const k = `KNAVERY.Settings.${m[1]}`;
  if (!has(k)) missing.set(k, "settings.js");
}

/* Placeholders passed where a static key is formatted */
const placeholdersOf = (v) => [...new Set([...(typeof v === "string" ? v : Object.values(v ?? {}).join(" ")).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
const placeholders = (key) => placeholdersOf(lookup(key));
const objectKeys = (body) => [...body.matchAll(/(?:^|,)\s*(\w+)\s*(?=[:,]|$)/g)].map((m) => m[1]);
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const rel = path.relative(root, f);
  // F("KEY", { a, b: … }) and game.i18n.format("KEY", { … }) with a one-level literal
  for (const m of text.matchAll(/(?:\bF|i18n\.format)\(\s*"(KNAVERY\.[\w.]+)"\s*,\s*\{([^{}]*)\}/g)) {
    const given = new Set(objectKeys(m[2]));
    for (const p of placeholders(m[1])) if (!given.has(p)) problems.push(`${rel}: ${m[1]} needs {${p}}`);
  }
  // P("KEY", count, { a, b }) and P("KEY", count): {n} is the count; a form may leave a placeholder out.
  for (const m of text.matchAll(/\bP\(\s*(?:[^"(),]*\?\s*)?"(KNAVERY\.[\w.]+)"[^,]*,\s*[^,{}()]+(?:\([^()]*\))?\s*(?:,\s*\{([^{}]*)\})?\s*\)/g)) {
    if (!isPlural(m[1])) { problems.push(`${rel}: P() on ${m[1]}, which is not a plural section`); continue; }
    const given = new Set(["n", ...objectKeys(m[2] ?? "")]);
    for (const p of placeholders(m[1])) if (!given.has(p)) problems.push(`${rel}: ${m[1]} needs {${p}}`);
  }
  // {{localize "KEY" a=…}} in templates
  for (const m of text.matchAll(/\{\{\s*localize\s+["'](KNAVERY\.[\w.]+)["']([^}]*)\}\}/g)) {
    const given = new Set([...m[2].matchAll(/(\w+)=/g)].map((x) => x[1]));
    const want = placeholders(m[1]);
    if (!want.length) continue;
    for (const p of want) if (!given.has(p)) problems.push(`${rel}: ${m[1]} needs ${p}=`);
  }
}

/* The disclaimer, one sentence in three places */
const squash = (s) => String(s ?? "").replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
const disclaimer = squash(lookup("KNAVERY.Disclaimer"));
for (const file of ["README.md", "LICENSE.txt"]) {
  if (!squash(fs.readFileSync(path.join(root, file), "utf8")).includes(disclaimer)) {
    problems.push(`${file}: does not carry KNAVERY.Disclaimer verbatim ("${disclaimer}")`);
  }
}

/* Translations: every other lang/*.json */
const leaves = (o, prefix = "", out = new Map()) => {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else if (v && typeof v === "object") leaves(v, key, out);
  }
  return out;
};
const tags = (s) => [...String(s).matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)].map((m) => m[1].toLowerCase()).sort().join(",");
const enLeaves = leaves(en);
const listed = new Set((manifest.languages ?? []).map((l) => l.path));
const coverage = [];
const status = process.argv.includes("--status");
for (const file of fs.readdirSync(path.join(root, "lang")).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const rel = `lang/${file}`;
  if (!listed.has(rel)) problems.push(`${rel}: not listed in system.json languages`);
  const tr = leaves(JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")));
  for (const [key, s] of tr) {
    const parent = key.slice(0, key.lastIndexOf("."));
    const pluralForm = isPlural(parent) && PLURAL_FORMS.includes(key.slice(key.lastIndexOf(".") + 1));
    const source = pluralForm ? lookup(parent) : enLeaves.get(key);
    if (source === undefined) { problems.push(`${rel}: ${key} is not an English key`); continue; }
    const allowed = new Set(placeholdersOf(source));
    for (const p of placeholdersOf(s)) if (!allowed.has(p)) problems.push(`${rel}: ${key} has {${p}}, which English does not pass`);
    const want = tags(typeof source === "string" ? source : source.other);
    if (tags(s) !== want) problems.push(`${rel}: ${key} has other HTML tags than English (${want || "none"})`);
  }
  const gaps = [...enLeaves.keys()].filter((k) => {
    if (tr.has(k)) return false;
    const parent = k.slice(0, k.lastIndexOf("."));
    return !(isPlural(parent) && tr.has(`${parent}.other`));
  });
  coverage.push(`${file.replace(/\.json$/, "")} ${Math.round(100 * (1 - gaps.length / enLeaves.size))}%`);
  if (status) { console.log(`
${rel}: ${gaps.length} missing`); for (const k of gaps) console.log(`  ${k}`); }
}

if (missing.size || problems.length) {
  for (const [k, f] of missing) console.error(`  missing ${k}   (${f})`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n${missing.size} missing i18n keys, ${problems.length} other problems.`);
  process.exit(1);
}
console.log(`i18n: every key resolves${coverage.length ? `; translations ${coverage.join(", ")}` : ""}.`);
