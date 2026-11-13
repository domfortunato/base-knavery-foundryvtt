#!/usr/bin/env node
/**
 * The fixes of Foundry review #1 (2026-11-13), each driven the way a table
 * would meet it: the GM and two players (Alice, Bob) in three browsers.
 *
 *   FOUNDRY_URL=http://<private-ip>:30000 node tools/dev/e2e-fixes.mjs   (npm run dev:fixes)
 *
 * Runs on the probe fleet, never from the workstation (CLAUDE.md). Everything
 * it makes is named "Probe …" and deleted at the end; settings it touches are
 * put back by withSettings, and the client message mode by hand.
 */
import fs from "node:fs";
import { chromium } from "playwright";
import {
  SHOTS, TIME_SCALE, VIEWPORT, joinAs, joinAsGM, useProbeRulebook, waitForRulebook, watchErrors, watchdog, withSettings,
} from "./lib.mjs";

fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};

const T = (ms) => ms * TIME_SCALE;
const SYS = "/systems/base-knavery/module";

const browser = await chromium.launch();
watchdog(360000, "e2e-fixes", () => browser.close());
const ctx = () => browser.newContext({ viewport: VIEWPORT });
const gm = await (await ctx()).newPage();
const alice = await (await ctx()).newPage();
const bob = await (await ctx()).newPage();
const errors = [gm, alice, bob].map(watchErrors);
/** One part of the probe: a throw fails that part and the rest still run. */
const section = async (name, fn) => {
  try { await fn(); } catch (e) {
    failures++;
    console.error(`  FAIL  ${name}: threw ${String(e?.message ?? e).split("\n")[0]}`);
    // Close any dialog the part left open, so the next part starts clean.
    for (const page of [gm, alice, bob]) {
      await page.evaluate(() => { for (const app of [...foundry.applications.instances.values()]) if (app instanceof foundry.applications.api.DialogV2) app.close(); }).catch(() => {});
    }
  }
};

