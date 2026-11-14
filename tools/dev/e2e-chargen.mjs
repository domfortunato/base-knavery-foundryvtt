#!/usr/bin/env node
/**
 * Char Gen Mode and growth: who may edit abilities, level and XP; the title-bar
 * Level Up arrow and its window; the HP rules; random creation from placed
 * ability points (one spellbook per STARTING point of INT); the failed-career
 * hack and its petty item; the GM's notes; the dashboard's XP tab; the ability
 * roll link's tooltip; the text size; the footer; traits; changing careers at level 1. GM, Alice and Bob in three browsers.
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
watchdog(360000, "e2e-chargen", () => browser.close());
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
  await SET(gm, "failed-career", true);
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
      level: el.querySelector('input[name="system.level"]')?.disabled,
      xp: el.querySelector('input[name="system.xp"]')?.disabled,
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
        failed: !!three.failedCareer, failedDistinct: !three.careers.some((c) => c.name === three.failedCareer?.name),
        bad: (await buildCharacter({ level: 1, abilities: { STR: 9 } })).notes[0],
        actorStr: actor.system.abilities.STR.value, actorInt: actor.system.abilities.INT.value,
        careers: careers.length, failedCareers: careers.filter((c) => c.system.failed).length,
      };
    }, SYS);
    const v = r.oneVals;
    ok(v.STR === 2 && v.INT === 1 && v.DEX === 0 && v.CON === 0 && v.WIS === 0 && v.CHA === 0, "level 1: exactly the points placed", JSON.stringify(v));
    ok(r.threeSum === 9 && r.threeBooks === 1, "level 3: three points + two levels of three, and ONE spellbook for the one starting INT", JSON.stringify(r));
    ok(/roll|3d6|rolled/i.test(r.bad), "points that do not total 3 are refused, and the dice decide", r.bad);
    ok(r.actorStr === 2 && r.actorInt === 1 && r.careers === 3 && r.failedCareers === 1, "a created character carries its points, two careers and one failed career", JSON.stringify(r));
    ok(r.failed && r.failedDistinct, "the failed career is a different career from the two", JSON.stringify(r));
  });

  /* ------------------------------------------------------------------ */
  await section("5. The failed career's petty item, on the sheet.", async () => {
    const r = await gm.evaluate(async ([sys, a, b]) => {
      const { addCareer } = await import(`${sys}/character-generator.js`);
      const { slotsForItem } = await import(`${sys}/documents/actor.js`);
      const actor = game.actors.get(a);
      for (const c of actor.items.filter((i) => i.type === "career")) await c.delete();
      const career = await addCareer(actor, { name: "Probe Lutist", type: "career", system: { startingItems: ["Probe Lute"] } }, { failed: true });
      const lute = actor.items.find((i) => i.getFlag("base-knavery", "pettyFor") === actor.id);
      const [copy] = await game.actors.get(b).createEmbeddedDocuments("Item", [lute.toObject()]);
      return {
        failed: career.system.failed, mark: career.getFlag("base-knavery", "pettyItem")?.name,
        lute: lute?.name, slotsHers: slotsForItem(lute), slotsBob: slotsForItem(copy),
        items: actor.items.filter((i) => i.type !== "career").length,
      };
    }, [SYS, ids.a, ids.b]);
    ok(r.failed && r.lute === "Probe Lute" && r.mark === "Probe Lute" && r.items === 1, "a failed career grants just one item from its list, remembered on the career", JSON.stringify(r));
    ok(r.slotsHers === 0 && r.slotsBob === 1, "petty: no slot while its Knave carries it, one slot in Bob's pack", JSON.stringify(r));
    await openAs(alice, ids.a);
    await settle();
    const ui = await alice.evaluate((x) => {
      const el = game.actors.get(x).sheet.element;
      return {
        chip: el.querySelector(".career-chip.failed")?.textContent.trim() ?? "",
        petty: el.querySelector(".career-petty")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        tag: [...el.querySelectorAll(".knavery-item-tag")].some((t) => t.textContent.trim() === game.i18n.localize("KNAVERY.Petty")),
      };
    }, ids.a);
    ok(ui.chip.includes("Probe Lutist"), "the Knave page shows the failed career", JSON.stringify(ui));
    ok(ui.petty.includes("Probe Lute") && ui.tag, "the Growth page names the petty item, and the inventory tags it", JSON.stringify(ui));
  });

  /* ------------------------------------------------------------------ */
  await section("6. The failed-career die in Char Gen Mode.", async () => {
    await gm.evaluate(async (x) => {
      const a = game.actors.get(x);
      for (const i of a.items.contents) await i.delete();
      // Careers change at level 1 only (part 2 levelled her up).
      await a.update({ "system.generationEnabled": true, "system.level": 1, "system.xp": 0 });
    }, ids.a);
    await openAs(alice, ids.a);
    await settle();
    await alice.evaluate((x) => game.actors.get(x).sheet.changeTab("growth", "primary"), ids.a);
    const die = `${sheet}[id$="${ids.a}"] .failed-career-roll`;
    await alice.waitForSelector(die, { timeout: T(10000) });
    await alice.locator(die).click();
    await gm.waitForFunction((x) => game.actors.get(x).items.some((i) => i.type === "career" && i.system.failed), ids.a, { timeout: T(15000) });
    await settle();
    const left = await alice.locator(die).count();
    ok(left === 0, "Alice rolls a failed career, and the die goes (one per Knave)", String(left));
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
    ok(foot === "Base Knavery is not affiliated with Questing Beast LLC.", "the sheet footer is the short line", foot);
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
    ok(labels.length >= 4 && labels.every((r) => r.lines <= 1), "every Hacks label sits on one line", JSON.stringify(labels));
  });

  /* ------------------------------------------------------------------ */
  await section("11. Traits: expanded, rolled for a blank sheet, pick-lists in Char Gen Mode.", async () => {
    const r = await gm.evaluate(async (sys) => {
      const made = [];
      if (!game.tables.getName("Physique")) {
        made.push((await RollTable.create({ name: "Physique", formula: "1d1", results: [{ type: "text", name: "Probe Wiry", range: [1, 1], weight: 1 }] })).id);
      }
      const { createCharacter } = await import(`${sys}/character-generator.js`);
      const blank = await createCharacter({ mode: "blank", name: "Probe Blank" });
      await new Promise((res) => setTimeout(res, 600));
      const el = blank.sheet.element;
      const out = { made, physique: blank.system.traits.physique, rows: el.querySelectorAll(".trait-row").length };
      await blank.sheet.close();
      return out;
    }, SYS);
    made.tables.push(...r.made);
    ok(!!r.physique, "a Blank character starts with its traits rolled", JSON.stringify(r));
    ok(r.rows === 10, "the traits section opens expanded, every trait showing", JSON.stringify(r));
    await gm.evaluate((x) => game.actors.get(x).update({ "system.generationEnabled": true }), ids.a);
    await openAs(alice, ids.a);
    await settle();
    const ctl = await alice.evaluate((x) => {
      const el = game.actors.get(x).sheet.element;
      return { picks: el.querySelectorAll(".trait-pick").length, all: !!el.querySelector(".trait-roll-all") };
    }, ids.a);
    ok(ctl.picks === 10 && ctl.all, "in Char Gen Mode Alice gets a pick-list per trait and Roll every trait", JSON.stringify(ctl));
  });

  /* ------------------------------------------------------------------ */
  await section("12. Careers change at level 1; the failed career's item is an option.", async () => {
    const setup = await gm.evaluate(async ([sys, a]) => {
      const { addCareer } = await import(`${sys}/character-generator.js`);
      const actor = game.actors.get(a);
      for (const i of actor.items.contents) await i.delete();
      await actor.update({ "system.level": 1, "system.xp": 0, "system.generationEnabled": true });
      await game.settings.set("base-knavery", "failed-career-item", true);
      const baker = await addCareer(actor, { name: "Probe Baker", type: "career", system: { startingItems: ["Probe Rolling Pin"] } }, { grantItems: true });
      const failed = await addCareer(actor, { name: "Probe Lutist", type: "career", system: { startingItems: ["Probe Lute"] } }, { failed: true });
      const pin = actor.items.find((i) => i.getFlag("base-knavery", "fromCareer") === baker.id);
      const lute = actor.items.find((i) => i.getFlag("base-knavery", "fromCareer") === failed.id);
      return { baker: baker.id, failed: failed.id, pin: pin?.id, lute: lute?.id };
    }, [SYS, ids.a]);
    await openAs(alice, ids.a);
    await alice.evaluate((x) => game.actors.get(x).sheet.changeTab("growth", "primary"), ids.a);
    await settle();
    await alice.locator(`${sheet}[id$="${ids.a}"] .knavery-career[data-career-id="${setup.baker}"] .career-change[data-mode="roll"]`).click();
    await gm.waitForFunction(([x, id]) => !game.actors.get(x).items.get(id), [ids.a, setup.baker], { timeout: T(15000) });
    await settle();
    await alice.locator(`${sheet}[id$="${ids.a}"] .knavery-career[data-career-id="${setup.failed}"] .career-change[data-mode="roll"]`).click();
    await gm.waitForFunction(([x, id]) => !game.actors.get(x).items.get(id), [ids.a, setup.failed], { timeout: T(15000) });
    await settle();
    const after = await gm.evaluate(([x, pinId, luteId]) => {
      const a = game.actors.get(x);
      const careers = a.items.filter((i) => i.type === "career");
      const plain = careers.find((c) => !c.system.failed);
      const failed = careers.find((c) => c.system.failed);
      const from = (c) => a.items.filter((i) => i.getFlag("base-knavery", "fromCareer") === c?.id);
      return {
        // By id: a rerolled career may well be the other Probe career, carrying an item of the same name.
        careers: careers.length, pin: !!pinId && !!a.items.get(pinId), lute: !!luteId && !!a.items.get(luteId), hadBoth: !!pinId && !!luteId,
        plainItems: from(plain).length, plainWants: (plain?.system.startingItems ?? []).filter((e) => e.trim()).length,
        petty: a.items.filter((i) => i.getFlag("base-knavery", "pettyFor") === a.id).length,
        pettyFromNew: from(failed).length,
      };
    }, [ids.a, setup.pin, setup.lute]);
    ok(after.hadBoth && after.careers === 2 && !after.pin && after.plainItems === after.plainWants, "rerolling a career takes back its items and gives the new one's", JSON.stringify(after));
    ok(!after.lute && after.petty === 1 && after.pettyFromNew === 1, "rerolling the failed career leaves one petty item, the new one's", JSON.stringify(after));

    const noItem = await gm.evaluate(async ([sys, a]) => {
      const { addCareer } = await import(`${sys}/character-generator.js`);
      await game.settings.set("base-knavery", "failed-career-item", false);
      const before = game.actors.get(a).items.size;
      await addCareer(game.actors.get(a), { name: "Probe Tinker", type: "career", system: { startingItems: ["Probe Pliers"] } }, { failed: true });
      await game.settings.set("base-knavery", "failed-career-item", true);
      return game.actors.get(a).items.size - before;
    }, [SYS, ids.a]);
    ok(noItem === 1, "with the item option off, a failed career gives no item", String(noItem));

    await gm.evaluate((x) => game.actors.get(x).update({ "system.level": 2 }), ids.a);
    await settle();
    const locked = await alice.evaluate(async ([sys, x]) => {
      const a = game.actors.get(x);
      const el = a.sheet.element;
      const out = { change: el.querySelectorAll(".career-change").length, roll: el.querySelectorAll('[data-action="rollCareer"]').length };
      const { replaceCareer } = await import(`${sys}/character-generator.js`);
      const c = a.items.find((i) => i.type === "career" && !i.system.failed);
      await replaceCareer(a, c, { name: "Probe Forger", type: "career", system: {} });
      out.kept = !!a.items.get(c.id);
      return out;
    }, [SYS, ids.a]);
    ok(locked.change === 0 && locked.roll === 0 && locked.kept, "at level 2 Alice can no longer change careers", JSON.stringify(locked));
    const gmCan = await gm.evaluate(async ([sys, x]) => {
      const a = game.actors.get(x);
      const { replaceCareer } = await import(`${sys}/character-generator.js`);
      const c = a.items.find((i) => i.type === "career" && !i.system.failed);
      await replaceCareer(a, c, { name: "Probe Forger", type: "career", system: {} });
      return !!a.items.getName("Probe Forger");
    }, [SYS, ids.a]);
    ok(gmCan, "the GM still can", String(gmCan));
  });

  /* ------------------------------------------------------------------ */
  await section("13. Create window, rolled names, coins, the Failed Career line, the portrait roll.", async () => {
    alice.evaluate(() => { game.knavery.createCharacterInteractive(); });
    await alice.waitForSelector(".knavery-create .form-footer", { timeout: T(10000) });
    const win = await alice.evaluate(() => {
      const el = document.querySelector(".knavery-create");
      return {
        subs: [...el.querySelectorAll(".form-footer .kn-create-sub")].map((s) => s.textContent.trim()),
        list: !!el.querySelector(".knavery-create-branches, ul"),
        titles: [...el.querySelectorAll(".form-footer button")].map((b) => b.textContent.trim()),
      };
    });
    await alice.locator('.knavery-create button[data-action="close"]').click().catch(() => {});
    await closeDialogs();
    ok(win.subs.length === 2 && win.subs[0].startsWith("Rolled stats") && win.subs[1].startsWith("An empty sheet") && !win.list,
      "Create Character: two big buttons with a line each, no list", JSON.stringify(win));

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
        failedLabel: el.querySelector(".failed-career-line .background-label")?.textContent.trim() ?? "",
        failedName: el.querySelector(".failed-career-line .career-chip")?.textContent.trim() ?? "",
        inCareers: [...el.querySelectorAll(".career-line:not(.failed-career-line) .career-chip")].map((c) => c.textContent.trim()),
        band: el.querySelector(".career-failed-band")?.textContent.trim() ?? "",
      };
    }, ids.a);
    ok(page.coins.startsWith("90 coins"), "the Inventory tab says how many coins", page.coins);
    ok(page.failedLabel === "Failed Career" && page.failedName && !page.inCareers.includes(page.failedName) && page.band === "Failed Career",
      "the failed career stands on its own labelled line, and its Growth card is banded", JSON.stringify(page));

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

  // Cleanup.
  await gm.evaluate(async (tables) => {
    for (const app of [...foundry.applications.instances.values()]) if (app.id !== "sidebar") app.close?.();
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    for (const id of tables) await game.tables.get(id)?.delete();
    for (const m of game.messages.filter((x) => x.getFlag("base-knavery", "xpAward"))) await m.delete();
  }, made.tables);
});

const real = errors.flat().filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
