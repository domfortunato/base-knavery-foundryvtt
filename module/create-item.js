/**
 * The Create Item window (GM only; plan item 12, decision D4, 2026-11-14): one window beside
 * Create NPC. The GM picks a kind (weapon, armor, gear or tool, potion, relic, spellbook, chaos
 * spellbook); its fields come pre-filled from the world's price list (config.js PRICE_BANDS,
 * WEAPON_LINES, ARMOR_LINES) and, under Knave 1e attacks, its quality; a Roll beside the name
 * and beside the effect draws on the tables the GM built from their own book (world RollTables
 * found by name, compendium.js). A table the world lacks holds its Roll and names itself in the
 * tooltip. The item is created into the Items directory, an actor's inventory or a world
 * marketplace aisle, and its sheet opens.
 *
 * Nothing of the books is here: the table names are the catalogue's (rulebook-catalogue.js),
 * the rows are the GM's own.
 */
import {
  ARMOR_LINES, ARMOR_TYPES, FLAG_SCOPE, ITEM_KINDS, PRICE_BANDS, SYS_PATH, WEAPON_LINES, defaultQualityMax,
} from "./config.js";
import { usesPrices1e, usesQuality } from "./rules.js";
import { drawFrom } from "./compendium.js";
import { FORMULA_TABLE, SLOT_TABLES, missingTables, rollSpell } from "./spell-generator.js";
import { aisleName, marketPrefix, nextRow, renumberAisle } from "./marketplace.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const APP_ID = "knavery-create-item";

/** The kinds on offer: the item type and badge each makes, its icons and its words. */
export const KINDS = {
  weapon: { type: "weapon", img: "weapons", icon: "fa-khanda", label: "KNAVERY.ItemMaker.Kind.weapon", hint: "KNAVERY.ItemMaker.Hint.weapon" },
  armor: { type: "armor", img: "armor", icon: "fa-shield-halved", label: "KNAVERY.ItemMaker.Kind.armor", hint: "KNAVERY.ItemMaker.Hint.armor" },
  gear: { type: "item", img: "tools", icon: "fa-toolbox", label: "KNAVERY.ItemMaker.Kind.gear", hint: "KNAVERY.ItemMaker.Hint.gear" },
  potion: { type: "item", badge: "potion", img: "generic-item", icon: "fa-flask", label: "KNAVERY.ItemMaker.Kind.potion", hint: "KNAVERY.ItemMaker.Hint.potion" },
  relic: { type: "item", badge: "relic", img: "generic-item", icon: "fa-gem", label: "KNAVERY.ItemMaker.Kind.relic", hint: "KNAVERY.ItemMaker.Hint.relic" },
  spellbook: { type: "spellbook", img: "spellbook", icon: "fa-book", label: "KNAVERY.ItemMaker.Kind.spellbook", hint: "KNAVERY.ItemMaker.Hint.spellbook" },
  chaos: { type: "spellbook", chaos: true, img: "spellbook", icon: "fa-book-skull", label: "KNAVERY.ItemMaker.Kind.chaos", hint: "KNAVERY.ItemMaker.Hint.chaos" },
};
export const KIND_KEYS = Object.keys(KINDS);

/** The tables a gear name may come from (the book's item tables, by the catalogue's names). */
export const GEAR_SOURCES = ["Tools", "Miscellaneous Items", "Books", "Clothing Items", "Treasures"];
const TREASURES = "Treasures";
/** The tables an effect Roll draws, one line each: a thing's trait and material; a potion's look. */
const EFFECT_TABLES = {
  thing: ["Item Traits", "Materials"],
  potion: ["Textures", "Tastes", "Colors", "Ingredients"],
};
const LINE_LABELS = {
  "Item Traits": "KNAVERY.ItemMaker.Line.trait", Materials: "KNAVERY.ItemMaker.Line.material",
  Textures: "KNAVERY.ItemMaker.Line.texture", Tastes: "KNAVERY.ItemMaker.Line.taste",
  Colors: "KNAVERY.ItemMaker.Line.color", Ingredients: "KNAVERY.ItemMaker.Line.ingredient",
};
/** A spell's name comes from the spell generator: the formula table, then the word tables it names. */
const SPELL_TABLES = [FORMULA_TABLE, ...Object.values(SLOT_TABLES)];