await joinAsGM(gm);
await withSettings(gm, async () => {
  const ids = await gm.evaluate(async () => {
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    for (const t of game.tables.filter((x) => x.name.startsWith("Probe"))) await t.delete();
    for (const m of game.messages.filter((x) => x.getFlag("base-knavery", "probe"))) await m.delete();
    const A = game.users.getName("Alice"); const B = game.users.getName("Bob");
    const O = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const a = await Actor.create({ name: "Probe Alice PC", type: "character", ownership: { default: 0, [A.id]: O }, system: { hp: { value: 4, max: 4 } } });
    const b = await Actor.create({ name: "Probe Bob PC", type: "character", ownership: { default: 0, [B.id]: O } });
    const [bobItem] = await b.createEmbeddedDocuments("Item", [{ name: "Probe Bob Ring", type: "item" }]);
    // A creature Alice may see (LIMITED) but not own: the target of a relayed Apply.
    const goblin = await Actor.create({
      name: "Probe Goblin", type: "npc", ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED },
      system: { role: "monster", hp: { value: 30, max: 30 } },
    });
    return { a: a.id, b: b.id, bobItem: bobItem.id, goblin: goblin.id, alice: A.id, bob: B.id };
  });
  await joinAs(alice, "Alice");
  await joinAs(bob, "Bob");
  let sheetSel = "";

  /* ------------------------------------------------------------------ */
  // 1. A sheet the viewer cannot edit keeps its rail, Die of Fate and Check.
  await section("1. A sheet the viewer cannot edit keeps its rail, Die of Fate and Check.", async () => {
  const locked = await gm.evaluate(async () => {
    const pack = game.packs.get("base-knavery.monsters");
    const entry = pack.index.contents[0];
    const doc = await pack.getDocument(entry._id);
    await doc.sheet.render({ force: true });
    await new Promise((r) => setTimeout(r, 800));
    const el = doc.sheet.element;
    const rail = [...el.querySelectorAll("nav.knavery-tab-rail button[data-tab]")];
    const fate = el.querySelector("#die-of-fate-button");
    const check = el.querySelector('button[data-action="rollAbility"]');
    const name = el.querySelector('input[name="name"]');
    const res = {
      locked: pack.locked, editable: doc.sheet.isEditable, rail: rail.length,
      railDisabled: rail.filter((b) => b.disabled).length, fateDisabled: fate?.disabled, checkDisabled: check?.disabled,
      nameDisabled: name?.disabled,
    };
    rail.find((b) => b.dataset.tab === "inventory")?.click();
    await new Promise((r) => setTimeout(r, 300));
    res.turned = doc.sheet.tabGroups?.primary === "inventory";
    await doc.sheet.close();
    return res;
  });
  ok(locked.locked && !locked.editable && locked.nameDisabled, "a bestiary creature opens read-only from its locked compendium", JSON.stringify(locked));
  ok(locked.rail > 0 && locked.railDisabled === 0 && locked.turned, "its page rail stays live and turns the page", JSON.stringify(locked));
  ok(locked.fateDisabled === false && locked.checkDisabled === false, "its Die of Fate and Check stay live", JSON.stringify(locked));

  });
  /* ------------------------------------------------------------------ */
  // 2. An Active Effect on max HP does not compound through the form.
  await section("2. An Active Effect on max HP does not compound through the form.", async () => {
  await gm.evaluate(async (id) => {
    const a = game.actors.get(id);
    await a.createEmbeddedDocuments("ActiveEffect", [{
      name: "Probe Tough", img: "icons/svg/aura.svg", changes: [{ key: "system.hp.max", mode: 2, value: "2" }],
    }]);
    await a.sheet.render({ force: true });
  }, ids.a);
  await gm.waitForSelector(`#${await gm.evaluate((id) => game.actors.get(id).sheet.id, ids.a)} input[name="system.hp.max"]`, { timeout: T(15000) });
  sheetSel = `#${await gm.evaluate((id) => game.actors.get(id).sheet.id, ids.a)}`;
  const before = await gm.evaluate((id) => { const a = game.actors.get(id); return { live: a.system.hp.max, stored: a._source.system.hp.max }; }, ids.a);
  const box = await gm.locator(`${sheetSel} input[name="system.hp.max"]`).evaluate((i) => ({ value: i.value, marked: i.hasAttribute("data-kn-modified"), tip: i.dataset.tooltipText }));
  ok(before.live === 6 && before.stored === 4, "the effect raises max HP 4 → 6 in play", JSON.stringify(before));
  ok(box.value === "4" && box.marked && /6/.test(box.tip ?? ""), "the max HP box holds the stored 4, marked, its tooltip giving 6", JSON.stringify(box));
  for (const xp of ["10", "20"]) {
    await gm.locator(`${sheetSel} input[name="system.xp"]`).fill(xp);
    await gm.locator(`${sheetSel} input[name="system.xp"]`).press("Tab");
    await gm.waitForFunction(([id, v]) => game.actors.get(id).system.xp === Number(v), [ids.a, xp], { timeout: T(10000) });
  }
  const after = await gm.evaluate((id) => { const a = game.actors.get(id); return { live: a.system.hp.max, stored: a._source.system.hp.max }; }, ids.a);
  ok(after.stored === 4 && after.live === 6, "two sheet edits later max HP is still 4 stored, 6 in play", JSON.stringify(after));

  });
  /* ------------------------------------------------------------------ */
  // 3. Enter in the roll prompt's Modifier field rolls Normal.
  await section("3. Enter in the roll prompt's Modifier field rolls Normal.", async () => {
  const n0 = await gm.evaluate(() => game.messages.size);
  await gm.locator(`${sheetSel} .resource-roll[data-ability="STR"]`).click();
  await gm.waitForSelector(".knavery-roll-prompt input[name=\"modifier\"]", { timeout: T(10000) });
  await gm.locator('.knavery-roll-prompt input[name="modifier"]').fill("2");
  await gm.locator('.knavery-roll-prompt input[name="modifier"]').press("Enter");
  await gm.waitForFunction((n) => game.messages.size > n, n0, { timeout: T(10000) });
  const enter = await gm.evaluate(() => {
    const m = game.messages.contents.at(-1);
    return { formula: m.rolls[0]?.formula ?? "", edge: !!m.content.match(/card-edge/) };
  });
  ok(!/kl|kh|- 5|\+ 5/.test(enter.formula) && !enter.edge && /\+ 2/.test(enter.formula), "Enter rolls Normal with the modifier", JSON.stringify(enter));

  });
  // 4. Enter in the level-up dialog levels up with the ticked abilities.
  await section("4. Enter in the level-up dialog levels up with the ticked abilities.", async () => {
  await gm.evaluate(async (id) => {
    const a = game.actors.get(id);
    await a.update({ "system.xp": 2000, "system.generationEnabled": true });
    (await import("/systems/base-knavery/module/level-up.js")).openLevelUp(a);
  }, ids.a);
  await gm.waitForSelector('input[name="pick"][value="STR"]', { timeout: T(10000) });
  const abil0 = await gm.evaluate((id) => Object.fromEntries(Object.entries(game.actors.get(id)._source.system.abilities).map(([k, v]) => [k, v.value])), ids.a);
  for (const k of ["STR", "DEX", "CON"]) await gm.locator(`input[name="pick"][value="${k}"]`).check();
  await gm.locator('input[name="pick"][value="CON"]').press("Enter");
  await gm.waitForFunction((id) => game.actors.get(id).system.level === 2, ids.a, { timeout: T(10000) });
  const abil1 = await gm.evaluate((id) => Object.fromEntries(Object.entries(game.actors.get(id)._source.system.abilities).map(([k, v]) => [k, v.value])), ids.a);
  const raised = Object.keys(abil1).filter((k) => abil1[k] > abil0[k]).sort();
  ok(raised.join() === "CON,DEX,STR", "Enter on a ticked box raises exactly the ticked three", JSON.stringify({ abil0, abil1 }));
  // Stored max 4 (6 with the effect). A roll at or under 4 keeps 4 + 1 = 5 from the
  // stored value; working from the effect's 6 it would be 7 for any roll up to 6.
  // The card is posted after the level changes, and other probes leave level-up
  // cards in the world: wait for THIS character's.
  await gm.waitForFunction((id) => game.messages.some((x) => x.getFlag("base-knavery", "levelUp") && x.speaker?.actor === id),
    ids.a, { timeout: T(10000) });
  const hpLevel = await gm.evaluate((id) => {
    const m = game.messages.filter((x) => x.getFlag("base-knavery", "levelUp") && x.speaker?.actor === id).at(-1);
    return { rolled: m?.rolls[0]?.total ?? null, max: game.actors.get(id)._source.system.hp.max };
  }, ids.a);
  ok(hpLevel.rolled !== null && hpLevel.max === (hpLevel.rolled <= 4 ? 5 : hpLevel.rolled),
    "level-up rolls HP against the stored max, not the effect's", JSON.stringify(hpLevel));

  });
  /* ------------------------------------------------------------------ */
  // 5. Enriched descriptions lose data-action and name in the sheet.
  await section("5. Enriched descriptions lose data-action and name in the sheet.", async () => {
  const cleaned = await gm.evaluate(async ({ id, sel }) => {
    const a = game.actors.get(id);
    const [it] = await a.createEmbeddedDocuments("Item", [{
      name: "Probe Trap", type: "item",
      system: { description: '<p>x <a data-action="itemDelete" name="system.coins" class="probe-bad">bad</a></p>' },
    }]);
    a.sheet.changeTab("inventory", "primary");
    await new Promise((r) => setTimeout(r, 300));
    a.sheet.element.querySelector(`[data-item-id="${it.id}"] [data-action="itemDescription"]`)?.click();
    await new Promise((r) => setTimeout(r, 800));
    const bad = document.querySelector(`${sel} .knavery-item-description .probe-bad`);
    return { shown: !!bad, action: bad?.getAttribute("data-action") ?? null, name: bad?.getAttribute("name") ?? null };
  }, { id: ids.a, sel: sheetSel });
  ok(cleaned.shown && cleaned.action === null && cleaned.name === null, "a description's data-action and name are stripped", JSON.stringify(cleaned));

  });
  /* ------------------------------------------------------------------ */
  // 6. Duplicates keep their token; hirelings start friendly.
  await section("6. Duplicates keep their token; hirelings start friendly.", async () => {
  const tokens = await gm.evaluate(async () => {
    const D = CONST.TOKEN_DISPOSITIONS;
    const friend = await Actor.create({ name: "Probe Friendly Beast", type: "npc", system: { role: "monster" }, prototypeToken: { disposition: D.FRIENDLY, actorLink: true } });
    const copy = await friend.clone({ name: "Probe Friendly Copy" }, { save: true });
    const hire = await Actor.create({ name: "Probe Hireling", type: "npc", system: { role: "hireling" } });
    const beast = await Actor.create({ name: "Probe Beast", type: "npc", system: { role: "monster" } });
    return {
      copy: copy.prototypeToken.disposition, copyLink: copy.prototypeToken.actorLink,
      hire: hire.prototypeToken.disposition, beast: beast.prototypeToken.disposition, D,
    };
  });
  ok(tokens.copy === tokens.D.FRIENDLY && tokens.copyLink === true, "a duplicated friendly NPC stays friendly and linked", JSON.stringify(tokens));
  ok(tokens.hire === tokens.D.FRIENDLY && tokens.beast === tokens.D.HOSTILE, "hirelings start friendly, monsters hostile", JSON.stringify(tokens));

  });
  /* ------------------------------------------------------------------ */
  // 7. Dashboard: a re-render keeps the half-written request; private rolls use messageMode.
  await section("7. Dashboard: a re-render keeps the half-written request; private rolls use messageMode.", async () => {
  await gm.evaluate(() => game.knavery.openDashboard());
  await gm.waitForSelector('#knavery-gm-dashboard input[name="reason"]', { timeout: T(10000) });
  await gm.locator('#knavery-gm-dashboard input[name="reason"]').fill("Probe half-written");
  await gm.locator(`#knavery-gm-dashboard input[name="pc"][value="${ids.a}"]`).check();
  const kept = await gm.evaluate(async (pc) => {
    const app = foundry.applications.instances.get("knavery-gm-dashboard");
    await app.render({ parts: ["requests"] });
    await app.render();
    const el = app.element;
    return { reason: el.querySelector('input[name="reason"]').value, pc: el.querySelector(`input[name="pc"][value="${pc}"]`)?.checked };
  }, ids.a);
  ok(kept.reason === "Probe half-written" && kept.pc, "re-renders keep the request being written", JSON.stringify(kept));
  // Deprecations reach the console as warnings; foundry.utils is a read-only
  // module namespace, so wrapping logCompatibilityWarning in the page catches nothing.
  const warned = [];
  const onWarn = (m) => { if (m.type() === "warning" && /rollMode|DICE_ROLL_MODES/.test(m.text())) warned.push(m.text().split("\n")[0]); };
  gm.on("console", onWarn);
  const dice = await gm.evaluate(async () => {
    try {
      const app = foundry.applications.instances.get("knavery-gm-dashboard");
      app.changeTab("dice", "primary");
      const n = game.messages.size;
      app.element.querySelector('button[data-action="encounterDistance"][data-where="dungeon"]').click();
      app.element.querySelector('button[data-action="reaction"]').click();
      for (let i = 0; i < 40 && game.messages.size < n + 2; i++) await new Promise((r) => setTimeout(r, 100));
      const made = game.messages.contents.slice(n);
      return { made: made.length, whispered: made.every((m) => m.whisper.length > 0 || m.blind) };
    } finally {
      await foundry.applications.instances.get("knavery-gm-dashboard")?.close();
    }
  });
  await gm.waitForTimeout(500);
  gm.off("console", onWarn);
  dice.warned = warned;
  ok(dice.made === 2 && dice.whispered, "the dashboard's distance and reaction rolls go to the GM only", JSON.stringify(dice));
  ok(dice.warned.length === 0, "no rollMode / DICE_ROLL_MODES deprecation from them", JSON.stringify(dice.warned));

  });
  // 8. Sheet rolls follow the chat's message mode.
  await section("8. Sheet rolls follow the chat's message mode.", async () => {
  const mode = await gm.evaluate(async (id) => {
    const prev = game.settings.get("core", "messageMode");
    await game.settings.set("core", "messageMode", "gm");
    try {
      const n = game.messages.size;
      await game.knavery.rollCheck(game.actors.get(id), "STR", { edge: "normal" });
      const m = game.messages.contents.at(-1);
      return { made: game.messages.size > n, whisper: m.whisper.length };
    } finally { await game.settings.set("core", "messageMode", prev); }
  }, ids.a);
  ok(mode.made && mode.whisper > 0, "a sheet check in Private GM mode is whispered", JSON.stringify(mode));

  });
  /* ------------------------------------------------------------------ */
  // 9. The importer turns a dead link into text and never empties a table.
  await section("9. The importer turns a dead link into text and never empties a table.", async () => {
  const imp = await gm.evaluate(async () => {
    const t0 = await game.knavery.importRows("Probe Import", game.knavery.parseRows("1 Old A\n2 Old B"));
    const report = { unlinked: 0 };
    const t = await game.knavery.importRows("Probe Import", game.knavery.parseRows("1 New A\n2 @UUID[Item.nopeNopeNopeNope]{Gone}"), { report });
    const rows = t.results.contents.map((r) => ({ name: r.name, type: r.type })).sort((x, y) => x.name.localeCompare(y.name));
    const same = t0.id === t.id;
    await t.delete();
    return { rows, unlinked: report.unlinked, same };
  });
  ok(imp.same && imp.rows.length === 2 && imp.rows.every((r) => r.type === "text") && imp.unlinked === 1,
    "a dead @UUID link imports as a text row, and the old rows are replaced", JSON.stringify(imp));

  });
  // 10. A rulebook-built table that the GM links or re-formulas counts as theirs.
  await section("10. A rulebook-built table that the GM links or re-formulas counts as theirs.", async () => {
  const book = await gm.evaluate(async () => {
    const m = await import("/systems/base-knavery/module/rulebook-import.js");
    const hadFolder = !!game.folders.find((f) => f.type === "RollTable" && f.getFlag("base-knavery", "rulebookFolder"));
    const rows = [{ range: [1, 1], text: "Probe A" }, { range: [2, 2], text: "Probe B" }];
    await m.writeRulebookTables([{ name: "Probe Book Linked", formula: "1d2", pages: [1], rows }, { name: "Probe Book Formula", formula: "1d2", pages: [1], rows }]);
    const fresh = [m.tableStatus("Probe Book Linked"), m.tableStatus("Probe Book Formula")];
    const linked = game.tables.getName("Probe Book Linked");
    const anyItem = game.items.contents[0] ?? (await game.packs.get("base-knavery.gear").getDocuments()).at(0);
    await linked.updateEmbeddedDocuments("TableResult", [{ _id: linked.results.contents[0].id, type: "document", documentUuid: anyItem.uuid }]);
    await game.tables.getName("Probe Book Formula").update({ formula: "1d6" });
    const edited = [m.tableStatus("Probe Book Linked"), m.tableStatus("Probe Book Formula")];
    for (const n of ["Probe Book Linked", "Probe Book Formula"]) await game.tables.getName(n)?.delete();
    if (!hadFolder) await game.folders.find((f) => f.type === "RollTable" && f.getFlag("base-knavery", "rulebookFolder"))?.delete();
    return { fresh, edited };
  });
  ok(book.fresh.every((s) => s === "replace"), "a freshly built book table is the book's to rebuild", JSON.stringify(book));
  ok(book.edited.every((s) => s === "keep"), "linking a row or changing the formula makes it the GM's", JSON.stringify(book));

  });
  /* ------------------------------------------------------------------ */
  // 11. Small fixes through the API.
  await section("11. Small fixes through the API.", async () => {
  // Each small fix in its own try, so one that throws on old code hides no other.
  const small = await gm.evaluate(async ({ a }) => {
    const out = {};
    const attempt = async (key, fn) => { try { out[key] = await fn(); } catch (e) { out[key] = `threw: ${e.message}`; } };
    const { rollDamage, castSpell } = await import("/systems/base-knavery/module/rolls.js");
    await attempt("price", async () => (await import("/systems/base-knavery/module/marketplace.js")).rowPrice({ flags: { "base-knavery": { price: 2.5 } } }, null));
    await attempt("special", () => rollDamage(game.actors.get(a), { formula: "special" }));
    await attempt("woundCard", async () => {
      const pc = game.actors.get(a);
      await pc.update({ "system.hp.value": 0, "system.wounds": 0 });
      await pc.applyDamage(1);
      return game.messages.contents.at(-1).content.match(/(\d+ wounds?)/)?.[1] ?? null;
    });
    await attempt("castLevel", async () => {
      const npc = await Actor.create({ name: "Probe Caster", type: "npc", system: { role: "npc", level: 3, useAbilities: false } });
      const [book] = await npc.createEmbeddedDocuments("Item", [{ name: "Probe Spell", type: "spellbook" }]);
      await castSpell(npc, book);
      return game.messages.contents.at(-1).content.match(/level (\d+)/i)?.[1] ?? null;
    });
    return out;
  }, ids);
  ok(small.price === 3, "a 2.5-coin price rounds up to 3", JSON.stringify(small));

  // The pick-list, with real key presses (a synthetic Enter never submits a form).
  await gm.evaluate(async () => {
    const { pickFromList } = await import("/systems/base-knavery/module/compendium.js");
    globalThis.__probePick = pickFromList([{ value: "alpha", label: "Alpha" }, { value: "beta", label: "Beta" }], { title: "Probe pick" });
  });
  await gm.waitForSelector(".knavery-picker .kn-pick-filter", { timeout: T(10000) });
  await gm.locator(".knavery-picker .kn-pick-filter").press("Enter");
  await gm.waitForTimeout(400);
  const stillOpen = await gm.locator(".knavery-picker .kn-pick-filter").count() === 1;
  await gm.locator(".knavery-picker .kn-pick-filter").fill("alp");
  await gm.locator(".knavery-picker .kn-pick-filter").press("Enter");
  const pick = await gm.evaluate(() => Promise.race([globalThis.__probePick, new Promise((r) => setTimeout(() => r("timeout"), 3000))]));
  ok(stillOpen && pick === "alpha", "Enter with nothing chosen does nothing; with one row left it picks it", JSON.stringify({ stillOpen, pick }));
  ok(small.special === null, "damage text that is not dice rolls nothing and throws nothing", JSON.stringify(small));
  ok(small.woundCard === "1 wound", "one wound reads \"1 wound\"", JSON.stringify(small));
  ok(small.castLevel === "3", "a level-3 monster casts at level 3", JSON.stringify(small));

  });
  // 12. A career sheet with a starting item inside a compendium actor still opens.
  await section("12. A career sheet with a starting item inside a compendium actor still opens.", async () => {
  const career = await gm.evaluate(async () => {
    const it = await Item.create({ name: "Probe Career", type: "career", system: { startingItems: ["Compendium.base-knavery.monsters.Actor.AAAAAAAAAAAAAAAA.Item.BBBBBBBBBBBBBBBB"] } });
    try {
      await it.sheet.render({ force: true });
      await new Promise((r) => setTimeout(r, 500));
      return { open: it.sheet.rendered };
    } catch (e) { return { open: false, error: e.message }; } finally { await it.sheet.close(); await it.delete(); }
  });
  ok(career.open, "a career listing an item inside a compendium actor still opens", JSON.stringify(career));

  });
  /* ------------------------------------------------------------------ */
  // 13. Offers: a card naming someone else's item gets no Accept on the GM's screen.
  await section("13. Offers: a card naming someone else's item gets no Accept on the GM's screen.", async () => {
  const forgedId = await alice.evaluate(async ({ a, b, item }) => {
    const m = await ChatMessage.create({
      content: '<div class="knavery-offer-card">probe</div>',
      flags: { "base-knavery": { probe: true, itemOffer: {
        state: "open", settled: false, giverActorUuid: `Actor.${b}`, targetActorUuid: `Actor.${a}`,
        itemId: item, acceptorUserId: null, item: { name: "Probe Bob Ring", img: "", slots: 1 },
      } } },
    });
    return m.id;
  }, { a: ids.a, b: ids.b, item: ids.bobItem });
  await gm.waitForFunction((id) => !!document.querySelector(`#chat [data-message-id="${id}"] .knavery-offer-state`), forgedId, { timeout: T(10000) });
  const forged = await gm.evaluate(({ id, b, item }) => {
    const labels = [...document.querySelectorAll(`#chat [data-message-id="${id}"] .knavery-offer-actions button`)].map((x) => x.textContent.trim());
    return { labels, accept: labels.includes(game.i18n.localize("KNAVERY.Offer.Accept")), stillBobs: !!game.actors.get(b).items.get(item) };
  }, { id: forgedId, b: ids.b, item: ids.bobItem });
  ok(!forged.accept && forged.stillBobs, "a forged offer card draws no Accept, and Bob keeps his ring", JSON.stringify(forged));

  });
  // 14. Damage relay: tied to the card, its total, and visible targets.
  await section("14. Damage relay: tied to the card, its total, and visible targets.", async () => {
  const dmg = await alice.evaluate(async ({ a, goblin }) => {
    const { rollDamage } = await import("/systems/base-knavery/module/rolls.js");
    const { emit } = await import("/systems/base-knavery/module/socket.js");
    const roll = await rollDamage(game.actors.get(a), { formula: "1d1 + 2", targets: [`Actor.${goblin}`] });
    const card = game.messages.contents.at(-1);
    // Forged relays first: no card, and a card with the wrong amount.
    emit("applyDamage", { targets: [`Actor.${goblin}`], amount: 25, direct: false });
    emit("applyDamage", { targets: [`Actor.${goblin}`], amount: 25, direct: false, messageId: card.id });
    await new Promise((r) => setTimeout(r, 1500));
    const afterForged = game.actors.get(goblin).system.hp.value;
    return { total: roll?.total, cardId: card.id, afterForged };
  }, ids);
  ok(dmg.total === 3 && dmg.afterForged === 30, "forged relays (no card, wrong amount) do nothing", JSON.stringify(dmg));
  await bob.waitForFunction((id) => !!document.querySelector(`#chat [data-message-id="${id}"] .knavery-roll-card`), dmg.cardId, { timeout: T(10000) });
  const bobSees = await bob.evaluate((id) => document.querySelectorAll(`#chat [data-message-id="${id}"] [data-kn-apply]`).length, dmg.cardId);
  ok(bobSees === 0, "another player gets no Apply buttons on Alice's card", String(bobSees));
  await alice.waitForFunction((id) => !!document.querySelector(`#chat [data-message-id="${id}"] [data-kn-apply="normal"]`), dmg.cardId, { timeout: T(10000) });
  await alice.evaluate((id) => document.querySelector(`#chat [data-message-id="${id}"] [data-kn-apply="normal"]`).click(), dmg.cardId);
  await gm.waitForFunction((g) => game.actors.get(g).system.hp.value === 27, ids.goblin, { timeout: T(10000) });
  await gm.waitForFunction((id) => game.messages.get(id)?.getFlag("base-knavery", "damageApplied") === true, dmg.cardId, { timeout: T(10000) });
  ok(true, "Alice's own Apply reaches the GM: 30 → 27, and the card is stamped applied");

  });
  // 15. A LIMITED viewer gets no rail.
  await section("15. A LIMITED viewer gets no rail.", async () => {
  await bob.evaluate((id) => game.actors.get(id).sheet.render({ force: true }), ids.a);
  await bob.waitForSelector(".knavery-limited-sheet", { timeout: T(10000) });
  const limited = await bob.evaluate(() => {
    const nav = document.querySelector(".knavery-limited-sheet")?.closest(".window-content")?.querySelector("nav.knavery-tab-rail");
    return { nav: !!nav, hidden: nav?.hidden, buttons: nav?.querySelectorAll("button").length ?? 0, shown: nav ? getComputedStyle(nav).display : null };
  });
  ok(limited.buttons === 0 && (limited.hidden || !limited.nav) && limited.shown !== "flex", "Bob's LIMITED view of Alice's character has no page rail", JSON.stringify(limited));
  await bob.evaluate((id) => game.actors.get(id).sheet.close(), ids.a);

  });
  // 16. Free Take follows "Players may use the creation tools".
  await section("16. Free Take follows 'Players may use the creation tools'.", async () => {
  await gm.evaluate(() => game.settings.set("base-knavery", "allow-player-randomization", false));
  await alice.waitForFunction(() => game.settings.get("base-knavery", "allow-player-randomization") === false, null, { timeout: T(10000) });
  const take = await alice.evaluate(async (a) => {
    const actor = game.actors.get(a);
    await actor.update({ "system.generationEnabled": true });
    const { mayTakeFree } = await import("/systems/base-knavery/module/marketplace.js");
    return mayTakeFree(actor);
  }, ids.a);
  ok(take === false, "with the creation tools off, a player in creation mode gets no free Take", String(take));

  });
  // 17. A refused Create Character is answered.
  await section("17. A refused Create Character is answered.", async () => {
  await gm.evaluate(() => game.settings.set("base-knavery", "allow-player-generate", false));
  await alice.waitForFunction(() => game.settings.get("base-knavery", "allow-player-generate") === false, null, { timeout: T(10000) });
  const refused = await alice.evaluate(async () => {
    const seen = [];
    const warn = ui.notifications.warn.bind(ui.notifications);
    ui.notifications.warn = (m, o) => { seen.push(String(m)); return warn(m, o); };
    try {
      (await import("/systems/base-knavery/module/socket.js")).emit("generatePC", { mode: "blank", level: 1, name: "Probe Refused" });
      for (let i = 0; i < 50 && !seen.length; i++) await new Promise((r) => setTimeout(r, 100));
      return seen;
    } finally { ui.notifications.warn = warn; }
  });
  ok(refused.some((m) => m.includes("CreationClosed")), "a refused creation request tells the player so", JSON.stringify(refused));
  ok(!(await gm.evaluate(() => !!game.actors.getName("Probe Refused"))), "and makes no character");

  });
  /* ------------------------------------------------------------------ */
  // 18. B closes the reader while the PDF has focus.
  await section("18. B closes the reader while the PDF has focus.", async () => {
  await useProbeRulebook(gm, { forPlayers: false });
  await gm.evaluate(() => game.knavery.openRulebook());
  await waitForRulebook(gm);
  await gm.frameLocator("#knavery-rulebook iframe.knavery-rulebook-frame").locator("#viewerContainer").click({ position: { x: 40, y: 120 } });
  // The key must land INSIDE the frame, where Foundry's keyboard manager cannot hear it.
  const focused = await gm.evaluate(() => document.activeElement?.tagName === "IFRAME");
  await gm.keyboard.press("KeyB");
  await gm.waitForFunction(() => !document.getElementById("knavery-rulebook"), null, { timeout: T(10000) }).catch(() => {});
  const closed = await gm.evaluate(() => !document.getElementById("knavery-rulebook"));
  ok(focused && closed, "B pressed inside the PDF closes the reader", JSON.stringify({ focused, closed }));
  await gm.evaluate(async () => {
    await game.settings.set("base-knavery", "rulebook-pdf", "");
    await game.settings.set("base-knavery", "rulebook-page-offset", 6);
  });

  });
  // Cleanup.
  await gm.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) if (app.id !== "sidebar") app.close?.();
    for (const a of game.actors.filter((x) => x.name.startsWith("Probe"))) await a.delete();
    for (const t of game.tables.filter((x) => x.name.startsWith("Probe"))) await t.delete();
    for (const m of game.messages.filter((x) => x.getFlag("base-knavery", "probe"))) await m.delete();
  });
});

const real = errors.flat().filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
