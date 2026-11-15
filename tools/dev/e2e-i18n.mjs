#!/usr/bin/env node
/**
 * The interface in another language (localization plan, Phase 1, 2026-11-15).
 *
 * No real translation exists yet, so the probe makes one in the page: every string Foundry has
 * loaded (the system's and core's) becomes a marked test language, ⟦Ŝłöţš …⟧, accented and about
 * 40% longer, with its {placeholders} and HTML kept. Then it opens the system's windows and:
 *   - lists any English left outside the marks (text the code writes itself, not through the
 *     language file), allowing the world's own names (actors, items, tables, users);
 *   - lists labels the longer words clip (text cut by overflow, ellipsis or nowrap);
 *   - takes a screenshot of each window for a person to look at;
 *   - checks plurals at 0, 1, 2, 5 and 22 under Polish rules (one, few, many).
 * Leftover English fails; clipping is listed as notes with its screenshot (the layout is judged
 * by eye first, then the worst cases fixed and turned into checks).
 *
 *   FOUNDRY_URL=http://<private-ip>:30000 node tools/dev/e2e-i18n.mjs   (npm run dev:i18n; fleet only)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { SHOTS, VIEWPORT, joinAsGM, watchErrors, watchdog, withSettings } from "./lib.mjs";

const OUT = path.join(SHOTS, "i18n");
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};
const note = (label, lines) => {
  console.log(`  note  ${label}`);
  for (const l of lines) console.log(`          ${l}`);
};

const browser = await chromium.launch();
watchdog(300000, "i18n", () => browser.close());
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = watchErrors(page);
await joinAsGM(page);

/** Turn every loaded string into the test language (in the page; nothing is written to disk). */
await page.evaluate(() => {
  const accents = { a: "á", e: "é", i: "í", o: "ö", u: "ü", c: "ç", n: "ñ", s: "š", z: "ž", y: "ý", A: "Á", E: "É", I: "Í", O: "Ö", U: "Ü", C: "Ç", N: "Ñ", S: "Š" };
  const pseudo = (s) => {
    // Keep {placeholders} and <tags> as they are; accent the words between them.
    const parts = s.split(/(\{[^}]+\}|<[^>]+>|&[a-z#0-9]+;)/gi);
    const body = parts.map((p, i) => (i % 2 ? p : p.replace(/[A-Za-z]/g, (ch) => accents[ch] ?? ch))).join("");
    const words = s.replace(/\{[^}]+\}|<[^>]+>/g, "").trim();
    const pad = words ? " " + "·".repeat(Math.max(1, Math.round(words.length * 0.4))) : "";
    return words ? `⟦${body}${pad}⟧` : s;
  };
  const walk = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") o[k] = pseudo(v);
      else if (v && typeof v === "object") walk(v);
    }
  };
  walk(game.i18n.translations);
  if (game.i18n._fallback) walk(game.i18n._fallback);
});

const report = { english: new Map(), clipped: [] };

/** English left outside the marks in an element, and the labels it clips. */
const inspect = async (selector, name) => {
  await page.waitForTimeout(600);
  const loc = page.locator(selector).first();
  if (!(await loc.count())) { report.english.set(`${name}: (window not found: ${selector})`, 1); return; }
  await loc.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {});
  const found = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const names = new Set();
    const addName = (n) => { for (const w of String(n ?? "").split(/[^\p{L}]+/u)) if (w) names.add(w.toLowerCase()); };
    for (const c of [game.actors, game.items, game.tables, game.users, game.scenes, game.macros, game.journal]) for (const d of c) addName(d.name);
    for (const a of game.actors) for (const i of a.items) addName(i.name);
    for (const p of game.packs) for (const e of p.index) addName(e.name);
    for (const t of game.tables) for (const r of t.results) addName(r.name);
    addName(game.world.title); addName(game.system.title);
    // Text of form fields is data, not interface.
    const text = [...root.querySelectorAll("*")].filter((el) => !el.closest("input, textarea, select, .editor-content, .prosemirror, [contenteditable]"))
      .flatMap((el) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent))
      .concat([...root.querySelectorAll("[data-tooltip-text], [placeholder], [aria-label], [title]")].map((el) => el.getAttribute("data-tooltip-text") || el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("title") || ""))
      .join("\n");
    // Marks can span several text nodes (a string with <b> inside): remove everything inside ⟦…⟧ first.
    const outside = text.replace(/⟦[\s\S]*?⟧/g, " ").replace(/[⟦⟧]/g, " ");
    const english = [...new Set(outside.match(/\p{L}{3,}/gu) ?? [])].filter((w) => !names.has(w.toLowerCase()) && !/[^\x00-\x7F]/.test(w));
    const clipped = [...root.querySelectorAll("label, button, span, th, td, h1, h2, h3, h4, a, .form-group > *, li")]
      .filter((el) => el.offsetParent && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2)
      .filter((el) => { const cs = getComputedStyle(el); return cs.overflow !== "visible" || cs.textOverflow === "ellipsis" || cs.whiteSpace === "nowrap"; })
      .map((el) => `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).trim().split(/\s+/).join(".") : ""}: ${el.textContent.trim().slice(0, 40)}`);
    return { english, clipped: [...new Set(clipped)].slice(0, 15) };
  }, selector);
  for (const w of found.english) report.english.set(`${name}: ${w}`, 1);
  for (const c of found.clipped) report.clipped.push(`${name} | ${c}`);
};

