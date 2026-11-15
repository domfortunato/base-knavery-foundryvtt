#!/usr/bin/env node
/**
 * The fresh world (0.3.0, plan item 14): a world no Game Master has opened plays Knave 1e as
 * written; then it gets the GM's real Knave 2e book: its tables built, the offer, the switch to 2e,
 * and what the switch leaves alone. Runs on the fleet's `base-knavery-fresh` row (world
 * `knavery-fresh`, the user's PDF staged into knavery-rulebook/ of that world's user data), never on
 * knavery-dev and never from the workstation (CLAUDE.md). The PDF is found in the folder, not named.
 *
 *   FOUNDRY_URL=http://<box>:30000 node tools/dev/e2e-fresh.mjs
 *
 *   1. The stamp: a new world plays Knave 1e, every rule at the 1e preset.
 *   2. A random knave the 1e way: lowest of 3d6, no careers, no coins, two rations and a weapon,
 *      a name from the system's list, 1e spells, 1e d6 initiative.
 *   3. The book: the PDF in knavery-rulebook/ is set, its tables read and written: Careers and
 *      Spells with 100 rows, the spell items compendium.
 *   4. The offer: Knave 2e rules? Yes. The world plays 2e; the stamp stays 1e; the old knave is
 *      untouched; a new knave gets careers and coins; the Spells table takes over from 1e's.
 *   5. A rebuild keeps the GM's edit and replaces an untouched table.
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { SHOTS, VIEWPORT, joinAsGM, watchErrors, watchdog } from "./lib.mjs";

const SYS = "/systems/base-knavery/module";
fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};

const browser = await chromium.launch();
watchdog(900000, "e2e-fresh", () => browser.close());
const gm = await (await browser.newContext({ viewport: VIEWPORT })).newPage();
const errors = [watchErrors(gm)];
await joinAsGM(gm);
await gm.waitForFunction(() => globalThis.game?.ready, null, { timeout: 60000 });
await gm.waitForTimeout(2000);
await gm.evaluate(() => foundry.applications.instances.get("knavery-welcome")?.close());

// 1. The stamp.
const stamp = await gm.evaluate(async (sys) => {
  const ns = "base-knavery";
  const R = await import(`${sys}/rules.js`);
  const { RULES_PRESETS } = await import(`${sys}/config.js`);
  const off = Object.entries(RULES_PRESETS["1e"]).filter(([k, v]) => game.settings.get(ns, k) !== v).map(([k]) => k);
  return {
    stamp: game.settings.get(ns, "rules-stamp"), rules: R.currentRules(), off, users: game.users.size,
    actors: game.actors.size, keys: (game.settings.get(ns, "rules-keys") ?? []).length,
  };
}, SYS);
ok(stamp.stamp === "1e" && stamp.rules === "1e" && stamp.off.length === 0 && stamp.keys > 10,
  "a world no GM had opened is stamped Knave 1e, every rule at the 1e preset", JSON.stringify(stamp));

// 2. A knave the 1e way.
const knave = await gm.evaluate(async (sys) => {
  const ns = "base-knavery";
  const cg = await import(`${sys}/character-generator.js`);
  const { spellTableName } = await import(`${sys}/compendium.js`);
  const { TABLES } = await import(`${sys}/config.js`);
  const a = await cg.createCharacter({ mode: "random", name: "", owner: null });
  const s = a.system;
  const out = {
    id: a.id, name: a.name, twoWords: /^\S+ \S+$/.test(a.name) && a.name !== game.i18n.localize("KNAVERY.DefaultCharacterName"),
    coins: s.coins, careers: a.items.filter((i) => i.type === "career").length,
    rations: a.items.find((i) => /\brations?\b/i.test(i.name))?.system.quantity ?? 0,
    weapons: a.items.filter((i) => i.type === "weapon").length,
    abilities: Object.fromEntries(Object.entries(s.abilities).map(([k, v]) => [k, v.value])),
    hpMax: s.hp.max, spellTable: spellTableName(), spells1e: TABLES.spells1e,
  };
  const combat = await Combat.create({});
  await combat.createEmbeddedDocuments("Combatant", [{ actorId: a.id }]);
  await combat.startCombat();
  out.initiative = combat.getFlag(ns, "groupInitiative")?.how ?? null;
  await combat.delete();
  return out;
}, SYS);
const abilityValues = Object.values(knave.abilities);
ok(knave.twoWords && knave.coins === 0 && knave.careers === 0 && knave.rations === 2 && knave.weapons >= 1,
  "a random knave: a name from the system's list, no coins, no careers, two rations and a weapon of choice", JSON.stringify(knave));
ok(abilityValues.length === 6 && abilityValues.every((v) => v >= 1 && v <= 6) && knave.hpMax >= 1 && knave.hpMax <= 8,
  "abilities from the lowest of 3d6, first-level HP from 1d8", JSON.stringify({ abilities: knave.abilities, hp: knave.hpMax }));
ok(knave.spellTable === knave.spells1e && knave.initiative === "d6", "Knave 1e's spells and d6 initiative", JSON.stringify({ table: knave.spellTable, initiative: knave.initiative }));

// 3. The book.
const book = await gm.evaluate(async (sys) => {
  const ns = "base-knavery";
  const FP = foundry.applications.apps.FilePicker.implementation;
  const listing = await FP.browse("data", "knavery-rulebook").catch(() => ({ files: [] }));
  const pdf = (listing.files ?? []).find((f) => /\.pdf$/i.test(f));
  if (!pdf) return { pdf: null };
  await game.settings.set(ns, "rulebook-pdf", decodeURIComponent(pdf));
  const t0 = Date.now();
  const m = await import(`${sys}/rulebook-import.js`);
  const { tables, pages } = await m.readRulebookTables();
  const read = Date.now() - t0;
  const report = await m.writeRulebookTables(tables);
  const sizes = Object.fromEntries(["Careers", "Spells", "Names", "Weather", "Signs"].map((n) => [n, game.tables.getName(n)?.results.size ?? 0]));
  const spellPack = game.packs.get("world.rulebook-spells");
  const spellItems = spellPack ? (await spellPack.getIndex()).size : 0;
  return { pdf, pages, read, ms: Date.now() - t0, tables: tables.length, created: report.created.length, kept: report.kept.length, sizes, spellItems };
}, SYS);
ok(book.pdf && book.pages > 50, "the GM's own PDF sits in knavery-rulebook/ and is set as the rulebook", JSON.stringify({ pdf: book.pdf, pages: book.pages }));
ok(book.created >= 40 && book.sizes.Careers === 100 && book.sizes.Spells === 100 && book.sizes.Names >= 100 && book.sizes.Weather === 11,
  "the book's tables are built: Careers and Spells with 100 rows, Names, Weather", JSON.stringify({ created: book.created, kept: book.kept, sizes: book.sizes, ms: book.ms }));
ok(book.spellItems >= 100, "a spellbook and a scroll per spell in the world's compendium", String(book.spellItems));

// 4. The offer.
const offerPromise = gm.evaluate(async (sys) => (await import(`${sys}/rules.js`)).offerRulesSwitch(), SYS);
await gm.waitForSelector('.knavery-rules-switch button[data-action="yes"]', { timeout: 20000 });
await gm.screenshot({ path: `${SHOTS}/fresh-offer.png` });
await gm.locator('.knavery-rules-switch button[data-action="yes"]').click();
const switched = await offerPromise;
const after = await gm.evaluate(async ([sys, id]) => {
  const ns = "base-knavery";
  const R = await import(`${sys}/rules.js`);
  const cg = await import(`${sys}/character-generator.js`);
  const { spellTableName } = await import(`${sys}/compendium.js`);
  const old = game.actors.get(id);
  const b = await cg.createCharacter({ mode: "random", name: "", owner: null });
  const out = {
    rules: R.currentRules(), stamp: game.settings.get(ns, "rules-stamp"), spellTable: spellTableName(),
    old: { coins: old.system.coins, careers: old.items.filter((i) => i.type === "career").length, items: old.items.size,
      abilities: Object.fromEntries(Object.entries(old.system.abilities).map(([k, v]) => [k, v.value])) },
    fresh: { coins: b.system.coins, careers: b.items.filter((i) => i.type === "career").length, name: b.name },
    initiative: game.settings.get(ns, "initiative-rule"), advantage: game.settings.get(ns, "advantage-mode"),
  };
  await b.delete();
  return out;
}, [SYS, knave.id]);
ok(switched === true && after.rules === "2e" && after.stamp === "1e" && after.initiative === "2e-leaders" && after.advantage === "raw",
  "Yes to the offer: the world plays Knave 2e (leaders' initiative, ±5 advantage); the stamp stays 1e", JSON.stringify({ switched, rules: after.rules, stamp: after.stamp, initiative: after.initiative, advantage: after.advantage }));
ok(after.old.coins === 0 && after.old.careers === 0 && JSON.stringify(after.old.abilities) === JSON.stringify(knave.abilities),
  "the knave made under 1e is untouched by the switch", JSON.stringify(after.old));
ok(after.fresh.careers === 2 && after.fresh.coins > 0 && after.spellTable === "Spells",
  "a knave made now gets two careers and coins, and the book's Spells table has taken over", JSON.stringify({ fresh: after.fresh, spellTable: after.spellTable }));

// 5. A rebuild keeps the GM's edit.
const rebuild = await gm.evaluate(async (sys) => {
  const m = await import(`${sys}/rulebook-import.js`);
  const weather = game.tables.getName("Weather");
  const row = weather.results.contents[1];
  await weather.updateEmbeddedDocuments("TableResult", [{ _id: row.id, name: "Probe edit", description: "Probe edit" }]);
  const { tables } = await m.readRulebookTables();
  const report = await m.writeRulebookTables(tables);
  const kept = game.tables.getName("Weather").results.contents[1];
  return { kept: report.kept.includes("Weather"), replaced: report.replaced.includes("Signs"), edit: kept.name === "Probe edit" || kept.description === "Probe edit", status: m.tableStatus("Weather") };
}, SYS);
ok(rebuild.kept && rebuild.replaced && rebuild.edit, "a rebuild keeps the table the GM edited and replaces an untouched one", JSON.stringify(rebuild));

// Cleanup: the probe's knave; the tables stay (the box returns to pristine before the next run).
await gm.evaluate(async (id) => { await game.actors.get(id)?.delete(); }, knave.id);
const real = errors.flat().filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
