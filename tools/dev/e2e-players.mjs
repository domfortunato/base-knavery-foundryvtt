#!/usr/bin/env node
/**
 * Multi-user probe: the GM and two players (Alice, Bob) in three browsers.
 *
 *   FOUNDRY_URL=http://192.168.30.127:30000 node tools/dev/e2e-players.mjs
 *
 *   1. GM asks Alice for a save with a reason; Alice's client prompts with
 *      the reason and a locked difficulty; the result lands on the dashboard.
 *   2. Alice gives an item to Bob's character; Bob accepts on the chat card.
 *   3. Alice edits her sheet by hand; the change-log card reaches the GM.
 *   4. Alice prints her sheet (a new window opens).
 *   5. Alice (no actor-create permission) creates a character through the GM.
 */
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";
import { VIEWPORT, joinAs, joinAsGM, watchErrors, watchdog } from "./lib.mjs";

const OUT = path.resolve("tools/dev/out");
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};

const browser = await chromium.launch();
watchdog(300000, "e2e-players", () => browser.close());
const ctx = () => browser.newContext({ viewport: VIEWPORT });
const gm = await (await ctx()).newPage();
const alice = await (await ctx()).newPage();
const bob = await (await ctx()).newPage();
const errors = [...[gm, alice, bob].map(watchErrors)];

await joinAsGM(gm);
const ids = await gm.evaluate(async () => {
  for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
  const A = game.users.getName("Alice"); const B = game.users.getName("Bob");
  const O = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const a = await Actor.create({ name: "Probe Alice PC", type: "character", ownership: { default: 0, [A.id]: O }, system: { coins: 100, hp: { value: 4, max: 4 } } });
  const b = await Actor.create({ name: "Probe Bob PC", type: "character", ownership: { default: 0, [B.id]: O } });
  const [lamp] = await a.createEmbeddedDocuments("Item", [{ name: "Probe Lantern", type: "item", system: { slots: 1, cost: 20 } }]);
  for (const m of game.messages.contents.slice(-50)) if (m.speaker?.alias === "Probe") await m.delete();
  return { a: a.id, b: b.id, lamp: lamp.id };
});
await joinAs(alice, "Alice");
await joinAs(bob, "Bob");

// 1. Roll request with a reason.
await gm.evaluate(() => game.knavery.openDashboard());
await gm.waitForSelector("#knavery-gm-dashboard .dash-pc", { timeout: 10000 });
await gm.locator(`#knavery-gm-dashboard input[name="pc"][value="${ids.a}"]`).check();
await gm.locator('#knavery-gm-dashboard select[name="check"]').selectOption("save:poison");
await gm.locator('#knavery-gm-dashboard input[name="difficulty"]').fill("7");
await gm.locator('#knavery-gm-dashboard input[name="reason"]').fill("The dart was poisoned");
await gm.locator('#knavery-gm-dashboard button[data-action="sendRequest"]').click();
await alice.waitForSelector(".knavery-roll-prompt", { timeout: 15000 });
const prompt = await alice.evaluate(() => {
  const el = document.querySelector(".knavery-roll-prompt");
  return { reason: el.querySelector(".roll-reason")?.textContent.trim(), diff: el.querySelector('input[name="difficulty"]')?.value, locked: el.querySelector('input[name="difficulty"]')?.readOnly };
});
ok(prompt.reason?.includes("The dart was poisoned"), "Alice's prompt shows the GM's reason", JSON.stringify(prompt));
ok(prompt.diff === "7" && prompt.locked, "the GM's difficulty is preset and locked", JSON.stringify(prompt));
await alice.locator(".knavery-roll-prompt").screenshot({ path: path.join(OUT, "request-prompt.png") });
await alice.locator('.knavery-roll-prompt button[data-action="normal"]').click();
await gm.waitForSelector("#knavery-gm-dashboard .request li.state-success, #knavery-gm-dashboard .request li.state-failure", { timeout: 15000 });
ok(true, "the result came back to the dashboard");
await gm.locator("#knavery-gm-dashboard").screenshot({ path: path.join(OUT, "dashboard-results.png") });
await gm.evaluate(() => foundry.applications.instances.get("knavery-gm-dashboard")?.close());

// 2. Alice gives the lantern to Bob's character; Bob accepts.
await alice.evaluate((id) => game.actors.get(id).sheet.render(true), ids.a);
await alice.waitForSelector(".knavery.sheet.actor .item-give", { timeout: 15000 });
await alice.locator(".knavery.sheet.actor .item-give").first().click();
await alice.waitForSelector('input[name="offerTarget"]', { timeout: 10000 });
await alice.locator(`input[name="offerTarget"][value="Actor.${ids.b}"]`).check();
await alice.locator('button[data-action="offer"]').click();
await bob.waitForFunction(() => [...document.querySelectorAll(".knavery-offer-actions button")].length > 0, null, { timeout: 15000 });
await bob.locator(".knavery-offer-actions button").first().click();
await gm.waitForFunction(([a, b]) => game.actors.get(b).items.getName("Probe Lantern") && !game.actors.get(a).items.getName("Probe Lantern"), [ids.a, ids.b], { timeout: 15000 });
ok(true, "the lantern moved from Alice's character to Bob's");

// 3. Change log: Alice edits her coins by hand.
const beforeLogs = await gm.evaluate(() => game.messages.filter((m) => m.getFlag("base-knavery", "changeLog")).length);
await alice.locator('.knavery.sheet.actor input[name="system.coins"]').fill("250");
await alice.locator('.knavery.sheet.actor input[name="system.coins"]').press("Tab");
await gm.waitForFunction((n) => game.messages.filter((m) => m.getFlag("base-knavery", "changeLog")).length > n, beforeLogs, { timeout: 15000 });
const log = await gm.evaluate(() => {
  const m = game.messages.filter((x) => x.getFlag("base-knavery", "changeLog")).at(-1);
  return { entries: m.getFlag("base-knavery", "changeLog").entries, whisper: m.whisper.length };
});
ok(log.entries.some((e) => e.p === "system.coins" && e.to === 250), "the change log records 100 → 250 coins", JSON.stringify(log));

// 4. Print.
const [popup] = await Promise.all([
  alice.context().waitForEvent("page", { timeout: 15000 }),
  alice.locator('.knavery.sheet.actor .window-header button[data-action="printSheet"]').click(),
]);
await popup.waitForLoadState("domcontentloaded");
await popup.waitForFunction(() => document.querySelector("h1")?.textContent.includes("Probe Alice PC"), null, { timeout: 15000 });
ok(true, "print opens a page with the character");
await popup.close();

// 5. Player creation through the GM.
const canCreate = await alice.evaluate(() => game.user.can("ACTOR_CREATE"));
alice.evaluate(() => { game.knavery.createCharacterInteractive(); });
await alice.waitForSelector(".knavery-create", { timeout: 10000 });
await alice.locator('.knavery-create input[name="name"]').fill("Probe Relay");
await alice.locator('.knavery-create button[data-action="random"]').click();
await gm.waitForFunction(() => game.actors.getName("Probe Relay"), null, { timeout: 30000 });
const relay = await gm.evaluate(() => {
  const a = game.actors.getName("Probe Relay");
  return { owner: a.testUserPermission(game.users.getName("Alice"), "OWNER"), level: a.system.level };
});
ok(!canCreate && relay.owner, "Alice (no create permission) got a character created by the GM", JSON.stringify({ canCreate, relay }));

// Cleanup.
await gm.evaluate(async () => {
  for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
});
const real = errors.flat().filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