await withSettings(page, async () => {
  const id = await page.evaluate(async () => {
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    const a = await game.knavery.createCharacter({ mode: "random", level: 2, name: "Probe Polyglot" });
    await a.update({ "system.coins": 1234, "system.xp": 1500 });
    return a.id;
  });
  const npcId = await page.evaluate(async () => (await Actor.create({ name: "Probe Gobelin", type: "npc" })).id);

  // The character sheet, every page.
  await page.evaluate((x) => game.actors.get(x).sheet.render(true), id);
  await page.waitForSelector(".knavery.sheet.actor", { timeout: 15000 });
  await inspect(".knavery.sheet.actor", "sheet-knave");
  for (const tab of ["inventory", "growth", "description"]) {
    await page.locator(`.knavery.sheet.actor nav.knavery-tab-rail button[data-tab="${tab}"]`).click();
    await inspect(".knavery.sheet.actor", `sheet-${tab}`);
  }
  await page.evaluate((x) => game.actors.get(x).sheet.close(), id);
  // An NPC sheet and a weapon's sheet.
  await page.evaluate((x) => game.actors.get(x).sheet.render(true), npcId);
  await inspect(".knavery.sheet.actor", "npc-sheet");
  await page.evaluate((x) => game.actors.get(x).sheet.close(), npcId);
  await page.evaluate((x) => game.actors.get(x).items.find((i) => i.type === "weapon")?.sheet.render(true), id);
  await inspect(".knavery.sheet.item", "item-sheet");
  await page.evaluate(() => { for (const app of foundry.applications.instances.values()) if (app.document instanceof Item) app.close(); });

  // The dashboard, every page.
  await page.evaluate(() => game.knavery.openDashboard());
  await page.waitForSelector("#knavery-gm-dashboard", { timeout: 15000 });
  for (const tab of ["requests", "damage", "time", "party", "dice", "xp", "market", "tools", "tables"]) {
    await page.evaluate((t) => foundry.applications.instances.get("knavery-gm-dashboard").changeTab(t, "primary"), tab);
    await inspect("#knavery-gm-dashboard", `dashboard-${tab}`);
  }
  await page.evaluate(() => foundry.applications.instances.get("knavery-gm-dashboard").close());

  // The Configure windows.
  for (const menu of ["general", "generation", "inventory", "hacks", "rulebook", "printing"]) {
    await page.evaluate(async (m) => { const M = game.settings.menus.get(`base-knavery.${m}`).type; await new M().render({ force: true }); }, menu);
    await inspect(`#knavery-settings-${menu}`, `configure-${menu}`);
    await page.evaluate((m) => foundry.applications.instances.get(`knavery-settings-${m}`)?.close(), menu);
  }

  // The welcome window, the Attack window, Create Item, the importer (dialogs are left open, then closed).
  await page.evaluate(() => game.knavery.openWelcome());
  await inspect("#knavery-welcome", "welcome");
  await page.evaluate(() => foundry.applications.instances.get("knavery-welcome")?.close());
  await page.evaluate((x) => { import("/systems/base-knavery/module/rolls.js").then((m) => m.openAttack(game.actors.get(x))); }, id);
  await inspect(".knavery-roll-prompt", "attack-window");
  await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app instanceof foundry.applications.api.DialogV2) app.close(); });
  await page.evaluate(() => { game.knavery.openCreateItem(); });
  await inspect(".knavery-create-item", "create-item");
  await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app.id !== "sidebar" && app.options?.classes?.includes?.("knavery") && !(app.document)) app.close(); });
  await page.evaluate(() => { game.knavery.openTableImporter(); });
  await inspect(".knavery-importer-dialog", "table-importer");
  await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app instanceof foundry.applications.api.DialogV2) app.close(); });

  // Chat cards: a damage card with wounds (a plural) and the clock's hazard card.
  await page.evaluate(async (x) => {
    const a = game.actors.get(x);
    await a.update({ "system.hp.value": 1 });
    await a.applyDamage?.(6, { source: "Probe" });
  }, id);
  await inspect("#chat .chat-message:last-child", "chat-damage");

  // Plurals under Polish rules: one (1), few (2, 22), many (0, 5).
  const plural = await page.evaluate(async () => {
    const { P } = await import("/systems/base-knavery/module/i18n.js");
    const save = Object.getOwnPropertyDescriptor(game.i18n, "pluralRules");
    Object.defineProperty(game.i18n, "pluralRules", { value: new Intl.PluralRules("pl"), configurable: true });
    foundry.utils.setProperty(game.i18n.translations, "KNAVERY.ProbePlural", { one: "{n} one", few: "{n} few", many: "{n} many", other: "{n} other" });
    const out = [0, 1, 2, 5, 22].map((n) => P("KNAVERY.ProbePlural", n));
    out.push(P("KNAVERY.NSlots", 5));
    if (save) Object.defineProperty(game.i18n, "pluralRules", save); else delete game.i18n.pluralRules;
    return out;
  });
  ok(plural.slice(0, 5).join("|") === "0 many|1 one|2 few|5 many|22 few", "plurals pick Polish's one, few and many forms", plural.join(" | "));
  ok(/^⟦/.test(plural[5]), "a language without a form falls back to its other form", plural[5]);

  await page.evaluate(async (ids) => { for (const x of ids) await game.actors.get(x)?.delete(); }, [id, npcId]);
});

const english = [...report.english.keys()];
ok(english.length === 0, "no English left outside the language file in the system's windows", `\n    ${english.join("\n    ")}`);
if (report.clipped.length) note(`${report.clipped.length} label(s) the longer words clip (screenshots in ${path.basename(OUT)}/):`, report.clipped);
else console.log("  ok    no label clipped by the longer words");
const real = errors.flat().filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
