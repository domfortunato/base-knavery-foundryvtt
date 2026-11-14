#!/usr/bin/env node
/**
 * Char Gen Mode and growth: who may edit abilities, level and XP; the title-bar
 * Level Up arrow and its window; the HP rules; random creation from placed
 * ability points (one spellbook per STARTING point of INT); the GM's notes; the dashboard's XP tab; the ability
 * roll link's tooltip; the text size; the footer; traits; changing careers at level 1;
 * the Knave 1e rule hacks (1000-XP levels, d8 HP, random raises, group initiative); the narrow
 * sheet, its Attack window and raised abilities; the welcome window's licence notice; random creation rolling by
 * default; a blank sheet held to its level's ability points, with HP, coin and career dice; the Attack window's
 * Target list; the narrow header; Rest by the book; red splats; compact attack cards; labels that fit; Create NPC;
 * spell items from the rulebook; weapons and armor first; rations per slot; the review #2 fixes; time and hazards; morale and wages; Backstory and the Knave-page traits; item badges;
 * the Knave 1e rules (part 26) and their second bundle: quality and wear, copper prices, coin slots, daily wages (part 27); the Party tab, treasure to XP, selling and free repair (part 28). GM, Alice and Bob
 * in three browsers.
 *
 *   FOUNDRY_URL=http://<private-ip>:30000 node tools/dev/e2e-chargen.mjs   (npm run dev:chargen)
 *
 * Runs on the probe fleet, never from the workstation (CLAUDE.md). Everything
 * it makes is named "Probe …" (or remembered, for the Careers and Spells tables
 * it adds to a world that has none) and deleted at the end; withSettings puts
 * the settings back.
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { SHOTS, TIME_SCALE, VIEWPORT, joinAs, joinAsGM, watchErrors, watchdog, withSettings } from "./lib.mjs";

fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};
const T = (ms) => ms * TIME_SCALE;
const SYS = "/systems/base-knavery/module";

const browser = await chromium.launch();
watchdog(1500000, "e2e-chargen", () => browser.close());
const ctx = () => browser.newContext({ viewport: VIEWPORT });
const gm = await (await ctx()).newPage();
const alice = await (await ctx()).newPage();
const bob = await (await ctx()).newPage();
const errors = [gm, alice, bob].map(watchErrors);
const closeDialogs = async () => {
  for (const page of [gm, alice, bob]) {
    await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app instanceof foundry.applications.api.DialogV2) app.close(); }).catch(() => {});
  }
};
/** One part: a throw fails that part and the rest still run. */
const section = async (name, fn) => {
  try { await fn(); } catch (e) {
    failures++;
    console.error(`  FAIL  ${name}: threw ${String(e?.message ?? e).split("\n")[0]}`);
    await closeDialogs();
  }
};
const SET = (page, key, value) => page.evaluate(([k, v]) => game.settings.set("base-knavery", k, v), [key, value]);
const sheet = ".knavery.sheet.actor";