const BANDS = [
  { key: "trifle", label: "KNAVERY.ItemMaker.Band.trifle" }, { key: "cheap", label: "KNAVERY.ItemMaker.Band.cheap" },
  { key: "common", label: "KNAVERY.ItemMaker.Band.common" }, { key: "costly", label: "KNAVERY.ItemMaker.Band.costly" },
  { key: "dear", label: "KNAVERY.ItemMaker.Band.dear" }, { key: "precious", label: "KNAVERY.ItemMaker.Band.precious" },
];

const priceList = () => (usesPrices1e() ? "knave1e" : "knave2e");
/** The six price bands of the world's price list, cheapest first. */
export const bands = () => PRICE_BANDS[priceList()];
/** A weapon's die, slots and price for its reach and hands, on the world's price list. */
export const weaponLine = (attackType, hands) =>
  WEAPON_LINES[priceList()][attackType === "ranged" ? "ranged" : "melee"][Number(hands) === 2 ? 2 : 1];
/** An armor piece's points, slots and price for its type (a type without a 1e line takes `other`). */
export const armorLine = (armorType) => {
  const lines = ARMOR_LINES[priceList()];
  return lines[armorType] ?? lines.other;
};

/** The window's fields for a kind, pre-filled. */
export const kindDefaults = (kind = "weapon") => {
  const key = KINDS[kind] ? kind : "weapon";
  const K = KINDS[key];
  const b = bands();
  const base = {
    kind: key, name: "", description: "", formula: "", badge: K.badge ?? "ordinary",
    slots: 1, quantity: 1, cost: b[2], treasure: false, uses: 0, source: GEAR_SOURCES[0], where: "world",
  };
  if (K.type === "weapon") {
    const w = weaponLine("melee", 1);
    return { ...base, attackType: "melee", hands: 1, damage: w.damage, slots: w.slots, cost: w.cost, range: "", qualityMax: null };
  }
  if (K.type === "armor") {
    const a = armorLine("other");
    return { ...base, armorType: "other", points: a.points, slots: a.slots, cost: a.cost, qualityMax: null };
  }
  if (key === "potion") return { ...base, uses: 1, cost: b[4] };
  if (key === "relic" || K.type === "spellbook") return { ...base, cost: b[5] };
  return base;
};

/** The tables a kind's Rolls draw on: `name` for the name, `effect` for the effect or description. */
export const rollTables = (data) => {
  const K = KINDS[data.kind] ?? KINDS.weapon;
  if (K.type === "spellbook") return { name: SPELL_TABLES, effect: [] };
  if (data.kind === "potion") return { name: ["Potions"], effect: EFFECT_TABLES.potion };
  if (data.kind === "relic") return { name: ["Symbols", "Domains"], effect: EFFECT_TABLES.thing };
  if (data.kind === "gear") return { name: [GEAR_SOURCES.includes(data.source) ? data.source : GEAR_SOURCES[0]], effect: EFFECT_TABLES.thing };
  if (K.type === "weapon") return { name: ["Weapons"], effect: EFFECT_TABLES.thing };
  return { name: [], effect: EFFECT_TABLES.thing };
};

/**
 * A Roll button's state. `mode`: "all" needs every table (a relic's symbol and domain), "any"
 * draws from those present, "first" needs the first (the spell formula; its words are checked
 * when a formula is drawn). Null when nothing rolls here.
 */
const rollState = async (tables, mode = "all") => {
  if (!tables.length) return null;
  const missing = await missingTables(tables);
  const present = tables.filter((t) => !missing.includes(t));
  const disabled = mode === "all" ? missing.length > 0 : mode === "first" ? missing.includes(tables[0]) : present.length === 0;
  const named = disabled ? (mode === "any" ? tables : missing) : (mode === "first" ? tables : present);
  return {
    tables, missing, present, disabled,
    tip: F(disabled ? "KNAVERY.ItemMaker.RollMissing" : "KNAVERY.ItemMaker.RollTip", { tables: game.i18n.getListFormatter().format(named) }),
  };
};

