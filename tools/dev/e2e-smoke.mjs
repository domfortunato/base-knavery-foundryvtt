#!/usr/bin/env node
/**
 * Smoke probe against a live world: joins as the GM, exercises the core
 * mechanics through the system's own API, and screenshots the main windows.
 *
 *   FOUNDRY_URL=http://<private-ip>:30000 node tools/dev/e2e-smoke.mjs   (npm run dev:smoke)
 *
 * Leaves no documents behind (everything it makes is named "Probe …" and
 * deleted at the end). Screenshots land in tools/dev/out/, or MB_SHOTS on the fleet.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { FOUNDRY_URL, SHOTS, VIEWPORT, joinAsGM, watchErrors, watchdog } from "./lib.mjs";

const OUT = SHOTS;
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};

const browser = await chromium.launch();
watchdog(240000, "smoke", () => browser.close());
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = watchErrors(page);
console.log(`smoke against ${FOUNDRY_URL}`);
await joinAsGM(page);
ok(await page.evaluate(() => game.system.id === "base-knavery"), "system is base-knavery");

// 1. Players for later probes.
await page.evaluate(async () => {
  for (const name of ["Alice", "Bob"]) {
    if (!game.users.getName(name)) await User.create({ name, role: CONST.USER_ROLES.PLAYER });
  }
});

// 2. A random level-3 character.
const actorId = await page.evaluate(async () => {
  for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
  const a = await game.knavery.createCharacter({ mode: "random", level: 3, name: "Probe Knave" });
  return a.id;
});
const char = await page.evaluate((id) => {
  const a = game.actors.get(id);
  const s = a.system;
  return {
    level: s.level, xp: s.xp, hp: s.hp, sum: Object.values(s.abilities).reduce((n, x) => n + x.value, 0),
    slotsMax: s.slotsMax, con: s.abilities.CON.value, ac: s.ac, coins: s.coins, gen: s.generationEnabled,
  };
}, actorId);
ok(char.level === 3 && char.xp === 4000, "random character is level 3 with 4000 XP", JSON.stringify(char));
ok(char.sum === 3 + 2 * 3, "abilities total 3 (3d6) + 3 per level-up", JSON.stringify(char));
ok(char.slotsMax === 10 + char.con, "slots = 10 + CON");
ok(char.ac === 11, "unarmored AC is 11");
ok(char.hp.max >= 1 && char.hp.value === char.hp.max, "HP rolled and full", JSON.stringify(char.hp));
ok(char.coins >= 30 && char.coins <= 180, "starting coins 3d6×10");

// 3. Sheet renders.
await page.evaluate((id) => game.actors.get(id).sheet.render(true), actorId);
await page.waitForSelector(".knavery.sheet.actor .knavery-page-knave", { timeout: 15000 });
ok(await page.locator('.knavery.sheet.actor nav.knavery-tab-rail button[data-tab]').count() === 4, "four pages on the thumb-tab rail");
await page.waitForTimeout(800);
await page.locator(".knavery.sheet.actor").first().screenshot({ path: path.join(OUT, "character-sheet.png") });
ok(await page.locator(".knavery.sheet.actor #die-of-fate-button").count() === 1, "Die of Fate button on the sheet");
ok(await page.locator(".knavery.sheet.actor .pronouns-input").count() === 1, "pronouns field by the name");
ok(await page.locator(".knavery.sheet.actor .resource-roll[data-ability]").count() === 6, "six ability roll buttons");

// 4. Armor and weapons.
const gear = await page.evaluate(async (id) => {
  const a = game.actors.get(id);
  const pack = game.packs.get("base-knavery.gear");
  const docs = await pack.getDocuments();
  const pick = (n) => docs.find((d) => d.name === n).toObject();
  const [helm, mail, sword] = await a.createEmbeddedDocuments("Item", [pick("Helmet"), pick("Mail Shirt"), pick("One-Handed Weapon")]);
  await helm.update({ "system.equipped": true });
  await mail.update({ "system.equipped": true });
  await sword.update({ "system.equipped": true });
  return { ac: a.system.ac, ap: a.system.ap, swordId: sword.id };
}, actorId);
ok(gear.ac === 13 && gear.ap === 2, "two armor pieces: AP 2, AC 13", JSON.stringify(gear));
await page.waitForTimeout(500);
ok(await page.locator(".knavery.sheet.actor #attack-button:not([disabled])").count() === 1, "the Attack button is on the sheet");

// 5. Advantage formulas in both modes.
const formulas = await page.evaluate(async () => {
  const { d20Formula } = await import("/systems/base-knavery/module/rolls.js");
  const prev = game.settings.get("base-knavery", "advantage-mode");
  await game.settings.set("base-knavery", "advantage-mode", "raw");
  const raw = [d20Formula(3, "advantage"), d20Formula(3, "disadvantage"), d20Formula(3, "normal")];
  await game.settings.set("base-knavery", "advantage-mode", "2d20");
  const two = [d20Formula(3, "advantage"), d20Formula(3, "disadvantage")];
  await game.settings.set("base-knavery", "advantage-mode", prev);
  return { raw, two };
});
ok(formulas.raw[0] === "1d20 + 3 + 5" && formulas.raw[1] === "1d20 + 3 - 5", "RAW mode: ±5", JSON.stringify(formulas));
ok(formulas.two[0] === "2d20kh + 3" && formulas.two[1] === "2d20kl + 3", "2d20 mode: keep high/low", JSON.stringify(formulas));

// 6. The roll prompt, through the UI: attack with damage at the same time.
const before = await page.evaluate(() => game.messages.size);
await page.locator(".knavery.sheet.actor #attack-button").click();
await page.waitForSelector(".knavery-roll-prompt", { timeout: 10000 });
ok(await page.locator('.knavery-roll-prompt input[name="weapon"]:checked').count() === 1, "the Attack window lists the equipped weapon, chosen");
ok(await page.locator('.knavery-roll-prompt input[name="rollDamage"]').isChecked(), "Roll damage at the same time is ticked by default");
await page.locator(".knavery-roll-prompt").screenshot({ path: path.join(OUT, "roll-prompt.png") });
await page.locator('.knavery-roll-prompt button[data-action="advantage"]').click();
await page.waitForFunction((n) => game.messages.size > n, before, { timeout: 10000 });
const card = await page.evaluate(() => {
  const m = game.messages.contents.at(-1);
  return { rolls: m.rolls.length, attack: m.getFlag("base-knavery", "attack"), html: m.content.includes("knavery-roll-card") };
});
ok(card.rolls === 2 && card.attack && card.html, "attack card carries the attack and damage rolls", JSON.stringify(card));

// 7. A check and a save without the prompt.
const check = await page.evaluate(async (id) => {
  const a = game.actors.get(id);
  const r = await game.knavery.rollCheck(a, "STR", { edge: "normal", difficulty: 5 });
  const s = await game.knavery.rollSave(a, "poison", { edge: "normal", difficulty: 5 });
  return { target: r.target, ok: typeof r.success === "boolean", saveTarget: s.target };
}, actorId);
ok(check.target === 16 && check.ok && check.saveTarget === 16, "checks and saves resolve vs 11 + difficulty");

// 8. Damage past HP becomes wounds; direct damage on a monster is tripled.
const dmg = await page.evaluate(async (id) => {
  const a = game.actors.get(id);
  const hp = a.system.hp.value;
  await a.applyDamage(hp + 2);
  const pc = { hp: a.system.hp.value, wounds: a.system.wounds };
  const layout = [...a.slotLayout().values()].filter((x) => x.wounded).length;
  const m = await Actor.create({ name: "Probe Goblin", type: "npc", system: { role: "monster", hp: { value: 12, max: 12 } } });
  await m.applyDamage(3, { direct: true });
  const mon = m.system.hp.value;
  await a.rest();
  await a.healWound();
  return { pc, woundedItems: layout, mon, afterRest: { hp: a.system.hp.value, max: a.system.hp.max, wounds: a.system.wounds } };
}, actorId);
ok(dmg.pc.hp === 0 && dmg.pc.wounds === 2, "damage beyond HP fills 2 wound slots", JSON.stringify(dmg));
ok(dmg.mon === 3, "direct damage on a monster is tripled (12 − 9)", JSON.stringify(dmg));
ok(dmg.afterRest.hp === dmg.afterRest.max && dmg.afterRest.wounds === 1, "rest heals HP; heal wound removes one");

// 9. Level Up visibility: only with Creation Mode on and enough XP.
const lvl = await page.evaluate(async (id) => {
  const a = game.actors.get(id);
  await a.update({ "system.generationEnabled": false, "system.xp": 8000 });
  await new Promise((r) => setTimeout(r, 400));
  const offBtn = !!a.sheet.element.querySelector(".level-up-button");
  await a.update({ "system.generationEnabled": true });
  await new Promise((r) => setTimeout(r, 400));
  const onBtn = !!a.sheet.element.querySelector(".level-up-button");
  const { applyLevelUp } = await import("/systems/base-knavery/module/level-up.js");
  const sumBefore = Object.values(a.system.abilities).reduce((n, x) => n + x.value, 0);
  await applyLevelUp(a, ["STR", "DEX", "CON"].filter((k) => a.system.abilities[k].value < 10));
  const sumAfter = Object.values(a.system.abilities).reduce((n, x) => n + x.value, 0);
  return { offBtn, onBtn, level: a.system.level, gained: sumAfter - sumBefore };
}, actorId);
ok(!lvl.offBtn && lvl.onBtn, "Level Up shows only in Creation Mode with the XP", JSON.stringify(lvl));
ok(lvl.level === 4 && lvl.gained >= 1, "level-up raises the level and abilities", JSON.stringify(lvl));

// 10. Dashboard, marketplace, marketplace manager.
await page.evaluate(() => game.knavery.openDashboard());
await page.waitForSelector("#knavery-gm-dashboard", { timeout: 10000 });
await page.waitForTimeout(500);
await page.locator("#knavery-gm-dashboard").screenshot({ path: path.join(OUT, "dashboard.png") });
ok(true, "GM dashboard opens");
await page.evaluate((id) => game.knavery.openMarketplace(game.actors.get(id)), actorId);
await page.waitForSelector(".knavery-marketplace .mkt-row", { timeout: 10000 });
ok(await page.locator(".knavery-marketplace .mkt-cat").count() >= 4, "marketplace shows the shipped aisles");
await page.locator(".knavery-marketplace").screenshot({ path: path.join(OUT, "marketplace.png") });
await page.evaluate(() => game.knavery.openMarketplaceManager());
await page.waitForSelector('#knavery-gm-dashboard section[data-tab="market"].active .mm-aisle', { timeout: 10000 });
await page.locator("#knavery-gm-dashboard").screenshot({ path: path.join(OUT, "market-manager.png") });
ok(true, "marketplace manager opens");

// 11. Table importer: a world copy overrides the shell.
const imported = await page.evaluate(async () => {
  const rows = game.knavery.parseRows("01-50 Alpha\n51-00 Beta");
  const t = await game.knavery.importRows("Probe Table", rows);
  const res = { n: t.results.size, formula: t.formula, ranges: t.results.map((r) => r.range.join("-")) };
  await t.delete();
  return res;
});
ok(imported.n === 2 && imported.formula === "1d100" && imported.ranges.includes("51-100"), "importer parses ranges (00 = 100)", JSON.stringify(imported));

// 12. Rulebook reader, without a book: the viewer URL, and the no-book path.
const rb = await page.evaluate(async () => {
  const m = await import("/systems/base-knavery/module/rulebook.js");
  const url = m.viewerUrl("knavery-rulebook/x.pdf", { page: 5, offset: 6 });
  const had = m.hasRulebook();
  const opened = had ? "skipped: this world has a book" : m.openRulebook();
  return { url, had, opened: opened === null ? null : String(opened), careers: m.tablePage("Careers"), traits: m.tablePage("Physique") };
});
ok(/scripts\/pdfjs\/web\/viewer\.html\?file=%2Fknavery-rulebook%2Fx\.pdf#page=11$/.test(rb.url), "rulebook viewer URL: printed p. 5 + offset 6 = PDF page 11", rb.url);
ok(rb.had || rb.opened === null, "no rulebook set: the reader does not open", JSON.stringify(rb));
ok(rb.careers === 5 && rb.traits === null, "page map: Careers p. 5, trait tables none", JSON.stringify(rb));

// 13. Every Configure submenu renders (its template was missing until 2026-11-13).
const menus = await page.evaluate(async () => {
  const out = {};
  for (const id of ["general", "generation", "inventory", "hacks", "rulebook"]) {
    const Menu = game.settings.menus.get(`base-knavery.${id}`)?.type;
    if (!Menu) { out[id] = "unregistered"; continue; }
    const app = new Menu();
    await app.render({ force: true });
    const el = document.getElementById(`knavery-settings-${id}`);
    out[id] = { rows: el?.querySelectorAll(".knavery-settings-rows .form-group").length ?? 0, picker: !!el?.querySelector("file-picker") };
    await app.close();
  }
  return out;
});
ok(Object.values(menus).every((m) => m.rows > 0), "the five Configure submenus render their rows", JSON.stringify(menus));
ok(menus.rulebook?.picker && menus.generation?.picker, "path settings get core's file picker", JSON.stringify(menus));

// 14. Welcome window and the Settings sidebar's buttons.
await page.evaluate(() => game.knavery.openWelcome());
await page.waitForSelector("#knavery-welcome .knavery-welcome-links a", { timeout: 10000 });
const welcome = await page.evaluate(() => {
  const el = document.getElementById("knavery-welcome");
  return {
    links: [...el.querySelectorAll(".knavery-welcome-links a")].map((a) => a.href),
    disclaimer: el.querySelector(".knavery-welcome-disclaimer")?.textContent.trim(),
    logo: !!el.querySelector("img.knavery-logo-light[src*='made-for-knave-black']"),
    onStart: !!el.querySelector('input[name="welcome-on-start"]'),
  };
});
ok(welcome.links.length === 4 && welcome.links[0] === "https://questingbeast.itch.io/knave" && welcome.links[1].includes("affiliate_id=379088"),
  "welcome: the Knave 1e PDF, and three places to buy Knave 2e", JSON.stringify(welcome.links));
ok(welcome.disclaimer?.startsWith("Base Knavery is an independent production of Dom Bosco") && welcome.logo, "welcome: the licence disclaimer and the Made for Knave logo", JSON.stringify(welcome));
ok(welcome.onStart, "welcome: the GM's show-on-start box");
await page.locator("#knavery-welcome").screenshot({ path: path.join(OUT, "welcome.png") });
await page.evaluate(() => foundry.applications.instances.get("knavery-welcome")?.close());
const sidebar = await page.evaluate(async () => {
  await ui.settings.render({ force: true });
  return [...document.querySelectorAll("#settings .knavery-sidebar-tools button")].map((b) => b.textContent.trim());
});
ok(sidebar.length === 4 && sidebar.some((t) => /guide/i.test(t)), "Settings sidebar: welcome, rulebook, guide and dashboard buttons", JSON.stringify(sidebar));

// Cleanup.
await page.evaluate(async () => {
  for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
  for (const app of [...foundry.applications.instances.values()]) if (app.id !== "sidebar") app.close?.();
});

const real = errors.filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