await joinAsGM(gm);
let made = { tables: [] };
await withSettings(gm, async () => {
  const ids = await gm.evaluate(async () => {
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    for (const t of game.tables.filter((x) => x.name.startsWith("Probe"))) await t.delete();
    const A = game.users.getName("Alice"); const B = game.users.getName("Bob");
    const O = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const a = await Actor.create({ name: "Probe Alice PC", type: "character", ownership: { default: 0, [A.id]: O }, system: { hp: { value: 4, max: 4 } } });
    const b = await Actor.create({ name: "Probe Bob PC", type: "character", ownership: { default: 0, [B.id]: O } });
    // Creation draws from the world's Careers and Spells tables; a world with none gets probe rows for the run.
    const tables = [];
    const rows = (names) => names.map((name, i) => ({ type: "text", name, range: [i + 1, i + 1], weight: 1 }));
    if (!game.tables.getName("Careers")) {
      tables.push((await RollTable.create({ name: "Careers", formula: "1d3", results: rows(["Probe Lutist: Probe Lute, Probe Songbook", "Probe Baker: Probe Rolling Pin", "Probe Smith: Probe Hammer"]) })).id);
    }
    if (!game.tables.getName("Spells")) {
      tables.push((await RollTable.create({ name: "Spells", formula: "1d2", results: rows(["Probe Spark", "Probe Mist"]) })).id);
    }
    return { a: a.id, b: b.id, tables };
  });
  made = { tables: ids.tables };
  await SET(gm, "allow-player-randomization", true);
  await SET(gm, "allow-player-level-xp", false);
  await SET(gm, "level-hp-rule", "reroll");
  await SET(gm, "first-level-hp", "1d6");
  await joinAs(alice, "Alice");
  await joinAs(bob, "Bob");
  const openAs = async (page, id) => {
    await page.evaluate((x) => game.actors.get(x).sheet.render(true), id);
    await page.waitForSelector(`${sheet}[id$="${id}"]`, { timeout: T(15000) });
  };
  const inputs = (page, id) => page.evaluate((x) => {
    const el = game.actors.get(x).sheet.element;
    return {
      str: el.querySelector('input[name="system.abilities.STR.value"]')?.disabled,
      // No field at all (Char Gen Mode off: plain text) counts as locked.
      level: el.querySelector('input[name="system.level"]')?.disabled ?? true,
      xp: el.querySelector('input[name="system.xp"]')?.disabled ?? true,
    };
  }, id);
  const settle = () => alice.waitForTimeout(T(700));

  /* ------------------------------------------------------------------ */
  await section("1. Abilities, level and XP follow Char Gen Mode and the GM's switch.", async () => {
    await openAs(alice, ids.a);
    const off = await inputs(alice, ids.a);
    ok(off.str && off.level && off.xp, "Char Gen Mode off: Alice's abilities, level and XP are locked", JSON.stringify(off));
    await alice.evaluate((x) => game.actors.get(x).update({ "system.xp": 999, "system.abilities.STR.value": 5, "system.gmNotes": "<p>forged</p>" }), ids.a);
    await settle();
    const forged = await gm.evaluate((x) => { const s = game.actors.get(x)._source.system; return { xp: s.xp, str: s.abilities.STR.value, notes: s.gmNotes }; }, ids.a);
    ok(forged.xp === 0 && forged.str === 0 && forged.notes === "", "a forged update from Alice changes none of them", JSON.stringify(forged));

    await gm.evaluate((x) => game.actors.get(x).update({ "system.generationEnabled": true }), ids.a);
    await settle();
    const on = await inputs(alice, ids.a);
    ok(on.str === false && on.level && on.xp, "Char Gen Mode on: abilities open, level and XP still locked (switch off)", JSON.stringify(on));
    await alice.evaluate((x) => game.actors.get(x).update({ "system.abilities.STR.value": 2, "system.xp": 50 }), ids.a);
    await settle();
    const half = await gm.evaluate((x) => { const s = game.actors.get(x)._source.system; return { xp: s.xp, str: s.abilities.STR.value }; }, ids.a);
    ok(half.str === 2 && half.xp === 0, "Alice can set STR but not XP", JSON.stringify(half));

    await SET(gm, "allow-player-level-xp", true);
    await settle();
    const open = await inputs(alice, ids.a);
    ok(open.level === false && open.xp === false, "the GM's switch on: level and XP open too", JSON.stringify(open));
    await alice.evaluate((x) => game.actors.get(x).update({ "system.xp": 100, "system.gmNotes": "<p>forged</p>" }), ids.a);
    await settle();
    const now = await gm.evaluate((x) => { const s = game.actors.get(x)._source.system; return { xp: s.xp, notes: s.gmNotes }; }, ids.a);
    ok(now.xp === 100 && now.notes === "", "Alice changes her XP, never the GM's notes", JSON.stringify(now));
    await SET(gm, "allow-player-level-xp", false);
    await gm.evaluate((x) => game.actors.get(x).update({ "system.xp": 0, "system.abilities.STR.value": 0, "system.generationEnabled": false }), ids.a);
  });

  /* ------------------------------------------------------------------ */
  await section("2. The Level Up arrow and window.", async () => {
    await gm.evaluate((x) => game.actors.get(x).update({ "system.xp": 2000 }), ids.a);
    await openAs(alice, ids.a);
    await settle();
    const arrow = `${sheet}[id$="${ids.a}"] .window-header button[data-action="levelUp"]`;
    const hiddenOff = await alice.evaluate((s) => document.querySelector(s)?.classList.contains("knavery-header-hidden"), arrow);
    await gm.evaluate((x) => game.actors.get(x).update({ "system.generationEnabled": true }), ids.a);
    await settle();
    const hiddenOn = await alice.evaluate((s) => document.querySelector(s)?.classList.contains("knavery-header-hidden"), arrow);
    ok(hiddenOff === true && hiddenOn === false, "the arrow shows only with the XP AND Char Gen Mode on", JSON.stringify({ hiddenOff, hiddenOn }));
    await alice.locator(arrow).click();
    await alice.waitForSelector(".kn-levelup", { timeout: T(10000) });
    for (const k of ["STR", "DEX", "CON"]) await alice.locator(`.kn-levelup input[name="pick"][value="${k}"]`).check();
    await alice.locator('.application:has(.kn-levelup) button[data-action="ok"]').click();
    await gm.waitForFunction((x) => game.actors.get(x).system.level === 2, ids.a, { timeout: T(15000) });
    const after = await gm.evaluate((x) => { const s = game.actors.get(x)._source.system; return { str: s.abilities.STR.value, dex: s.abilities.DEX.value, con: s.abilities.CON.value, int: s.abilities.INT.value, max: s.hp.max }; }, ids.a);
    ok(after.str === 1 && after.dex === 1 && after.con === 1 && after.int === 0, "the window raises the three abilities picked, with the level & XP switch off", JSON.stringify(after));
    ok(after.max >= 5 && after.max <= 12, "max HP follows the book: 2d6, or 4 + 1", JSON.stringify(after));
    await settle();
    const gone = await alice.evaluate((s) => document.querySelector(s)?.classList.contains("knavery-header-hidden"), arrow);
    ok(gone === true, "the arrow goes once the next level needs more XP", String(gone));
  });

  /* ------------------------------------------------------------------ */
  await section("3. The HP rules and the Growth line.", async () => {
    const r = await gm.evaluate(async (sys) => {
      const lu = await import(`${sys}/level-up.js`);
      const set = (k, v) => game.settings.set("base-knavery", k, v);
      const out = {};
      await set("level-hp-rule", "add1d6");
      out.add = (await lu.rollLevelHp(3, 10)).max;
      await set("level-hp-rule", "rerollBest");
      out.bestKeep = (await lu.rollLevelHp(3, 30)).max;
      await set("level-hp-rule", "reroll");
      out.bookBump = (await lu.rollLevelHp(2, 30)).max;
      await set("first-level-hp", "1d4+2");
      out.formula = lu.levelHpFormula(3);
      const { buildCharacter } = await import(`${sys}/character-generator.js`);
      out.firstHp = (await buildCharacter({ level: 1 })).system.hp.max;
      return out;
    }, SYS);
    ok(r.add >= 11 && r.add <= 16, "Add 1d6: 10 becomes 11–16", JSON.stringify(r));
    ok(r.bestKeep === 30, "Reroll, keep the better: a low roll keeps 30", JSON.stringify(r));
    ok(r.bookBump === 31, "Knave 2e: a low roll adds 1", JSON.stringify(r));
    ok(r.formula === "1d4 + 2 + 2d6" && r.firstHp >= 3 && r.firstHp <= 6, "1d4+2 at first level, and as the first die of a reroll", JSON.stringify(r));
    await openAs(gm, ids.a);
    await gm.waitForTimeout(T(500));
    const line = await gm.evaluate((x) => game.actors.get(x).sheet.element.querySelector(".knavery-level-rule")?.textContent ?? "", ids.a);
    ok(line.includes("1d4 + 2 + 1d6") || line.includes("1d4 + 2 + 2d6"), "the Growth page says what the next level brings, by the GM's rule", line.trim());
    await SET(gm, "first-level-hp", "1d6");
    await gm.evaluate((x) => game.actors.get(x).sheet.close(), ids.a);
  });

  /* ------------------------------------------------------------------ */
  await section("4. Random creation from placed points; spellbooks from the starting INT.", async () => {
    const r = await gm.evaluate(async (sys) => {
      const { buildCharacter, createCharacter } = await import(`${sys}/character-generator.js`);
      const one = await buildCharacter({ level: 1, abilities: { STR: 2, INT: 1 } });
      const three = await buildCharacter({ level: 3, abilities: { STR: 2, INT: 1 } });
      const sum = (s) => Object.values(s.abilities).reduce((n, x) => n + x.value, 0);
      const actor = await createCharacter({ mode: "random", level: 1, name: "Probe Gen", abilities: { STR: 2, INT: 1 } });
      await actor.sheet.close();
      const careers = actor.items.filter((i) => i.type === "career");
      return {
        oneVals: Object.fromEntries(Object.entries(one.system.abilities).map(([k, v]) => [k, v.value])),
        threeSum: sum(three.system), threeBooks: three.items.filter((i) => i.type === "spellbook").length,
        threeInt: three.system.abilities.INT.value,
        bad: (await buildCharacter({ level: 1, abilities: { STR: 9 } })).notes[0],
        actorStr: actor.system.abilities.STR.value, actorInt: actor.system.abilities.INT.value,
        careers: careers.length,
      };
    }, SYS);
    const v = r.oneVals;
    ok(v.STR === 2 && v.INT === 1 && v.DEX === 0 && v.CON === 0 && v.WIS === 0 && v.CHA === 0, "level 1: exactly the points placed", JSON.stringify(v));
    ok(r.threeSum === 9 && r.threeBooks === 1, "level 3: three points + two levels of three, and ONE spellbook for the one starting INT", JSON.stringify(r));
    ok(/roll|3d6|rolled/i.test(r.bad), "points that do not total 3 are refused, and the dice decide", r.bad);
    ok(r.actorStr === 2 && r.actorInt === 1 && r.careers === 2, "a created character carries its points and two careers", JSON.stringify(r));
  });

  /* ------------------------------------------------------------------ */
  await section("7. The GM's notes: the GM writes, the player reads.", async () => {
    await gm.evaluate((x) => game.actors.get(x).update({ "system.gmNotes": "<p>Probe owes the guild 40c.</p>" }), ids.a);
    await openAs(gm, ids.a);
    await openAs(alice, ids.a);
    await settle();
    const gmSide = await gm.evaluate((x) => !!game.actors.get(x).sheet.element.querySelector('prose-mirror[name="system.gmNotes"]'), ids.a);
    const aliceSide = await alice.evaluate((x) => {
      const el = game.actors.get(x).sheet.element;
      return { editor: !!el.querySelector('prose-mirror[name="system.gmNotes"]'), text: el.querySelector(".knavery-gm-notes-text")?.textContent ?? "" };
    }, ids.a);
    ok(gmSide, "the GM gets an editor for them", String(gmSide));
    ok(!aliceSide.editor && aliceSide.text.includes("owes the guild"), "Alice reads them, with no editor", JSON.stringify(aliceSide));
    await gm.evaluate((x) => game.actors.get(x).sheet.close(), ids.a);
  });

  /* ------------------------------------------------------------------ */
  await section("8. The dashboard's XP tab: same, split and individual.", async () => {
    await gm.evaluate((xs) => Promise.all(xs.map((x) => game.actors.get(x).update({ "system.xp": 0 }))), [ids.a, ids.b]);
    await gm.evaluate(() => game.knavery.openDashboard());
    await gm.waitForSelector("#knavery-gm-dashboard", { timeout: T(10000) });
    await gm.locator('#knavery-gm-dashboard nav [data-tab="xp"]').first().click();
    const D = "#knavery-gm-dashboard";
    const award = async (mode, fill) => {
      await gm.locator(`${D} select[name="xpMode"]`).selectOption(mode);
      await fill();
      await gm.locator(`${D} button[data-action="awardXp"]`).click();
      await gm.waitForTimeout(T(900));
    };
    const xp = () => gm.evaluate((xs) => xs.map((x) => game.actors.get(x).system.xp), [ids.a, ids.b]);
    const tick = async () => { for (const x of [ids.a, ids.b]) await gm.locator(`${D} input[name="xpPc"][value="${x}"]`).check(); };
    await award("each", async () => { await tick(); await gm.locator(`${D} input[name="xpAmount"]`).fill("100"); });
    const each = await xp();
    await award("split", async () => { await tick(); await gm.locator(`${D} input[name="xpAmount"]`).fill("301"); });
    const split = await xp();
    await award("individual", async () => { await gm.locator(`${D} input[name="xpFor.${ids.a}"]`).fill("7"); });
    const single = await xp();
    ok(each[0] === 100 && each[1] === 100, "same amount to each: +100 apiece", JSON.stringify(each));
    ok(split[0] === 250 && split[1] === 250, "301 split between two: +150 apiece, rounded down", JSON.stringify(split));
    ok(single[0] === 257 && single[1] === 250, "a different amount to each: only Alice's box", JSON.stringify(single));
    const card = await gm.evaluate(() => game.messages.contents.at(-1)?.getFlag("base-knavery", "xpAward"));
    ok(Array.isArray(card) && card.length === 1, "each award posts a card of who got what", JSON.stringify(card));
    await gm.screenshot({ path: `${SHOTS}/dashboard-xp.png` });
    await gm.evaluate(() => foundry.applications.instances.get("knavery-gm-dashboard")?.close());
  });

  /* ------------------------------------------------------------------ */
  await section("9. The ability roll link: a big d20 with the name, and a tooltip.", async () => {
    await openAs(alice, ids.a);
    await alice.evaluate((x) => game.actors.get(x).sheet.changeTab("knave", "primary"), ids.a);
    await settle();
    const size = await alice.evaluate((x) => {
      const icon = game.actors.get(x).sheet.element.querySelector(".knavery-ability-name .roll-icon");
      return icon ? parseFloat(getComputedStyle(icon).fontSize) : 0;
    }, ids.a);
    ok(size >= 20, "the d20 is large", String(size));
    await alice.locator(`${sheet}[id$="${ids.a}"] .knavery-ability.STR-ability .roll-icon`).hover();
    const tip = await alice.waitForFunction(() => {
      const t = document.querySelector("#tooltip");
      return t?.classList.contains("active") && t.textContent.trim() ? t.textContent.trim() : null;
    }, null, { timeout: T(5000) }).then((h) => h.jsonValue()).catch(() => "");
    ok(/Strength/i.test(tip), "hovering the d20 shows the ability's tooltip", tip);
    await alice.screenshot({ path: `${SHOTS}/chargen-sheet.png` });
    const ac = await alice.evaluate(() => game.i18n.localize("KNAVERY.ACAuto"));
    ok(ac === "AC = 11 plus 1 point for each piece of equipped armor.", "the AC tooltip states the rule", ac);
  });

  /* ------------------------------------------------------------------ */
  await section("10. Text size, the short footer, the fist icon, the Hacks labels.", async () => {
    const before = await gm.evaluate(() => game.settings.get("base-knavery", "text-size"));
    const measure = (x) => gm.evaluate(async (id) => {
      const a = game.actors.get(id);
      await a.sheet.render({ force: true });
      await new Promise((r) => setTimeout(r, 500));
      const name = a.sheet.element.querySelector(".knavery-ability-name");
      const card = document.querySelector("#chat .chat-message .card-title h3, #chat .chat-message h3");
      return { name: parseFloat(getComputedStyle(name).fontSize), card: card ? parseFloat(getComputedStyle(card).fontSize) : null };
    }, x);
    await gm.evaluate(() => game.settings.set("base-knavery", "text-size", "1"));
    const small = await measure(ids.a);
    await gm.evaluate(() => game.settings.set("base-knavery", "text-size", "1.4"));
    const big = await measure(ids.a);
    await gm.evaluate((v) => game.settings.set("base-knavery", "text-size", v), before);
    ok(Math.abs(big.name / small.name - 1.4) < 0.05, "the ability names grow with the text size, live", JSON.stringify({ small, big }));
    ok(small.card === null || small.card === big.card, "chat cards keep their size", JSON.stringify({ small, big }));
    ok(before === "1.2", "the default is Large", String(before));

    const foot = await gm.evaluate((id) => game.actors.get(id).sheet.element.querySelector(".knavery-compat-caption")?.textContent.trim(), ids.a);
    ok(foot === "Base Knavery is an unofficial fan-made Foundry system for Knave (first and second editions) and is not affiliated with Questing Beast LLC.", "the sheet footer is the short line", foot);
    const welcome = await gm.evaluate(async () => {
      await game.knavery.openWelcome();
      await new Promise((r) => setTimeout(r, 800));
      const t = document.querySelector(".knavery-welcome-disclaimer")?.textContent.trim() ?? "";
      for (const app of [...foundry.applications.instances.values()]) if (app.constructor.name === "WelcomeWindow") await app.close();
      return t;
    });
    ok(welcome === (await gm.evaluate(() => game.i18n.localize("KNAVERY.Disclaimer"))), "the welcome window keeps the full disclaimer", welcome);

    const fist = await gm.evaluate(async (id) => {
      const a = game.actors.get(id);
      await a.createEmbeddedDocuments("Item", [{ name: "Probe Club", type: "weapon", system: { damage: "d6" } }]);
      await a.sheet.render({ force: true });
      await new Promise((r) => setTimeout(r, 500));
      return !!a.sheet.element.querySelector(".item-toggle-equipped i.fa-hand-fist");
    }, ids.a);
    ok(fist, "the equip toggle is a fist", String(fist));
    await gm.evaluate((id) => game.actors.get(id).sheet.close(), ids.a);

    const labels = await gm.evaluate(async () => {
      const menu = new (game.settings.menus.get("base-knavery.hacks").type)();
      await menu.render({ force: true });
      await new Promise((r) => setTimeout(r, 500));
      const rows = [...menu.element.querySelectorAll(".form-group > label")].map((l) => {
        const lh = parseFloat(getComputedStyle(l).lineHeight) || 20;
        return { text: l.textContent.trim(), lines: Math.round(l.getBoundingClientRect().height / lh) };
      });
      await menu.close();
      return rows;
    });
    ok(labels.length >= 4 && labels.every((r) => r.lines <= 1), "every Rules label sits on one line", JSON.stringify(labels));
  });

  /* ------------------------------------------------------------------ */
  await section("11. Traits: expanded, rolled for a blank sheet, pick-lists in Char Gen Mode.", async () => {
    const r = await gm.evaluate(async (sys) => {
      const made = [];
      const { createCharacter } = await import(`${sys}/character-generator.js`);
      const blank = await createCharacter({ mode: "blank", name: "Probe Blank" });
      await new Promise((res) => setTimeout(res, 600));
      const el = blank.sheet.element;
      const t = blank.system.traits;
      const out = {
        made, rows: el.querySelectorAll(".trait-row").length, groups: el.querySelectorAll(".trait-group-heading").length,
        // The ten Knave 1e traits come from the shipped tables (a world table of the same name would win, so only count, not compare).
        // Background (and Alignment) are rolled only while their Knave 1e switch is on (off by default).
        filled1e: ["physique", "face", "skin", "hair", "clothing", "virtue", "vice", "speech", "misfortune"].filter((k) => t[k]).length,
        hiddenBlank: !t.background && !t.alignment,
        own: ["Physique", "Face", "Skin", "Hair", "Clothing", "Virtue", "Vice", "Speech", "Background", "Misfortune"].filter((n) => game.tables.getName(n)).length,
      };
      await blank.sheet.close();
      return out;
    }, SYS);
    made.tables.push(...r.made);
    ok(r.filled1e === 9 && r.hiddenBlank, "a Blank character starts with the nine shown Knave 1e traits rolled; hidden Background and Alignment stay blank", JSON.stringify(r));
    ok(r.rows === 11 && r.groups === 2, "the traits section opens expanded: the two 2e traits, then nine 1e ones (Alignment and Background live on the Knave page)", JSON.stringify(r));
    await gm.evaluate((x) => game.actors.get(x).update({ "system.generationEnabled": true }), ids.a);
    await openAs(alice, ids.a);
    await settle();
    const ctl = await alice.evaluate((x) => {
      const el = game.actors.get(x).sheet.element;
      return { picks: el.querySelectorAll(".trait-pick").length, all: !!el.querySelector(".trait-roll-all") };
    }, ids.a);
    ok(ctl.picks === 11 && ctl.all, "in Char Gen Mode Alice gets a pick-list per Description trait (Alignment and Background live on the Knave page) and Roll every trait", JSON.stringify(ctl));
  });

  /* ------------------------------------------------------------------ */
  await section("12. Careers change at level 1.", async () => {
    const setup = await gm.evaluate(async ([sys, a]) => {
      const { addCareer } = await import(`${sys}/character-generator.js`);
      const actor = game.actors.get(a);
      for (const i of actor.items.contents) await i.delete();
      await actor.update({ "system.level": 1, "system.xp": 0, "system.generationEnabled": true });
      const baker = await addCareer(actor, { name: "Probe Baker", type: "career", system: { startingItems: ["Probe Rolling Pin"] } }, { grantItems: true });
      const pin = actor.items.find((i) => i.getFlag("base-knavery", "fromCareer") === baker.id);
      return { baker: baker.id, pin: pin?.id };
    }, [SYS, ids.a]);
    await openAs(alice, ids.a);
    await alice.evaluate((x) => game.actors.get(x).sheet.changeTab("growth", "primary"), ids.a);
    await settle();
    await alice.locator(`${sheet}[id$="${ids.a}"] .knavery-career[data-career-id="${setup.baker}"] .career-change[data-mode="roll"]`).click();
    await gm.waitForFunction(([x, id]) => !game.actors.get(x).items.get(id), [ids.a, setup.baker], { timeout: T(15000) });
    await settle();
    const after = await gm.evaluate(([x, pinId]) => {
      const a = game.actors.get(x);
      const careers = a.items.filter((i) => i.type === "career");
      const plain = careers[0];
      const from = (c) => a.items.filter((i) => i.getFlag("base-knavery", "fromCareer") === c?.id);
      return {
        // By id: a rerolled career may well be the other Probe career, carrying an item of the same name.
        careers: careers.length, pin: !!pinId && !!a.items.get(pinId), hadPin: !!pinId,
        plainItems: from(plain).length, plainWants: (plain?.system.startingItems ?? []).filter((e) => e.trim()).length,
      };
    }, [ids.a, setup.pin]);
    ok(after.hadPin && after.careers === 1 && !after.pin && after.plainItems === after.plainWants, "rerolling a career takes back its items and gives the new one's", JSON.stringify(after));

    await gm.evaluate((x) => game.actors.get(x).update({ "system.level": 2 }), ids.a);
    await settle();
    const locked = await alice.evaluate(async ([sys, x]) => {
      const a = game.actors.get(x);
      const el = a.sheet.element;
      const out = { change: el.querySelectorAll(".career-change").length, roll: el.querySelectorAll('[data-action="rollCareer"]').length };
      const { replaceCareer } = await import(`${sys}/character-generator.js`);
      const c = a.items.find((i) => i.type === "career");
      await replaceCareer(a, c, { name: "Probe Forger", type: "career", system: {} });
      out.kept = !!a.items.get(c.id);
      return out;
    }, [SYS, ids.a]);
    ok(locked.change === 0 && locked.roll === 0 && locked.kept, "at level 2 Alice can no longer change careers", JSON.stringify(locked));
    const gmCan = await gm.evaluate(async ([sys, x]) => {
      const a = game.actors.get(x);
      const { replaceCareer } = await import(`${sys}/character-generator.js`);
      const c = a.items.find((i) => i.type === "career");
      await replaceCareer(a, c, { name: "Probe Forger", type: "career", system: {} });
      return !!a.items.getName("Probe Forger");
    }, [SYS, ids.a]);
    ok(gmCan, "the GM still can", String(gmCan));
  });

  /* ------------------------------------------------------------------ */
  await section("13. Create window, rolled names, coins, the portrait roll.", async () => {
    alice.evaluate(() => { game.knavery.createCharacterInteractive(); });
    await alice.waitForSelector(".knavery-create .form-footer", { timeout: T(10000) });
    const win = await alice.evaluate(() => {
      const el = document.querySelector(".knavery-create");
      return {
        subs: [...el.querySelectorAll(".form-footer .kn-create-sub")].map((s) => s.textContent.trim()),
        list: !!el.querySelector(".knavery-create-branches, ul"),
        titles: [...el.querySelectorAll(".form-footer button")].map((b) => b.textContent.trim()),
        wide: (() => { const f = el.querySelector(".form-footer"); const b = f?.querySelector("button"); return !!b && b.getBoundingClientRect().width > 0.8 * f.getBoundingClientRect().width; })(),
      };
    });
    await alice.locator('.knavery-create button[data-action="close"]').click().catch(() => {});
    await closeDialogs();
    // Alice is a player: Blank Sheet is the GM's (2026-11-14), so one big tile spanning the row.
    ok(win.subs.length === 1 && win.subs[0].startsWith("Rolled stats") && !win.list && win.wide,
      "Create Character for a player: one big Randomly Generated tile with its line, no list", JSON.stringify(win));

    const names = await gm.evaluate(async ([sys, x]) => {
      const made = [];
      const mk = async (name, rows) => {
        const t = await RollTable.create({ name, formula: `1d${rows.length}`, results: rows.map((r, i) => ({ type: "text", name: r, range: [i + 1, i + 1], weight: 1 })) });
        made.push(t.id);
        return t;
      };
      // Only when the world has none of its own: otherwise the world's rows are what get drawn.
      const own = ["Names", "Surnames", "Surname Endings"].some((n) => game.tables.getName(n));
      if (own) return { skipped: true, made };
      await mk("Names", ["Probe Wren"]); await mk("Surnames", ["Probe Adder-"]);
      const endings = await mk("Surname Endings", ["bald"]);
      const { rollFullName } = await import(`${sys}/character-generator.js`);
      const joined = await rollFullName();
      await endings.delete(); made.pop();
      const bare = await rollFullName();
      return { joined, bare, made };
    }, [SYS, ids.a]);
    made.tables.push(...names.made);
    ok(names.skipped || (names.joined === "Probe Wren Probe Adderbald" && names.bare === "Probe Wren Probe Adder"),
      "a rolled surname joins its ending, and never ends in a hyphen", JSON.stringify(names));

    await gm.evaluate((x) => game.actors.get(x).update({ "system.coins": 90, "system.level": 1, "system.generationEnabled": true }), ids.a);
    await openAs(alice, ids.a);
    await settle();
    const page = await alice.evaluate((x) => {
      const el = game.actors.get(x).sheet.element;
      return {
        coins: el.querySelector(".summary-coins")?.textContent.trim() ?? "",
      };
    }, ids.a);
    ok(page.coins.startsWith("90 coins"), "the Inventory tab says how many coins", page.coins);

    const pic = await alice.evaluate(async (x) => {
      const a = game.actors.get(x);
      const before = a.img;
      a.sheet.element.querySelector('img.portrait[data-action="editPortrait"]').click();
      await new Promise((r) => setTimeout(r, 1500));
      const btn = document.querySelector(".knavery-portrait-roll");
      const has = !!btn;
      btn?.click();
      await new Promise((r) => setTimeout(r, 1500));
      return { has, changed: a.img !== before };
    }, ids.a);
    await gm.evaluate((x) => game.actors.get(x).update({ "system.generationEnabled": false }), ids.a);
    await settle();
    const offHas = await alice.evaluate(async (x) => {
      game.actors.get(x).sheet.element.querySelector('img.portrait[data-action="editPortrait"]').click();
      await new Promise((r) => setTimeout(r, 1500));
      const has = !!document.querySelector(".knavery-portrait-roll");
      for (const app of [...foundry.applications.instances.values()]) if (app instanceof foundry.applications.api.DialogV2) await app.close();
      return has;
    }, ids.a);
    ok(pic.has && pic.changed && !offHas, "the portrait picker rolls a portrait in Char Gen Mode only", JSON.stringify({ ...pic, offHas }));
  });

  /* ------------------------------------------------------------------ */
  await section("14. Knave 1e: the spell list and its switch, starting gear, reaction.", async () => {
    const r = await gm.evaluate(async (sys) => {
      const { spellTableName, findTable, realResults } = await import(`${sys}/compendium.js`);
      const { buildCharacter } = await import(`${sys}/character-generator.js`);
      const set = (k, v) => game.settings.set("base-knavery", k, v);
      const pack1e = await findTable("Spells (Knave 1e)");
      const names1e = new Set(realResults(pack1e).map((x) => x.name));
      const out = { rows1e: names1e.size, hasWorldSpells: !!game.tables.getName("Spells") };
      await set("spell-list", "auto");
      out.auto = spellTableName();
      await set("spell-list", "1e");
      out.forced = spellTableName();
      const built = await buildCharacter({ level: 1, abilities: { INT: 3 } });
      const books = built.items.filter((i) => i.type === "spellbook");
      out.books = books.length;
      out.booksFrom1e = books.filter((b) => names1e.has(b.name)).length;
      out.withEffect = books.filter((b) => (b.system?.description ?? "").length > 10).length;
      await set("spell-list", "auto");
      // The old starting-gear hack is the starting kit "careers plus the 1e gear tables" since 0.2.0.
      await set("starting-kit", "careers-1e-gear");
      const geared = await buildCharacter({ level: 1, abilities: { STR: 3 } });
      out.gearNote = geared.notes.find((n) => n.startsWith("Knave 1e starting gear")) ?? "";
      await set("starting-kit", "careers");
      const reaction = await findTable("Reaction");
      out.reactionRows = realResults(reaction).length;
      out.reactionWorld = !!game.tables.getName("Reaction");
      return out;
    }, SYS);
    ok(r.rows1e === 100, "Knave 1e's 100 level-less spells ship", JSON.stringify(r));
    ok(r.auto === (r.hasWorldSpells ? "Spells" : "Spells (Knave 1e)") && r.forced === "Spells (Knave 1e)",
      "the world's own Spells table wins, and the GM can switch back to 1e", JSON.stringify(r));
    ok(r.books === 3 && r.booksFrom1e === 3 && r.withEffect === 3, "on 1e, three INT draw three 1e spellbooks, each with its effect", JSON.stringify(r));
    ok(r.gearNote.split(",").length >= 4, "careers plus the 1e gear tables roll Knave 1e gear at creation", r.gearNote);
    ok(r.reactionWorld || r.reactionRows === 5, "Reaction ships filled from Knave 1e", JSON.stringify(r));
  });

  /* ------------------------------------------------------------------ */
  await section("15. Knave 1e rule hacks: 1000-XP levels, d8 HP, random raises, group initiative.", async () => {
    const r = await gm.evaluate(async ([sys, pcId]) => {
      const lu = await import(`${sys}/level-up.js`);
      const { buildCharacter } = await import(`${sys}/character-generator.js`);
      const set = (k, v) => game.settings.set("base-knavery", k, v);
      const pc = game.actors.get(pcId);
      const out = {};

      // Advancement: Knave 2e's ladder, then a level every 1000 XP.
      await pc.update({ "system.level": 1, "system.xp": 1000 }, { knCreation: true });
      out.off = { next: pc.system.nextXp, can: pc.system.canLevelUp };
      await set("knave1e-xp", true);
      pc.prepareData();
      out.on = { next: pc.system.nextXp, can: pc.system.canLevelUp };
      await pc.sheet.render({ force: true });
      await new Promise((res) => setTimeout(res, 800));
      out.ladder = [...pc.sheet.element.querySelectorAll(".ladder-xp")].map((e) => parseInt(e.textContent, 10));
      await pc.sheet.close();
      out.built3 = (await buildCharacter({ level: 3, abilities: { STR: 3 } })).system?.xp;
      await set("knave1e-xp", false);

      // HP: one d8 per level; below the old max, old max + 1.
      await set("level-hp-rule", "knave1e");
      await set("first-level-hp", "1d8");
      out.first = lu.firstLevelHpFormula();
      out.formula4 = lu.levelHpFormula(4);
      out.low = (await lu.rollLevelHp(3, 30)).max;
      const up = await lu.rollLevelHp(2, 1);
      out.up = { max: up.max, rolled: up.rolled };
      out.hint = lu.hpRuleHint(4, 12);
      await set("level-hp-rule", "reroll");
      await set("first-level-hp", "1d6");

      // Random raises: a d20 under defense favours strong abilities.
      const strong = { STR: 9, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
      const rate = () => { let n = 0; for (let i = 0; i < 400; i++) if (lu.randomAbilityPicks(strong).includes("STR")) n++; return n / 400; };
      out.rateOff = rate();
      await set("knave1e-random-raises", true);
      out.rateOn = rate();
      const sets = Array.from({ length: 50 }, () => lu.randomAbilityPicks({ STR: 10, DEX: 10, CON: 10, INT: 2, WIS: 2, CHA: 2 }));
      out.picksOk = sets.every((p) => p.length === 3 && new Set(p).size === 3 && p.every((k) => ["INT", "WIS", "CHA"].includes(k)));
      await set("knave1e-random-raises", false);

      // Group initiative: one d6 a round orders the sides.
      await set("knave1e-initiative", true);
      const npc = await Actor.create({ name: "Probe Goblin", type: "npc" });
      const combat = await Combat.create({});
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: pc.id }, { actorId: npc.id }]);
      const msgs = () => game.messages.filter((m) => m.getFlag("base-knavery", "groupInitiative") !== undefined && m.timestamp >= t0).length;
      const t0 = Date.now() - 1000;
      await combat.rollAll();
      out.preRoll = { flag: combat.getFlag("base-knavery", "groupInitiative"), inits: combat.combatants.map((c) => c.initiative).sort(), msgs: msgs() };
      await combat.startCombat();
      out.started = { round: combat.getFlag("base-knavery", "groupInitiative")?.round, msgs: msgs() };
      const rounds = [];
      for (let i = 0; i < 12; i++) {
        await combat.nextRound();
        const g = combat.getFlag("base-knavery", "groupInitiative");
        rounds.push({ round: combat.round, flagRound: g?.round, pcsFirst: g?.pcsFirst, firstIsPc: combat.combatant?.actor?.type === "character" });
      }
      out.rounds = rounds;
      out.roundMsgs = msgs();
      await set("knave1e-initiative", false);
      await combat.resetAll();
      await combat.rollAll();
      out.offFlag = combat.getFlag("base-knavery", "groupInitiative") ?? null;
      out.offRolled = combat.combatants.every((c) => Number.isFinite(c.initiative));
      await combat.delete();
      await npc.delete();
      for (const m of game.messages.filter((x) => x.getFlag("base-knavery", "groupInitiative") !== undefined)) await m.delete();
      return out;
    }, [SYS, ids.a]);
    ok(r.off.next === 2000 && !r.off.can && r.on.next === 1000 && r.on.can, "Knave 1e advancement: level 2 at 1000 XP", JSON.stringify({ off: r.off, on: r.on }));
    ok(r.ladder.join() === "0,1000,2000,3000,4000,5000,6000,7000,8000,9000" && r.built3 === 2000,
      "the Growth ladder and random creation follow the 1000-XP levels", JSON.stringify({ ladder: r.ladder, built3: r.built3 }));
    ok(r.first === "1d8" && r.formula4 === "4d8" && r.low === 31 && r.up.max === r.up.rolled && r.hint.includes("4d8"),
      "Knave 1e HP: 1d8 at first level, then a d8 per level, below the old max +1", JSON.stringify({ first: r.first, f: r.formula4, low: r.low, up: r.up, hint: r.hint }));
    // STR 9 among five 0s: about 83% under 1e (a weak ability can rise first), 50% at random.
    ok(r.rateOn > 0.72 && r.rateOff < 0.62 && r.picksOk, "Knave 1e random raises favour strong abilities and skip maxed ones",
      JSON.stringify({ on: r.rateOn, off: r.rateOff, picksOk: r.picksOk }));
    ok(r.preRoll.flag?.round === 0 && r.preRoll.inits.join() === "1,2" && r.preRoll.msgs === 1 && r.started.round === 1 && r.started.msgs === 1,
      "group initiative: one d6 lines up both sides, and Begin Combat keeps a roll made before it", JSON.stringify({ pre: r.preRoll, started: r.started }));
    const rounds = r.rounds ?? [];
    ok(rounds.length === 12 && rounds.every((x) => x.flagRound === x.round && x.firstIsPc === x.pcsFirst) && r.roundMsgs === 13,
      "each new round rerolls, and its first turn goes to the side that won", JSON.stringify({ rounds, msgs: r.roundMsgs }));
    ok(rounds.some((x) => x.pcsFirst) && rounds.some((x) => !x.pcsFirst), "over 12 rounds both sides win at least once", JSON.stringify(rounds.map((x) => x.pcsFirst)));
    ok(r.offFlag === null && r.offRolled, "with the hack off, initiative is core's roll again", JSON.stringify({ flag: r.offFlag, rolled: r.offRolled }));
  });

  /* ------------------------------------------------------------------ */
  await section("16. The narrow sheet, the Attack window, raised abilities, the welcome window, the footer.", async () => {
    const r = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      for (const s of [...foundry.applications.instances.values()]) if (s.document?.type) await s.close();
      await pc.update({ "system.abilities.DEX.value": 1, "system.abilities.STR.value": 0 }, { knCreation: true });
      for (const i of pc.items.filter((x) => x.type === "weapon")) await i.delete();
      const k = Number(game.settings.get("base-knavery", "text-size")) || 1;
      await pc.sheet.render({ force: true });
      await wait(900);
      const el = pc.sheet.element;
      const out = {
        k, width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height), vh: window.innerHeight,
        playColumn: !!el.querySelector(".knavery-page-knave .knavery-play"),
        disabled: !!el.querySelector("#attack-button")?.disabled,
        dexRaised: el.querySelector(".DEX-ability")?.classList.contains("raised") ?? null,
        strRaised: el.querySelector(".STR-ability")?.classList.contains("raised") ?? null,
        footer: el.querySelector(".knavery-compat-caption")?.textContent ?? "",
      };
      const npc = await Actor.create({ name: "Probe Wolf", type: "npc" });
      await npc.sheet.render({ force: true });
      await wait(900);
      out.npcWidth = Math.round(npc.sheet.element.getBoundingClientRect().width);
      await npc.sheet.close();
      await npc.delete();
      // Two weapons: a sword (melee) and a bow (ranged).
      await pc.createEmbeddedDocuments("Item", [
        { name: "Probe Sword", type: "weapon", system: { equipped: true, attackType: "melee", damage: "d6" } },
        { name: "Probe Bow", type: "weapon", system: { equipped: true, attackType: "ranged", damage: "d6", range: "80ft" } },
      ]);
      await wait(600);
      out.enabled = !pc.sheet.element.querySelector("#attack-button")?.disabled;
      return out;
    }, ids.a);
    const exp = 440 * r.k;
    ok(Math.abs(r.width - exp) < 30 && Math.abs(r.npcWidth - 640 * r.k) < 40, "a character sheet opens narrow (440 × text size); an NPC's stays at 640", JSON.stringify(r));
    ok(Math.abs(r.height - 660 * r.k) < 40 || r.height >= r.vh - 80, "and just tall enough for the Knave page (660 × text size)", JSON.stringify(r));
    ok(!r.playColumn && !r.disabled && r.enabled, "no attacks column; the Attack button is always there (an improvised attack needs no weapon)", JSON.stringify(r));
    ok(r.dexRaised === true && r.strRaised === false, "a score above 0 is marked raised, a 0 is not", JSON.stringify(r));
    ok(r.footer.includes("unofficial fan-made Foundry system for Knave (first and second editions)"), "the sheet footer reads the new sentence", r.footer);

    // The Attack window: both weapons, Power attack for the sword only, the bow rolls.
    const before = await gm.evaluate(() => game.messages.size);
    await gm.evaluate((x) => game.actors.get(x).sheet.element.querySelector("#attack-button").click(), ids.a);
    await gm.waitForSelector(".knavery-roll-prompt .kn-attack-weapons", { timeout: T(10000) });
    const win = await gm.evaluate(() => {
      const d = document.querySelector(".knavery-roll-prompt");
      const names = [...d.querySelectorAll(".kn-attack-weapon strong")].map((e) => e.textContent.trim());
      const power = () => !d.querySelector(".power-group")?.hidden;
      const pick = (n) => { const l = [...d.querySelectorAll(".kn-attack-weapon")].find((e) => e.textContent.includes(n)); const i = l.querySelector("input"); i.checked = true; i.dispatchEvent(new Event("change")); };
      pick("Probe Sword"); const swordPower = power();
      pick("Probe Bow"); const bowPower = power();
      pick("Improvised"); const improvisedPower = power();
      return { names, swordPower, bowPower, improvisedPower };
    });
    await gm.locator('.knavery-roll-prompt button[data-action="normal"]').click();
    await gm.waitForFunction((n) => game.messages.size > n, before, { timeout: T(10000) });
    const card = await gm.evaluate(() => {
      const m = game.messages.contents.at(-1);
      return { weapon: m.getFlag("base-knavery", "attack")?.weapon ?? null, damage: m.rolls[1]?.formula ?? "" };
    });
    ok(win.names.join() === "Probe Sword,Probe Bow,Improvised" && win.swordPower && !win.bowPower && win.improvisedPower,
      "the Attack window lists both weapons and Improvised; Power attack for the melee ones", JSON.stringify(win));
    ok(card.weapon === "Improvised" && /^1d4$/.test(card.damage), "the improvised attack rolls a d4 for damage", JSON.stringify(card));

    // The welcome window's licence notice, lighter intro and checkbox.
    const w = await gm.evaluate(async () => {
      await game.knavery.openWelcome();
      await new Promise((res) => setTimeout(res, 900));
      const el = document.getElementById("knavery-welcome");
      const out = {
        // Knave 1e's notice, in Licensing (the art's licences fold in the AI disclosure above it).
        link: el?.querySelector(".knavery-welcome-small .knavery-welcome-license a")?.href ?? "",
        weight: el ? getComputedStyle(el.querySelector(".knavery-welcome-unofficial")).fontWeight : "",
        align: el ? getComputedStyle(el.querySelector(".knavery-welcome-unofficial")).textAlign : "",
        // Two sentences, two lines: the second starts below the first.
        twoLines: (() => { const s = el?.querySelectorAll(".knavery-welcome-unofficial > span") ?? []; return s.length === 2 && s[1].getBoundingClientRect().top >= s[0].getBoundingClientRect().bottom - 1; })(),
        box: el?.querySelector(".knavery-welcome-onstart")?.textContent.trim() ?? "",
      };
      await foundry.applications.instances.get("knavery-welcome")?.close();
      return out;
    });
    ok(w.link.includes("creativecommons.org/licenses/by/4.0") && w.weight === "300" && w.align === "center" && w.twoLines && !/rulebook/i.test(w.box),
      "the welcome window carries the Knave 1e licence, a centred light-weight intro and the new checkbox text", JSON.stringify(w));
  });

  /* ------------------------------------------------------------------ */
  await section("17. The Knave page: no failed career, the bottom band, HP and Wounds by + and −, the rail's Attack.", async () => {
    const r = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      await pc.update({ "system.generationEnabled": false, "system.hp.max": 3, "system.hp.value": 3, "system.wounds": 0 }, { knCreation: true });
      await pc.sheet.render({ force: true });
      await wait(900);
      const el = () => pc.sheet.element;
      const out = {
        hackGone: !game.settings.settings.has("base-knavery.failed-career"),
        failedLine: !!el().querySelector(".failed-career-line, .career-failed-band, [data-action=\"rollFailedCareer\"]"),
        band: [...el().querySelectorAll(".knavery-page-knave .knavery-band .band-label")].map((e) => e.textContent.trim()),
        xpBar: !!el().querySelector(".knavery-band .knavery-xp-bar"),
        coins: !!el().querySelector('.knavery-band input[name="system.coins"]'),
        levelInputOff: !!el().querySelector('input[name="system.level"]'),
        xpInputOff: !!el().querySelector('input[name="system.xp"]'),
        hpInput: !!el().querySelector('input[name="system.hp.value"]'),
        woundInput: !!el().querySelector('input[name="system.wounds"]'),
        healButton: !!el().querySelector("#heal-wound-button"),
      };
      const press = async (action) => { el().querySelector(`.knavery-page-knave [data-action="${action}"]`).click(); await wait(500); };
      out.upAtMax = !!el().querySelector('[data-action="hpUp"]')?.disabled;
      await press("hpDown"); await press("hpDown"); out.hpAfterTwoDown = pc.system.hp.value;
      await press("hpUp"); out.hpAfterUp = pc.system.hp.value;
      await press("hpDown"); await press("hpDown"); out.downAtZero = !!el().querySelector('[data-action="hpDown"]')?.disabled; out.hpZero = pc.system.hp.value;
      await press("addWound"); await press("addWound"); out.woundsTwo = pc.system.wounds;
      await press("healWound"); out.woundsOne = pc.system.wounds;
      await pc.update({ "system.generationEnabled": true });
      await wait(700);
      out.levelInputOn = !!el().querySelector('input[name="system.level"]');
      // The rail's Attack opens the window from the Inventory page.
      el().querySelector('nav.knavery-tab-rail button[data-tab="inventory"]').click();
      await wait(400);
      const railAttack = el().querySelector("nav.knavery-tab-rail .knavery-rail-attack");
      out.railAttack = !!railAttack && !railAttack.disabled;
      railAttack?.click();
      await wait(900);
      out.windowOpen = !!document.querySelector(".knavery-roll-prompt .kn-attack-weapons");
      for (const app of [...foundry.applications.instances.values()]) if (app instanceof foundry.applications.api.DialogV2) await app.close();
      // The layout: Slots in the vitals, Level/XP/Coins in the abilities column, a half-width XP bar.
      el().querySelector('nav.knavery-tab-rail button[data-tab="knave"]').click();
      await wait(400);
      const left = el().querySelector(".knavery-page-knave .knavery-left");
      const bar = left?.querySelector(".knavery-band .knavery-xp-bar");
      out.slotsInVitals = !!el().querySelector(".knavery-vitals .knavery-slots-line");
      out.bandInLeft = !!left?.querySelector(".knavery-band");
      out.barShare = bar && left ? Math.round(100 * bar.getBoundingClientRect().width / left.getBoundingClientRect().width) : null;
      // Wounds: empty slots first, then the coin slot, then the lowest item, marked Unusable.
      await pc.deleteEmbeddedDocuments("Item", pc.items.filter((i) => i.type !== "career").map((i) => i.id));
      await pc.update({ "system.abilities.CON.value": 1, "system.coins": 500, "system.wounds": 0 }, { knCreation: true });
      await pc.createEmbeddedDocuments("Item", Array.from({ length: 9 }, (_, i) => ({ name: `Probe Rock ${i + 1}`, type: "item", sort: (i + 1) * 1000, system: { slots: 1, quantity: 1 } })));
      const marks = async (wounds) => {
        await pc.update({ "system.wounds": wounds });
        await wait(600);
        const inv = el().querySelector(".knavery-page-inventory");
        return {
          items: [...inv.querySelectorAll(".knavery-items-list-row.wounded-row:not(.gold-slot-row) .knavery-item-title")].map((e) => e.textContent.trim()),
          coin: inv.querySelectorAll(".gold-slot-row.wounded-row").length,
          tag: inv.querySelector(".wounded-tag")?.textContent.trim() ?? "",
        };
      };
      out.slotsMax = pc.system.slotsMax;
      out.oneWound = await marks(1);
      out.twoWounds = await marks(2);
      out.threeWounds = await marks(3);
      await pc.deleteEmbeddedDocuments("Item", pc.items.filter((i) => i.name.startsWith("Probe Rock")).map((i) => i.id));
      await pc.update({ "system.coins": 0, "system.abilities.CON.value": 0 }, { knCreation: true });
      await pc.update({ "system.wounds": 0, "system.hp.value": 3 });
      return out;
    }, ids.a);
    ok(r.hackGone && !r.failedLine, "the failed-career hack is gone: no setting, no line, no die", JSON.stringify(r));
    ok(r.band.join() === "Level,XP,Coins" && r.xpBar && r.coins, "the bottom band holds Level, the XP bar and Coins", JSON.stringify(r.band));
    ok(!r.levelInputOff && !r.xpInputOff && r.levelInputOn, "Level and XP are text with Char Gen Mode off, fields with it on", JSON.stringify(r));
    ok(!r.hpInput && !r.woundInput && !r.healButton, "current HP and wounds are not fields; Heal Wound is the wounds' −", JSON.stringify(r));
    ok(r.upAtMax && r.hpAfterTwoDown === 1 && r.hpAfterUp === 2 && r.hpZero === 0 && r.downAtZero && r.woundsTwo === 2 && r.woundsOne === 1,
      "HP and Wounds step by + and −, stopping at max and at 0", JSON.stringify(r));
    ok(r.railAttack && r.windowOpen, "the rail's Attack opens the Attack window from the Inventory page", JSON.stringify(r));
    ok(r.slotsInVitals && r.bandInLeft && r.barShare !== null && r.barShare <= 55, "Slots sit in the vitals; Level, XP and Coins under the abilities, the XP bar half the column", JSON.stringify(r));
    // 11 slots: nine rocks (1-9), the coin slot (10), one empty (11).
    ok(r.slotsMax === 11 && r.oneWound.items.length === 0 && r.oneWound.coin === 0, "a wound goes into an empty slot first", JSON.stringify(r.oneWound));
    ok(r.twoWounds.items.length === 0 && r.twoWounds.coin === 1, "the next wound reaches the coin slot before any item", JSON.stringify(r.twoWounds));
    ok(r.threeWounds.items.join() === "Probe Rock 9" && r.threeWounds.tag === "Unusable", "then the lowest item, marked Unusable", JSON.stringify(r.threeWounds));
  });

  /* ------------------------------------------------------------------ */
  await section("18. Random rolls by default; a blank sheet built by the rules; the Attack window's Target; the header.", async () => {
    // Random creation, as the GM: the dice decide unless "Place the 3 ability points myself" is ticked.
    gm.evaluate(() => { game.knavery.createCharacterInteractive(); });
    await gm.waitForSelector(".knavery-create .form-footer", { timeout: T(10000) });
    const placeBox = await gm.locator('.knavery-create input[name="place"]').isChecked().catch(() => null);
    await gm.locator('.knavery-create input[name="name"]').fill("Probe Rolled");
    await gm.locator('.knavery-create button[data-action="random"]').click();
    await gm.waitForFunction(() => game.actors.getName("Probe Rolled")?.items.size > 0, null, { timeout: T(30000) }).catch(() => {});
    const rolled = await gm.evaluate(() => {
      const a = game.actors.getName("Probe Rolled");
      return {
        made: !!a, pointsWindow: !!document.querySelector(".knavery-points"),
        total: a ? Object.values(a._source.system.abilities).reduce((n, x) => n + x.value, 0) : null, level: a?.system.level,
      };
    });
    await closeDialogs();
    ok(placeBox === false && rolled.made && !rolled.pointsWindow && (rolled.level > 1 || rolled.total === 3),
      "Random creation rolls the abilities (3d6) without the points window; placing them is a box to tick", JSON.stringify({ placeBox, ...rolled }));

    const r = await gm.evaluate(async (sys) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const { createCharacter } = await import(`${sys}/character-generator.js`);
      const pc = await createCharacter({ mode: "blank", name: "Probe Blank Build" });
      await wait(1200);
      const el = () => pc.sheet.element;
      const out = { img: pc.img, gen: pc.system.generationEnabled, careers0: pc.items.filter((i) => i.type === "career").length };
      // The portrait die is not hidden under the list button.
      const die = el().querySelector(".portrait-roll");
      if (die) {
        const b = die.getBoundingClientRect();
        out.dieOnTop = !!document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest(".portrait-roll");
      }
      // Abilities: 3 points at level 1, so 24 typed into STR leaves 3, and nothing is left for DEX.
      const type = async (k, v) => {
        const input = el().querySelector(`input[name="system.abilities.${k}.value"]`);
        input.value = String(v);
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await wait(900);
      };
      await type("STR", 24);
      out.str = pc._source.system.abilities.STR.value;
      out.strField = el().querySelector('input[name="system.abilities.STR.value"]').value;
      await type("DEX", 1);
      out.dex = pc._source.system.abilities.DEX.value;
      out.counter = el().querySelector(".knavery-ability-points")?.textContent.trim() ?? "";
      // Moving a point: STR 2 frees one for DEX.
      await type("STR", 2);
      await type("DEX", 1);
      out.moved = [pc._source.system.abilities.STR.value, pc._source.system.abilities.DEX.value];
      // HP, coins and two different careers from the sheet's dice.
      el().querySelector('[data-action="rollHp"]')?.click();
      await wait(1200);
      out.hp = [pc.system.hp.value, pc.system.hp.max];
      el().querySelector('[data-action="rollCoins"]')?.click();
      await wait(1200);
      out.coins = pc.system.coins;
      for (let i = 0; i < 2; i++) {
        el().querySelector('.knavery-head [data-action="rollCareer"]')?.click();
        await wait(1800);
      }
      const careers = pc.items.filter((i) => i.type === "career");
      out.careers = careers.map((c) => c.name);
      out.careerImg = careers[0]?.img ?? "";
      out.slotAfter = !!el().querySelector(".knavery-head .career-slot");
      // The header: ⋮ and close inside the window, Pop Out and Print as icons.
      const win = el().getBoundingClientRect();
      const close = el().querySelector('.window-header button[data-action="close"]')?.getBoundingClientRect();
      const dots = el().querySelector('.window-header button[data-action="toggleControls"]')?.getBoundingClientRect();
      out.closeInside = !!close && close.right <= win.right + 1 && close.width > 10;
      out.dotsInside = !!dots && dots.right <= win.right + 1 && dots.width > 10;
      out.printText = el().querySelector('.window-header button[data-action="printSheet"]')?.textContent.trim() ?? null;
      // The Description page: a rule above the Biography.
      out.bioRule = getComputedStyle(el().querySelector(".knavery-bio")).borderTopStyle;
      return { id: pc.id, ...out };
    }, SYS);
    await gm.screenshot({ path: `${SHOTS}/chargen-blank-build.png` });
    ok(r.img === "icons/svg/mystery-man.svg" && r.gen === true && r.careers0 === 0, "a Blank Sheet starts with Foundry's blank portrait, in Char Gen Mode, with no careers", JSON.stringify(r));
    ok(r.dieOnTop === true, "the portrait's die is visible beside the list button, not under it", JSON.stringify(r));
    ok(r.str === 3 && r.strField === "3" && r.dex === 0 && /3 \/ 3/.test(r.counter), "24 typed into STR at level 1 leaves 3, with nothing left for DEX; the counter reads 3 / 3", JSON.stringify(r));
    ok(r.moved[0] === 2 && r.moved[1] === 1, "lowering STR frees a point for DEX", JSON.stringify(r.moved));
    ok(r.hp[1] >= 1 && r.hp[1] <= 6 && r.hp[0] === r.hp[1], "Roll HP sets max HP from 1d6, and HP to it", JSON.stringify(r.hp));
    ok(r.coins >= 30 && r.coins <= 180 && r.coins % 10 === 0, "Roll Coins gives 3d6 × 10", String(r.coins));
    ok(r.careers.length === 2 && r.careers[0] !== r.careers[1] && !r.slotAfter, "two career rolls give two different careers, then the slot closes", JSON.stringify(r));
    ok(r.careerImg.endsWith("/icons/career.svg"), "a rolled career carries the scroll icon", r.careerImg);
    ok(r.closeInside && r.dotsInside && r.printText === "", "the narrow header keeps ⋮ and close inside the window; Print is an icon", JSON.stringify(r));
    ok(r.bioRule === "solid", "a rule above the Biography", r.bioRule);

    // The Attack window: "Straight Roll", and a Target list on a scene with tokens.
    const t = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const before = canvas.scene?.id ?? null;
      const pc = game.actors.get(pcId);
      const bob = game.actors.getName("Probe Bob PC");
      const gob = await Actor.create({ name: "Probe Goblin", type: "npc", system: { role: "monster" } });
      const scene = await Scene.create({ name: "Probe Scene", width: 1000, height: 1000, grid: { size: 100 } });
      await scene.view();
      for (let i = 0; i < 40 && !(canvas.ready && canvas.scene?.id === scene.id); i++) await wait(250);
      const out = { canvas: canvas.ready && canvas.scene?.id === scene.id, before };
      const tok = async (a, x) => (await a.getTokenDocument({ x, y: 100 })).toObject();
      await scene.createEmbeddedDocuments("Token", [await tok(pc, 100), await tok(bob, 300), await tok(gob, 500)]);
      await wait(1500);
      pc.sheet.render(true);
      await wait(900);
      pc.sheet.element.querySelector("#attack-button").click();
      await wait(1200);
      const dlg = document.querySelector(".knavery-roll-prompt");
      const select = dlg?.querySelector('select[name="target"]');
      out.straight = dlg?.querySelector('footer button[data-action="normal"]')?.textContent.trim() ?? "";
      out.options = select ? [...select.options].map((o) => ({ name: o.textContent.trim(), pc: !!o.dataset.pc, hidden: o.hidden })) : null;
      out.hideBox = dlg?.querySelector('input[name="hidePcs"]')?.checked ?? null;
      const gobOpt = select ? [...select.options].find((o) => o.textContent.trim() === "Probe Goblin") : null;
      if (gobOpt) select.value = gobOpt.value;
      dlg?.querySelector('footer button[data-action="normal"]')?.click();
      await wait(1500);
      const card = game.messages.contents.at(-1);
      out.cardTarget = card?.content.includes("Probe Goblin") ?? false;
      out.cardHitMiss = /Hit|Miss/.test(card?.content ?? "");
      out.targeted = [...game.user.targets].map((x) => x.document.name);
      canvas.tokens.setTargets([], { mode: "replace" });
      if (before) await game.scenes.get(before)?.view();
      await scene.delete();
      await gob.delete();
      return out;
    }, r.id);
    const names = (t.options ?? []).map((o) => o.name);
    const bobOpt = (t.options ?? []).find((o) => o.name === "Probe Bob PC");
    ok(t.straight === "Straight Roll", "the middle button reads Straight Roll", t.straight);
    ok(t.canvas && names[0] === "No target" && names.includes("Probe Goblin") && !names.includes("Probe Blank Build"),
      "the Attack window lists the tokens on the scene, never the attacker's own", JSON.stringify(t));
    ok(t.hideBox === true && bobOpt?.pc && bobOpt.hidden, "\"Hide other player characters\" is ticked by default and hides them", JSON.stringify(t.options));
    ok(t.cardTarget && t.cardHitMiss && t.targeted.join() === "Probe Goblin", "the chosen target is targeted and the card says hit or miss", JSON.stringify(t));
  });

  /* ------------------------------------------------------------------ */
  await section("19. Rest by the book; a red Attack and Apply; a teal HP bar; compact attack cards.", async () => {
    const r = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      for (const i of pc.items.contents) await i.delete();
      await pc.update({ "system.generationEnabled": false, "system.hp.max": 5, "system.hp.value": 5, "system.wounds": 0, "system.coins": 0 }, { knCreation: true });
      await pc.createEmbeddedDocuments("Item", [
        { name: "Probe Sword", type: "weapon", system: { damage: "d6", attackType: "melee", equipped: true } },
        { name: "Probe Tome", type: "spellbook", system: { castToday: true } },
      ]);
      await pc.sheet.render({ force: true });
      await wait(900);
      const el = () => pc.sheet.element;
      const out = {};
      // Colours: the full HP bar is teal; Attack is red.
      const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const [hr, hg, hb] = rgb(getComputedStyle(el().querySelector(".hp-bar .knavery-bar-fill")).backgroundColor);
      out.hpFill = getComputedStyle(el().querySelector(".hp-bar .knavery-bar-fill")).backgroundColor;
      out.hpTeal = hb > hr && hg > hr;
      const [ar, ag, ab] = rgb(getComputedStyle(el().querySelector("#attack-button")).backgroundColor);
      out.attackBg = getComputedStyle(el().querySelector("#attack-button")).backgroundColor;
      // The button keeps core chrome; only its splat is red (user, 2026-11-14).
      const [sr, sg, sb] = rgb(getComputedStyle(el().querySelector("#attack-button i.fa-burst")).color);
      out.attackRed = !(ar > 150 && ag < 80 && ab < 80) && sr > 150 && sg < 80 && sb < 80;
      out.restIcon = el().querySelector("#rest-button i")?.className ?? "";
      // Rest without a meal: no HP, no wound, but spellbooks ready.
      await pc.update({ "system.hp.value": 1, "system.wounds": 2 });
      await wait(400);
      const rest = async (boxes) => {
        el().querySelector("#rest-button").click();
        await wait(900);
        const dlg = document.querySelector(".knavery-rest");
        const f = dlg?.querySelector("form")?.elements;
        if (!f) return false;
        for (const [k, v] of Object.entries(boxes)) {
          if (f[k].checked !== v) { f[k].checked = v; f[k].dispatchEvent(new Event("change", { bubbles: true })); }
        }
        dlg.querySelector('footer button[data-action="rest"]').click();
        await wait(1200);
        return true;
      };
      out.window = await rest({ ate: false });
      out.noMeal = { hp: pc.system.hp.value, wounds: pc.system.wounds, book: pc.items.getName("Probe Tome").system.castToday };
      await rest({ slept: true, ate: true, haven: true });
      out.full = { hp: pc.system.hp.value, wounds: pc.system.wounds };
      out.restCard = game.messages.contents.at(-1)?.content ?? "";
      // An attack with damage: compact rows, a big Hit/Miss, a small Damage label, a red Apply.
      const target = await Actor.create({ name: "Probe Dummy", type: "npc", system: { role: "monster" } });
      const scene = canvas.ready ? canvas.scene : null;
      const { rollAttack } = await import("/systems/base-knavery/module/rolls.js");
      let tok = null;
      if (scene) {
        [tok] = await scene.createEmbeddedDocuments("Token", [(await target.getTokenDocument({ x: 0, y: 0 })).toObject()]);
        await wait(800);
        canvas.tokens.setTargets([tok.id], { mode: "replace" });
      }
      const attack = async () => {
        const p = rollAttack(pc, pc.items.getName("Probe Sword"));
        await wait(900);
        const dlg = document.querySelector(".knavery-roll-prompt");
        const dmg = dlg?.querySelector('input[name="rollDamage"]');
        if (dmg) dmg.checked = true;
        dlg?.querySelector('footer button[data-action="normal"]')?.click();
        await p;
        await wait(1200);
        return [...document.querySelectorAll("#chat .chat-message .knavery-roll-card.kind-attack")].at(-1);
      };
      // With a target: the Hit/Miss badge.
      let card = tok ? await attack() : null;
      const badge = card?.querySelector(".card-targets li strong");
      out.badgePx = badge ? parseFloat(getComputedStyle(badge).fontSize) : null;
      // No target: every attack "hits", so damage is always rolled.
      canvas.tokens?.setTargets([], { mode: "replace" });
      card = await attack();
      const row = card?.querySelector(".dice-result");
      const fTop = row?.querySelector(".dice-formula")?.getBoundingClientRect().top;
      const tTop = row?.querySelector(".dice-total")?.getBoundingClientRect().top;
      out.sameRow = fTop !== undefined && tTop !== undefined && Math.abs(fTop - tTop) < 8;
      const label = card?.querySelector(".card-damage-label");
      out.damagePx = label ? parseFloat(getComputedStyle(label).fontSize) : null;
      out.hasDamage = !!card?.querySelector(".card-damage");
      const apply = card?.querySelector('[data-kn-apply="normal"]');
      const [pr, pg, pb] = apply ? rgb(getComputedStyle(apply.querySelector("i")).color) : [0, 0, 0];
      out.applyRed = pr > 130 && pg < 60 && pb < 60;
      card?.scrollIntoView();
      if (tok) await tok.delete();
      canvas.tokens?.setTargets([], { mode: "replace" });
      await target.delete();
      return out;
    }, ids.a);
    await gm.screenshot({ path: `${SHOTS}/chargen-cards-sheet.png` });
    ok(r.hpTeal && r.attackRed && r.restIcon.includes("fa-campfire"), "a full HP bar is teal, Attack's splat is red (not the button), Rest is a campfire", JSON.stringify(r));
    ok(r.window && r.noMeal.hp === 1 && r.noMeal.wounds === 2 && r.noMeal.book === false,
      "a rest without a meal restores no HP and heals no wound, but readies the spellbooks", JSON.stringify(r.noMeal));
    ok(r.full.hp === 5 && r.full.wounds === 1 && /One wound heals/.test(r.restCard), "sleep, a meal and a safe haven: full HP, one wound heals, and a card says so", JSON.stringify(r.full));
    ok(r.sameRow, "an attack card shows each roll's formula and total on one row", JSON.stringify(r));
    ok(r.badgePx === null || r.badgePx >= 14, "Hit or Miss is a big badge", String(r.badgePx));
    ok(r.hasDamage && r.damagePx <= 14 && r.applyRed, "Damage is a small label on its row, and Apply's splat is red", JSON.stringify(r));
  });

  /* ------------------------------------------------------------------ */
  await section("20. Labels that fit; Blank Sheet for the GM; Create NPC; spell items; item order; rations per slot.", async () => {
    // The Create Character window, as the GM: the label no longer gapes; the placeholder; Blank Sheet.
    gm.evaluate(() => { game.knavery.createCharacterInteractive(); });
    await gm.waitForSelector(".knavery-create .form-footer", { timeout: T(10000) });
    const win = await gm.evaluate(() => {
      const el = document.querySelector(".knavery-create");
      const label = el.querySelector('label[for^="kn-create-place-"]');
      const cs = getComputedStyle(label);
      const fs = parseFloat(cs.fontSize);
      return {
        lineRatio: parseFloat(cs.lineHeight) / fs, lines: label.getBoundingClientRect().height / parseFloat(cs.lineHeight),
        placeholder: el.querySelector('input[name="name"]').placeholder,
        blank: !!el.querySelector('.form-footer button[data-action="blank"]'),
      };
    });
    await gm.screenshot({ path: `${SHOTS}/chargen-create-window.png` });
    await closeDialogs();
    ok(win.lineRatio <= 1.5 && win.lines < 2.2, "the Create Character labels wrap without gaps", JSON.stringify(win));
    ok(win.placeholder === "Random if left blank" && win.blank, "the name says \"Random if left blank\"; the GM sees Blank Sheet", JSON.stringify(win));
    alice.evaluate(() => { game.knavery.createCharacterInteractive(); });
    await alice.waitForSelector(".knavery-create .form-footer", { timeout: T(10000) });
    const aliceBlank = await alice.evaluate(() => !!document.querySelector('.knavery-create .form-footer button[data-action="blank"]'));
    await closeDialogs();
    ok(!aliceBlank, "a player does not see Blank Sheet", String(aliceBlank));

    // Create NPC: the window, then one of each kind.
    gm.evaluate(() => { game.knavery.createNpcInteractive(); });
    await gm.waitForSelector(".knavery-create-npc .form-footer", { timeout: T(10000) });
    const npcWin = await gm.evaluate(() => ({
      tiles: [...document.querySelectorAll(".knavery-create-npc .form-footer button")].map((b) => b.dataset.action),
      monsters: document.querySelectorAll('.knavery-create-npc select[name="monster"] option').length,
    }));
    await gm.screenshot({ path: `${SHOTS}/chargen-create-npc.png` });
    await closeDialogs();
    ok(npcWin.tiles.join() === "monster,person,hireling" && npcWin.monsters > 10, "Create NPC offers Monster, Person and Hireling, with the bestiary listed", JSON.stringify(npcWin));
    const npc = await gm.evaluate(async () => {
      const pack = game.packs.get("base-knavery.monsters");
      const first = [...(await pack.getIndex())][0];
      const src = await pack.getDocument(first._id);
      const mon = await game.knavery.createNpc({ kind: "monster", name: "Probe Monster", monster: first._id, hp: "roll" });
      const person = await game.knavery.createNpc({ kind: "person", name: "Probe Person" });
      const merc = await game.knavery.createNpc({ kind: "hireling", name: "Probe Merc", hireling: "mercenary" });
      for (const app of [...foundry.applications.instances.values()]) if (app.document?.name?.startsWith("Probe ") && app.document.type === "npc") await app.close();
      const out = {
        level: src.system.level, monHp: mon.system.hp.max, monItems: mon.items.size, srcItems: src.items.size,
        person: { role: person.system.role, ac: person.system.ac, hp: person.system.hp.max, traits: Object.keys(person.system.traits ?? {}).length },
        merc: { role: merc.system.role, ac: merc.system.ac, wage: merc.system.wage, dmg: merc.items.find((i) => i.type === "weapon")?.system.damage,
          friendly: merc.prototypeToken.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY },
      };
      return out;
    });
    ok(npc.monHp >= Math.max(1, npc.level) && npc.monHp <= Math.max(1, 8 * npc.level) && npc.monItems === npc.srcItems,
      "a bestiary monster arrives with its attacks and HP rolled as level d8s", JSON.stringify(npc));
    ok(npc.person.role === "npc" && npc.person.ac === 11 && npc.person.hp === 3, "a person met on the road: AC 11, HP 3", JSON.stringify(npc.person));
    ok(npc.merc.role === "hireling" && npc.merc.ac === 15 && npc.merc.wage === 600 && npc.merc.dmg === "d6" && npc.merc.friendly,
      "a mercenary: AC 15, 600c a month, a d6 weapon, friendly", JSON.stringify(npc.merc));

    // Spell items: a spellbook and a scroll for each row, linked; an edited item is kept on a rebuild.
    const spells = await gm.evaluate(async () => {
      const { writeSpellItems, SPELL_PACK } = await import("/systems/base-knavery/module/rulebook-import.js");
      const had = !!game.packs.get(`world.${SPELL_PACK}`);
      const table = await RollTable.create({
        name: "Probe Spell Table", formula: "1d2",
        results: [
          { type: "text", name: "Probe Spark", description: "<p>A spark.</p>", range: [1, 1], weight: 1 },
          { type: "text", name: "Probe Mist", description: "<p>A mist.</p>", range: [2, 2], weight: 1 },
        ],
      });
      const first = await writeSpellItems(table);
      const pack = game.packs.get(`world.${SPELL_PACK}`);
      const mine = async () => (await pack.getDocuments()).filter((d) => ["Probe Spark", "Probe Mist"].includes(d.flags?.["base-knavery"]?.rulebookSpell?.spell));
      let docs = await mine();
      const out = {
        first, books: docs.filter((d) => !d.system.scroll).length, scrolls: docs.filter((d) => d.system.scroll).length,
        described: docs.every((d) => d.system.description.includes("A ")),
        linked: table.results.contents.every((r) => r.documentUuid && docs.some((d) => d.uuid === r.documentUuid && !d.system.scroll)),
      };
      const spark = docs.find((d) => d.name === "Probe Spark");
      await spark.update({ "system.description": "<p>My own spark.</p>" });
      out.second = await writeSpellItems(table);
      docs = await mine();
      out.keptEdit = docs.find((d) => d.name === "Probe Spark")?.system.description.includes("My own");
      for (const d of docs) await d.delete();
      await table.delete();
      if (!had) await pack.deleteCompendium();
      return out;
    });
    ok(spells.books === 2 && spells.scrolls === 2 && spells.described && spells.linked,
      "a spellbook and a scroll for each Spells row, in the world compendium, with the effect, and the rows linked to the books", JSON.stringify(spells));
    ok(spells.second?.kept === 1 && spells.keptEdit, "a rebuild keeps a spell item the GM edited", JSON.stringify(spells));

    // Item order and rations, on Alice's character.
    const inv = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      for (const i of pc.items.contents) await i.delete();
      const add = (data) => pc.createEmbeddedDocuments("Item", [data]);
      await add({ name: "Probe Torch", type: "item", system: { slots: 1 } });
      await add({ name: "Probe Sword", type: "weapon", system: { damage: "d6", attackType: "melee" } });
      await add({ name: "Probe Mail", type: "armor", system: { points: 1 } });
      await add({ name: "Probe Rope", type: "item", system: { slots: 1 } });
      const order = () => pc.inventory.map((i) => i.name).join();
      const out = { first: order() };
      // An old sheet: every sort 0. A new weapon still lands under the last weapon.
      await pc.updateEmbeddedDocuments("Item", pc.items.map((i) => ({ _id: i.id, sort: 0 })));
      const before = pc.inventory.map((i) => i.name);
      await add({ name: "Probe Axe", type: "weapon", system: { damage: "d6", attackType: "melee" } });
      const after = pc.inventory.map((i) => i.name);
      out.axeAfter = after[after.indexOf("Probe Axe") - 1];
      out.lastWeaponBefore = [...before].reverse().find((n) => ["Probe Sword"].includes(n));
      // Rations per slot.
      const { slotsForItem } = await import("/systems/base-knavery/module/documents/actor.js");
      await game.settings.set("base-knavery", "rations-per-slot", 3);
      const [r3] = await add({ name: "Rations", type: "item", system: { slots: 1, quantity: 3 } });
      out.three = slotsForItem(r3);
      await r3.update({ "system.quantity": 4 });
      out.four = slotsForItem(r3);
      await game.settings.set("base-knavery", "rations-per-slot", 1);
      await r3.update({ "system.quantity": 2 });
      out.twoAtOne = slotsForItem(r3);
      // The Inventory footer.
      await pc.sheet.render({ force: true });
      await wait(900);
      out.hint = pc.sheet.element.querySelector(".knavery-reorder-hint")?.textContent.trim() ?? "";
      await pc.sheet.close();
      for (const i of pc.items.contents) await i.delete();
      return out;
    }, ids.a);
    ok(inv.first === "Probe Sword,Probe Mail,Probe Torch,Probe Rope", "a new weapon and armor go to the top, other gear to the bottom", inv.first);
    ok(inv.axeAfter === "Probe Sword", "on a sheet whose items all sort 0, a new weapon still lands under the last weapon", JSON.stringify(inv));
    ok(inv.three === 1 && inv.four === 2 && inv.twoAtOne === 2, "rations per slot: 3 to a slot fills 1 then 2; at 1 a slot, 2 rations fill 2", JSON.stringify(inv));
    ok(/wounded and marked unusable or damaged first/.test(inv.hint), "the Inventory footer's new sentence", inv.hint);
  });

  /* ------------------------------------------------------------------ */
  await section("21. Review #2: effects apply once; GM notes held by the server; career drops gated; hidden names; spell digest; initiative turns.", async () => {
    // A setting change re-prepares actors from their source: an Add effect counts once.
    const fx = await gm.evaluate(async (pcId) => {
      const pc = game.actors.get(pcId);
      const [career] = await pc.createEmbeddedDocuments("Item", [{ name: "Probe Effect Career", type: "career" }], { knKeepSort: true });
      await career.createEmbeddedDocuments("ActiveEffect", [{
        name: "Probe +1 STR", transfer: true,
        changes: [{ key: "system.abilities.STR.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" }],
      }]);
      const base = pc._source.system.abilities.STR.value;
      const before = pc.system.abilities.STR.value;
      await game.settings.set("base-knavery", "rations-per-slot", 3);
      await game.settings.set("base-knavery", "rations-per-slot", 1);
      const after = pc.system.abilities.STR.value;
      await career.delete();
      return { base, before, after };
    }, ids.a);
    ok(fx.before === fx.base + 1 && fx.after === fx.before, "a setting change leaves a +1 STR effect at +1, not +2 or +3", JSON.stringify(fx));

    // GM notes: the server refuses a player's write (system.json gmOnlyFields).
    await gm.evaluate(async (pcId) => game.actors.get(pcId).update({ "system.gmNotes": "<p>Probe secret</p>" }), ids.a);
    const notes = await alice.evaluate(async (pcId) => {
      try { await game.actors.get(pcId).update({ "system.gmNotes": "<p>Alice was here</p>" }, { knCreation: true }); return "accepted"; }
      catch (e) { return `refused: ${e.message}`; }
    }, ids.a);
    const kept = await gm.evaluate((pcId) => game.actors.get(pcId)._source.system.gmNotes, ids.a);
    ok(kept.includes("Probe secret") && !kept.includes("Alice"), "a player cannot overwrite the GM's notes, even past the sheet", `${notes} / ${kept}`);

    // A career dropped on the sheet: no third career.
    const careerId = await gm.evaluate(async (pcId) => {
      const pc = game.actors.get(pcId);
      for (const i of pc.items.filter((x) => x.type === "career")) await i.delete();
      await pc.createEmbeddedDocuments("Item", [{ name: "Probe Career One", type: "career" }, { name: "Probe Career Two", type: "career" }]);
      const loose = await Item.create({ name: "Probe Career Three", type: "career", ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } });
      return loose.id;
    }, ids.a);
    const drop = await alice.evaluate(async ({ pcId, careerId }) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      await pc.sheet.render({ force: true });
      await wait(700);
      await pc.sheet._onDropItem(new DragEvent("drop"), game.items.get(careerId));
      await wait(700);
      await pc.sheet.close();
      return pc.items.filter((i) => i.type === "career").map((i) => i.name);
    }, { pcId: ids.a, careerId });
    await gm.evaluate(async ({ pcId, careerId }) => {
      await game.items.get(careerId)?.delete();
      for (const i of game.actors.get(pcId).items.filter((x) => x.type === "career")) await i.delete();
    }, { pcId: ids.a, careerId });
    ok(drop.length === 2 && !drop.includes("Probe Career Three"), "a career dropped on a sheet with two careers is refused", JSON.stringify(drop));

    // The Target list as a player: a name the GM hid reads "Unknown creature".
    const sceneInfo = await gm.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const before = game.scenes.active?.id ?? null;
      const M = CONST.TOKEN_DISPLAY_MODES;
      const named = await Actor.create({ name: "Probe Named Goblin", type: "npc", system: { role: "monster" } });
      const secret = await Actor.create({ name: "Probe Secret Goblin", type: "npc", system: { role: "monster" } });
      // No token vision: Alice has no token here, and with vision on she would see none at all.
      const scene = await Scene.create({ name: "Probe Names Scene", width: 1000, height: 1000, grid: { size: 100 }, tokenVision: false });
      const tok = async (a, x, displayName) => ({ ...(await a.getTokenDocument({ x, y: 100 })).toObject(), displayName });
      await scene.createEmbeddedDocuments("Token", [await tok(named, 200, M.ALWAYS), await tok(secret, 400, M.NONE)]);
      await scene.activate();
      await wait(1000);
      return { before, scene: scene.id };
    });
    const names = await alice.evaluate(async ({ pcId, sceneId }) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      for (let i = 0; i < 60 && !(canvas.ready && canvas.scene?.id === sceneId); i++) await wait(250);
      await wait(800);
      const pc = game.actors.get(pcId);
      await pc.sheet.render({ force: true });
      await wait(900);
      pc.sheet.element.querySelector("#attack-button")?.click();
      await wait(1200);
      const dlg = document.querySelector(".knavery-roll-prompt");
      const opts = [...(dlg?.querySelectorAll('select[name="target"] option') ?? [])].map((o) => o.textContent.trim());
      const elIds = [...(dlg?.querySelectorAll(".dialog-content [id]") ?? [])].map((e) => e.id);
      // Sheets and dialogs only: closing core's chat log too would break every later message update here.
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.document || app instanceof foundry.applications.api.DialogV2) await app.close();
      }
      return { opts, ids: elIds, canvas: canvas.scene?.id === sceneId };
    }, { pcId: ids.a, sceneId: sceneInfo.scene });
    await gm.evaluate(async ({ before, scene }) => {
      if (before) await game.scenes.get(before)?.activate();
      await game.scenes.get(scene)?.delete();
      for (const a of game.actors.filter((x) => ["Probe Named Goblin", "Probe Secret Goblin"].includes(x.name))) await a.delete();
    }, sceneInfo);
    ok(names.canvas && names.opts.includes("Probe Named Goblin") && names.opts.includes("Unknown creature") && !names.opts.includes("Probe Secret Goblin"),
      "a player's Target list shows the names the GM shows, and \"Unknown creature\" for a hidden one", JSON.stringify(names));
    ok(names.ids.length > 0 && names.ids.every((id) => !/^kn-[a-z-]+$/.test(id)), "the attack window's ids are its own (no fixed kn-... ids)", JSON.stringify(names.ids));

    // The Spells digest reads the stored rows: editing a linked spellbook leaves the table "unchanged".
    const dig = await gm.evaluate(async () => {
      const { writeSpellItems, digest, SPELL_PACK } = await import("/systems/base-knavery/module/rulebook-import.js");
      const had = !!game.packs.get(`world.${SPELL_PACK}`);
      const table = await RollTable.create({
        name: "Probe Digest Table", formula: "1d1",
        results: [{ type: "text", name: "Probe Glow", description: "<p>A glow.</p>", range: [1, 1], weight: 1 }],
      });
      await writeSpellItems(table);
      const hash = digest(table);
      const pack = game.packs.get(`world.${SPELL_PACK}`);
      const docs = (await pack.getDocuments()).filter((d) => d.flags?.["base-knavery"]?.rulebookSpell?.spell === "Probe Glow");
      const book = docs.find((d) => !d.system.scroll);
      await book.update({ img: "icons/svg/book.svg" });
      await pack.getIndex();
      table.reset();
      const after = digest(table);
      for (const d of docs) await d.delete();
      await table.delete();
      if (!had) await pack.deleteCompendium();
      return { same: hash === after, linked: !!book };
    });
    ok(dig.linked && dig.same, "editing a spellbook the Spells table links to does not mark the table as edited", JSON.stringify(dig));

    // Knave 1e group initiative. The GM's Next Round rolls before the round changes: core keeps the turn
    // with its holder, so the holder's turn is the first to end. A round a player advanced is rolled after:
    // its turn goes to the first combatant who is not defeated (core's Skip Defeated on), and is stored.
    const ini = await gm.evaluate(async (pcId) => {
      const settle = () => new Promise((res) => setTimeout(res, 600));
      await game.settings.set("base-knavery", "knave1e-initiative", true);
      const trackerBefore = foundry.utils.deepClone(game.settings.get("core", "combatTrackerConfig"));
      const foes = [];
      for (const n of ["Probe Foe A", "Probe Foe B", "Probe Foe C"]) foes.push(await Actor.create({ name: n, type: "npc", system: { role: "monster" } }));
      const combat = await Combat.create({ scene: null });
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: pcId }, ...foes.map((f) => ({ actorId: f.id }))]);
      // Core fires combatTurnChange once an update's turn events are done: wait for it, then settle.
      const change = () => {
        let hook;
        return new Promise((res) => {
          hook = Hooks.on("combatTurnChange", (c) => { if (c === combat) res(); });
          setTimeout(res, 5000);
        }).finally(() => Hooks.off("combatTurnChange", hook));
      };
      const step = async (fn) => { const done = change(); await fn(); await done; await settle(); };
      await step(() => combat.startCombat());
      const gmRounds = [];
      for (let r = 0; r < 10; r++) {
        await step(() => combat.update({ turn: combat.turns.length - 1 })); // end of the round
        const holder = combat.combatant?.id;
        const ended = [];
        combat._onEndTurn = async function (c, ctx) { ended.push(c.id); return Object.getPrototypeOf(this)._onEndTurn.call(this, c, ctx); };
        const order = combat.turns.map((c) => c.id).join();
        await step(() => combat.nextRound());
        delete combat._onEndTurn;
        gmRounds.push({ ok: ended[0] === holder, flipped: order !== combat.turns.map((c) => c.id).join() });
      }
      // A round a player advanced: core's nextRound with no roll first; the active GM's client rolls it.
      await game.settings.set("core", "combatTrackerConfig", { ...trackerBefore, skipDefeated: true });
      const pc = combat.combatants.find((c) => c.actorId === pcId);
      await pc.update({ defeated: true });
      const playerRounds = [];
      for (let r = 0; r < 10; r++) {
        await step(() => combat.update({ turn: combat.turns.length - 1 }));
        await step(() => foundry.documents.Combat.prototype.nextRound.call(combat));
        await settle();
        const want = combat.turns.findIndex((c) => !c.isDefeated);
        playerRounds.push({ ok: combat.turn === want && combat._source.turn === want, turn: combat.turn, stored: combat._source.turn, want,
          pcFirst: combat.turns[0]?.id === pc.id });
      }
      await combat.delete();
      for (const f of foes) await f.delete();
      await game.settings.set("core", "combatTrackerConfig", trackerBefore);
      await game.settings.set("base-knavery", "knave1e-initiative", false);
      return { gmRounds, playerRounds };
    }, ids.a);
    ok(ini.gmRounds.every((r) => r.ok) && ini.gmRounds.some((r) => r.flipped),
      "group initiative: at each Next Round the holder's turn is the first to end", JSON.stringify(ini.gmRounds));
    ok(ini.playerRounds.every((r) => r.ok) && ini.playerRounds.some((r) => r.pcFirst),
      "a round a player advanced goes to the first combatant not defeated, and the turn is stored", JSON.stringify(ini.playerRounds));
  });

  /* ------------------------------------------------------------------ */
  await section("22. Time: dungeon turns and travel watches; hazard cards apply fatigue, burn and depletion on a click; lit lights.", async () => {
    // The Time tab ends a turn: the clock counts it, the world clock moves 10 minutes, the die rolls.
    const t = await gm.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const H = await import("/systems/base-knavery/module/hazard.js");
      const saved = game.settings.get("base-knavery", "time-clock");
      const start = game.time.worldTime;
      await game.settings.set("base-knavery", "time-clock", { mode: "dungeon" });
      game.knavery.openDashboard();
      await wait(1200);
      const dash = foundry.applications.instances.get("knavery-gm-dashboard");
      await dash.changeTab("time", "primary");
      await wait(400);
      const el = dash.element;
      const out = { tab: !!el.querySelector('[data-tab="time"].active .dash-end-turn') };
      const before = game.messages.size;
      el.querySelector('[data-action="endTurn"]').click();
      await wait(2000);
      const card = game.messages.contents.at(-1);
      out.turn = H.clock().turn;
      out.dungeonSeconds = game.time.worldTime - start;
      out.card = game.messages.size > before && !!card?.getFlag("base-knavery", "hazard") && card.whisper.length > 0;
      out.cardWhen = card?.content.includes("Turn 1") ?? false;
      // Travel: four watches on the move; the fourth card carries the forced-march note.
      await H.setClock({ mode: "travel" });
      await wait(300);
      for (let i = 0; i < 4; i++) { await H.endTurn({ travelling: true }); await wait(300); }
      const fourth = game.messages.contents.at(-1);
      out.travel = H.clock();
      out.forced = fourth?.content.includes("More than three watches") ?? false;
      out.travelSeconds = game.time.worldTime - start - out.dungeonSeconds;
      await dash.close();
      // Put the world back as it was.
      await game.time.advance(start - game.time.worldTime);
      await game.settings.set("base-knavery", "time-clock", saved);
      return out;
    });
    ok(t.tab && t.turn === 1 && t.dungeonSeconds === 600 && t.card && t.cardWhen,
      "ending a dungeon turn counts it, moves the world clock 10 minutes and whispers the hazard die", JSON.stringify(t));
    ok(t.travel.watch === 4 && t.travel.travelled === 4 && t.travelSeconds === 4 * 14400 && t.forced,
      "four watches of travel: the clock moves 16 hours and the fourth card notes forced marching", JSON.stringify(t));
    // Pictures: the Time tab in travel, and the chat with its hazard cards.
    await gm.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const H = await import("/systems/base-knavery/module/hazard.js");
      await game.settings.set("base-knavery", "time-clock", { mode: "travel", day: 2, watch: 3, travelled: 2 });
      game.knavery.openDashboard();
      await wait(1200);
      await foundry.applications.instances.get("knavery-gm-dashboard").changeTab("time", "primary");
      ui.sidebar.changeTab("chat", "primary");
      await wait(600);
      return H.clock();
    });
    await gm.screenshot({ path: `${SHOTS}/time-tab.png` });
    await gm.evaluate(async () => {
      await foundry.applications.instances.get("knavery-gm-dashboard")?.close();
      await game.settings.set("base-knavery", "time-clock", {});
    });

    // A light toggles on the sheet; burn and depletion change sheets only when the GM clicks.
    await gm.evaluate(async (pcId) => {
      const pc = game.actors.get(pcId);
      for (const i of pc.items.contents) await i.delete();
      await pc.createEmbeddedDocuments("Item", [
        { name: "Torch", type: "item", system: { quantity: 3, lit: true } },
        { name: "Torch", type: "item", system: { quantity: 2 } },
        { name: "Candles", type: "item", system: { quantity: 10, bundle: 10 } },
        { name: "Rations", type: "item", system: { quantity: 6 } },
      ]);
    }, ids.a);
    const lit = await alice.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      await pc.sheet.render({ force: true });
      await wait(900);
      await pc.sheet.changeTab("inventory", "primary");
      await wait(300);
      const candleRow = [...pc.sheet.element.querySelectorAll(".knavery-items-list-row")].find((r) => r.textContent.includes("Candles"));
      candleRow?.querySelector('[data-action="itemToggleLit"]')?.click();
      await wait(900);
      const candle = pc.items.find((i) => i.name === "Candles");
      const row = [...pc.sheet.element.querySelectorAll(".knavery-items-list-row")].find((r) => r.textContent.includes("Candles"));
      const out = { candleLit: candle?.system.lit, tag: !!row?.querySelector(".lit-tag"), ropeToggle: false };
      await pc.sheet.close();
      return out;
    }, ids.a);
    ok(lit.candleLit === true && lit.tag, "a player lights a candle from the Inventory row; the row says Lit", JSON.stringify(lit));

    const apply = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const { rollHazard } = await import("/systems/base-knavery/module/rolls.js");
      const pc = game.actors.get(pcId);
      const torches = () => pc.items.filter((i) => i.name === "Torch").map((i) => `${i.system.quantity}${i.system.lit ? "L" : ""}`).sort().join();
      const out = { before: torches() };
      // Roll until a burn card lands; the sheet is untouched until its button is clicked.
      let card = null;
      const made = [];
      for (let i = 0; i < 80 && !card; i++) {
        const m = await rollHazard("dungeon");
        made.push(m.id);
        if (m.getFlag("base-knavery", "hazard")?.face === "burn") card = m;
      }
      await wait(800);
      out.untouched = torches() === out.before;
      ui.sidebar.changeTab("chat", "primary");
      await wait(500);
      const btn = document.querySelector(`#chat [data-message-id="${card.id}"] [data-kn-hazard="burn"]`);
      out.button = !!btn;
      btn?.click();
      await wait(1500);
      out.after = torches();
      out.applied = card.getFlag("base-knavery", "hazardApplied") === true;
      // Depletion: a d6 for each ration, each 1 spoils.
      const H = await import("/systems/base-knavery/module/hazard.js");
      await H.applyDepletion();
      await wait(800);
      const report = game.messages.contents.at(-1);
      const ones = report.rolls[0]?.dice[0]?.results.filter((r) => r.result === 1).length ?? -1;
      const food = pc.items.find((i) => i.name === "Rations");
      out.rations = food ? food.system.quantity : 0;
      out.expected = 6 - ones;
      for (const id of made) await game.messages.get(id)?.delete();
      await report.delete();
      return out;
    }, ids.a);
    ok(apply.untouched && apply.button && apply.after === "2,2" && apply.applied,
      "a burn card changes nothing until the GM clicks; then the lit stack of 3 torches loses one and goes dark, the unlit 2 kept", JSON.stringify(apply));
    ok(apply.rations === apply.expected, "depletion rolls a d6 per ration and each 1 spoils", JSON.stringify(apply));

    // Fatigue: resting sets it aside; otherwise the GM's ticks take 1 damage.
    const fat = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const { rollHazard } = await import("/systems/base-knavery/module/rolls.js");
      const H = await import("/systems/base-knavery/module/hazard.js");
      const pc = game.actors.get(pcId);
      await pc.update({ "system.hp.value": 4, "system.hp.max": 4, "system.wounds": 0 });
      const made = [];
      let rested = null;
      for (let i = 0; i < 80 && !rested; i++) {
        const m = await rollHazard("dungeon", { resting: true });
        made.push(m.id);
        if (m.getFlag("base-knavery", "hazard")?.face === "fatigue") rested = m;
      }
      const out = { restNote: rested?.content.includes("Ignored: the party is resting") ?? false, restButton: rested?.content.includes("data-kn-hazard") ?? true };
      // Untick everyone but this character, then deal it.
      const pending = H.applyFatigue();
      await wait(1000);
      const dlg = [...document.querySelectorAll(".application.dialog")].at(-1);
      for (const box of dlg?.querySelectorAll('input[name="hit"]') ?? []) box.checked = box.value === pcId;
      dlg?.querySelector('footer button[data-action="ok"]')?.click();
      out.dealt = await pending;
      await wait(800);
      out.hp = pc.system.hp.value;
      for (const id of made) await game.messages.get(id)?.delete();
      for (const i of pc.items.contents) await i.delete();
      return out;
    }, ids.a);
    ok(fat.restNote && !fat.restButton, "a fatigue roll while resting is ignored and offers no button", JSON.stringify(fat));
    ok(fat.dealt === 1 && fat.hp === 3, "fatigue deals 1 damage to each ticked party member", JSON.stringify(fat));
  });

  /* ------------------------------------------------------------------ */
  await section("23. Morale at breaking points, the leader's rally, companions; wages due and paid by the employer.", async () => {
    // Wages: a mercenary employed by Alice's character; Pay takes 600c and moves the due date a month.
    const w = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      await pc.update({ "system.coins": 1000 });
      const merc = await game.knavery.createNpc({ kind: "hireling", name: "Probe Wage Merc", hireling: "mercenary" });
      await merc.sheet.close();
      await merc.update({ "system.employer": pcId });
      await merc.sheet.render({ force: true });
      await wait(900);
      const select = merc.sheet.element.querySelector('select[name="system.employer"]');
      const out = { employerShown: select?.value === pcId };
      await merc.sheet.close();
      game.knavery.openDashboard();
      await wait(1200);
      const dash = foundry.applications.instances.get("knavery-gm-dashboard");
      await dash.changeTab("time", "primary");
      await wait(400);
      const row = () => [...dash.element.querySelectorAll(".dash-wage")].find((r) => r.textContent.includes("Probe Wage Merc"));
      out.before = row()?.querySelector(".dash-wage-status")?.textContent.trim();
      row()?.querySelector('[data-action="payWage"]')?.click();
      await wait(1500);
      out.coins = pc.system.coins;
      out.dueDays = Math.round((merc.system.wageDue - game.time.worldTime) / 86400);
      out.after = row()?.querySelector(".dash-wage-status")?.textContent.trim();
      row()?.querySelector('[data-action="payWage"]')?.click(); // 400c left: not enough
      await wait(1200);
      out.coinsAfterRefusal = pc.system.coins;
      await dash.close();
      await merc.delete();
      return out;
    }, ids.a);
    ok(w.employerShown && w.before === "Due now" && w.coins === 400 && w.dueDays === 30 && w.after === "Due in 30 days",
      "a hireling's sheet names its employer; Pay takes the month's wage from them and the next is due in 30 days", JSON.stringify(w));
    ok(w.coinsAfterRefusal === 400, "an employer who can't cover the wage is not charged", JSON.stringify(w));

    // Breaking points in a running combat: the first casualty, half fallen, the last one alone at half HP.
    const b = await gm.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const foes = [];
      for (const n of ["Probe Rout A", "Probe Rout B", "Probe Rout C"]) {
        foes.push(await Actor.create({ name: n, type: "npc", system: { role: "monster", hp: { value: 4, max: 4 }, morale: 7 } }));
      }
      const companion = await Actor.create({ name: "Probe Loyal", type: "npc", system: { role: "companion" } });
      const combat = await Combat.create({ scene: null, active: true });
      await combat.createEmbeddedDocuments("Combatant", foes.map((f) => ({ actorId: f.id })));
      await combat.startCombat();
      await wait(500);
      const cards = () => game.messages.filter((m) => m.getFlag("base-knavery", "breaking")?.combat === combat.id);
      await foes[0].update({ "system.hp.value": 0 });
      await wait(1200);
      const first = cards().map((m) => m.content);
      await foes[1].update({ "system.hp.value": 0 });
      await wait(1200);
      await foes[2].update({ "system.hp.value": 2 });
      await wait(1200);
      await foes[2].update({ "system.hp.value": 1 }); // already prompted: no second card
      await wait(1000);
      const all = cards();
      const out = {
        firstCard: first.length === 1 && first[0].includes("first casualty") && first[0].includes("Probe Rout B") && !first[0].includes("Probe Rout A,"),
        reasons: all.map((m) => m.getFlag("base-knavery", "breaking").reason),
        whispered: all.every((m) => m.whisper.length > 0),
      };
      // The card's button rolls morale for the standing NPCs it names.
      ui.sidebar.changeTab("chat", "primary");
      await wait(500);
      const before = game.messages.filter((m) => m.getFlag("base-knavery", "morale")).length;
      document.querySelector(`#chat [data-message-id="${all[0].id}"] [data-kn-morale-test]`)?.click();
      await wait(1500);
      out.moraleRolled = game.messages.filter((m) => m.getFlag("base-knavery", "morale")).length - before;
      // A companion never tests morale.
      const { rollMorale } = await import("/systems/base-knavery/module/rolls.js");
      out.companion = await rollMorale(companion);
      // The rally: a failed test offers it; the leader's CHA check; once per side a battle.
      await foes[2].update({ "system.morale": 2 });
      let failed = null;
      for (let i = 0; i < 30 && !failed; i++) {
        const m = await rollMorale(foes[2]);
        if (m.getFlag("base-knavery", "morale")?.holds === false) failed = m;
      }
      out.rallyButton = failed?.content.includes("data-kn-rally") ?? false;
      const pending = game.knavery.rally(foes[2]);
      await wait(900);
      const dlg = [...document.querySelectorAll(".application.dialog")].at(-1);
      dlg?.querySelector('footer button[data-action="ok"]')?.click();
      await wait(900);
      document.querySelector('.knavery-roll-prompt footer button[data-action="normal"]')?.click();
      await pending;
      await wait(800);
      out.rallied = combat.getFlag("base-knavery", "rallied") ?? [];
      const warned = [];
      const origWarn = ui.notifications.warn.bind(ui.notifications);
      ui.notifications.warn = (msg, o) => { warned.push(msg); return origWarn(msg, o); };
      await game.knavery.rally(foes[2]);
      ui.notifications.warn = origWarn;
      out.secondRefused = warned.includes("KNAVERY.MoraleTest.RallyUsed");
      for (const m of all) await m.delete();
      await combat.delete();
      for (const f of [...foes, companion]) await f.delete();
      return out;
    });
    ok(b.firstCard && b.whispered, "the first casualty whispers the GM a breaking-point card naming the NPCs who still stand", JSON.stringify(b));
    ok(b.reasons.length === 3 && /half of them/.test(b.reasons[1]) && /alone/.test(b.reasons[2]),
      "half the side fallen, and the last one alone at half HP, each prompt once", JSON.stringify(b.reasons));
    ok(b.moraleRolled === 1, "the card's Roll morale button rolls for the NPCs it names who still stand (one of two has fallen since)", JSON.stringify(b));
    ok(b.companion === null, "a companion never tests morale", JSON.stringify(b));
    ok(b.rallyButton && b.rallied.includes("foes") && b.secondRefused,
      "a failed test offers the leader's CHA rally, and each side may try it once a battle", JSON.stringify(b));
  });

  /* ------------------------------------------------------------------ */
  await section("24. Description: Backstory with a 35-word guide; Alignment and Background on the Knave page by switch.", async () => {
    const d = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
      await pc.update({ "system.biography": `<p>${words(12)}</p>`, "system.traits.alignment": "Probe Lawful", "system.traits.background": "Probe Baker" });
      await game.settings.set("base-knavery", "show-alignment", false);
      await game.settings.set("base-knavery", "show-background", false);
      await pc.sheet.render({ force: true });
      await wait(900);
      await pc.sheet.changeTab("description", "primary");
      await wait(400);
      const el = pc.sheet.element;
      const desc = () => [...el.querySelectorAll('[data-tab="description"] .trait-input')].map((i) => i.name);
      const out = {
        descTraits: desc(),
        label: el.querySelector(".knavery-bio .trait-picklist-label")?.textContent.trim(),
        count: el.querySelector(".knavery-word-count")?.textContent.trim(),
        knaveOff: el.querySelectorAll(".knave-trait-line").length,
      };
      await pc.update({ "system.biography": `<p>${words(40)}</p>` });
      await wait(900);
      out.countOver = pc.sheet.element.querySelector(".knavery-word-count")?.textContent.trim();
      out.overClass = pc.sheet.element.querySelector(".knavery-word-count")?.classList.contains("over");
      // Both switches on: the Knave page shows both lines, still not on Description.
      await game.settings.set("base-knavery", "show-alignment", true);
      await game.settings.set("base-knavery", "show-background", true);
      await wait(900);
      await pc.sheet.changeTab("knave", "primary");
      await wait(400);
      const lines = [...pc.sheet.element.querySelectorAll(".knave-trait-line input")];
      out.knaveOn = lines.map((i) => `${i.name}=${i.value}`);
      out.descOn = [...pc.sheet.element.querySelectorAll('[data-tab="description"] .trait-input')].map((i) => i.name)
        .filter((n) => /alignment|background/.test(n));
      out.lineWidths = lines.map((i) => Math.round(i.closest(".knave-trait-line").getBoundingClientRect().right <= pc.sheet.element.getBoundingClientRect().right));
      return out;
    }, ids.a);
    await gm.screenshot({ path: `${SHOTS}/knave-page-1e-traits.png` });
    await gm.evaluate(async (pcId) => {
      const pc = game.actors.get(pcId);
      await pc.sheet.changeTab("description", "primary");
    }, ids.a);
    await new Promise((res) => setTimeout(res, 500));
    await gm.screenshot({ path: `${SHOTS}/description-backstory.png` });
    const r = await gm.evaluate(async (pcId) => {
      const { rollTraits } = await import("/systems/base-knavery/module/character-generator.js");
      const on = await rollTraits();
      await game.settings.set("base-knavery", "show-alignment", false);
      await game.settings.set("base-knavery", "show-background", false);
      const off = await rollTraits();
      const pc = game.actors.get(pcId);
      await pc.sheet.close();
      await pc.update({ "system.biography": "", "system.traits.alignment": "", "system.traits.background": "" });
      return { onAlignment: !!on.alignment, onBackground: !!on.background, offAlignment: "alignment" in off, offBackground: "background" in off, offOthers: Object.keys(off).length };
    }, ids.a);
    ok(!d.descTraits.some((n) => /alignment|background/.test(n)) && d.descTraits.length > 0 && d.label === "Backstory",
      "the Description page reads Backstory and no longer lists Alignment or Background", JSON.stringify(d));
    ok(d.count === "12 / 35 words" && d.countOver === "40 / 35 words" && d.overClass,
      "the backstory counter reads 12 / 35 words, and turns amber at 40", JSON.stringify(d));
    ok(d.knaveOff === 0 && d.knaveOn.join() === "system.traits.alignment=Probe Lawful,system.traits.background=Probe Baker" && d.descOn.length === 0,
      "with their Knave 1e switches on, Alignment and Background show on the Knave page (kept values), still not on Description", JSON.stringify(d));
    ok(d.lineWidths.every(Boolean), "the Knave page's trait lines fit the narrow sheet", JSON.stringify(d.lineWidths));
    ok(r.onAlignment && r.onBackground && !r.offAlignment && !r.offBackground && r.offOthers > 0,
      "random traits include Alignment and Background only while their switches are on", JSON.stringify(r));
  });

  /* ------------------------------------------------------------------ */
  await section("25. Item badges: weapons, armor, spellbooks, scrolls, magic items, relics and potions are marked on the Inventory row.", async () => {
    const b = await gm.evaluate(async (pcId) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = game.actors.get(pcId);
      for (const i of pc.items.contents) await i.delete();
      await pc.createEmbeddedDocuments("Item", [
        { name: "Probe Sword", type: "weapon", system: { damage: "d6", attackType: "melee" } },
        { name: "Probe Glowing Blade", type: "weapon", system: { damage: "d8", attackType: "melee", kind: "magic" } },
        { name: "Probe Gambeson", type: "armor", system: { points: 1 } },
        { name: "Probe Spellbook", type: "spellbook" },
        { name: "Probe Scroll", type: "spellbook", system: { scroll: true } },
        { name: "Probe Ring", type: "item", system: { kind: "magic" } },
        { name: "Probe Idol", type: "item", system: { kind: "relic" } },
        { name: "Probe Potion", type: "item", system: { kind: "potion" } },
        { name: "Probe Rope", type: "item" },
      ]);
      await pc.sheet.render({ force: true });
      await wait(900);
      await pc.sheet.changeTab("inventory", "primary");
      await wait(400);
      const rows = {};
      for (const row of pc.sheet.element.querySelectorAll(".knavery-items-list-row[data-item-id]")) {
        const name = row.querySelector(".knavery-item-title")?.textContent.trim();
        const badge = row.querySelector(".knavery-item-badge");
        rows[name] = { cls: [...badge.classList].filter((c) => c !== "knavery-item-badge").sort().join(" "), icon: badge.querySelector("i")?.className.replace("fa-solid ", "") ?? "", tip: badge.dataset.tooltipText ?? "" };
      }
      // The item sheet offers the Kind choice.
      const ring = pc.items.getName("Probe Ring");
      await ring.sheet.render({ force: true });
      await wait(700);
      const kindSelect = ring.sheet.element.querySelector('select[name="system.kind"]');
      const out = { rows, kindOptions: kindSelect ? [...kindSelect.options].map((o) => o.value).join() : "", kindValue: kindSelect?.value };
      await ring.sheet.close();
      return out;
    }, ids.a);
    await gm.screenshot({ path: `${SHOTS}/inventory-badges.png` });
    await gm.evaluate(async (pcId) => {
      const pc = game.actors.get(pcId);
      await pc.sheet.close();
      for (const i of pc.items.contents) await i.delete();
    }, ids.a);
    const r = b.rows;
    ok(r["Probe Sword"]?.icon === "fa-sword" && r["Probe Sword"].cls === "plain" && r["Probe Gambeson"]?.icon === "fa-shield" && r["Probe Gambeson"].cls === "plain",
      "a weapon and armor carry a quiet sword and shield badge", JSON.stringify(r));
    ok(r["Probe Spellbook"]?.icon === "fa-book-sparkles" && r["Probe Scroll"]?.icon === "fa-scroll" && r["Probe Spellbook"].cls === "special" && r["Probe Scroll"].cls === "special",
      "spellbooks and scrolls carry accented book and scroll badges", JSON.stringify(r));
    ok(r["Probe Ring"]?.icon === "fa-sparkles" && r["Probe Idol"]?.icon === "fa-ankh" && r["Probe Potion"]?.icon === "fa-flask-round-potion",
      "magic items, relics and potions carry their own badges", JSON.stringify(r));
    ok(r["Probe Glowing Blade"]?.icon === "fa-sword" && /glow/.test(r["Probe Glowing Blade"].cls) && r["Probe Glowing Blade"].tip === "Magic: Weapon",
      "a magic weapon keeps its sword, glowing, and says it is magic", JSON.stringify(r["Probe Glowing Blade"]));
    ok(r["Probe Rope"]?.cls === "empty" && !r["Probe Rope"].icon, "an ordinary item has an empty chit, so the names line up", JSON.stringify(r["Probe Rope"]));
    ok(b.kindOptions === "ordinary,magic,relic,potion" && b.kindValue === "magic", "the item sheet offers Ordinary, Magic, Relic and Potion", JSON.stringify(b));
  });

  /* ------------------------------------------------------------------ */
  await section("26. Knave 1e rules: the Rules choice, the stamp, 1e creation, death, healing, spells, the sheet, the 2e hand-off, the welcome.", async () => {
    // The Rules choice and the stamp.
    const a = await gm.evaluate(async (sys) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const ns = "base-knavery";
      const R = await import(`${sys}/rules.js`);
      const { RULES_PRESETS } = await import(`${sys}/config.js`);
      const out = { stamp: game.settings.get(ns, "rules-stamp") };
      out.newWorld = R.isExistingWorld({ storedKeys: [], documents: 0 });
      out.autoOnly = R.isExistingWorld({ storedKeys: ["welcome-shown-version", "rules-stamp"], documents: 0 });
      out.withActors = R.isExistingWorld({ storedKeys: [], documents: 3 });
      out.withSetting = R.isExistingWorld({ storedKeys: ["advantage-mode"], documents: 0 });
      await R.applyRules("2e");
      out.as2e = R.currentRules();
      await R.applyRules("1e");
      out.as1e = R.currentRules();
      out.all1e = Object.entries(RULES_PRESETS["1e"]).every(([k, v]) => game.settings.get(ns, k) === v);
      await game.settings.set(ns, "spell-rule", "int-per-day");
      out.mixed = R.currentRules();
      await game.settings.set(ns, "spell-rule", "book-per-day");
      out.back = R.currentRules();
      // The Rules window: the choice sets the rows, a row changed reads Custom. Closed unsaved.
      const menu = game.settings.menus.get(`${ns}.hacks`);
      const app = new menu.type();
      await app.render({ force: true });
      await wait(700);
      const el = app.element;
      const select = el.querySelector('select[name="knavery-rules"]');
      out.windowValue = select?.value;
      out.windowFirst = el.querySelector(".knavery-settings-rows")?.firstElementChild?.classList.contains("knavery-rules-choice");
      select.value = "2e";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      out.deathAfter2e = el.querySelector(`[name="${ns}.death-rule"]`)?.value;
      out.xpAfter2e = el.querySelector(`[name="${ns}.knave1e-xp"]`)?.checked;
      const death = el.querySelector(`[name="${ns}.death-rule"]`);
      death.value = "knave1e";
      death.dispatchEvent(new Event("change", { bubbles: true }));
      out.afterRow = select.value;
      await app.close();
      out.stillSaved = R.currentRules();
      return out;
    }, SYS);
    ok(a.stamp === "2e", "the probe world, made before 0.2.0, was stamped with Knave 2e's rules", JSON.stringify(a));
    ok(!a.newWorld && !a.autoOnly && a.withActors && a.withSetting,
      "a world with no documents and no settings of its own is new; actors or a stored setting make it an older world", JSON.stringify(a));
    ok(a.as2e === "2e" && a.as1e === "1e" && a.all1e && a.mixed === "custom" && a.back === "1e",
      "the Rules choice writes every rule; one rule changed reads Custom, and back again reads Knave 1e", JSON.stringify(a));
    ok(a.windowFirst && a.windowValue === "1e" && a.deathAfter2e === "wounds" && a.xpAfter2e === false && a.afterRow === "custom" && a.stillSaved === "1e",
      "Configure Rules opens with the Rules choice: picking 2e sets the rows, changing a row shows Custom, nothing saves unasked", JSON.stringify(a));

    // Knave 1e creation (the world now plays 1e).
    const c = await gm.evaluate(async (sys) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const G = await import(`${sys}/character-generator.js`);
      const { abilityBudget } = await import(`${sys}/level-up.js`);
      const built = await G.buildCharacter({ level: 1 });
      const v = built.system.abilities;
      const out = {
        scores: Object.values(v).map((x) => x.value),
        careers: built.careers.length, coins: built.system.coins,
        books: built.items.filter((i) => i.type === "spellbook").length,
        rations: built.items.find((i) => i.name === "Rations")?.system?.quantity ?? 0,
        weapons: built.items.filter((i) => i.type === "weapon").length,
        hp: built.system.hp.max,
        alignment: built.system.traits.alignment ?? "", background: built.system.traits.background ?? "",
        lowestNote: built.notes.find((n) => n.startsWith("Abilities, lowest of 3d6")) ?? "",
        weaponNote: built.notes.find((n) => n.startsWith("Weapon:")) ?? "",
        budget: abilityBudget(1),
      };
      const r = await G.rollLowestAbilities();
      out.valid = !!G.validRolled(r);
      out.validSwap = !!G.validRolled({ ...r, values: { ...r.values, STR: r.values.CHA, CHA: r.values.STR }, swap: ["STR", "CHA"] });
      out.cheat = G.validRolled({ ...r, values: { ...r.values, STR: 7 } });
      const choices = await G.weaponChoices();
      const chosen = await G.buildCharacter({ level: 1, weapon: choices[0]?.name });
      out.chosenNote = chosen.notes.find((n) => n.startsWith("Weapon:")) ?? "";
      out.firstWeapon = choices[0]?.name;
      // The swap window: pick STR and CHA, then Done.
      const p = G.promptSwap(r);
      await wait(700);
      const dlg = [...foundry.applications.instances.values()].find((x) => x.element?.classList.contains("knavery-lowest"));
      out.rows = dlg?.element.querySelectorAll(".kn-lowest-row").length;
      dlg.element.querySelector('select[name="a"]').value = "STR";
      dlg.element.querySelector('select[name="b"]').value = "CHA";
      dlg.element.querySelector('button[data-action="ok"]').click();
      const res = await p;
      out.swapped = res?.swap?.join() === "STR,CHA" && res.values.STR === r.values.CHA && res.values.CHA === r.values.STR;
      return out;
    }, SYS);
    ok(c.scores.every((s) => s >= 1 && s <= 6) && /lowest of 3d6/.test(c.lowestNote) && c.budget.total === null && c.budget.cap === 6,
      "a 1e character's abilities are each the lowest of 3d6 (1 to 6), and Char Gen Mode caps them at 6 with no points total", JSON.stringify(c));
    ok(c.careers === 0 && c.coins === 0 && c.books === 0 && c.rations === 2 && c.weapons === 1 && c.hp >= 1 && c.hp <= 8,
      "a 1e kit: no careers, coins or spellbook; two rations, one weapon; HP a d8", JSON.stringify(c));
    ok(!!c.alignment && !!c.background, "a 1e character rolls Alignment and Background", JSON.stringify(c));
    ok(c.valid && c.validSwap && c.cheat === null, "a roll from a player's window is checked: dice and one swap pass, a raised score fails", JSON.stringify(c));
    ok(c.chosenNote === `Weapon: ${c.firstWeapon} (chosen).` && /picked at random/.test(c.weaponNote),
      "the weapon is the player's choice, or picked at random when nobody chose", JSON.stringify(c));
    ok(c.rows === 6 && c.swapped, "the six rolls are shown and two scores can be swapped", JSON.stringify(c));

    // Death, healing and spells under 1e, and the sheet.
    const d = await gm.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const pc = await Actor.create({ name: "Probe 1e PC", type: "character", system: { hp: { value: 3, max: 5 }, level: 3, abilities: { CON: { value: 2 }, INT: { value: 0 } } } });
      const last = () => game.messages.contents.at(-1)?.content ?? "";
      const out = {};
      await pc.applyDamage(3);
      out.d1 = { hp: pc.system.hp.value, wounds: pc.system.wounds, out: pc.system.unconscious, dead: pc.system.dead, card: /is unconscious/.test(last()) };
      // The sheet at 0 HP: one bar, no wounds, no careers, no spells-left; Alignment and Background on the Knave page.
      await pc.sheet.render({ force: true });
      await wait(900);
      const el = pc.sheet.element;
      out.sheet = {
        single: !!el.querySelector(".knavery-bars.single"), woundsBar: el.querySelectorAll(".wounds-bar").length,
        careerLine: el.querySelectorAll(".career-line").length, careersBlock: el.querySelectorAll(".knavery-careers, .careers-block").length,
        knaveTraits: [...el.querySelectorAll(".knave-trait-line input")].map((i) => i.name.split(".").pop()).join(),
        descTraits: [...el.querySelectorAll('[data-tab="description"] .trait-input')].map((i) => i.name.split(".").pop()),
        spellsLeft: [...el.querySelectorAll(".knavery-summary-strip .summary-item")].some((s) => /Spells left/i.test(s.textContent)),
        woundItem: [...el.querySelectorAll(".knavery-summary-strip .summary-item")].some((s) => /Wound/i.test(s.textContent)),
        banner: el.querySelector(".status-banner, .knavery-banner")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        footer: /first and second editions/.test(el.textContent),
        hasPersonalityTable: !!game.tables.getName("Personalities"), hasMannerismTable: !!game.tables.getName("Mannerisms"),
      };
      return out;
    }, SYS);
    // The 1e sheet at 0 HP: the Unconscious banner over one HP bar.
    await gm.screenshot({ path: `${SHOTS}/knave1e-sheet.png` });
    Object.assign(d, await gm.evaluate(async (sys) => {
      const { castSpell } = await import(`${sys}/rolls.js`);
      const pc = game.actors.getName("Probe 1e PC");
      const last = () => game.messages.contents.at(-1)?.content ?? "";
      const out = {};
      await pc.applyDamage(1, { direct: true });
      out.d2 = { hp: pc.system.hp.value, wounds: pc.system.wounds, dead: pc.system.dead, direct: /direct damage/.test(last()), card: /is dead/.test(last()) };
      await pc.applyDamage(5);
      out.floor = pc.system.hp.value;
      // Healing: d8 + CON after a meal; a safe haven, all; the dead do not heal.
      await pc.rest();
      out.deadRest = { hp: pc.system.hp.value, card: /no healing/.test(last()) };
      await pc.update({ "system.hp.value": 0, "system.hp.max": 12 });
      await pc.rest({ slept: true, ate: true });
      out.night = { hp: pc.system.hp.value, card: /Healed \d+ HP \(d8 \d \+ CON 2\)/.test(last()) };
      await pc.rest({ slept: true, ate: true, haven: true });
      out.haven = pc.system.hp.value;
      // Spells: INT 0, three books, each once; cast at the caster's level (3).
      await pc.createEmbeddedDocuments("Item", ["Probe Book A", "Probe Book B", "Probe Book C"].map((name) => ({ name, type: "spellbook" })));
      const count = () => game.messages.filter((m) => m.getFlag("base-knavery", "spell")).length;
      const before = count();
      for (const b of pc.items.filter((i) => i.type === "spellbook")) await castSpell(pc, b);
      out.cast = count() - before;
      out.level = /Cast at level 3\./.test(last());
      await castSpell(pc, pc.items.getName("Probe Book A"));
      out.again = count() - before;
      return out;
    }, SYS));
    const s = d.sheet;
    ok(d.d1.hp === 0 && d.d1.wounds === 0 && d.d1.out && !d.d1.dead && d.d1.card,
      "under Knave 1e, damage to 0 HP leaves a character unconscious, with no wounds", JSON.stringify(d.d1));
    ok(d.d2.hp === -1 && d.d2.wounds === 0 && d.d2.dead && !d.d2.direct && d.d2.card && d.floor === -1,
      "one more point kills (HP -1, no further); direct damage is ordinary damage", JSON.stringify({ d2: d.d2, floor: d.floor }));
    ok(d.deadRest.hp === -1 && d.deadRest.card && d.night.hp >= 3 && d.night.hp <= 10 && d.night.card && d.haven === 12,
      "a night heals d8 + CON, a safe haven all HP, and the dead do not heal", JSON.stringify({ deadRest: d.deadRest, night: d.night, haven: d.haven }));
    ok(d.cast === 3 && d.again === 3 && d.level, "with INT 0 three spellbooks cast, each once a day, at the caster's level", JSON.stringify(d));
    ok(s.single && s.woundsBar === 0 && s.careerLine === 0 && s.careersBlock === 0 && !s.spellsLeft && !s.woundItem,
      "the 1e sheet has one HP bar, no wounds, no careers and no daily spell count", JSON.stringify(s));
    ok(s.knaveTraits === "alignment,background" && /Unconscious/.test(s.banner) && s.footer,
      "Alignment and Background sit on the Knave page, the banner says Unconscious, the footer names both editions", JSON.stringify(s));
    ok(s.descTraits.includes("personality") === s.hasPersonalityTable && s.descTraits.includes("mannerism") === s.hasMannerismTable,
      "Personality and Mannerism show in a 1e world only once their tables exist", JSON.stringify(s));

    // The welcome under 1e, then the 2e hand-off.
    const w = await gm.evaluate(async (sys) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      await game.actors.getName("Probe 1e PC")?.sheet.close();
      const { openWelcome } = await import(`${sys}/welcome.js`);
      await openWelcome();
      await wait(900);
      const el = document.getElementById("knavery-welcome");
      return {
        world: el?.querySelector(".knavery-welcome-world")?.textContent.trim(),
        itch1e: [...el.querySelectorAll('.knavery-welcome-book[data-edition="1e"] a')].map((x) => x.href).join(),
        links2e: el.querySelectorAll('.knavery-welcome-book[data-edition="2e"] a').length,
        smallLast: el.querySelector(".knavery-welcome-small details.knavery-welcome-license")?.open === false,
        licensing: [...el.querySelectorAll(".knavery-welcome-heading")].at(-1)?.textContent.trim(),
        noAi: el.querySelector(".knavery-welcome-ai p")?.textContent.trim() ?? "",
        noAiText: el.querySelector(".knavery-welcome-notext")?.textContent.trim() ?? "",
        artFolded: el.querySelector("details.knavery-welcome-art")?.open === false,
        artLinks: el.querySelectorAll("details.knavery-welcome-art li").length,
        author: el.querySelector(".knavery-welcome-author")?.textContent.trim(),
        fits: el.getBoundingClientRect().bottom <= window.innerHeight + 1,
        scrolls: getComputedStyle(el.querySelector(".window-content")).overflowY,
        licences: el.querySelectorAll(".knavery-welcome-licences > li > details.knavery-welcome-fold:not([open])").length,
        twoCols: (() => { const c = [...el.querySelectorAll(".knavery-welcome-col")].map((x) => x.getBoundingClientRect()); return c.length === 2 && Math.abs(c[0].top - c[1].top) < 2 && c[1].left > c[0].right; })(),
        width: Math.round(el.getBoundingClientRect().width),
        // The book ends: two knaves showing (one version each for the theme), loaded, either side of the title.
        knight: (() => { const shown = [...el.querySelectorAll(".knavery-welcome-bookend img")].filter((i) => i.offsetParent); const t = el.querySelector(".knavery-welcome-title")?.getBoundingClientRect(); if (shown.length !== 2 || !t || !shown.every((i) => i.complete && i.naturalWidth > 0)) return false; const [a, b] = shown.map((i) => i.getBoundingClientRect()); return a.right <= t.left && b.left >= t.right && a.top < t.bottom && b.top < t.bottom; })(),
        // The world line is one line.
        worldOneLine: (() => { const p = el.querySelector(".knavery-welcome-world"); return !!p && getComputedStyle(p).whiteSpace === "nowrap" && p.scrollWidth <= p.clientWidth + 1; })(),
        watermark: (() => { const m = [...el.querySelectorAll(".knavery-welcome-licensing .knavery-welcome-watermark")].find((i) => i.offsetParent); return !!m && getComputedStyle(m).position === "absolute" && Number(getComputedStyle(m).opacity) < 0.3; })(),
        rulesHeading: el.querySelector(".knavery-welcome-col-main .knavery-welcome-heading")?.textContent.trim(),
        aiCode: el.querySelector(".knavery-welcome-aicode")?.textContent.trim(),
        booksHeading: [...el.querySelectorAll(".knavery-welcome-heading")].find((h) => /books/i.test(h.textContent))?.textContent.trim(),
        licenceOrder: [...el.querySelectorAll(".knavery-welcome-licences summary")].map((x) => x.textContent.trim()).join(" | "),
      };
    }, SYS);
    await gm.screenshot({ path: `${SHOTS}/welcome-1e.png` });
    const h = await gm.evaluate(async (sys) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      await foundry.applications.instances.get("knavery-welcome")?.close();
      const R = await import(`${sys}/rules.js`);
      const pc = game.actors.getName("Probe 1e PC");
      const hpBefore = pc.system.hp.value;
      const p = R.offerRulesSwitch();
      await wait(700);
      const dlg = [...foundry.applications.instances.values()].find((x) => x.element?.classList.contains("knavery-rules-switch"));
      const lines = dlg?.element.querySelectorAll("li").length;
      dlg?.element.querySelector('button[data-action="yes"]')?.click();
      const now2e = await p;
      return { lines, now2e, rules: R.currentRules(), hpSame: pc.system.hp.value === hpBefore, again: await R.offerRulesSwitch() };
    }, SYS);
    ok(w.noAi.startsWith("No AI art.") && /never use AI-generated art/.test(w.noAi) && w.artFolded && w.artLinks === 6
      && w.noAiText === "No AI game text. No spell, item or monster description was written by AI.",
      "the AI disclosure opens with no AI art, the art's licences folded under it", JSON.stringify(w));
    ok(w.author === "Both editions of Knave were written by Ben Milton.", "the welcome credits Ben Milton for both editions, in one line", w.author);
    ok(w.fits && w.scrolls === "auto" && w.licences === 2 && w.twoCols && w.licenceOrder === "Knave: CC BY 4.0 | Knave: Second Edition Third Party License",
      "the welcome is wide, in two columns, stops at the screen and scrolls; each edition's licence is a folded bullet, 1e first", JSON.stringify(w));
    ok(w.world === "This world plays Knave." && w.knight && w.worldOneLine && w.watermark && w.booksHeading === "Buy the books!" && w.rulesHeading === "System Rules"
      && w.aiCode === "Base Knavery's code is written with the help of an AI coding assistant." && w.itch1e === "https://questingbeast.itch.io/knave" && w.links2e === 3 && w.smallLast && w.licensing === "Licensing",
      "two knaves as book ends either side of the welcome's title, the logo a watermark in Licensing, says which rules the world plays, and has Buy the books! with Knave's PDF on itch", JSON.stringify(w));
    ok(h.lines === 7 && h.now2e && h.rules === "2e" && h.hpSame && h.again === true,
      "after the 2e book, the GM is asked to switch; yes plays Knave 2e and changes no character", JSON.stringify(h));
  });

  await section("27. Knave 1e bundle 2: quality and wear, the natural-20 die, repair, copper prices and aisles, 100 coins a slot, daily wages.", async () => {
    // The new rules reach a stamped world in its own edition; then the world plays 1e for the rest.
    const p = await gm.evaluate(async (sys) => {
      const ns = "base-knavery";
      const R = await import(`${sys}/rules.js`);
      const { RULES_PRESETS, CORE_RULE_KEYS } = await import(`${sys}/config.js`);
      const NEW = ["attack-rule", "price-list", "coins-per-slot"];
      const out = {
        keys: NEW.every((k) => game.settings.get(ns, "rules-keys").includes(k)),
        // The world plays 2e after part 26's hand-off, the new rules included.
        now2e: NEW.every((k) => game.settings.get(ns, k) === RULES_PRESETS["2e"][k]) && R.currentRules() === "2e",
      };
      const vals = (e) => Object.fromEntries(CORE_RULE_KEYS.map((k) => [k, RULES_PRESETS[e][k]]));
      out.edition = [
        R.editionForNewRules(vals("2e"), CORE_RULE_KEYS, "2e"), R.editionForNewRules(vals("1e"), CORE_RULE_KEYS, "2e"),
        R.editionForNewRules({ ...vals("2e"), "death-rule": "knave1e" }, CORE_RULE_KEYS, "2e"),
        R.editionForNewRules({ ...vals("1e"), "death-rule": "wounds" }, CORE_RULE_KEYS, "1e"),
      ].join();
      // The Rules window has the three new rows.
      const menu = game.settings.menus.get(`${ns}.hacks`);
      const app = new menu.type();
      await app.render({ force: true });
      await new Promise((res) => setTimeout(res, 700));
      out.rows = NEW.every((k) => !!app.element.querySelector(`[name="${ns}.${k}"]`)) && !!app.element.querySelector(`[name="${ns}.weapon-breaks-on-1"]`);
      await app.close();
      await R.applyRules("1e");
      out.as1e = R.currentRules();
      return out;
    }, SYS);
    ok(p.keys && p.now2e && p.edition === "2e,1e,2e,1e",
      "the three new rules reached the stamped world in the edition its other rules play (2e), and a mixed world takes its stamp's", JSON.stringify(p));
    ok(p.rows && p.as1e === "1e", "Configure Rules lists Attacks, Prices and wages, and Coins per slot; the 1e preset sets them", JSON.stringify(p));

    // Attacks under 1e: a forced natural 20 (one more die, Wear armor), a natural 1 (the weapon wears).
    const q = await gm.evaluate(async (sys) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const { rollAttack } = await import(`${sys}/rolls.js`);
      const Q = await import(`${sys}/quality.js`);
      const pack = game.packs.get("base-knavery.gear-1e");
      const index = await pack.getIndex();
      const get = async (name) => { const d = (await pack.getDocument(index.getName(name)._id)).toObject(); delete d._id; return d; };
      const fighter = await Actor.create({ name: "Probe 1e Fighter", type: "character", system: { coins: 250, abilities: { STR: { value: 3 } } } });
      const sword = await get("Sword");
      sword.system.equipped = true;
      await fighter.createEmbeddedDocuments("Item", [sword]);
      const target = await Actor.create({ name: "Probe 1e Target", type: "character", system: { hp: { value: 30, max: 30 } } });
      const chain = await get("Chain");
      const shield = await get("Shield");
      chain.system.equipped = true;
      shield.system.equipped = true;
      await target.createEmbeddedDocuments("Item", [chain, shield]);
      const out = {
        coinSlots: fighter.system.coinSlots,
        chainQ: Q.qualityOf(target.items.getName("Chain")), shieldQ: Q.qualityOf(target.items.getName("Shield")),
        swordQ: Q.qualityOf(fighter.items.getName("Sword")), ap: target.system.ap,
      };
      const scene = canvas.ready ? canvas.scene : null;
      let tok = null;
      if (scene) {
        [tok] = await scene.createEmbeddedDocuments("Token", [(await target.getTokenDocument({ x: 0, y: 0 })).toObject()]);
        await wait(800);
        canvas.tokens.setTargets([tok.id], { mode: "replace" });
      }
      const real = CONFIG.Dice.randomUniform;
      const attack = async (u) => {
        CONFIG.Dice.randomUniform = () => u; // a die's face is ceil((1 - u) × faces): near 0 is the top face
        try {
          const pr = rollAttack(fighter, fighter.items.getName("Sword"));
          await wait(900);
          const dlg = document.querySelector(".knavery-roll-prompt");
          const dmg = dlg?.querySelector('input[name="rollDamage"]');
          if (dmg) dmg.checked = true;
          out.noPower = !dlg?.querySelector('input[name="power"]') || dlg.querySelector(".power-group")?.hidden === true;
          dlg?.querySelector('footer button[data-action="normal"]')?.click();
          await pr;
        } finally { CONFIG.Dice.randomUniform = real; }
        await wait(1200);
        return game.messages.contents.at(-1);
      };
      // A natural 20.
      let msg = await attack(1e-7);
      let card = document.querySelector(`#chat .chat-message[data-message-id="${msg.id}"] .knavery-roll-card`);
      out.crit = {
        flag: msg.getFlag("base-knavery", "attack")?.crit === true, note: !!card?.querySelector(".card-note.crit"),
        formula: card?.querySelector(".card-damage .dice-formula")?.textContent.trim() ?? "", maneuver: !!card?.querySelector(".card-note.maneuver"),
        wearButton: !!card?.querySelector("[data-kn-wear]"), scene: !!tok,
      };
      if (tok) {
        card.querySelector("[data-kn-wear]").click();
        await wait(900);
        const dlg = [...foundry.applications.instances.values()].find((x) => x.element?.classList.contains("knavery-wear"));
        out.wearRows = dlg?.element.querySelectorAll(".kn-wear-row").length ?? 0;
        const radio = dlg?.element.querySelector(`input[value="${target.items.getName("Shield").id}"]`);
        if (radio) radio.checked = true;
        dlg?.element.querySelector('button[data-action="ok"]')?.click();
        await wait(1200);
        card = document.querySelector(`#chat .chat-message[data-message-id="${msg.id}"] .knavery-roll-card`);
        const sh = target.items.getName("Shield");
        out.worn = { shield: Q.qualityOf(sh), broken: sh.system.broken, ap: target.system.ap, done: !!card?.querySelector(".kn-wear-done"),
          taken: Q.wearTaken(target, msg.id), again: await Q.openWearDialog(target, msg.id) };
      }
      // A natural 1: the weapon loses a point.
      msg = await attack(1 - 1e-7);
      card = document.querySelector(`#chat .chat-message[data-message-id="${msg.id}"] .knavery-roll-card`);
      const sw = fighter.items.getName("Sword");
      out.fumble = { q: Q.qualityOf(sw), broken: sw.system.broken, note: /loses a point of quality \(2\/3\)/.test(card?.textContent ?? "") };
      // The inventory row and the item sheet.
      await fighter.sheet.render({ force: true });
      await wait(900);
      out.tag = [...fighter.sheet.element.querySelectorAll(".knavery-item-tag")].some((t) => t.textContent.trim() === "Quality 2/3");
      await fighter.sheet.close();
      await sw.sheet.render({ force: true });
      await wait(900);
      const ie = sw.sheet.element;
      out.sheet = { line: !!ie.querySelector(".kn-quality-stats"), value: ie.querySelector('input[name="kn.quality"]')?.value,
        max: ie.querySelector('input[name="system.qualityMax"]')?.value, repair: ie.querySelector('[data-action="repair"]')?.textContent.trim() ?? "" };
      if (tok) await tok.delete();
      canvas.tokens?.setTargets([], { mode: "replace" });
      return out;
    }, SYS);
    await gm.screenshot({ path: `${SHOTS}/knave1e-quality.png` });
    const r = await gm.evaluate(async (sys) => {
      const ns = "base-knavery";
      const Q = await import(`${sys}/quality.js`);
      const fighter = game.actors.getName("Probe 1e Fighter");
      const sw = fighter.items.getName("Sword");
      const out = { cost: Q.repairCost(sw) };
      out.paid = await Q.repairItem(sw);
      out.after = { q: Q.qualityOf(sw), coins: fighter.system.coins };
      await sw.sheet.close();
      // Wear to 0: destroyed, kept, marked Broken; a full repair costs 10% a point.
      const ch = game.actors.getName("Probe 1e Target").items.getName("Chain");
      await Q.wearItem(ch, { n: 5, post: false });
      out.chain = { q: Q.qualityOf(ch), broken: ch.system.broken, kept: !!ch.parent.items.get(ch.id), cost: Q.repairCost(ch) };
      // Coins per slot: 250 coins are 2 slots at 100, none at 500.
      out.slots100 = fighter.system.coinSlots;
      await game.settings.set(ns, "coins-per-slot", "500");
      out.slots500 = fighter.system.coinSlots;
      await game.settings.set(ns, "coins-per-slot", "100");
      return out;
    }, SYS);
    ok(q.coinSlots === 2 && q.chainQ?.max === 5 && q.shieldQ?.max === 1 && q.swordQ?.max === 3 && q.ap === 4,
      "1e gear has the book's quality (sword 3, chain 5, shield 1), and 250 coins fill two slots at 100 a slot", JSON.stringify(q));
    ok(q.crit.flag && q.crit.note && q.crit.formula.startsWith("2d8") && !q.crit.maneuver && q.noPower,
      "a natural 20 is a critical hit: one more damage die (2d8 for a sword), no free maneuver, no power attack under 1e", JSON.stringify(q.crit));
    ok(!q.crit.scene || (q.crit.wearButton && q.wearRows === 2 && q.worn.shield.value === 0 && q.worn.broken && q.worn.ap === 3 && q.worn.done && q.worn.taken && q.worn.again === null),
      "the card's Wear armor lets the target's owner pick the piece; the shield at 0 is destroyed (Broken, its point gone) and the card reads Armor worn", JSON.stringify({ crit: q.crit, rows: q.wearRows, worn: q.worn }));
    ok(q.fumble.q.value === 2 && !q.fumble.broken && q.fumble.note && q.tag,
      "a natural 1 costs the weapon a point of quality, said on the card and on the inventory row", JSON.stringify({ fumble: q.fumble, tag: q.tag }));
    ok(q.sheet.line && q.sheet.value === "2" && q.sheet.max === "3" && q.sheet.repair === "Repair (1c)",
      "the item sheet shows Quality 2 / 3 and Repair at 10% of the price a point", JSON.stringify(q.sheet));
    ok(r.cost === 1 && r.paid === 1 && r.after.q.value === 3 && r.after.coins === 249,
      "Repair takes the coins from the owner and restores full quality", JSON.stringify(r));
    ok(r.chain.q.value === 0 && r.chain.broken && r.chain.kept && r.chain.cost === 600 && r.slots100 === 2 && r.slots500 === 0,
      "at 0 quality the item is kept, marked Broken, and costs 10% of its price a point to repair; coins per slot follows the rule", JSON.stringify(r));

    // Prices: the 1e aisles, starting gear and weapons; henchmen by the day.
    const m = await gm.evaluate(async (sys) => {
      const M = await import(`${sys}/marketplace.js`);
      const G = await import(`${sys}/character-generator.js`);
      const N = await import(`${sys}/npc-generator.js`);
      const H = await import(`${sys}/hirelings.js`);
      const names = async (o) => (await M.marketTables(o)).map((t) => t.name);
      const out = { shown: await names(), all: await names({ includeHidden: true }) };
      const weapons = (await M.marketTables()).find((t) => t.name === "Market 1e: Weapons");
      const stock = weapons ? await M.aisleStock(weapons) : [];
      out.sword = stock.find((s) => s.name === "Sword")?.price;
      const halls = (await M.marketTables({ includeHidden: true })).find((t) => t.name === "Market 1e: Buildings");
      const hs = halls ? await M.aisleStock(halls) : [];
      out.hovel = hs.find((s) => s.name === "Hovel");
      out.hovel = out.hovel ? { price: out.hovel.price, service: out.hovel.service, slots: out.hovel.slots } : null;
      const choices = (await G.weaponChoices()).map((w) => w.name);
      out.weapons = { long: choices.includes("Long Sword"), generic: choices.includes("One-Handed Weapon") };
      const built = await G.buildCharacter({ level: 1, weapon: "Crossbow" });
      const xbow = built.items.find((i) => i.name === "Crossbow");
      out.built = { xbow: xbow ? { cost: xbow.system.cost, slots: xbow.system.slots, q: xbow.system.qualityMax } : null,
        rations: built.items.find((i) => i.name === "Rations")?.system?.cost };
      // A knight at 25c a day, three days owed.
      const hc = N.hirelingChoices();
      out.knightLine = hc.knight ? { wage: hc.knight.wage, period: hc.knight.period } : null;
      const knight = await N.createNpc({ kind: "hireling", hireling: "knight", name: "Probe Knight" });
      await knight?.sheet.close();
      const fighter = game.actors.getName("Probe 1e Fighter");
      const now = game.time.worldTime;
      await knight.update({ "system.employer": fighter.id, "system.wageDue": now - 2 * H.DAY_SECONDS });
      out.knight = { name: knight.name, wage: knight.system.wage, period: knight.system.wagePeriod };
      out.status = H.wageRows().find((x) => x.id === knight.id)?.status;
      out.amount = H.wageRows().find((x) => x.id === knight.id)?.amount;
      const before = fighter.system.coins;
      out.due = await H.payWage(knight);
      out.paid = before - fighter.system.coins;
      out.nextDue = out.due === now - 2 * H.DAY_SECONDS + 3 * H.DAY_SECONDS;
      out.after = H.wageRows().find((x) => x.id === knight.id)?.status;
      out.days = [H.daysOwed(null, 100), H.daysOwed(200, 100), H.daysOwed(100, 100), H.daysOwed(100, 100 + 2 * H.DAY_SECONDS)].join();
      return out;
    }, SYS);
    ok(m.shown.includes("Market 1e: Weapons") && m.shown.includes("Market 1e: Food") && !m.shown.some((n) => n.startsWith("Market: "))
      && !m.shown.includes("Market 1e: Buildings") && !m.shown.includes("Market 1e: Lodging & Meals")
      && m.all.includes("Market 1e: Buildings") && m.all.includes("Market 1e: Lodging & Meals"),
      "on the 1e price list the shop shows the 1e aisles only; Lodging & Meals and Buildings ship hidden", JSON.stringify(m));
    ok(m.sword === 10 && m.hovel?.price === 120 && m.hovel.service && m.hovel.slots === 0,
      "1e prices are in copper (a sword 10, a hovel 120), and a building is a service with no slot", JSON.stringify(m));
    ok(m.weapons.long && !m.weapons.generic && m.built.xbow?.cost === 60 && m.built.xbow.slots === 3 && m.built.xbow.q === 3 && m.built.rations === 5,
      "a 1e character chooses from 1e's weapons, and its kit comes from the 1e list with its prices", JSON.stringify({ w: m.weapons, b: m.built }));
    ok(m.knightLine?.wage === 25 && m.knightLine.period === "day" && m.knight.name === "Probe Knight" && m.knight.wage === 25 && m.knight.period === "day",
      "Create NPC offers 1e's henchmen at daily wages (a knight 25c a day)", JSON.stringify(m));
    ok(m.status === "3 days owed (75c)" && m.amount === "25c a day" && m.paid === 75 && m.nextDue && m.after === "Paid up" && m.days === "1,0,1,3",
      "Pay settles every day owed (three days, 75c) and the hireling is paid up", JSON.stringify(m));
    await gm.evaluate(async (sys) => { const R = await import(`${sys}/rules.js`); await R.applyRules("2e"); }, SYS);
  });

  await section("28. Features C-E: the Party tab, treasure to XP, selling, free repair under 2e.", async () => {
    // The world plays 2e again after part 27. Two of Alice's characters, a companion, treasure and a torch.
    const t = await gm.evaluate(async (sys) => {
      const ns = "base-knavery";
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const R = await import(`${sys}/rules.js`);
      const T = await import(`${sys}/treasure.js`);
      const { RULES_PRESETS } = await import(`${sys}/config.js`);
      const out = {
        rule: game.settings.get(ns, "treasure-xp"), known: game.settings.get(ns, "rules-keys").includes("treasure-xp"),
        plays: [
          R.rulesFor({ ...RULES_PRESETS["1e"], "treasure-xp": "gold" }), R.rulesFor({ ...RULES_PRESETS["1e"], "treasure-xp": "coin" }),
          R.rulesFor({ ...RULES_PRESETS["2e"], "treasure-xp": "gold" }),
        ].join(),
        gold: [T.xpForTreasure(250, "gold"), T.xpForTreasure(250, "coin"), T.xpForTreasure(250, "off")].join(),
      };
      const alice = game.users.getName("Alice");
      const own = { default: 0, [alice.id]: 3 };
      const a = await Actor.create({ name: "Probe Party A", type: "character", ownership: own, system: { coins: 0, hp: { value: 0, max: 6 } } });
      const b = await Actor.create({ name: "Probe Party B", type: "character", ownership: own, system: { coins: 0, hp: { value: 5, max: 5 }, wounds: 1 } });
      const c = await Actor.create({ name: "Probe Companion", type: "npc", system: { role: "companion", employer: a.id } });
      await a.createEmbeddedDocuments("Item", [
        { name: "Probe Gem", type: "item", system: { cost: 100, treasure: true } },
        { name: "Torch", type: "item", system: { cost: 1, quantity: 3, lit: true } },
        { name: "Probe Rope", type: "item", system: { cost: 10, quantity: 3 } },
        { name: "Probe Book", type: "spellbook", system: { castToday: true } },
        { name: "Probe Book 2", type: "spellbook" },
      ]);
      await b.createEmbeddedDocuments("Item", [{ name: "Probe Idol", type: "item", system: { cost: 40, treasure: true } }]);
      const split = T.treasureSplit(150, [a, b], [c]);
      out.split = [...split.pcs.map((x) => x.xp), ...split.companions.map((x) => x.xp)].join();
      out.companions = T.companionsOf([a]).map((x) => x.name).join();
      out.prices = [T.sellPrice(a.items.getName("Probe Rope"), 3), T.sellPrice(a.items.getName("Probe Gem")), T.sellPrice(a.items.getName("Torch"))].join();
      // The Party tab.
      const { openGmDashboard } = await import(`${sys}/gm-dashboard.js`);
      openGmDashboard();
      await wait(1200);
      const app = foundry.applications.instances.get("knavery-gm-dashboard");
      app.changeTab("party", "primary");
      await wait(500);
      const row = (actor) => app.element.querySelector(`.dash-party-row[data-actor-id="${actor.id}"]`);
      const ra = row(a);
      const rb = row(b);
      out.party = {
        tab: !!app.element.querySelector('[data-tab="party"].active'),
        a: ra ? { hp: ra.querySelector(".dash-party-stat.hp")?.textContent.replace(/\s+/g, " ").trim(), unconscious: ra.classList.contains("unconscious"),
          books: ra.querySelector(".dash-party-stat.books")?.textContent.trim(), lit: ra.querySelector(".dash-party-light.lit")?.textContent.trim(),
          slots: ra.querySelector(".dash-party-stat.slots")?.textContent.trim() } : null,
        b: rb ? { wounds: rb.querySelector(".dash-party-stat.wounds")?.textContent.trim() } : null,
        npc: !app.element.querySelector(`.dash-party-row[data-actor-id="${c.id}"]`),
      };
      // It keeps up: B heals, and the row follows.
      await b.update({ "system.hp.value": 2 });
      await wait(900);
      out.party.follows = row(b)?.querySelector(".dash-party-stat.hp")?.textContent.replace(/\s+/g, " ").trim();
      row(a)?.querySelector('[data-action="openSheet"]')?.click();
      await wait(900);
      out.party.sheet = !!a.sheet.rendered;
      await a.sheet.close();
      return out;
    }, SYS);
    await gm.screenshot({ path: `${SHOTS}/dashboard-party.png` });
    ok(t.rule === "coin" && t.known && t.plays === "1e,custom,custom" && t.gold === "2,250,0",
      "XP for treasure reached the 2e world as 1 XP a coin; 1e's XP for gold (1 per 100c) still plays Knave 1e", JSON.stringify(t));
    ok(t.split === "60,60,30" && t.companions === "Probe Companion" && t.prices === "15,100,0",
      "treasure XP splits evenly with a companion at a half share; items sell at half price rounded down (a 1c torch for nothing), treasure in full", JSON.stringify(t));
    ok(t.party.tab && t.party.a?.hp === "0/6" && t.party.a.unconscious === false && t.party.a.books === "1/2 ready, 0 spells left today"
      && t.party.a.lit === "Torch ×3" && /^\d+\/\d+$/.test(t.party.a.slots ?? "") && t.party.b?.wounds === "1" && t.party.npc,
      "the Party tab shows each player character's HP, wounds, slots, lit lights and spellbooks", JSON.stringify(t.party));
    ok(t.party.follows === "2/5" && t.party.sheet, "the Party tab keeps up with a change, and a name opens the sheet", JSON.stringify(t.party));

    // Treasure brought back, from the XP tab: A and B, with 50 coins typed in.
    const x = await gm.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const app = foundry.applications.instances.get("knavery-gm-dashboard");
      app.changeTab("xp", "primary");
      await wait(400);
      const root = app.element;
      const a = game.actors.getName("Probe Party A");
      const b = game.actors.getName("Probe Party B");
      const xp0 = [a.system.xp, b.system.xp];
      const mode = root.querySelector('[name="xpMode"]');
      mode.value = "treasure";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
      for (const actor of [a, b]) {
        const box = root.querySelector(`input[name="xpPc"][value="${actor.id}"]`);
        box.checked = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const coins = root.querySelector('[name="xpCoins"]');
      coins.value = "10";
      coins.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(300);
      const out = {
        shown: !root.querySelector(".dash-xp-treasure")?.hidden, amountHidden: !!root.querySelector(".dash-xp-amount")?.hidden,
        items: [...root.querySelectorAll(".dash-xp-treasure-item:not([hidden])")].map((r) => r.querySelector("span")?.textContent).sort().join(),
        total: root.querySelector(".dash-xp-treasure-total")?.textContent.trim(),
      };
      root.querySelector('[data-action="awardXp"]').click();
      await wait(1500);
      out.xp = [a.system.xp - xp0[0], b.system.xp - xp0[1]].join();
      out.counted = [a.items.getName("Probe Gem").system.treasureCounted, b.items.getName("Probe Idol").system.treasureCounted].join();
      const msg = game.messages.contents.at(-1);
      out.card = msg.getFlag("base-knavery", "treasure");
      out.companionLine = /Probe Companion \(companion, half share\): 30 XP/.test(msg.content);
      await wait(500);
      out.after = root.ownerDocument.querySelectorAll("#knavery-gm-dashboard .dash-xp-treasure-item").length;
      return out;
    });
    await gm.screenshot({ path: `${SHOTS}/dashboard-xp-treasure.png` });
    ok(x.shown && x.amountHidden && x.items === "Probe Gem,Probe Idol" && x.total === "Treasure worth 150c: 150 XP, split among 2 and 1 companion(s) at a half share.",
      "the XP tab's Treasure brought back lists the chosen characters' treasure and adds the coins typed in", JSON.stringify(x));
    ok(x.xp === "60,60" && x.counted === "true,true" && x.card?.coins === 150 && x.companionLine && x.after === 0,
      "the award splits 150 XP among two and a companion at half; each item counts once", JSON.stringify(x));

    // Selling from the Inventory row; Repair is free under 2e attacks.
    const s = await gm.evaluate(async (sys) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const Q = await import(`${sys}/quality.js`);
      const a = game.actors.getName("Probe Party A");
      foundry.applications.instances.get("knavery-gm-dashboard")?.close();
      await a.sheet.render({ force: true });
      await wait(900);
      a.sheet.changeTab?.("inventory", "primary");
      await wait(300);
      const rowOf = (name) => a.sheet.element.querySelector(`[data-item-id="${a.items.getName(name).id}"]`);
      const out = { sellButton: !!rowOf("Probe Rope")?.querySelector('[data-action="itemSell"]'), gemTag: !!rowOf("Probe Gem")?.querySelector(".treasure-tag") };
      rowOf("Probe Rope").querySelector('[data-action="itemSell"]').click();
      await wait(900);
      const dlg = [...foundry.applications.instances.values()].find((d) => d.element?.classList.contains("knavery-sell"));
      const n = dlg?.element.querySelector('input[name="n"]');
      if (n) { n.value = "2"; n.dispatchEvent(new Event("input", { bubbles: true })); }
      out.line = dlg?.element.querySelector(".kn-sell-price")?.textContent.trim();
      dlg?.element.querySelector('button[data-action="ok"]')?.click();
      await wait(1200);
      out.rope = a.items.getName("Probe Rope")?.system.quantity;
      out.coins = a.system.coins;
      // The gem, treasure: its full value, and the item goes.
      rowOf("Probe Gem").querySelector('[data-action="itemSell"]').click();
      await wait(900);
      const dlg2 = [...foundry.applications.instances.values()].find((d) => d.element?.classList.contains("knavery-sell"));
      dlg2?.element.querySelector('button[data-action="ok"]')?.click();
      await wait(1200);
      out.gem = !!a.items.getName("Probe Gem");
      out.coins2 = a.system.coins;
      // Repair under 2e: a broken item mends for nothing.
      const sword = (await a.createEmbeddedDocuments("Item", [{ name: "Probe Sword", type: "weapon", system: { cost: 20, broken: true } }]))[0];
      await wait(700);
      out.rowRepair = !!rowOf("Probe Sword")?.querySelector('[data-action="itemRepair"]');
      await sword.sheet.render({ force: true });
      await wait(900);
      out.sheetRepair = sword.sheet.element.querySelector(".kn-repair-free")?.textContent.trim();
      out.quality = !!sword.sheet.element.querySelector(".kn-quality-stats");
      sword.sheet.element.querySelector(".kn-repair-free")?.click();
      await wait(1200);
      out.mended = !sword.system.broken;
      out.coins3 = a.system.coins;
      out.free = /Probe Sword is repaired\./.test(game.messages.contents.at(-1)?.content ?? "");
      out.canAfter = Q.canRepair(sword);
      await sword.sheet.close();
      await a.sheet.close();
      return out;
    }, SYS);
    ok(s.sellButton && s.gemTag && s.line === "2 × Probe Rope sells for 10c, half the price." && s.rope === 1 && s.coins === 10,
      "Sell on the Inventory row sells part of a stack for half its price", JSON.stringify(s));
    ok(!s.gem && s.coins2 === 110, "treasure sells for its full value, and the item goes", JSON.stringify(s));
    ok(s.rowRepair && s.sheetRepair === "Repair" && !s.quality && s.mended && s.coins3 === 110 && s.free && !s.canAfter,
      "under Knave 2e attacks a broken item's Repair is free, from the row or the sheet", JSON.stringify(s));

    // The ability taglines follow the edition: 2e (and Custom) the 2e set, 1e its own.
    const h = await gm.evaluate(async (sys) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const R = await import(`${sys}/rules.js`);
      const a = game.actors.getName("Probe Party A");
      const hints = async () => {
        await a.sheet.render({ force: true });
        await wait(900);
        const out = Object.fromEntries([...a.sheet.element.querySelectorAll(".knavery-ability-hint")].map((el, i) => [["STR", "DEX", "CON", "INT", "WIS", "CHA"][i], el.textContent.trim()]));
        await a.sheet.close();
        return out;
      };
      const out = { e2: await hints() };
      await R.applyRules("1e");
      out.e1 = await hints();
      await game.settings.set("base-knavery", "death-rule", "wounds");
      out.custom = R.abilityHint("CON");
      await R.applyRules("2e");
      return out;
    }, SYS);
    ok(h.e2.CON === "Physical resistance, item slots, wounds" && h.e2.INT === "Lockpicking, alchemy, spells per day"
      && h.e1.CON === "Resisting poison and sickness, item slots, healing" && h.e1.INT === "Lockpicking, alchemy, resisting magic"
      && h.e1.WIS === "Ranged attacks, foraging, navigation, spotting illusions" && h.e1.CHA === "Persuasion, henchmen, blessings"
      && h.e1.STR === h.e2.STR && h.custom === "Physical resistance, item slots, wounds",
      "a 1e world shows the 1e ability taglines (CON healing, INT no spells a day, WIS illusions, CHA henchmen); 2e and Custom the 2e ones", JSON.stringify(h));
  });

  // Cleanup.
  await gm.evaluate(async (tables) => {
    for (const app of [...foundry.applications.instances.values()]) if (app.id !== "sidebar") app.close?.();
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    for (const s of game.scenes.filter((x) => x.name.startsWith("Probe"))) await s.delete();
    for (const id of tables) await game.tables.get(id)?.delete();
    for (const m of game.messages.filter((x) => x.getFlag("base-knavery", "xpAward"))) await m.delete();
  }, made.tables);
});

// Part 21's write to the GM's notes as Alice is refused by the server on purpose, which core logs.
const real = errors.flat().filter((e) => !/favicon|DEPRECATED/i.test(e) && !/may only be modified by a GM or Assistant GM user/.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