/**
 * Roll a name for the window's data: the drawn row (a relic: "{symbol} of {domain}"; a
 * spellbook: the spell generator's name and formula). Null when the kind has no name table;
 * {missing} when the world lacks one it needs.
 */
export const rollName = async (data) => {
  const K = KINDS[data.kind] ?? KINDS.weapon;
  if (K.type === "spellbook") {
    const spell = await rollSpell();
    if (spell.missing?.length) return { missing: spell.missing };
    return { name: spell.name, formula: spell.formula };
  }
  const { name: tables } = rollTables(data);
  if (!tables.length) return null;
  const missing = await missingTables(tables);
  if (missing.length) return { missing };
  const drawn = [];
  for (const t of tables) drawn.push((await drawFrom(t, { warn: false }))?.text ?? "");
  if (data.kind === "relic") return { name: F("KNAVERY.ItemMaker.RelicName", { symbol: drawn[0], domain: drawn[1] }) };
  return { name: drawn[0], treasure: tables[0] === TREASURES };
};

/** Roll an effect or description: one line per table the world has ("Trait: …"). Null when nothing rolls here. */
export const rollEffect = async (data) => {
  const { effect: tables } = rollTables(data);
  if (!tables.length) return null;
  const missing = await missingTables(tables);
  const present = tables.filter((t) => !missing.includes(t));
  if (!present.length) return { missing };
  const lines = [];
  for (const t of present) {
    const text = (await drawFrom(t, { warn: false }))?.text;
    if (text) lines.push(F("KNAVERY.ItemMaker.LineText", { label: L(LINE_LABELS[t]), text }));
  }
  return { text: lines.join("\n") };
};

const toHtml = (text) => String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join("");
const num = (v, fallback = 0, min = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
};

/** The Item document data the window's fields make. Pure, for the probe. */
export const itemDataFor = (data) => {
  const key = KINDS[data.kind] ? data.kind : "weapon";
  const K = KINDS[key];
  const name = String(data.name ?? "").trim().slice(0, 120) || L(K.label);
  const system = {
    description: toHtml(data.description),
    kind: ITEM_KINDS.includes(data.badge) ? data.badge : (K.badge ?? "ordinary"),
    slots: num(data.slots, 1),
    quantity: Math.max(1, Math.round(num(data.quantity, 1))),
    cost: num(data.cost, 0),
    treasure: data.treasure === true,
  };
  if (K.type === "weapon") {
    Object.assign(system, {
      damage: String(data.damage || "d6").trim(), hands: Number(data.hands) === 2 ? 2 : 1,
      attackType: data.attackType === "ranged" ? "ranged" : "melee", range: String(data.range ?? "").trim(),
    });
  }
  if (K.type === "armor") {
    Object.assign(system, { armorType: ARMOR_TYPES.includes(data.armorType) ? data.armorType : "other", points: Math.round(num(data.points, 1)) });
  }
  // Quality is stored only when the GM set it to something other than the item's default.
  if (["weapon", "armor"].includes(K.type) && data.qualityMax !== null && data.qualityMax !== undefined && data.qualityMax !== "") {
    const q = Math.round(Number(data.qualityMax));
    if (q >= 1 && q !== defaultQualityMax(K.type, system)) system.qualityMax = q;
  }
  if (K.type === "item") {
    const uses = Math.round(num(data.uses, 0));
    system.uses = { value: uses, max: uses };
  }
  if (K.type === "spellbook") system.chaos = K.chaos === true;
  const flags = data.formula ? { [FLAG_SCOPE]: { generated: { formula: data.formula } } } : {};
  return { name, type: K.type, img: `${SYS_PATH}/icons/${K.img}.svg`, system, flags };
};

/**
 * Make the item `where`: "world" (the Items directory), "actor:<id>" (that actor's inventory) or
 * "aisle:<uuid>" (a world aisle table: the item goes in the Items directory and a row links it,
 * as the Marketplace Manager's drop does). Opens the item's sheet. GM only.
 */
