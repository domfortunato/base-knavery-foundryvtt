#!/usr/bin/env node
/**
 * Screenshots of every main window, in both colour schemes, plus functional
 * checks of careers (features, starting items, effects) and the GLOG hack.
 *
 *   FOUNDRY_URL=http://192.168.30.127:30000 node tools/dev/screens.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { VIEWPORT, joinAsGM, watchErrors, watchdog, withSettings } from "./lib.mjs";

const OUT = path.resolve("tools/dev/out");
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
    await shot(page, ".knavery.sheet.actor", `sheet-items-${scheme}`);
    await page.locator('.knavery.sheet.actor nav.tabs a[data-tab="description"]').click();
    await page.waitForTimeout(500);
    await shot(page, ".knavery.sheet.actor", `sheet-description-${scheme}`);
    await page.locator('.knavery.sheet.actor nav.tabs a[data-tab="items"]').click();
    await page.evaluate((id) => game.actors.get(id).sheet.close(), id);
    await page.waitForTimeout(400);
  }

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
