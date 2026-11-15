#!/usr/bin/env node
/**
 * The screenshots for the Foundry package listing (2026-11-15), in both colour schemes: the character
 * sheet's Knave and Inventory pages, the Game Master's Dashboard (Party and Time), the Attack window and
 * its chat card, the welcome window and Create Character. One prepared knave with a portrait and gear;
 * the shots land in <MB_SHOTS>/listing/ with names fit to upload. Its checks only say each shot was taken.
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
watchdog(300000, "listing", () => browser.close());
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
const closeAll = () => page.evaluate(() => {
  for (const app of [...foundry.applications.instances.values()]) if (app.id !== "sidebar" && !app.id?.startsWith?.("ui-") && app.options?.classes?.includes?.("knavery")) app.close();
});

await withSettings(page, async () => {
  const id = await page.evaluate(async () => {
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    const a = await game.knavery.createCharacter({ mode: "random", level: 3, name: "Probe Mirela Ashgrove" });
    // Played, not being made: Char Gen Mode off; Alice owns her, so the Party page lists her.
    const alice = game.users.getName("Alice");
    await a.update({ name: "Mirela Ashgrove", "system.coins": 340, "system.xp": 2600, "system.pronouns": "she/her",
      "system.generationEnabled": false, ...(alice ? { [`ownership.${alice.id}`]: 3 } : {}) }, { knCreation: true });
    await a.createEmbeddedDocuments("Item", [
      { name: "Sword", type: "weapon", system: { damage: "d6", attackType: "melee", equipped: true, slots: 1, hands: 1 } },
      { name: "Torch", type: "item", system: { slots: 1, quantity: 1, lit: true } },
    ]);
    return a.id;
  });
  const npcId = await page.evaluate(async () => (await Actor.create({ name: "Probe Goblin", type: "npc", system: { hp: { value: 4, max: 4 } } })).id);

  for (const scheme of ["dark", "light"]) {
    await page.evaluate((s) => game.settings.set("core", "uiConfig", foundry.utils.mergeObject(game.settings.get("core", "uiConfig"), { colorScheme: { applications: s, interface: s } })), scheme);
    // The character sheet: the Knave page, then Inventory.
    await page.evaluate(async (x) => { const s = game.actors.get(x).sheet; await s.render(true); s.setPosition({ height: 1300 }); }, id);
    await page.waitForSelector(".knavery.sheet.actor", { timeout: 15000 });
    await shot(".knavery.sheet.actor", `01-sheet-knave-${scheme}`);
    await page.locator('.knavery.sheet.actor nav.knavery-tab-rail button[data-tab="inventory"]').click();
    await shot(".knavery.sheet.actor", `02-sheet-inventory-${scheme}`);
    await page.locator('.knavery.sheet.actor nav.knavery-tab-rail button[data-tab="knave"]').click();
    await page.evaluate((x) => game.actors.get(x).sheet.close(), id);
    // The dashboard: Party, then Dice.
    await page.evaluate(() => game.knavery.openDashboard());
    await page.waitForSelector("#knavery-gm-dashboard", { timeout: 15000 });
    for (const [tab, n] of [["party", "03"], ["time", "04"]]) {
      await page.evaluate((t) => foundry.applications.instances.get("knavery-gm-dashboard").changeTab(t, "primary"), tab);
      await shot("#knavery-gm-dashboard", `${n}-dashboard-${tab}-${scheme}`);
    }
    await page.evaluate(() => foundry.applications.instances.get("knavery-gm-dashboard").close());
    // The Attack window, then its roll in the chat.
    await page.evaluate((x) => { import("/systems/base-knavery/module/rolls.js").then((m) => m.openAttack(game.actors.get(x))); }, id);
    await page.waitForSelector(".knavery-roll-prompt", { timeout: 15000 });
    await shot(".knavery-roll-prompt", `05-attack-window-${scheme}`);
    await page.locator('.knavery-roll-prompt button[data-action="normal"]').click();
    await page.evaluate(() => { ui.sidebar.expand?.(); ui.sidebar.changeTab("chat", "primary"); });
    await page.waitForTimeout(1500);
    await shot("#chat .chat-message", `06-attack-card-${scheme}`);
    // The welcome window and Create Character.
    await page.evaluate(() => game.knavery.openWelcome());
    await page.waitForSelector("#knavery-welcome", { timeout: 15000 });
    await shot("#knavery-welcome", `07-welcome-${scheme}`);
    await page.evaluate(() => foundry.applications.instances.get("knavery-welcome")?.close());
    await page.evaluate(() => { game.knavery.createCharacterInteractive(); });
    await page.waitForSelector(".knavery-create", { timeout: 15000 }).catch(() => {});
    await shot(".knavery-create", `08-create-character-${scheme}`);
    await closeAll();
    await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app instanceof foundry.applications.api.DialogV2) app.close(); });
  }
  await page.evaluate(async (ids) => {
    for (const x of ids) await game.actors.get(x)?.delete();
    for (const m of game.messages.filter((x) => x.timestamp > Date.now() - 600000 && x.speaker?.alias === "Mirela Ashgrove")) await m.delete();
  }, [id, npcId]);
});

ok(taken.length === 16, `the listing's 16 screenshots were taken (${OUT})`, `only: ${taken.join(", ")}`);
const real = errors.flat().filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
