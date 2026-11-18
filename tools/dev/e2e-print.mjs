#!/usr/bin/env node
/**
 * The printed sheet: one page on US Letter and A4, both editions (plan item 10, 2026-11-14).
 *
 *   FOUNDRY_URL=http://<your-foundry-host>:30000 node tools/dev/e2e-print.mjs   (npm run dev:print)
 *
 * Page COUNT is not DOM-observable, so the gate is a real PDF: headless Chromium prints the
 * popup with `page.pdf()` as Letter and as A4, and the count of page objects in the PDF must be
 * exactly 1 (Air Bladder's `e2e-print.mjs` proved the method on the fleet's Linux Chromium).
 * Then, under print media, the DOM is checked: the fixed 261 mm sheet, the footer inside it,
 * exactly slotsMax numbered rows, the wound marks on the right rows, the "+N more" line and the
 * "…continues on the sheet" mark on the overflow case and on nothing else.
 *
 * Four fixtures, created here as the GM and deleted in a `finally`:
 *   (i)   a typical Knave 2e knave: CON 3, two careers with features, 11 traits, a two-slot
 *         spear, a spellbook and a scroll, 540 coins, 2 wounds, a 35-word backstory, notes;
 *   (ii)  a typical Knave 1e knave: alignment and background, a worn sword, 140 copper;
 *   (iii) a level-10 knave: CON 10, 20 items, the top of the XP ladder; also at 10 pt;
 *   (iv)  an overburdened knave with 60 lines of notes: the degradation rules.
 * Editions are switched with `game.knavery.applyRules` inside `withSettings`, which puts
 * every setting back. The Letter PDF of each fixture is saved beside the screenshots.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { SHOTS, TIME_SCALE, VIEWPORT, joinAsGM, watchErrors, watchdog, withSettings } from "./lib.mjs";

const OUT = SHOTS;
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label} ${extra}`); }
};
const note = (text) => console.log(`  note  ${text}`);
const J = (v) => JSON.stringify(v);

const PREFIX = "ZZ Print";
const ZERO = { top: "0", bottom: "0", left: "0", right: "0" };
/** Chromium's Skia PDF writes its page objects uncompressed: count them. */
const pdfPages = (buf) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
/** The sheet box is 261 mm tall: 986.5 CSS px. */
const SHEET_PX = (261 * 96) / 25.4;
const ROWS_CAP = 24;

const browser = await chromium.launch();
watchdog(480000, "e2e-print", () => browser.close());
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = watchErrors(page);
const popupErrors = [];
await joinAsGM(page);

/* ------------------------------------------------------------ fixtures -- */
const TRAITS = {
  physique: "Brawny", face: "Pockmarked", skin: "Scarred", hair: "Braided", clothing: "Patched",
  virtue: "Loyal", vice: "Greedy", speech: "Blunt", misfortune: "Disowned",
};
const TRAITS_2E = { ...TRAITS, personality: "Grim", mannerism: "Spits" };
const BACKSTORY = "<p>Born in the gutters of Hollowmere, dug graves for the plague cart until the night one of them "
  + "climbed back out; has not slept a whole night since, and keeps the shovel sharp for the day it happens again.</p>";
