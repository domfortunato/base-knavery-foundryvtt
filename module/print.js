/**
 * The printable sheet: one fixed 186 × 261 mm page, the A4 and US Letter intersection, written
 * into a new window, so a knave prints on one page on either paper (plan item 10, user
 * decisions 2026-11-14: body 9.5 pt by default, career descriptions and the old Saves block off
 * the paper, a Spells block with tick boxes, the short disclaimer in the footer and the Knave 1e
 * CC BY credit whenever a value from a 1e table prints).
 *
 * Zones: the head (portrait, name, level line, careers or alignment and background, the logo);
 * the abilities and vitals strips; one numbered row per slot, wounds from the bottom; traits as
 * a two-column key: value grid; career features; spells with a box each; the backstory clamped
 * to six lines; Notes, the one elastic zone, ruled to the foot; the footer. Every row height is
 * fixed in px, so the page count never depends on the machine's fonts: the template's `.sheet`
 * box cannot reach a second page, and `markClipped` says on the paper when Notes was cut.
 *
 * The window is opened SYNCHRONOUSLY in the click handler: a popup blocker allows window.open
 * only inside the user gesture, before any await. The Printing settings (Configure General)
 * choose the paper, the type size and what the paper carries; the page count holds at every one.
 */
import { ABILITIES, SETTINGS_NS, SYS_PATH, TABLES } from "./config.js";
import { slotsForItem } from "./documents/actor.js";
import { nextLevelXp } from "./data-models.js";
import { isLight } from "./hazard.js";
import { qualityOf } from "./quality.js";
import { coinsPerSlot, spellRule, usesCareers, usesQuality, usesWounds } from "./rules.js";
import { KNAVE_PAGE_TRAITS, traitShown } from "./settings.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const TextEditor = foundry.applications.ux.TextEditor.implementation;
const abs = (src) => (src ? new URL(foundry.utils.getRoute(src), window.location.href).href : "");

/** Slot rows the list may grow to for an overburdened knave; past the cap, one "+N more" line. */
export const PRINT_ROWS_CAP = 24;
/** Lines a career's features may take, and the spells, before "+N more". */
const FEATURE_LINES = 4;
const SPELL_LINES = 8;
/** Track features print as boxes up to this many pips; longer tracks print as "value / max". */
const TRACK_BOXES_MAX = 12;
/** Ruled lines offered to the Notes zone; the zone clips what does not fit. */
const RULED_LINES = 40;
/** The traits grid, row by row: appearance down the left, character down the right, Misfortune last. */
const TRAITS_LEFT = ["physique", "face", "skin", "hair", "clothing"];
const TRAITS_RIGHT = ["personality", "mannerism", "virtue", "vice", "speech", "misfortune"];
/** Knave 2e's own traits come from the GM's book; every other trait table is Knave 1e's (CC BY 4.0). */
const TRAITS_2E = ["personality", "mannerism"];
/** The paper setting's CSS page sizes; Auto sets none and the print dialog decides. */
const PAPER_SIZES = { a4: "A4", letter: "Letter" };

/** A world setting, or `fallback` before settings exist. */
const setting = (key, fallback) => {
  try { return game.settings.get(SETTINGS_NS, key); } catch { return fallback; }
};
/** `max` tick boxes, the first `on` of them filled. */
const boxes = (max, on) => Array.from({ length: Math.max(0, Number(max) || 0) }, (_, i) => ({ on: i < on }));
const num = (n) => Number(n ?? 0).toLocaleString(game.i18n.lang);
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);

export const printActorSheet = (actor) => {
  const win = window.open("", "_blank");
  if (!win) return ui.notifications.warn("KNAVERY.Notify.PrintBlocked", { localize: true });
  fill(win, actor).catch((err) => {
    console.error("Base Knavery | print failed", err);
    win.close();
  });
  return win;
};

/**
 * Mark every elastic zone whose content was cut: the zone shows "…continues on the sheet" and
 * the probe can see the mark. Layout is complete once the document is closed, and again on load.
 */