export const createItem = async (data, where = "world") => {
  if (!game.user.isGM) {
    ui.notifications.warn("KNAVERY.Notify.GmOnly", { localize: true });
    return null;
  }
  const doc = itemDataFor(data);
  let item = null;
  let note = null;
  if (where.startsWith("actor:")) {
    const actor = game.actors.get(where.slice("actor:".length));
    if (!actor) {
      ui.notifications.warn("KNAVERY.ItemMaker.NoTarget", { localize: true });
      return null;
    }
    [item] = await actor.createEmbeddedDocuments("Item", [doc]);
    note = ["KNAVERY.ItemMaker.MadeActor", { name: item.name, where: actor.name }];
  } else if (where.startsWith("aisle:")) {
    const table = await fromUuid(where.slice("aisle:".length));
    if (!table || table.pack || table.documentName !== "RollTable") {
      ui.notifications.warn("KNAVERY.ItemMaker.NoTarget", { localize: true });
      return null;
    }
    item = await Item.create(doc);
    const n = nextRow(table);
    await table.createEmbeddedDocuments("TableResult", [{
      type: CONST.TABLE_RESULT_TYPES.DOCUMENT, documentUuid: item.uuid, name: item.name, img: item.img, range: [n, n], weight: 1,
    }]);
    await renumberAisle(table);
    note = ["KNAVERY.ItemMaker.MadeAisle", { name: item.name, where: aisleName(table) }];
  } else {
    item = await Item.create(doc);
    note = ["KNAVERY.ItemMaker.MadeWorld", { name: item.name }];
  }
  if (!item) return null;
  ui.notifications.info(note[0], { format: note[1] });
  item.sheet.render(true);
  return item;
};

/**
 * Where the item can go: the Items directory, the world's actors (characters first) and the
 * world's own aisle tables (a shipped aisle is read-only; the Marketplace Manager's Customize
 * makes the world copy). World tables only, read by name: no compendium document is loaded.
 */
const whereOptions = (selected = "world") => {
  const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);
  const actors = (type) => game.actors.filter((a) => a.type === type).sort(byName)
    .map((a) => ({ value: `actor:${a.id}`, label: a.name, selected: selected === `actor:${a.id}` }));
  const prefix = marketPrefix();
  const aisles = game.tables.filter((t) => t.name.startsWith(prefix)).sort(byName)
    .map((t) => ({ value: `aisle:${t.uuid}`, label: aisleName(t), selected: selected === `aisle:${t.uuid}` }));
  const groups = [
    { label: L("KNAVERY.ItemMaker.WhereCharacters"), options: actors("character") },
    { label: L("KNAVERY.ItemMaker.WhereNpcs"), options: actors("npc") },
    { label: L("KNAVERY.ItemMaker.WhereAisles"), options: aisles, empty: aisles.length ? "" : L("KNAVERY.ItemMaker.NoAisles") },
  ];
  const chosen = groups.some((g) => g.options.some((o) => o.selected));
  return { world: !chosen, groups: groups.filter((g) => g.options.length || g.empty) };
};

/* -------------------------------------------- */
/*  The window                                   */
/* -------------------------------------------- */