const NOTES = "<p>Owes the Gravediggers' Guild 40 coins.</p><p>The well in Hollowmere hums at dusk.</p><p>Ask the abbot about the bell.</p>";
const abilities = (o) => Object.fromEntries(["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((k) => [k, { value: o[k] ?? 0 }]));
const many = (n, slots = 1) => Array.from({ length: n }, (_, i) => ({ name: `${PREFIX} Item ${String(i + 1).padStart(2, "0")}`, type: "item", system: { slots } }));

const FIXTURES = {
  typical2e: {
    edition: "2e",
    actor: {
      name: `${PREFIX} Grimbold Tallow`, type: "character", img: "icons/svg/aura.svg",
      system: {
        abilities: abilities({ STR: 2, DEX: 1, CON: 3, INT: 2, WIS: 0, CHA: 1 }), level: 3, xp: 4400,
        hp: { value: 7, max: 9 }, coins: 540, wounds: 2, pronouns: "he/him", spellsCastToday: 1,
        traits: TRAITS_2E, biography: BACKSTORY, notes: NOTES,
        features: { gravedigger: { graves: 3 }, beggar: { favor: 2 } },
      },
    },
    items: [
      { name: `${PREFIX} Sword`, type: "weapon", system: { damage: "d6", equipped: true } },
      { name: `${PREFIX} Spear`, type: "weapon", system: { damage: "d8", hands: 2, slots: 2, equipped: true } },
      { name: `${PREFIX} Shield`, type: "armor", system: { armorType: "shield", points: 1, equipped: true } },
      { name: `${PREFIX} Gambeson`, type: "armor", system: { armorType: "gambeson", points: 1, equipped: true } },
      { name: `${PREFIX} Helmet`, type: "armor", system: { armorType: "helmet", points: 1, equipped: true } },
      { name: `${PREFIX} Phantom Steed`, type: "spellbook", system: {} },
      { name: `${PREFIX} Scroll of Fireball`, type: "spellbook", system: { scroll: true, castToday: true, treasure: true } },
      { name: `${PREFIX} Rations`, type: "item", system: {} },
      { name: `${PREFIX} Torch`, type: "item", system: { lit: true } },
      { name: `${PREFIX} Ring`, type: "item", system: { weightless: true } },
      // Careers carry a description on purpose: it must NOT print (D12); only the features do.
      { name: "Beggar", type: "career", system: { key: "beggar", description: "<p>ZZDESCRIPTION beggar</p>", features: [{ key: "favor", label: "Favors owed", type: "number", initial: "0" }] } },
      { name: "Gravedigger", type: "career", system: { key: "gravedigger", description: "<p>ZZDESCRIPTION gravedigger</p>", features: [{ key: "graves", label: "Graves dug", type: "number", initial: "0" }, { key: "shovel", label: "Shovel", type: "checkbox", initial: "true" }] } },
    ],
  },
  typical1e: {
    edition: "1e",
    actor: {
      name: `${PREFIX} Osric Vane`, type: "character",
      system: {
        abilities: abilities({ STR: 2, DEX: 1, CON: 3, INT: 1, WIS: 0, CHA: 1 }), level: 3, xp: 2400,
        hp: { value: 7, max: 9 }, coins: 140, pronouns: "he/him",
        traits: { ...TRAITS, alignment: "Neutral", background: "Blacksmith" }, biography: BACKSTORY, notes: NOTES,
      },
    },
    items: [
      { name: `${PREFIX} Sword`, type: "weapon", system: { damage: "d6", equipped: true, wear: 1 } },
      { name: `${PREFIX} Shield`, type: "armor", system: { armorType: "shield", points: 1, equipped: true } },
      { name: `${PREFIX} Gambeson`, type: "armor", system: { armorType: "gambeson", points: 1, equipped: true } },
      { name: `${PREFIX} Phantom Steed`, type: "spellbook", system: {} },
      { name: `${PREFIX} Rations`, type: "item", system: {} },
      { name: `${PREFIX} Rope`, type: "item", system: {} },
    ],
  },
  level10: {
    edition: "2e",
    actor: {
      name: `${PREFIX} Marrow the Tenth`, type: "character",
      system: {
        abilities: abilities({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }), level: 10, xp: 500000,
        hp: { value: 44, max: 44 }, coins: 0, traits: TRAITS_2E, biography: BACKSTORY, notes: NOTES,
      },
    },
    items: many(20),
  },
  overflow: {
    edition: "2e",
    actor: {
      name: `${PREFIX} Overburdened`, type: "character",
      system: {
        abilities: abilities({ CON: 1 }), level: 1, xp: 0, hp: { value: 3, max: 3 }, coins: 0, traits: TRAITS_2E,
        notes: Array.from({ length: 60 }, (_, i) => `<p>Line ${i + 1} of the notes, which run on and on.</p>`).join(""),
      },
    },
    items: many(30),
  },
};

const create = (fixture) => page.evaluate(async ({ actor, items }) => {
  const a = await Actor.create(actor);
  await a.createEmbeddedDocuments("Item", items, { render: false });
  return a.id;
}, fixture);

const cleanup = () => page.evaluate(async (prefix) => {
  for (const a of game.actors.filter((x) => x.name.startsWith(prefix))) await a.delete();
}, PREFIX).catch((e) => console.error(`  note  cleanup: ${e.message}`));

/** Set every rule to one edition: the API when it exists, else the presets written directly. */
const playEdition = (edition) => page.evaluate(async (edition) => {
  if (typeof game.knavery?.applyRules === "function") { await game.knavery.applyRules(edition); return "api"; }
  const { RULES_PRESETS } = await import("/systems/base-knavery/module/config.js");
  for (const [k, v] of Object.entries(RULES_PRESETS[edition])) {
    if (game.settings.get("base-knavery", k) !== v) await game.settings.set("base-knavery", k, v);
  }
  return "presets";
}, edition);

const setSettings = (values) => page.evaluate(async (values) => {
  for (const [k, v] of Object.entries(values)) {
    if (game.settings.get("base-knavery", k) !== v) await game.settings.set("base-knavery", k, v);
  }
}, values);

/* --------------------------------------------------------------- print -- */
/** Open the actor's sheet, press Print, take the popup, PDF it both ways, read its DOM, close both. */
const printActor = async (id, name, key) => {
  await page.evaluate((id) => game.actors.get(id).sheet.render(true), id);
  const button = '.knavery.sheet.actor .window-header button[data-action="printSheet"]';
  await page.waitForSelector(button, { timeout: 15000 * TIME_SCALE });
  const [pop] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 20000 * TIME_SCALE }),
    page.locator(button).first().click(),
  ]);
  pop.on("pageerror", (e) => popupErrors.push(`${key}: ${e.message}`));
  await pop.waitForLoadState("domcontentloaded").catch(() => {});
  await pop.waitForFunction((name) => document.querySelector("h1")?.textContent.includes(name) && !!document.querySelector(".sheet footer"), name, { timeout: 15000 * TIME_SCALE });
  await pop.waitForLoadState("load", { timeout: 10000 * TIME_SCALE }).catch(() => {});
  // The paper: the dialog's "None" margins on both papers (the @page rule is 0 top and bottom
  // anyway), and once letting the page's own @page size win, so the Paper setting is exercised.
  const pages = {};
  const variants = { letter: { format: "Letter", margin: ZERO }, a4: { format: "A4", margin: ZERO }, letterCss: { format: "Letter", margin: ZERO, preferCSSPageSize: true } };
  for (const [label, opts] of Object.entries(variants)) {
    const buf = await pop.pdf({ ...opts, printBackground: false });
    pages[label] = pdfPages(buf);
    if (label === "letter") fs.writeFileSync(path.join(OUT, `print-${key}.pdf`), buf);
  }
  await pop.emulateMedia({ media: "print" });
  const dom = await pop.evaluate(() => {
    const sheet = document.querySelector(".sheet");
    const rows = [...document.querySelectorAll(".inv .slot")];
    const text = (el) => el?.textContent.replace(/\s+/g, " ").trim() ?? null;
    const rect = (el) => el?.getBoundingClientRect();
    return {
      sheetH: rect(sheet)?.height, sheetOver: sheet.scrollHeight - sheet.clientHeight,
      footerIn: rect(document.querySelector("footer")).bottom <= rect(sheet).bottom + 1,
      zones: Object.fromEntries([...document.querySelectorAll("[data-zone]")].map((z) => [z.dataset.zone, z.scrollHeight - z.clientHeight])),
      docH: document.documentElement.scrollHeight, bodyFont: getComputedStyle(document.body).fontSize,
      rows: rows.map((r) => ({
        n: r.dataset.slot, name: text(r.querySelector(".name")), empty: r.classList.contains("empty"), wounded: r.classList.contains("wounded"),
        unusable: r.classList.contains("unusable"), over: r.classList.contains("over"), cont: !!r.querySelector(".name.cont"), coins: !!r.querySelector(".name.coins"),
        equipped: !!r.querySelector(".dot"), tags: [...r.querySelectorAll(".tag")].map(text), chits: [...r.querySelectorAll(".chit")].map(text),
        qBoxes: r.querySelectorAll(".q .box").length, qOn: r.querySelectorAll(".q .box.on").length,
      })),
      more: text(document.querySelector(".inv .more")), weightless: text(document.querySelector(".weightless")),
      clipped: [...document.querySelectorAll(".clipped")].map((e) => e.className), continues: getComputedStyle(document.querySelector(".notes .continues")).display,
      head: { level: text(document.querySelector(".head .line.level")), careers: text(document.querySelector(".head .line.careers")), traits: text(document.querySelector(".head .line.head-traits")) },
      portrait: !!document.querySelector(".head .portrait img"), logo: document.querySelector(".head .logo")?.getAttribute("src"),
      abilities: [...document.querySelectorAll(".strip.abilities .cell")].map((c) => [".lbl", ".val", ".sub"].map((sel) => text(c.querySelector(sel))).join(" ")),
      vitals: [...document.querySelectorAll(".strip.vitals .cell")].map((c) => ({ label: text(c.querySelector(".lbl")), value: text(c.querySelector(".val")), sub: text(c.querySelector(".sub")), boxes: c.querySelectorAll(".box").length, on: c.querySelectorAll(".box.on").length })),
      traits: [...document.querySelectorAll(".traits .kv")].map((r) => [text(r.querySelector(".k")), text(r.querySelector(".v"))]),
      careers: [...document.querySelectorAll(".careers .kv")].map((r) => ({
        text: [".k", ".v", ".r"].map((sel) => text(r.querySelector(sel)) ?? "").join(" ").trim(), boxes: r.querySelectorAll(".box").length, on: r.querySelectorAll(".box.on").length,
      })),
      spells: [...document.querySelectorAll(".spells .kv.spell")].map((r) => ({ name: text(r.querySelector(".v")), tag: text(r.querySelector(".r")), on: !!r.querySelector(".box.on") })),
      spellsNote: text(document.querySelector(".spells h2 .note")),
      backstory: text(document.querySelector(".backstory .clamp")), backstoryH: rect(document.querySelector(".backstory .clamp"))?.height ?? 0,
      notesH: rect(document.querySelector(".notes"))?.height ?? 0, ruled: document.querySelectorAll(".notes .rules i").length,
      footer: [...document.querySelectorAll("footer p")].map(text),
      body: document.body.textContent,
    };
  });
  await pop.close();
  await page.evaluate((id) => game.actors.get(id)?.sheet.close(), id);
  note(`${key}: Letter ${pages.letter}, A4 ${pages.a4}, CSS size ${pages.letterCss} page(s); sheet ${Math.round(dom.sheetH)}px, document ${dom.docH}px, notes ${Math.round(dom.notesH)}px, body ${dom.bodyFont}`);
  return { pages, dom };
};