export const markClipped = (doc) => {
  for (const el of doc.querySelectorAll("[data-elastic]")) {
    const clipped = el.scrollHeight > el.clientHeight + 1;
    el.classList.toggle("clipped", clipped);
    el.closest("[data-zone]")?.classList.toggle("clipped", clipped);
  }
};

const fill = async (win, actor) => {
  const context = await printContext(actor);
  const html = await foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/print/character-print.html`, context);
  win.document.open();
  win.document.write(html);
  win.document.close();
  markClipped(win.document);
  const go = () => { markClipped(win.document); win.focus(); win.print(); };
  if (win.document.readyState === "complete") setTimeout(go, 300);
  else win.addEventListener("load", () => setTimeout(go, 300));
};

/** Enriched HTML flattened to one run of text, for a zone that prints a fixed number of lines. */
const plainText = (html) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent.replace(/\s+/g, " ").trim();
};

/** One slot row's item: its tags as the sheet shows them, chits, and 1e quality as boxes. */
const itemRow = (item, quality, wounded) => {
  const s = item.system;
  const tags = [];
  if (item.type === "weapon") {
    const parts = [s.damage, L(s.attackType === "ranged" ? "KNAVERY.Ranged" : "KNAVERY.Melee")];
    if (s.hands === 2) parts.push(L("KNAVERY.PrintSheet.TwoHanded"));
    tags.push({ text: parts.filter(Boolean).join(" "), lower: true });
  }
  if (item.type === "armor") tags.push({ text: F("KNAVERY.NAp", { n: s.points }) });
  if (item.type === "spellbook") tags.push({ text: L(s.scroll ? "KNAVERY.Scroll" : "KNAVERY.Spellbook"), lower: true });
  if ((s.quantity ?? 1) > 1) tags.push({ text: F("KNAVERY.NQuantity", { n: s.quantity }) });
  // Knave 1e (p4): every weapon and piece of armor shows its quality as boxes, lost points filled, so wear can be pencilled.
  const q = quality ? qualityOf(item) : null;
  const chits = [];
  if (isLight(item) && s.lit) chits.push(L("KNAVERY.Lit"));
  if (s.broken) chits.push(L("KNAVERY.Broken"));
  if (s.treasure) chits.push(L("KNAVERY.Treasure"));
  return {
    name: item.name, equipped: !!s.equipped, tags, chits,
    quality: q ? boxes(q.max, q.max - q.value) : null,
    // An item in a wounded slot is Unusable, not dropped (user ruling 2026-11-14).
    unusable: wounded,
  };
};

/** A career feature as a line: text or number, a box, or a track's pips. */
const featureRow = (f, stored) => {
  const value = stored ?? (f.type === "number" || f.type === "track" ? Number(f.initial) || 0
    : f.type === "checkbox" ? f.initial === "true" : f.initial);
  if (f.type === "checkbox") return { label: f.label, boxes: [{ on: value === true }] };
  if (f.type === "track") {
    const max = Number(f.max) || 0;
    if (max > 0 && max <= TRACK_BOXES_MAX) return { label: f.label, boxes: boxes(max, Number(value) || 0) };
    return { label: f.label, value: max > 0 ? `${Number(value) || 0} / ${max}` : String(Number(value) || 0) };
  }
  return { label: f.label, value: String(value ?? "") };
};

/** Everything the template prints, computed from the rules the GM actually plays (rules.js). */
export const printContext = async (actor) => {
  const s = actor.system;
  const isChar = actor.type === "character";
  const slotsMax = s.slotsMax ?? 0;
  const wounds = isChar ? (s.wounds ?? 0) : 0;
  const quality = usesQuality();
  const coinsTakeSlots = setting("coins-take-slots", true) !== false;

  /* The slot list: one row per slot, items by the actor's layout, coins after the last item,
     wounds from the bottom; extra rows for an overburdened knave to the cap, then "+N more". */
  const layout = actor.slotLayout();
  const rows = new Map();
  const weightless = [];
  let lastSlot = 0;
  for (const item of actor.inventory) {
    const pos = layout.get(item.id);
    if (!slotsForItem(item) || !pos?.first) { weightless.push(item.name); continue; }
    for (let n = pos.first; n <= pos.last; n++) rows.set(n, n === pos.first ? itemRow(item, quality, pos.wounded) : { continued: true });
    lastSlot = Math.max(lastSlot, pos.last);
  }
  const coinSlots = s.coinSlots ?? 0;
  const coinRow = F("KNAVERY.PrintSheet.CoinRow", { n: coinsPerSlot() });
  for (let i = 1; i <= coinSlots; i++) rows.set(lastSlot + i, { coins: coinRow });
  const needed = lastSlot + coinSlots;
  const shown = Math.min(Math.max(slotsMax, needed), PRINT_ROWS_CAP);
  const firstWounded = slotsMax - wounds + 1;
  const slots = Array.from({ length: shown }, (_, i) => {
    const n = i + 1;
    const row = rows.get(n) ?? {};
    return { n, ...row, empty: !rows.has(n), wounded: wounds > 0 && n >= firstWounded && n <= slotsMax, over: n > slotsMax };
  });
  const more = Math.max(0, needed - PRINT_ROWS_CAP);

  /* The head: level, title, XP and pronouns; then careers (2e) or alignment and background (1e). */
  const next = isChar ? nextLevelXp(s.level) : null;
  const xpText = next !== null ? `${F("KNAVERY.XpShort", { xp: num(s.xp), next: num(next) })} ${L("KNAVERY.XP")}` : F("KNAVERY.XpTop", { xp: num(s.xp) });
  const levelLine = (isChar
    ? [`${L("KNAVERY.Level")} ${s.level}`, L(`KNAVERY.LevelTitle.${s.level}`), xpText, s.pronouns]
    : [L(`KNAVERY.Role.${s.role}`), `${L("KNAVERY.Level")} ${s.level}`, s.pronouns]).filter(Boolean).join(" · ");
  const careerItems = isChar ? actor.items.filter((i) => i.type === "career").sort(bySort) : [];
  const showCareers = isChar && (usesCareers() || careerItems.length > 0);
  const headTraits = isChar ? KNAVE_PAGE_TRAITS.filter(traitShown) : [];
  const traitsLine = headTraits.map((k) => ({ label: L(`KNAVERY.Trait.${k}`), value: s.traits?.[k] ?? "" }));

  /* The strips. */
  const abilities = isChar || s.useAbilities ? ABILITIES.map((k) => ({
    label: L(`KNAVERY.AbilityShort.${k}`), value: s.abilities[k].value, defense: s.abilities[k].defense,
  })) : [];
  const vitals = [
    { label: L("KNAVERY.AC"), value: s.ac, sub: F("KNAVERY.NAp", { n: s.ap ?? 0 }) },
    { label: L("KNAVERY.HP"), value: `${s.hp.value} / ${s.hp.max}` },
  ];
  if (isChar) {
    if (usesWounds()) vitals.push({ label: L("KNAVERY.Wounds"), value: `${wounds} / ${slotsMax}` });
    vitals.push({ label: L("KNAVERY.Coins"), value: num(s.coins), sub: coinsTakeSlots ? F("KNAVERY.PrintSheet.PerSlot", { n: coinsPerSlot() }) : "" });
    const int = s.abilities.INT.value;
    // Knave 2e: INT casts a day, a box each, the ones cast filled. Knave 1e has no daily count: the slots cell instead.
    if (spellRule() === "int-per-day" && int > 0) vitals.push({ label: L("KNAVERY.PrintSheet.Spells"), boxes: boxes(int, s.spellsCastToday ?? 0), sub: F("KNAVERY.PrintSheet.OfInt", { n: int }) });
    else vitals.push({ label: L("KNAVERY.Slots"), value: `${actor.calcSlotsUsed()} / ${slotsMax}` });
  } else {
    vitals.push({ label: L("KNAVERY.Morale"), value: s.morale }, { label: L("KNAVERY.Movement"), value: s.movement });
  }

  /* Traits as a grid, in the paper's order; the head's two are not repeated. Off with Show traits. */
  const gridTraits = (keys) => keys.filter((k) => traitShown(k) && !KNAVE_PAGE_TRAITS.includes(k));
  const left = gridTraits(TRAITS_LEFT);
  const right = gridTraits([...TRAITS_RIGHT, ...Object.keys(TABLES.traits).filter((k) => !TRAITS_LEFT.includes(k) && !TRAITS_RIGHT.includes(k))]);
  const traitCell = (k) => ({ label: L(`KNAVERY.Trait.${k}`), value: s.traits?.[k] ?? "" });
  const traits = [];
  if (setting("show-traits", true) !== false) {
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      if (left[i]) traits.push(traitCell(left[i]));
      if (right[i]) traits.push(traitCell(right[i]));
    }
  }
  // The CC BY 4.0 credit goes on the paper whenever a value from a Knave 1e table prints.
  const printed = [...headTraits, ...(traits.length ? [...left, ...right] : [])].filter((k) => !TRAITS_2E.includes(k));
  const credit1e = printed.some((k) => String(s.traits?.[k] ?? "").trim());

  /* Careers: names are in the head; here only their features, never the description (D12). */
  const careers = setting("print-career-features", true) === false ? [] : careerItems.map((c) => {
    const ckey = c.system.key || c.id;
    const all = (c.system.features ?? []).filter((f) => f.key)
      .map((f) => featureRow(f, foundry.utils.getProperty(s.features ?? {}, `${ckey}.${f.key}`)));
    return { name: c.name, features: all.slice(0, FEATURE_LINES), more: all.length > FEATURE_LINES ? F("KNAVERY.PrintSheet.More", { n: all.length - FEATURE_LINES }) : "" };
  }).filter((c) => c.features.length);

  /* Spells: a box per book or scroll, ticked when cast today. */
  const books = actor.items.filter((i) => i.type === "spellbook").sort(bySort);
  const spells = books.slice(0, SPELL_LINES).map((b) => ({
    name: b.name, cast: !!b.system.castToday, tag: L(b.system.scroll ? "KNAVERY.Scroll" : "KNAVERY.Spellbook"),
  }));
  const spellsNote = !isChar ? "" : spellRule() === "int-per-day"
    ? F("KNAVERY.PrintSheet.SpellsPerDay", { n: s.abilities.INT.value }) : L("KNAVERY.PrintSheet.OncePerDay");

  const enrich = (html) => TextEditor.enrichHTML(html ?? "", { relativeTo: actor });
  const backstory = isChar && setting("print-backstory", true) !== false ? plainText(await enrich(s.biography)) : "";
  const description = isChar ? "" : await enrich(s.description);
  const paper = PAPER_SIZES[setting("print-paper", "auto")] ?? "";

  return {
    lang: game.i18n.lang,
    name: actor.name,
    // Foundry's blank portrait leaves the box empty, so the name never shifts.
    portrait: actor.img && actor.img !== CONST.DEFAULT_TOKEN ? abs(actor.img) : "",
    logo: abs(`${SYS_PATH}/logo/made-for-knave-black.png`),
    isChar,
    levelLine,
    showCareers,
    careerNames: careerItems.map((c) => c.name).join(" · "),
    traitsLine,
    abilities,
    vitals,
    attacks: isChar ? "" : (s.attacksText ?? ""),
    slotCount: F("KNAVERY.PrintSheet.SlotCount", { used: actor.calcSlotsUsed(), max: slotsMax }),
    slots,
    more: more ? F("KNAVERY.PrintSheet.More", { n: more }) : "",
    weightless: weightless.length ? F("KNAVERY.PrintSheet.Weightless", { names: weightless.join(", ") }) : "",
    traits,
    careers,
    spells,
    spellsMore: books.length > SPELL_LINES ? F("KNAVERY.PrintSheet.More", { n: books.length - SPELL_LINES }) : "",
    spellsNote,
    backstory,
    description,
    notes: await enrich(s.notes),
    notesLines: setting("print-notes-lines", true) !== false,
    ruledLines: Array.from({ length: RULED_LINES }),
    footer: [L("KNAVERY.DisclaimerShort"), credit1e ? L("KNAVERY.Knave1eCredit") : ""].filter(Boolean),
    pageSize: paper,
    bodySize: setting("print-text-size", "9.5pt") === "10pt" ? "10pt" : "9.5pt",
  };
};
