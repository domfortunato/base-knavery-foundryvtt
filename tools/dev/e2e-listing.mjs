#!/usr/bin/env node
/**
 * The three screenshots on the Foundry package listing (docs/listing/, 2026-11-15), dark scheme:
 *   welcome.png          the welcome window in a world that plays Knave 1e with no PDF chosen, so it shows
 *                        "This world plays Knave." and the box to upload the Knave 2e book (user, 2026-11-15:
 *                        the listing's welcome must show a 1e world that can move up to 2e)
 *   character-sheet.png  the character sheet's Knave page, one prepared knave
 *   attack-window.png    the Attack window the player sees
 * The world's rule settings are put back afterwards (withSettings). Shots land in <MB_SHOTS>/listing/;
 * copy the ones that changed into docs/listing/. Its checks only say each shot was taken.
 *
 *   FOUNDRY_URL=http://<private-ip>:30000 node tools/dev/e2e-listing.mjs   (npm run dev:listing; fleet only)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { SHOTS, VIEWPORT, joinAsGM, watchErrors, watchdog, withSettings } from "./lib.mjs";

const OUT = path.join(SHOTS, "listing");
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};

const browser = await chromium.launch();
watchdog(240000, "listing", () => browser.close());
const page = await browser.newPage({ viewport: { width: VIEWPORT.width, height: 1400 }, deviceScaleFactor: 2 });
const errors = watchErrors(page);
await joinAsGM(page);

const taken = [];
const shot = async (selector, name) => {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(700);
  const loc = page.locator(selector).last();
  if (!(await loc.count())) return;
  await loc.screenshot({ path: path.join(OUT, `${name}.png`) });
  taken.push(name);
};

await withSettings(page, async () => {
  await page.evaluate(() => game.settings.set("core", "uiConfig", foundry.utils.mergeObject(game.settings.get("core", "uiConfig"), { colorScheme: { applications: "dark", interface: "dark" } })));
  const id = await page.evaluate(async () => {
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    const a = await game.knavery.createCharacter({ mode: "random", level: 3, name: "Probe Mirela Ashgrove" });
    // Played, not being made: Char Gen Mode off.
    await a.update({ name: "Mirela Ashgrove", "system.coins": 340, "system.xp": 2600, "system.pronouns": "she/her",
      "system.generationEnabled": false }, { knCreation: true });
    await a.createEmbeddedDocuments("Item", [
      { name: "Sword", type: "weapon", system: { damage: "d6", attackType: "melee", equipped: true, slots: 1, hands: 1 } },
      { name: "Torch", type: "item", system: { slots: 1, quantity: 1, lit: true } },
    ]);
    return a.id;
  });
  // Creation opens the new sheet: close it, so each shot finds one window.
  await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app.document) app.close(); });
  await page.waitForTimeout(500);

  // The character sheet's Knave page.
  await page.evaluate(async (x) => { const s = game.actors.get(x).sheet; await s.render(true); s.setPosition({ height: 790 }); }, id);
  await page.waitForSelector(".knavery.sheet.actor", { timeout: 15000 });
  await shot(".knavery.sheet.actor", "character-sheet");
  await page.evaluate((x) => game.actors.get(x).sheet.close(), id);

  // The Attack window.
  await page.evaluate((x) => { import("/systems/base-knavery/module/rolls.js").then((m) => m.openAttack(game.actors.get(x))); }, id);
  await page.waitForSelector(".knavery-roll-prompt", { timeout: 15000 });
  await shot(".knavery-roll-prompt", "attack-window");
  await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app.element?.classList?.contains("knavery-roll-prompt")) app.close(); });

  // The welcome window: a Knave 1e world with no rulebook PDF chosen.
  await page.evaluate(async () => {
    const R = await import("/systems/base-knavery/module/rules.js");
    await R.applyRules("1e");
    await game.settings.set("base-knavery", "rulebook-pdf", "");
    game.knavery.openWelcome();
  });
  await page.waitForSelector("#knavery-welcome .knavery-welcome-rulebook", { timeout: 15000 });
  const world = await page.locator("#knavery-welcome .knavery-welcome-world").innerText();
  ok(/Knave\.$/.test(world.trim()), `the welcome says the world plays Knave 1e ("${world.trim()}")`);
  await shot("#knavery-welcome", "welcome");
  await page.evaluate(() => foundry.applications.instances.get("knavery-welcome")?.close());

  await page.evaluate(async (x) => { await game.actors.get(x)?.delete(); }, id);
});

ok(taken.length === 3, `the listing's 3 screenshots were taken (${OUT})`, `only: ${taken.join(", ")}`);
const real = errors.flat().filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