export class CreateItemWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    tag: "form",
    classes: ["knavery", "knavery-create-item"],
    window: { title: "KNAVERY.ItemMaker.Title", icon: "fas fa-box-open", resizable: false },
    position: { width: 540, height: "auto" },
    form: { handler: CreateItemWindow.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      rollName: CreateItemWindow.#onRollName,
      rollEffect: CreateItemWindow.#onRollEffect,
    },
  };

  static PARTS = { body: { template: `${SYS_PATH}/templates/apps/create-item.html` } };

  /** @param {object} [o] @param {string} [o.kind] the kind to start on */
  constructor({ kind = "weapon", ...options } = {}) {
    super(options);
    this.data = kindDefaults(kind);
    this.idp = foundry.utils.randomID(); // ids unique to this window
    this.busy = false;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const d = this.data;
    const K = KINDS[d.kind];
    const tables = rollTables(d);
    const b = bands();
    const hasQuality = usesQuality() && ["weapon", "armor"].includes(K.type);
    return Object.assign(context, {
      idp: this.idp,
      data: d,
      kinds: KIND_KEYS.map((key) => ({ key, icon: KINDS[key].icon, label: L(KINDS[key].label), hint: KINDS[key].hint, selected: key === d.kind })),
      is: {
        weapon: K.type === "weapon", armor: K.type === "armor", item: K.type === "item", gear: d.kind === "gear",
        potion: d.kind === "potion", relic: d.kind === "relic", spellbook: K.type === "spellbook", chaos: K.chaos === true,
      },
      namePlaceholder: L(K.label),
      hands: [1, 2].map((h) => ({ value: h, selected: Number(d.hands) === h })),
      armorTypes: ARMOR_TYPES.map((t) => ({ value: t, label: L(`KNAVERY.ArmorType.${t}`), selected: d.armorType === t })),
      badges: ITEM_KINDS.map((k) => ({ value: k, label: L(`KNAVERY.ItemKind.${k}`), selected: d.badge === k })),
      sources: GEAR_SOURCES.map((s) => ({ value: s, label: s, selected: d.source === s })),
      bands: BANDS.map((band, i) => ({ value: i, label: F("KNAVERY.ItemMaker.BandLabel", { band: L(band.label), cost: b[i] }), selected: b[i] === Number(d.cost) })),
      bandNone: !b.includes(Number(d.cost)),
      quality: hasQuality ? { value: d.qualityMax ?? "", fallback: defaultQualityMax(K.type, { armorType: d.armorType, points: d.points }) } : null,
      nameRoll: await rollState(tables.name, K.type === "spellbook" ? "first" : "all"),
      effectRoll: await rollState(tables.effect, "any"),
      where: whereOptions(d.where),
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // The part is replaced on every render, so the listener goes on it, not the form.
    this.element.querySelector(".kn-ci")?.addEventListener("change", (e) => this.#onChange(e));
  }

  /** Every field into the window's data (a blank quality means the item's default). */
  #read() {
    const o = new foundry.applications.ux.FormDataExtended(this.element).object;
    Object.assign(this.data, o);
    if ("qualityMax" in o) this.data.qualityMax = o.qualityMax === "" || o.qualityMax === null ? null : o.qualityMax;
    this.data.treasure = o.treasure === true;
  }

  /** A change of kind, reach, hands, armor type or price band re-fills the numbers; the name source redraws its Roll. */
  #onChange(event) {
    const field = event.target?.name;
    this.#read();
    const d = this.data;
    if (field === "kind") this.data = { ...kindDefaults(d.kind), name: d.name, description: d.description, where: d.where };
    else if (field === "attackType" || field === "hands") Object.assign(d, weaponLine(d.attackType, d.hands));
    else if (field === "armorType") Object.assign(d, armorLine(d.armorType), { qualityMax: null });
    else if (field === "band") {
      const cost = bands()[Number(event.target.value)];
      if (event.target.value !== "" && cost !== undefined) d.cost = cost;
    } else if (field !== "source") return;
    this.render();
  }

  async #roll(fn, apply) {
    if (this.busy) return;
    this.busy = true;
    try {
      this.#read();
      const r = await fn(this.data);
      if (!r) return;
      if (r.missing?.length) {
        ui.notifications.warn("KNAVERY.ItemMaker.RollMissing", { format: { tables: game.i18n.getListFormatter().format(r.missing) } });
        return;
      }
      apply(r);
      this.render();
    } finally {
      this.busy = false;
    }
  }

  static #onRollName() {
    return this.#roll(rollName, (r) => {
      this.data.name = r.name;
      this.data.formula = r.formula ?? "";
      if (r.treasure) this.data.treasure = true;
    });
  }

  static #onRollEffect() {
    return this.#roll(rollEffect, (r) => { this.data.description = r.text; });
  }

  /** Create (the footer's button, or Enter): the item is made where the select says, and the window closes. */
  static async #onSubmit() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.#read();
      const item = await createItem(this.data, this.data.where);
      if (item) await this.close();
    } finally {
      this.busy = false;
    }
  }
}

/** Open the Create Item window (GM only): one window, brought forward if it is open. */
export const openCreateItem = ({ kind } = {}) => {
  if (!game.user.isGM) {
    ui.notifications.warn("KNAVERY.Notify.GmOnly", { localize: true });
    return null;
  }
  const open = foundry.applications.instances.get(APP_ID);
  if (open) return open.render({ force: true });
  return new CreateItemWindow({ kind }).render({ force: true });
};
