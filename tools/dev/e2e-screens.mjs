#!/usr/bin/env node
/**
 * Screenshots of every main window, in both colour schemes, plus functional
 * checks of careers (features, starting items, effects) and the GLOG hack.
 *
 *   FOUNDRY_URL=http://<private-ip>:30000 node tools/dev/e2e-screens.mjs   (npm run dev:screens)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  SHOTS, VIEWPORT, joinAsGM, probePdf, useProbeRulebook, waitForRulebook, watchErrors, watchdog, withSettings,
} from "./lib.mjs";

const OUT = SHOTS;
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};
const shot = (page, sel, name) => page.locator(sel).first().screenshot({ path: path.join(OUT, `${name}.png`) });

const browser = await chromium.launch();
watchdog(300000, "screens", () => browser.close());
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = watchErrors(page);
await joinAsGM(page);

await withSettings(page, async () => {
  await page.evaluate(() => game.settings.set("base-knavery", "enable-glog-grimoire", true));

  // A character with a custom career (features + an effect) and a grimoire.
  const id = await page.evaluate(async () => {
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    const a = await game.knavery.createCharacter({ mode: "random", level: 2, name: "Probe Wizard" });
    await a.update({ "system.abilities.INT.value": 4, "system.pronouns": "they/them" });
    const pack = game.packs.get("base-knavery.careers");
    const tmpl = (await pack.getDocuments())[0];
    const { addCareer } = await import("/systems/base-knavery/module/character-generator.js");
    const career = await addCareer(a, tmpl, { grantItems: true });
    await career.createEmbeddedDocuments("ActiveEffect", [{
      name: "Hardy", transfer: true, img: "icons/svg/heal.svg",
      changes: [{ key: "system.hp.max", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2" }],
    }]);
    const { createGrimoire } = await import("/systems/base-knavery/module/grimoire.js");
    await createGrimoire(a);
    const [book] = await a.createEmbeddedDocuments("Item", [{
      name: "Probe Bolt", type: "spellbook", system: { description: "<p>Deals [sum] damage to [dice] targets.</p>" },
    }]);
    const { bindSpell } = await import("/systems/base-knavery/module/grimoire.js");
    await bindSpell(a, book);
    return a.id;
  });

  const career = await page.evaluate((id) => {
    const a = game.actors.get(id);
    const c = a.items.find((i) => i.type === "career");
    return {
      favor: foundry.utils.getProperty(a.system.features, `${c.system.key}.favor`),
      torch: !!a.items.getName("Torch"),
      hpMaxWithEffect: a.system.hp.max,
      srcMax: a._source.system.hp.max,
    };
  }, id);
  ok(career.favor === 1, "career feature seeded with its starting value", JSON.stringify(career));
  ok(career.torch, "career starting items granted");
  ok(career.hpMaxWithEffect === career.srcMax + 2, "career Active Effect applies (+2 max HP)", JSON.stringify(career));

  const glog = await page.evaluate(async (id) => {
    const a = game.actors.get(id);
    const book = a.items.getName("Probe Bolt");
    const { magicDiceLeft, magicDiceMax } = await import("/systems/base-knavery/module/grimoire.js");
    return { bound: book.system.bound, slots: a.calcSlotsUsed(), max: magicDiceMax(a), left: magicDiceLeft(a) };
  }, id);
  ok(glog.bound && glog.max === 2 && glog.left === 2, "GLOG: spell bound, 2 Magic Dice at level 2", JSON.stringify(glog));

  for (const scheme of ["dark", "light"]) {
    await page.evaluate((s) => game.settings.set("core", "uiConfig", foundry.utils.mergeObject(game.settings.get("core", "uiConfig"), { colorScheme: { applications: s, interface: s } })), scheme);
    await page.evaluate((id) => game.actors.get(id).sheet.render(true), id);
    await page.waitForSelector(".knavery.sheet.actor .knavery-grimoire", { timeout: 15000 });
    await page.waitForTimeout(800);
    await shot(page, ".knavery.sheet.actor", `sheet-knave-${scheme}`);
    const rail = (tab) => page.locator(`.knavery.sheet.actor nav.knavery-tab-rail button[data-tab="${tab}"]`);
    for (const tab of ["inventory", "growth", "description"]) {
      await rail(tab).click();
      await page.waitForTimeout(500);
      await shot(page, ".knavery.sheet.actor", `sheet-${tab}-${scheme}`);
    }
    await rail("knave").click();
    await page.evaluate((id) => game.actors.get(id).sheet.close(), id);
    await page.waitForTimeout(400);
  }

  // "Choose your rulebook PDF from this computer" in the welcome window: the
  // computer's own file dialog (Playwright answers it), then an upload.
  await page.evaluate(() => game.settings.set("base-knavery", "rulebook-pdf", ""));
  await page.evaluate(() => game.knavery.openWelcome());
  await page.waitForSelector('#knavery-welcome button[data-action="chooseRulebook"]', { timeout: 10000 });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 10000 }),
    page.locator('#knavery-welcome button[data-action="chooseRulebook"]').click(),
  ]);
  await chooser.setFiles({ name: "probe-local.pdf", mimeType: "application/pdf", buffer: Buffer.from(probePdf()) });
  await page.waitForFunction(() => game.settings.get("base-knavery", "rulebook-pdf").endsWith("probe-local.pdf"), null, { timeout: 20000 });
  await waitForRulebook(page);
  const local = await page.evaluate(() => ({
    path: game.settings.get("base-knavery", "rulebook-pdf"),
    welcomeOpen: !!document.querySelector('#knavery-welcome button[data-action="openRulebook"]'),
  }));
  ok(local.path === "knavery-rulebook/probe-local.pdf" && local.welcomeOpen, "a PDF chosen from this computer is uploaded, set and opened", JSON.stringify(local));
  // The upload also opens the review of the book's tables (a one-page PDF has none of them).
  await page.waitForSelector("#knavery-rulebook-tables", { timeout: 20000 }).catch(() => {});
  await page.evaluate(async () => {
    await foundry.applications.instances.get("knavery-rulebook-tables")?.close();
    await foundry.applications.instances.get("knavery-rulebook")?.close();
    await foundry.applications.instances.get("knavery-welcome")?.close();
  });

  // The rulebook reader on a hand-made one-page PDF, and the welcome window, in both schemes.
  await useProbeRulebook(page);
  for (const scheme of ["dark", "light"]) {
    await page.evaluate((s) => game.settings.set("core", "uiConfig", foundry.utils.mergeObject(game.settings.get("core", "uiConfig"), { colorScheme: { applications: s, interface: s } })), scheme);
    await page.evaluate(() => game.knavery.openRulebook({ page: 1 }));
    await waitForRulebook(page);
    await page.waitForTimeout(800);
    await shot(page, "#knavery-rulebook", `rulebook-${scheme}`);
    await page.evaluate(async () => { await foundry.applications.instances.get("knavery-rulebook")?.close(); });
    await page.evaluate(() => game.knavery.openWelcome());
    await page.waitForSelector("#knavery-welcome .knavery-welcome-links a", { timeout: 10000 });
    await page.waitForTimeout(500);
    await shot(page, "#knavery-welcome", `welcome-${scheme}`);
    await page.evaluate(() => foundry.applications.instances.get("knavery-welcome")?.close());
  }
  const pages = await page.evaluate(() => {
    const app = game.knavery.openRulebook({ page: 1 });
    return !!app;
  });
  await waitForRulebook(page);
  const doc = await page.evaluate(() => document.querySelector("#knavery-rulebook iframe").contentWindow.PDFViewerApplication.pagesCount);
  ok(pages && doc === 1, "rulebook reader loads the GM's PDF in core's pdf.js viewer", JSON.stringify({ pages, doc }));
  await page.evaluate(async () => { await foundry.applications.instances.get("knavery-rulebook")?.close(); });

  // Tables from the rulebook: read, review, build; a rebuild replaces an
  // unchanged table and keeps one the GM edited or made by hand.
  const SPEC = { name: "Probe Rulebook Table", pages: [1], region: "left", below: "probe table", first: 1, last: 6, formula: "1d6" };
  await page.evaluate(async (spec) => {
    const m = await import("/systems/base-knavery/module/rulebook-import.js");
    await m.openRulebookTablesReview({ specs: [spec], offset: 0, combined: [] });
  }, SPEC);
  await page.waitForSelector('#knavery-rulebook-tables textarea[data-index="0"]', { timeout: 20000 });
  const reviewed = await page.evaluate(() => document.querySelector('#knavery-rulebook-tables textarea[data-index="0"]').value.split("\n"));
  ok(reviewed.length === 6 && reviewed[0] === "1 Row Alpha" && reviewed[5] === "6 Row Foxtrot", "rulebook tables: the review shows the rows read from the PDF", JSON.stringify(reviewed));
  await page.locator("#knavery-rulebook-tables details").first().evaluate((d) => { d.open = true; });
  await shot(page, "#knavery-rulebook-tables", "rulebook-tables");
  await page.locator('#knavery-rulebook-tables button[type="submit"]').click();
  await page.waitForFunction((n) => game.tables.getName(n)?.results.size === 6, SPEC.name, { timeout: 15000 });
  const built = await page.evaluate(async (spec) => {
    const m = await import("/systems/base-knavery/module/rulebook-import.js");
    const t = game.tables.getName(spec.name);
    const out = { formula: t.formula, folder: t.folder?.getFlag("base-knavery", "rulebookFolder") ?? false, status: m.tableStatus(spec.name) };
    const rows = t.results.contents.map((r) => ({ range: r.range, text: r.name }));
    out.rebuild = await m.writeRulebookTables([{ ...spec, rows }]);
    await game.tables.getName(spec.name).results.contents[0].update({ name: "Edited by the GM" });
    out.afterEdit = m.tableStatus(spec.name);
    out.editedRebuild = await m.writeRulebookTables([{ ...spec, rows }]);
    out.kept = game.tables.getName(spec.name).results.contents.some((r) => r.name === "Edited by the GM");
    await game.knavery.importRows("Probe Hand Table", game.knavery.parseRows("1 Mine"));
    out.handStatus = m.tableStatus("Probe Hand Table");
    out.handRebuild = await m.writeRulebookTables([{ ...spec, name: "Probe Hand Table", rows }]);
    out.handKept = game.tables.getName("Probe Hand Table").results.size === 1;
    return out;
  }, SPEC);
  ok(built.formula === "1d6" && built.folder && built.status === "replace", "rulebook tables: built into the world's folder", JSON.stringify(built));
  ok(built.rebuild.replaced.includes(SPEC.name), "rulebook tables: a rebuild replaces an unchanged table", JSON.stringify(built.rebuild));
  ok(built.afterEdit === "keep" && built.editedRebuild.kept.includes(SPEC.name) && built.kept, "rulebook tables: a table the GM edited is kept", JSON.stringify(built));
  ok(built.handStatus === "keep" && built.handRebuild.kept.includes("Probe Hand Table") && built.handKept, "rulebook tables: a table the GM imported is kept", JSON.stringify(built));
  await page.evaluate(async () => {
    for (const t of game.tables.filter((x) => x.name.startsWith("Probe"))) await t.delete();
    for (const f of game.folders.filter((x) => x.type === "RollTable" && x.getFlag("base-knavery", "rulebookFolder"))) await f.delete();
  });

  await page.evaluate(() => game.knavery.openDashboard());
  await page.waitForSelector("#knavery-gm-dashboard", { timeout: 10000 });
  await page.locator('#knavery-gm-dashboard nav [data-tab="tables"]').first().click();
  await page.waitForSelector("#knavery-gm-dashboard .dash-rulebook", { timeout: 10000 });
  const books = await page.evaluate(() => [...document.querySelectorAll("#knavery-gm-dashboard .dash-table-book")]
    .map((a) => `${a.closest("[data-table]").dataset.table}:${a.dataset.page}`));
  ok(books.includes("Careers:5") && books.includes("Spells:22") && !books.some((b) => b.startsWith("Physique")), "dashboard: book icons at each table's page", JSON.stringify(books));
  await shot(page, "#knavery-gm-dashboard", "dashboard-tables");
  await page.evaluate(() => foundry.applications.instances.get("knavery-gm-dashboard")?.close());

  // Cast with Magic Dice through the UI.
  await page.evaluate((id) => game.actors.get(id).sheet.render(true), id);
  await page.waitForSelector(".knavery.sheet.actor .grimoire-page .attack-roll", { timeout: 15000 });
  await page.locator(".knavery.sheet.actor .grimoire-page .attack-roll").click();
  await page.waitForSelector('select[name="md"]', { timeout: 10000 });
  await page.locator('select[name="md"]').selectOption("2");
  await page.locator('.application.dialog button[data-action="ok"]').click();
  await page.waitForTimeout(1500);
  const cast = await page.evaluate(() => {
    const m = game.messages.contents.at(-1);
    return { flag: m.getFlag("base-knavery", "glogCast"), text: m.content };
  });
  ok(cast.flag?.dice === 2 && cast.text.includes(`Deals ${cast.flag.sum} damage to 2 targets`), "GLOG cast substitutes [dice] and [sum]", JSON.stringify(cast.flag));

  // Career item sheet (the custom-background editor).
  await page.evaluate((id) => game.actors.get(id).items.find((i) => i.type === "career").sheet.render(true), id);
  await page.waitForSelector(".knavery.sheet.item .career-editor", { timeout: 10000 });
  await page.waitForTimeout(600);
  await shot(page, ".knavery.sheet.item", "career-editor");
  await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app.document?.documentName === "Item") app.close(); });

  // Level-up dialog.
  await page.evaluate((id) => game.actors.get(id).update({ "system.xp": 4000, "system.generationEnabled": true }), id);
  await page.evaluate(async (id) => { const { openLevelUp } = await import("/systems/base-knavery/module/level-up.js"); openLevelUp(game.actors.get(id)); }, id);
  await page.waitForSelector(".kn-levelup", { timeout: 10000 });
  await shot(page, ".application:has(.kn-levelup)", "level-up");
  await page.locator(".application:has(.kn-levelup) button[data-action=\"close\"]").click().catch(() => {});

  // Create dialog.
  page.evaluate(() => { game.knavery.createCharacterInteractive(); });
  await page.waitForSelector(".knavery-create", { timeout: 10000 });
  await shot(page, ".knavery-create", "create-character");
  await page.locator('.knavery-create button[data-action="close"]').click().catch(() => {});

  // A bestiary monster.
  const monsterId = await page.evaluate(async () => {
    const pack = game.packs.get("base-knavery.monsters");
    const entry = pack.index.find((e) => e.name === "Owlbear");
    const m = await game.actors.importFromCompendium(pack, entry._id, { name: "Probe Owlbear" });
    await m.sheet.render(true);
    return m.id;
  });
  await page.waitForSelector(".knavery-npc-sheet .knavery-attack-row", { timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, ".knavery-npc-sheet", "monster-sheet");
  const mon = await page.evaluate((mid) => {
    const m = game.actors.get(mid);
    return { ac: m.system.ac, lvl: m.system.level, bonus: m.abilityBonus("STR"), attacks: m.items.filter((i) => i.type === "weapon").length };
  }, monsterId);
  ok(mon.ac === 14 && mon.lvl === 5 && mon.bonus === 5 && mon.attacks === 2, "owlbear: AC 14, LVL 5 adds to checks, two attacks", JSON.stringify(mon));

  await page.evaluate(async () => {
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    for (const app of [...foundry.applications.instances.values()]) if (app.document || app.id?.startsWith("knavery")) app.close?.();
  });
});

const real = errors.filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