const onePage = ({ pages }, label) => ok(pages.letter === 1 && pages.a4 === 1 && pages.letterCss === 1, `${label}: exactly one page on Letter and on A4`, J(pages));
const intact = ({ dom }, label) => {
  ok(Math.abs(dom.sheetH - SHEET_PX) <= 2 && dom.sheetOver <= 1 && dom.footerIn,
    `${label}: the 261 mm sheet holds everything, the footer inside it`, J({ sheetH: dom.sheetH, over: dom.sheetOver, footerIn: dom.footerIn }));
  ok(Object.values(dom.zones).every((v) => v <= 1), `${label}: no zone overflows its box`, J(dom.zones));
  ok(dom.clipped.length === 0 && dom.continues === "none", `${label}: nothing was cut; no "continues on the sheet"`, J(dom.clipped));
  ok(!/Paralysis|Breath & Blast|Magic Device/.test(dom.body) && !/ZZDESCRIPTION/.test(dom.body), `${label}: no Saves block and no career description on the paper`);
  ok(dom.footer[0] === "Base Knavery is an unofficial fan-made Foundry system for Knave (first and second editions) and is not affiliated with Questing Beast LLC.",
    `${label}: the footer carries the short disclaimer`, J(dom.footer));
};

/* ---------------------------------------------------------------- run -- */
try {
  await cleanup();
  await withSettings(page, async () => {
    // The paper's defaults, whatever the dev world's GM chose; withSettings puts them back.
    await setSettings({ "show-traits": true, "coins-take-slots": true, "rations-per-slot": 1, "torches-per-slot": 1,
      "print-paper": "auto", "print-text-size": "9.5pt", "print-career-features": true, "print-backstory": true, "print-notes-lines": true });

    /* (i) Knave 2e */
    note(`rules set with the ${await playEdition("2e")}`);
    const f1 = FIXTURES.typical2e;
    const id1 = await create(f1);
    const r1 = await printActor(id1, f1.actor.name, "typical-2e");
    onePage(r1, "2e typical");
    intact(r1, "2e typical");
    const d1 = r1.dom;
    ok(d1.rows.length === 13 && d1.rows.every((r, i) => r.n === String(i + 1)), "2e typical: exactly slotsMax (13) numbered rows", J(d1.rows.map((r) => r.n)));
    const spear = d1.rows.findIndex((r) => /Spear/.test(r.name ?? ""));
    ok(spear >= 0 && d1.rows[spear + 1]?.cont && d1.rows[spear].tags.join() === "d8 Melee 2h" && d1.rows[spear].equipped,
      "2e typical: the two-slot spear names itself once, its next row continues it; tags d8 melee 2h, equipped", J(d1.rows.slice(spear, spear + 2)));
    ok(d1.rows.filter((r) => r.coins).map((r) => [r.n, r.name]).join() === "11,Coins (500)", "2e typical: one coin row after the last item, 500 a slot", J(d1.rows.filter((r) => r.coins)));
    ok(d1.rows.filter((r) => r.wounded).map((r) => r.n).join() === "12,13" && d1.rows.filter((r) => r.empty).map((r) => r.n).join() === "12,13"
      && d1.rows.filter((r) => r.unusable).length === 0 && d1.rows[11].chits.join() === "Wound",
      "2e typical: the two wounds mark slots 12 and 13 from the bottom (empty, so nothing is Unusable)", J(d1.rows.slice(11)));
    ok(d1.rows.some((r) => /Torch/.test(r.name) && r.chits.includes("Lit")) && d1.rows.some((r) => /Scroll/.test(r.name) && r.chits.includes("Treasure") && r.tags.join() === "Scroll"),
      "2e typical: a lit torch and a treasure scroll carry their chits; the scroll its tag", J(d1.rows.map((r) => [r.name, r.tags, r.chits])));
    ok(d1.rows.every((r) => r.qBoxes === 0), "2e typical: no 1e quality boxes under Knave 2e attacks");
    ok(/Ring/.test(d1.weightless ?? ""), "2e typical: the weightless ring is listed under the slots", J(d1.weightless));
    ok(/Level 3 · Rascal · 4,400 \/ 8,000 XP · he\/him/.test(d1.head.level ?? ""), "2e typical: the head line reads level, title, XP and pronouns", J(d1.head));
    ok(/^Careers .*Beggar/.test(d1.head.careers ?? "") && /Gravedigger/.test(d1.head.careers ?? "") && d1.head.traits === null, "2e typical: careers in the head, no alignment line", J(d1.head));
    ok(d1.portrait && /made-for-knave-black\.png$/.test(d1.logo ?? ""), "2e typical: portrait and the Made for Knave logo", J({ portrait: d1.portrait, logo: d1.logo }));
    ok(d1.abilities.length === 6 && /STR \+2 def 13/.test(d1.abilities[0]) && /CON \+3 def 14/.test(d1.abilities[2]), "2e typical: six ability cells with bonus and defense", J(d1.abilities));
    ok(d1.vitals.map((v) => v.label).join() === "AC,HP,Wounds,Coins,Spells", "2e typical: the vitals strip is AC, HP, Wounds, Coins, Spells", J(d1.vitals));
    ok(d1.vitals[0].value === "14" && d1.vitals[0].sub === "3 AP" && d1.vitals[1].value === "7 / 9" && d1.vitals[2].value === "2 / 13" && d1.vitals[3].value === "540",
      "2e typical: AC 14 (3 AP), HP 7 / 9, Wounds 2 / 13, Coins 540", J(d1.vitals));
    ok(d1.vitals[4].boxes === 2 && d1.vitals[4].on === 1 && d1.vitals[4].sub === "of INT 2", "2e typical: INT 2 gives two spell boxes, one cast today", J(d1.vitals[4]));
    ok(d1.traits.length === 11 && d1.traits[0].join() === "Physique,Brawny" && d1.traits[1].join() === "Personality,Grim" && d1.traits.at(-1).join() === "Misfortune,Disowned",
      "2e typical: eleven traits as a key: value grid, appearance left, character right, Misfortune last", J(d1.traits));
    ok(d1.careers.length === 3 && d1.careers.some((c) => /Beggar Favors owed 2/.test(c.text)) && d1.careers.some((c) => /Gravedigger Graves dug 3/.test(c.text))
      && d1.careers.some((c) => /Shovel/.test(c.text) && c.on === 1),
      "2e typical: career features only, values from the sheet, a checkbox as a ticked box", J(d1.careers));
    ok(d1.spells.length === 2 && d1.spells.some((sp) => /Phantom Steed/.test(sp.name) && !sp.on && sp.tag === "Spellbook")
      && d1.spells.some((sp) => /Fireball/.test(sp.name) && sp.on && sp.tag === "Scroll"),
      "2e typical: a Spells line per book and scroll, the cast scroll ticked", J(d1.spells));
    ok(d1.spellsNote === "2 a day (INT)", "2e typical: the Spells heading says INT a day", J(d1.spellsNote));
    ok(/Born in the gutters/.test(d1.backstory ?? "") && d1.backstoryH <= 100, "2e typical: the backstory prints, within six lines", J({ h: d1.backstoryH }));
    ok(d1.footer.length === 2 && /Knave \(first edition\) by Ben Milton, licensed under CC BY 4\.0/.test(d1.footer[1]), "2e typical: the Knave 1e credit follows (its trait values print)", J(d1.footer));
    ok(d1.ruled > 10 && d1.notesH >= 100, "2e typical: Notes takes the rest of the page, ruled for pencil", J({ ruled: d1.ruled, notesH: d1.notesH }));

    /* (ii) Knave 1e */
    await playEdition("1e");
    const f2 = FIXTURES.typical1e;
    const id2 = await create(f2);
    const r2 = await printActor(id2, f2.actor.name, "typical-1e");
    onePage(r2, "1e typical");
    intact(r2, "1e typical");
    const d2 = r2.dom;
    ok(d2.rows.length === 13 && d2.rows.filter((r) => r.wounded).length === 0, "1e typical: 13 rows, no wound marks", J(d2.rows.map((r) => r.n)));
    ok(/Alignment Neutral · Background Blacksmith/.test(d2.head.traits ?? "") && d2.head.careers === null, "1e typical: alignment and background in the head, no careers line", J(d2.head));
    ok(/Level 3 · Rascal · 2,400 \/ 3,000 XP/.test(d2.head.level ?? ""), "1e typical: the 1e XP ladder in the head line", J(d2.head));
    ok(d2.vitals.map((v) => v.label).join() === "AC,HP,Coins,Slots" && d2.vitals[3].value === "7 / 13" && d2.vitals[2].sub === "100 a slot",
      "1e typical: the vitals strip is AC, HP, Coins, Slots; no Wounds; 100 copper a slot", J(d2.vitals));
    const sword = d2.rows.find((r) => /Sword/.test(r.name ?? ""));
    const shield = d2.rows.find((r) => /Shield/.test(r.name ?? ""));
    const gambeson = d2.rows.find((r) => /Gambeson/.test(r.name ?? ""));
    ok(sword?.qBoxes === 3 && sword?.qOn === 1 && shield?.qBoxes === 1 && shield?.qOn === 0 && gambeson?.qBoxes === 3 && gambeson?.qOn === 0,
      "1e typical: quality boxes on weapons and armor (sword 3, one lost; shield 1; gambeson 3)", J({ sword, shield, gambeson }));
    ok(d2.rows.filter((r) => r.coins).map((r) => [r.n, r.name]).join() === "7,Coins (100)", "1e typical: 140 copper fill one slot of 100", J(d2.rows.filter((r) => r.coins)));
    ok(d2.traits.length >= 9 && !d2.traits.some(([k]) => /Alignment|Background/.test(k ?? "")), "1e typical: the grid holds the nine traits, not the head's two", J(d2.traits));
    ok(d2.spells.length === 1 && d2.spellsNote === "each book once a day", "1e typical: the Spells heading says each book once a day, no daily count", J({ spells: d2.spells, note: d2.spellsNote }));
    ok(d2.careers.length === 0, "1e typical: no careers block");
    ok(d2.footer.length === 2 && /CC BY 4\.0/.test(d2.footer[1]), "1e typical: the Knave 1e credit in the footer", J(d2.footer));

    /* (iii) level 10, then at 10 pt */
    await playEdition("2e");
    const f3 = FIXTURES.level10;
    const id3 = await create(f3);
    const r3 = await printActor(id3, f3.actor.name, "level-10");
    onePage(r3, "level 10");
    intact(r3, "level 10");
    const d3 = r3.dom;
    ok(d3.rows.length === 20 && d3.rows.every((r) => !r.empty && !r.over), "level 10: twenty rows, all filled, none past the slots", J(d3.rows.map((r) => r.n)));
    ok(/Level 10 · .* · 500,000 XP — the top level/.test(d3.head.level ?? ""), "level 10: the top of the XP ladder in the head line", J(d3.head));
    ok(d3.abilities.every((a) => /\+10 def 21/.test(a)), "level 10: +10 and def 21 fit the ability cells", J(d3.abilities));
    ok(d3.notesH >= 100, "level 10: Notes keeps at least 100 px of pencil room", J({ notesH: d3.notesH }));
    await setSettings({ "print-text-size": "10pt", "print-paper": "letter", "print-notes-lines": false, "print-backstory": false, "print-career-features": false });
    const r3b = await printActor(id3, f3.actor.name, "level-10-10pt");
    onePage(r3b, "level 10 at 10 pt, paper Letter");
    intact(r3b, "level 10 at 10 pt");
    ok(/13\.33/.test(r3b.dom.bodyFont) && r3b.dom.ruled === 0 && r3b.dom.backstory === null && r3b.dom.careers.length === 0,
      "the Printing settings: 10 pt body, no ruled lines, no backstory, no career features", J({ font: r3b.dom.bodyFont, ruled: r3b.dom.ruled, backstory: r3b.dom.backstory }));
    await setSettings({ "print-text-size": "9.5pt", "print-paper": "auto", "print-notes-lines": true, "print-backstory": true, "print-career-features": true });

    /* (iv) overflow */
    const f4 = FIXTURES.overflow;
    const id4 = await create(f4);
    const r4 = await printActor(id4, f4.actor.name, "overflow");
    onePage(r4, "overflow");
    const d4 = r4.dom;
    ok(Math.abs(d4.sheetH - SHEET_PX) <= 2 && d4.sheetOver <= 1 && d4.footerIn, "overflow: the sheet still holds the footer", J({ sheetH: d4.sheetH, over: d4.sheetOver, footerIn: d4.footerIn }));
    ok(d4.rows.length === ROWS_CAP && d4.rows.filter((r) => r.over).length === ROWS_CAP - 11 && d4.more === "+6 more",
      "overflow: 30 items on 11 slots give 24 rows (13 past the slots) and \"+6 more\"", J({ rows: d4.rows.length, over: d4.rows.filter((r) => r.over).length, more: d4.more }));
    ok(d4.clipped.some((c) => /notes/.test(c)) && d4.continues === "block", "overflow: 60 lines of notes are cut and the paper says \"…continues on the sheet\"", J({ clipped: d4.clipped, continues: d4.continues }));
    ok(d4.notesH >= 100, "overflow: Notes keeps at least 100 px even at the row cap", J({ notesH: d4.notesH }));
  });
} finally {
  await cleanup();
}

const real = [...errors, ...popupErrors].filter((e) => !/favicon|DEPRECATED/i.test(e));
ok(real.length === 0, "no console errors", `\n    ${real.join("\n    ")}`);
await browser.close();
console.log(failures ? `\n${failures} failed.` : "\nall passed.");
process.exit(failures ? 1 : 0);
