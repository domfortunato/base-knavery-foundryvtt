/**
 * Character creation: one dialog that branches between a RANDOM character
 * (rolled the Knave way, at a level the player chooses within the GM's range)
 * and a BLANK sheet the player builds by hand with Char Gen Mode on.
 *
 * Generation, level by level:
 *   1. The player places 3 points in the abilities (more than one in a score
 *      is allowed), or lets 3d6 decide: each die adds +1 to the ability
 *      matching its face (1 STR … 6 CHA).
 *   2. For each level above 1: +1 to three different abilities, and reroll
 *      max HP with one d6 per level (no higher than before -> old max + 1).
 *   3. XP set to the chosen level's threshold.
 *   4. Two careers from the Careers table, with their starting items.
 *   5. 3d6 × 10 coins and the standard kit; one random spellbook per point of
 *      INT the character starts with (levels above the first add none).
 *   6. Name, traits and portrait from the tables and galleries.
 *
 * Every table is a shell until the GM fills it. A step whose table is empty is
 * skipped and listed on the summary card, never faked.
 */
import { builtInName } from "./names.js";
import {
  ABILITIES, ABILITY_MAX, CREATION_POINTS, FLAG_SCOPE, GEAR_1E_PACK, LEVELS, LOWEST_DIE_MAX, SETTINGS_NS, STARTING_COINS, SYS_PATH, TABLES,
} from "./config.js";
import { drawFrom, pickFromList, plainText, realResults, findTable, resultText, spellTableName } from "./compendium.js";
import { firstLevelHpFormula, randomAbilityPicks, rollLevelHp } from "./level-up.js";
import { levelLadder } from "./data-models.js";
import { randomPortraitPair } from "./art.js";
import { emit, onSocket } from "./socket.js";
import { mayEditCareers } from "./edit-gates.js";
import { traitShown } from "./settings.js";
import { abilityHint, creationAbilities, startingKit, usesCareers, usesPrices1e } from "./rules.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** A career's art: a tied scroll (user, 2026-11-14). Careers made earlier carry the shattered heart. */
export const CAREER_ICON = `${SYS_PATH}/icons/career.svg`;
const OLD_CAREER_ICON = `${SYS_PATH}/icons/background.svg`;

/** The active GM swaps the old career art for the scroll, on world and actor careers. */
export const updateCareerIcons = async () => {
  if (!game.user.isActiveGM) return;
  const stale = (i) => i.type === "career" && i.img === OLD_CAREER_ICON;
  const fix = (i) => ({ _id: i.id, img: CAREER_ICON });
  const world = game.items.filter(stale).map(fix);
  if (world.length) await Item.implementation.updateDocuments(world);
  for (const actor of game.actors) {
    const updates = actor.items.filter(stale).map(fix);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates, { knNoLog: true });
  }
};

/** A creation card, whispered to the GM and the owners: a title, its lines, and the dice behind them. */
export const postGenerationCard = (actor, title, notes, rolls = []) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  whisper: game.users.filter((u) => u.isGM || actor.testUserPermission(u, "OWNER")).map((u) => u.id),
  rolls,
  content: `<div class="knavery-roll-card kind-generation"><header class="card-title"><h3><i class="fas fa-dice-d6"></i> `
    + `${esc(title)}</h3></header><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`,
  flags: { [FLAG_SCOPE]: { generation: true } },
});

/** Standard kit every PC may take: looked up by name in the gear packs. */
const STANDARD_KIT = [
  { name: "Rations", quantity: 2 },
  { name: "Rope (50')", quantity: 1 },
  { name: "Torch", quantity: 2 },
];

/** Knave 1e's kit (p1): the weapon is the player's choice, the rest is rolled. */
const KNAVE_1E_KIT = [{ name: "Rations", quantity: 2 }];

/** Every weapon a new character may choose (Knave 1e kit): world items and the Item compendia, by name. */
/**
 * Item packs in lookup order: the world's price list first (Knave 1e's gear-1e, or the rest),
 * so a name both lists know ("Shield") resolves to the price list's item.
 */
const itemPacks = ({ only = false } = {}) => {
  const packs = game.packs.filter((p) => p.documentName === "Item");
  const mine = (p) => (p.collection === GEAR_1E_PACK) === usesPrices1e();
  return only ? packs.filter(mine) : [...packs.filter(mine), ...packs.filter((p) => !mine(p))];
};

export const weaponChoices = async () => {
  const seen = new Map();
  for (const i of game.items.filter((it) => it.type === "weapon")) seen.set(i.name, { name: i.name, img: i.img });
  // Only the price list's own weapons: a 1e world chooses a dagger or a sword, not "One-Handed Weapon".
  for (const pack of itemPacks({ only: true })) {
    for (const e of pack.index.filter((x) => x.type === "weapon")) if (!seen.has(e.name)) seen.set(e.name, { name: e.name, img: e.img });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const creationLevels = () => {
  const min = Number(game.settings.get(SETTINGS_NS, "min-creation-level")) || 1;
  const max = Math.max(min, Number(game.settings.get(SETTINGS_NS, "max-creation-level")) || LEVELS.length);
  return { min, max };
};

/* -------------------------------------------- */
/*  Item lookups                                 */
/* -------------------------------------------- */

/** Find an Item by name: world items first, then Item compendia. */
export const findItemByName = async (name, type = null) => {
  const lc = String(name).trim().toLowerCase();
  const match = (e) => e.name?.toLowerCase() === lc && (!type || e.type === type);
  const world = game.items.find(match);
  if (world) return world;
  for (const pack of itemPacks()) {
    const entry = pack.index.find(match);
    if (entry) return pack.getDocument(entry._id);
  }
  return null;
};

const itemData = (doc, overrides = {}) => {
  const data = doc.toObject();
  delete data._id;
  foundry.utils.mergeObject(data, overrides);
  // Where it came from, the way core's fromCompendium records it (v14 reads
  // `_stats.compendiumSource`; the old `flags.core.sourceId` is read by nothing).
  if (doc.pack) foundry.utils.setProperty(data, "_stats.compendiumSource", doc.uuid);
  return data;
};

/** A starting-item entry (a UUID or a name) to item data; unknown names become plain items. */
const resolveStartingItem = async (entry) => {
  const s = String(entry ?? "").trim();
  if (!s) return null;
  if (/^(Compendium|Item)\./.test(s)) {
    const doc = await fromUuid(s).catch(() => null);
    if (doc?.documentName === "Item") return itemData(doc);
  }
  const doc = await findItemByName(s);
  if (doc) return itemData(doc);
  return { name: s, type: "item", img: `${SYS_PATH}/icons/generic-item.svg`, system: { slots: 1, quantity: 1 } };
};

/* -------------------------------------------- */
/*  Careers                                      */
/* -------------------------------------------- */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || foundry.utils.randomID(6);

/**
 * Add a career Item to an actor. In Char Gen Mode its starting items come too,
 * and each feature field is seeded with its initial value.
 */
export const addCareer = async (actor, career, { grantItems = null, knNoLog = false } = {}) => {
  const data = career instanceof Item ? itemData(career) : foundry.utils.deepClone(career);
  data.system ??= {};
  data.system.key ||= slug(data.name);
  // `knNoLog` from generation, whose summary card already lists what it gave.
  const [created] = await actor.createEmbeddedDocuments("Item", [data], { knNoLog });
  const seed = {};
  for (const f of created.system.features ?? []) {
    if (!f.key) continue;
    const v = f.type === "number" || f.type === "track" ? Number(f.initial) || 0
      : f.type === "checkbox" ? f.initial === "true" : f.initial;
    seed[`system.features.${created.system.key}.${f.key}`] = v;
  }
  if (Object.keys(seed).length) await actor.update(seed, { knNoLog: true });
  const grant = grantItems ?? actor.system.generationEnabled === true;
  if (grant && created.system.startingItems?.length) {
    const items = (await Promise.all(created.system.startingItems.map(resolveStartingItem))).filter(Boolean);
    // Marked with the career and kept on their own rows (never stacked onto what
    // the Knave already carries), so changing the career takes back exactly these.
    for (const data of items) foundry.utils.setProperty(data, `flags.${FLAG_SCOPE}.fromCareer`, created.id);
    if (items.length) await actor.createEmbeddedDocuments("Item", items, { knNoLog });
  }
  return created;
};

/**
 * A Careers table result to a career. A result linked to a career Item uses
 * it; a text row reads "Name: item, item, item" (the format the importer
 * documents) and becomes a plain career with those starting items.
 */
export const careerFromResult = async (result, text) => {
  if (result?.documentUuid) {
    const doc = await fromUuid(result.documentUuid).catch(() => null);
    if (doc?.type === "career") return doc;
  }
  const [name, rest] = String(text).split(/:\s*/, 2);
  return {
    name: name.trim() || text,
    type: "career",
    img: CAREER_ICON,
    system: {
      startingItems: rest ? rest.split(/\s*,\s*/).filter(Boolean) : [],
      source: result?.parent?.name ?? "",
    },
  };
};

export const careerFromText = async (actor, result, text) => addCareer(actor, await careerFromResult(result, text));

/** A career from the Careers table whose name is not in `avoid`, or null. */
export const drawCareerExcept = async (avoid = []) => {
  for (let i = 0; i < 12; i++) {
    const r = await drawFrom(TABLES.careers, { warn: false });
    if (!r) return null;
    const c = await careerFromResult(r.result, r.text);
    if (!avoid.includes(c.name)) return c;
  }
  return null;
};

/** Remove a career, its feature values and the items it gave that the Knave still carries. */
export const removeCareer = async (actor, career) => {
  const given = actor.items.filter((i) => i.getFlag(FLAG_SCOPE, "fromCareer") === career.id).map((i) => i.id);
  const key = career.system.key;
  await actor.deleteEmbeddedDocuments("Item", [career.id, ...given]);
  if (key && actor.system.features?.[key] !== undefined) {
    await actor.update({ [`system.features.${key}`]: foundry.data.operators.ForcedDeletion.create() }, { knNoLog: true });
  }
};

/**
 * Swap a career for another, taking back the old one's items and giving the
 * new one's. Players may only while the character is level 1, in Char Gen Mode.
 */
export const replaceCareer = async (actor, old, replacement) => {
  if (!mayEditCareers(actor)) return ui.notifications.warn("KNAVERY.Notify.CareersLocked", { localize: true });
  if (!old || !replacement) return null;
  await removeCareer(actor, old);
  return addCareer(actor, replacement, { grantItems: true });
};

/** The pick-list for careers: career Items everywhere, plus Careers table rows. */
export const pickCareerItem = async (actor) => {
  const career = await chooseCareer();
  if (career) return addCareer(actor, career);
};

/** The career pick-list, returning the chosen career (an Item, or career data from a table row) without adding it. */
export const chooseCareer = async () => {
  const options = [];
  for (const i of game.items.filter((it) => it.type === "career")) {
    options.push({ value: i.uuid, label: i.name, img: i.img });
  }
  for (const pack of game.packs.filter((p) => p.documentName === "Item")) {
    const index = await pack.getIndex({ fields: ["type"] });
    for (const e of index.filter((x) => x.type === "career")) {
      options.push({ value: `Compendium.${pack.collection}.Item.${e._id}`, label: e.name, img: e.img, prefix: pack.title });
    }
  }
  const table = await findTable(TABLES.careers);
  for (const r of realResults(table)) {
    options.push({ value: `row:${r.id}`, label: plainText(resultText(r)), prefix: `${r.range[0]}` });
  }
  if (!options.length) return ui.notifications.warn("KNAVERY.Notify.NoCareers", { localize: true });
  const chosen = await pickFromList(options, { title: L("KNAVERY.PickCareer") });
  if (!chosen) return null;
  if (chosen.startsWith("row:")) {
    const r = table.results.get(chosen.slice(4));
    return careerFromResult(r, plainText(resultText(r)));
  }
  const doc = await fromUuid(chosen);
  return doc?.type === "career" ? doc : null;
};

/* -------------------------------------------- */
/*  Generation                                   */
/* -------------------------------------------- */

/**
 * A first name and a surname. The book builds a surname from two halves
 * ("Adder-" + "bald"): a Surnames draw ending in "-" is joined to one from
 * Surname Endings, or loses its hyphen when the world has no such table.
 * The system's own list (names.js) while the Names table is still an empty shell.
 */
export const rollFullName = async ({ warn = false } = {}) => {
  const first = await drawFrom(TABLES.namesA, { warn });
  if (!first) return builtInName();
  let last = (await drawFrom(TABLES.surnames, { warn: false }))?.text ?? null;
  if (last?.endsWith("-")) {
    const end = (await drawFrom(TABLES.surnameEndings, { warn: false }))?.text;
    last = end ? last.slice(0, -1) + end.replace(/^-/, "") : last.slice(0, -1);
  }
  return [first.text, last].filter(Boolean).join(" ");
};

/**
 * The starting-gear tables' words for items the 1e price list names otherwise (both Knave 1e, p2-p3).
 * A count is a bundle: five torches share a slot.
 */
export const GEAR_1E_ALIASES = {
  "Rope, 50ft": { name: "Rope (50 ft)" }, "Candles, 5": { name: "Candle (4 hours)", quantity: 5 },
  "Chain, 10ft": { name: "Chain (10 ft)" }, "Chalk, 10": { name: "Chalk (10 pieces)" }, "Lamp oil": { name: "Lamp Oil (4 hours)" },
  "Padlock": { name: "Padlock and Key" }, "Mirror": { name: "Mirror (small, silver)" }, "Pole, 10ft": { name: "Pole (10 ft)" },
  "Tent": { name: "Tent (personal)" }, "Spikes, 5": { name: "Spike (iron)", quantity: 5 }, "Torches, 5": { name: "Torch (1 hour)", quantity: 5 },
  "Grease": { name: "Black Grease" }, "Caltrops": { name: "Caltrops (bag)" }, "Fishing rod": { name: "Fishing Rod/Tackle" },
  "Marbles": { name: "Glass Marbles (bag)" }, "Glue": { name: "Glue (bottle)" }, "Tongs": { name: "Iron Tongs" },
  "Nails": { name: "Nails (12)" }, "Incense": { name: "Incense (packet)" }, "Sponge": { name: "Large Sponge" },
  "Bottle": { name: "Bottle/Vial" }, "Tar pot": { name: "Tar (pot)" }, "Twine": { name: "Twine (300 ft)" },
  "Blank book": { name: "Book (Blank)" }, "Cook pots": { name: "Cookpots" }, "Face paint": { name: "Face Paint/Makeup" },
  "Instrument": { name: "Musical Instrument" }, "Quill & Ink": { name: "Quill and Ink" },
};

/** Knave 1e armor, by its defense: 12/13/14 is 11 + 1/2/3, so 1/2/3 armor points (and as many slots). */
const KNAVE_1E_ARMOR = { Gambeson: 1, Brigandine: 2, Chain: 3 };

/**
 * The Knave 1e starting gear: armor, helmet and shield, two dungeoneering
 * items and one from each General Gear table. Items the gear packs know by
 * name (Gambeson, Helmet, Shield, Crowbar…) come from them; the rest are
 * plain one-slot items. Returns {items, names}.
 */
export const rollKnave1eGear = async () => {
  const T = TABLES.gear1e;
  const names = [];
  for (const t of [T.armor, T.helmets, T.dungeon, T.dungeon, T.general1, T.general2]) {
    const r = await drawFrom(t, { warn: false });
    if (!r) continue;
    if (r.text === "Helmet and Shield") names.push("Helmet", "Shield");
    else if (!["No armor", "None"].includes(r.text)) names.push(r.text);
  }
  const items = [];
  for (const name of names) {
    // On the 1e price list the gear comes from it (with its price and quality), by the list's own name.
    const alias = usesPrices1e() ? GEAR_1E_ALIASES[name] : null;
    const known = await findItemByName(alias?.name ?? name);
    if (known && alias?.quantity) items.push(itemData(known, { system: { quantity: alias.quantity, bundle: alias.quantity } }));
    else if (known) items.push(itemData(known));
    else if (KNAVE_1E_ARMOR[name]) {
      const n = KNAVE_1E_ARMOR[name];
      items.push({ name, type: "armor", img: `${SYS_PATH}/icons/armor.svg`, system: { points: n, slots: n, armorType: "other" } });
    } else items.push({ name, type: "item", img: `${SYS_PATH}/icons/generic-item.svg`, system: { slots: 1, quantity: 1 } });
  }
  return { items, names };
};

/** Every trait drawn from its table; a table still an empty shell leaves its trait out. */
export const rollTraits = async () => {
  const traits = {};
  for (const [key, table] of Object.entries(TABLES.traits)) {
    if (!traitShown(key)) continue; // Alignment and Background only while their switch is on
    const r = await drawFrom(table, { warn: false });
    if (r) traits[key] = r.text;
  }
  return traits;
};

/**
 * Knave 1e (p1): 3d6 for each ability in order, the lowest die its score. Returns
 * {values, rolls}: rolls holds each ability's three dice.
 */
export const rollLowestAbilities = async () => {
  const values = {};
  const rolls = {};
  for (const k of ABILITIES) {
    const roll = await new Roll("3d6").evaluate();
    rolls[k] = roll.dice[0].results.map((r) => r.result);
    values[k] = Math.min(...rolls[k]);
  }
  return { values, rolls, swap: null };
};

/**
 * A Knave 1e roll sent from a player's window: six rolls of three dice, and at most one swap
 * of two scores (p1). Returns it when the values follow from the dice, otherwise null.
 */
export const validRolled = (rolled) => {
  if (!rolled || typeof rolled !== "object") return null;
  const die = (d) => Number.isInteger(d) && d >= 1 && d <= LOWEST_DIE_MAX;
  const mins = {};
  for (const k of ABILITIES) {
    const r = rolled.rolls?.[k];
    if (!Array.isArray(r) || r.length !== 3 || !r.every(die)) return null;
    mins[k] = Math.min(...r);
  }
  const swap = Array.isArray(rolled.swap) && rolled.swap.length === 2 && rolled.swap[0] !== rolled.swap[1]
    && rolled.swap.every((k) => ABILITIES.includes(k)) ? [...rolled.swap] : null;
  if (swap) [mins[swap[0]], mins[swap[1]]] = [mins[swap[1]], mins[swap[0]]];
  if (!ABILITIES.every((k) => rolled.values?.[k] === mins[k])) return null;
  return { values: mins, rolls: Object.fromEntries(ABILITIES.map((k) => [k, [...rolled.rolls[k]]])), swap };
};

/** 3d6, each face raising its ability (Knave 2e). Returns {values, faces}. */
const rollAbilities = async () => {
  const roll = await new Roll("3d6").evaluate();
  const faces = roll.dice[0].results.map((r) => r.result);
  const values = Object.fromEntries(ABILITIES.map((k) => [k, 0]));
  for (const f of faces) values[ABILITIES[f - 1]] = Math.min(ABILITY_MAX, values[ABILITIES[f - 1]] + 1);
  return { values, faces, roll };
};

/**
 * Build a character's data at `level`. Pure data; nothing is written.
 * @returns {Promise<{system:object, careers:object[], items:object[], name:string, img:string, token:string, notes:string[]}>}
 */
export const buildCharacter = async ({ level = 1, abilities = null, rolled = null, weapon = null } = {}) => {
  const notes = [];
  const lowest = creationAbilities() === "lowest";
  const placed = lowest ? null : validPoints(abilities);
  let values;
  if (lowest) {
    const r = validRolled(rolled) ?? await rollLowestAbilities();
    values = { ...r.values };
    notes.push(F("KNAVERY.Gen.AbilityLowest", {
      list: ABILITIES.map((k) => `${L(`KNAVERY.AbilityShort.${k}`)} ${Math.min(...r.rolls[k])} (${r.rolls[k].join("·")})`).join(", "),
    }));
    if (r.swap) {
      notes.push(F("KNAVERY.Gen.AbilitySwapped", { a: L(`KNAVERY.AbilityShort.${r.swap[0]}`), b: L(`KNAVERY.AbilityShort.${r.swap[1]}`) }));
    }
  } else if (placed) {
    values = { ...placed };
    notes.push(F("KNAVERY.Gen.AbilityPoints", {
      list: ABILITIES.filter((k) => placed[k]).map((k) => `${L(`KNAVERY.AbilityShort.${k}`)} ${placed[k]}`).join(", "),
    }));
  } else {
    const rolled = await rollAbilities();
    values = rolled.values;
    notes.push(F("KNAVERY.Gen.AbilityRoll", { faces: rolled.faces.join(", ") }));
  }
  // One spellbook per point of INT the character STARTS with: a point of INT
  // gained at a later level brings no book. Knave 1e starts without one (p1).
  const kit = startingKit();
  const startingInt = kit === "knave1e" ? 0 : values.INT;

  const hpRoll = await new Roll(firstLevelHpFormula()).evaluate();
  let hpMax = hpRoll.total;
  notes.push(F("KNAVERY.Gen.HpRoll", { level: 1, rolled: hpRoll.total, max: hpMax }));
  for (let l = 2; l <= level; l++) {
    const picks = randomAbilityPicks(values);
    for (const k of picks) values[k] = Math.min(ABILITY_MAX, values[k] + 1);
    const hp = await rollLevelHp(l, hpMax);
    notes.push(F("KNAVERY.Gen.LevelStep", {
      level: l, abilities: picks.map((k) => L(`KNAVERY.AbilityShort.${k}`)).join(", "), rolled: hp.rolled, max: hp.max,
    }));
    hpMax = hp.max;
  }

  const careers = [];
  for (let i = 0; i < (usesCareers() ? 2 : 0); i++) {
    const r = await drawFrom(TABLES.careers, { warn: false });
    if (!r) { notes.push(L("KNAVERY.Gen.NoCareerTable")); break; }
    careers.push(await careerFromResult(r.result, r.text));
  }

  const items = [];
  // Knave 1e (p1): two days of rations and a weapon of the player's choice, then the gear tables.
  for (const k of kit === "knave1e" ? KNAVE_1E_KIT : STANDARD_KIT) {
    const doc = await findItemByName(k.name);
    if (doc) items.push(itemData(doc, { system: { quantity: k.quantity } }));
  }
  const spellTable = spellTableName();
  for (let i = 0; i < startingInt; i++) {
    const r = await drawFrom(spellTable, { warn: false });
    if (!r) { notes.push(L("KNAVERY.Gen.NoSpellTable")); break; }
    const linked = r.result.documentUuid ? await fromUuid(r.result.documentUuid).catch(() => null) : null;
    // A row built from the rulebook carries the spell's effect as its description.
    items.push(linked?.type === "spellbook" ? itemData(linked)
      : {
        name: r.text, type: "spellbook", img: `${SYS_PATH}/icons/spellbook.svg`,
        system: { slots: 1, description: r.result?.description ?? "" },
      });
  }

  if (kit === "knave1e") {
    const choices = await weaponChoices();
    const chosen = choices.find((w) => w.name === weapon);
    const pick = chosen ?? choices[Math.floor(Math.random() * choices.length)];
    const doc = pick ? await findItemByName(pick.name, "weapon") : null;
    if (doc) {
      items.push(itemData(doc));
      notes.push(F(chosen ? "KNAVERY.Gen.WeaponChosen" : "KNAVERY.Gen.WeaponRandom", { name: doc.name }));
    }
  }
  if (kit === "knave1e" || kit === "careers-1e-gear") {
    const gear = await rollKnave1eGear();
    items.push(...gear.items);
    if (gear.names.length) notes.push(F("KNAVERY.Gen.Knave1eGear", { list: gear.names.join(", ") }));
  }

  // A Knave 1e kit is rolled, not bought: no coins.
  const coins = kit === "knave1e" ? 0 : (await new Roll(STARTING_COINS).evaluate()).total;
  const name = await rollFullName();

  const traits = await rollTraits();
  const art = await randomPortraitPair("person");

  return {
    name,
    img: art?.img ?? CONST.DEFAULT_TOKEN,
    token: art?.token ?? art?.img ?? null,
    system: {
      abilities: Object.fromEntries(ABILITIES.map((k) => [k, { value: values[k] }])),
      hp: { value: hpMax, max: hpMax },
      level,
      xp: levelLadder().find((r) => r.level === level)?.xp ?? 0,
      coins,
      traits,
      generationEnabled: true,
    },
    careers,
    items,
    notes,
  };
};

/** Write a built character onto an actor (replacing inventory and careers). */
const applyBuilt = async (actor, built) => {
  const ids = actor.items.map((i) => i.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids, { knNoLog: true });
  await actor.update({
    name: built.name,
    img: built.img,
    "prototypeToken.name": built.name,
    "prototypeToken.texture.src": built.token ?? built.img,
    system: {
      ...built.system,
      wounds: 0,
      spellsCastToday: 0,
      acOverride: null,
      features: foundry.data.operators.ForcedReplacement.create({}),
    },
  }, { knNoLog: true, knCreation: true });
  for (const c of built.careers) await addCareer(actor, c, { grantItems: true, knNoLog: true });
  if (built.items.length) await actor.addItems(built.items, { knNoLog: true });
  // Knave 2e (p4): a quiver of 20 arrows comes with a missile weapon.
  if (usesCareers() && actor.items.some((i) => i.type === "weapon" && i.system.attackType === "ranged")
    && !actor.items.some((i) => /\barrows?\b/i.test(i.name))) {
    const arrows = await findItemByName("Arrows");
    if (arrows) await actor.addItems([itemData(arrows, { system: { quantity: 20 } })], { knNoLog: true });
  }
  await postGenerationCard(actor, F("KNAVERY.Gen.Summary", { name: built.name, level: built.system.level }), built.notes);
};

/** Re-roll an existing character in place (title-bar Roll Character). */
export const regenerateCharacter = async (actor) => {
  if (actor.type !== "character") return ui.notifications.info("KNAVERY.Notify.NpcRollManual", { localize: true });
  const { min, max } = creationLevels();
  const chosen = await promptLevel({ min, max, initial: Math.max(min, actor.system.level) });
  if (!chosen) return;
  const { level } = chosen;
  // The dice decide unless the player asked to place the points.
  const points = chosen.place && creationAbilities() !== "lowest" ? await promptAbilityPoints() : "dice";
  if (!points) return;
  const extras = await promptKnave1eChoices();
  if (!extras) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    classes: ["knavery"],
    window: { title: L("KNAVERY.RollCharacter") },
    content: `<p>${esc(F("KNAVERY.Gen.RerollConfirm", { name: actor.name }))}</p>`,
    rejectClose: false,
  });
  if (!ok) return;
  await applyBuilt(actor, await buildCharacter({ level, abilities: points === "dice" ? null : points, ...extras }));
};

/** Placed points, if they are whole numbers from 0 to 3 totalling exactly 3; otherwise null. */
export const validPoints = (abilities) => {
  if (!abilities || typeof abilities !== "object") return null;
  const out = {};
  let total = 0;
  for (const k of ABILITIES) {
    const v = Number(abilities[k] ?? 0);
    if (!Number.isInteger(v) || v < 0 || v > CREATION_POINTS) return null;
    out[k] = v;
    total += v;
  }
  return total === CREATION_POINTS ? out : null;
};

/**
 * Where a new character's 3 ability points go: a stepper per ability (more
 * than one point in a score is allowed), or the dice. Resolves to the
 * placed points, "dice" for 3d6, or null when the window is closed.
 */
export const promptAbilityPoints = async () => {
  const rows = ABILITIES.map((k) => `<div class="kn-points-row" data-ability="${k}">`
    + `<span class="kn-points-name"><strong>${esc(L(`KNAVERY.Ability.${k}`))}</strong>`
    + ` <span class="kn-points-hint">${esc(abilityHint(k))}</span></span>`
    + `<button type="button" class="kn-points-step" data-delta="-1" aria-label="${esc(F("KNAVERY.Gen.PointsLess", { name: L(`KNAVERY.Ability.${k}`) }))}"><i class="fas fa-minus" inert></i></button>`
    + `<input type="number" name="${k}" value="0" readonly tabindex="-1" />`
    + `<button type="button" class="kn-points-step" data-delta="1" aria-label="${esc(F("KNAVERY.Gen.PointsMore", { name: L(`KNAVERY.Ability.${k}`) }))}"><i class="fas fa-plus" inert></i></button>`
    + "</div>").join("");
  const content = `<div class="kn-points"><p>${esc(F("KNAVERY.Gen.PointsBody", { n: CREATION_POINTS }))}</p>${rows}`
    + "<p class=\"kn-points-left\"></p></div>";
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: L("KNAVERY.Gen.PointsTitle"), icon: "fas fa-dice-d6" },
    classes: ["knavery", "knavery-points"],
    position: { width: 480 },
    content,
    render: (_e, dialog) => {
      const root = dialog.element;
      const inputs = [...root.querySelectorAll(".kn-points-row input")];
      const sync = () => {
        const used = inputs.reduce((n, i) => n + Number(i.value), 0);
        root.querySelector(".kn-points-left").textContent = F("KNAVERY.Gen.PointsLeft", { n: CREATION_POINTS - used });
        for (const row of root.querySelectorAll(".kn-points-row")) {
          const v = Number(row.querySelector("input").value);
          row.querySelector('[data-delta="-1"]').disabled = v <= 0;
          row.querySelector('[data-delta="1"]').disabled = used >= CREATION_POINTS || v >= ABILITY_MAX;
        }
        const assign = root.querySelector('button[data-action="assign"]');
        if (assign) assign.disabled = used !== CREATION_POINTS;
      };
      for (const b of root.querySelectorAll(".kn-points-step")) {
        b.addEventListener("click", () => {
          const input = b.closest(".kn-points-row").querySelector("input");
          input.value = String(Math.max(0, Number(input.value) + Number(b.dataset.delta)));
          sync();
        });
      }
      sync();
    },
    buttons: [
      // A plain button: Enter submits through the first submit button, which must be Assign.
      { action: "dice", type: "button", label: "KNAVERY.Gen.PointsDice", icon: "fas fa-dice", callback: () => "dice" },
      {
        action: "assign", label: "KNAVERY.Gen.PointsAssign", icon: "fas fa-check", default: true,
        callback: (_e, b) => validPoints(Object.fromEntries(ABILITIES.map((k) => [k, Number(b.form.elements[k].value) || 0]))) || false,
      },
    ],
    rejectClose: false,
  });
  return result || null;
};

/**
 * Knave 1e's choices at creation, asked in the player's window: the six rolls with an optional
 * swap of two scores (p1), and the weapon of their choice. Resolves to {rolled, weapon} (either
 * null when its rule is off), or null when a window is closed.
 */
export const promptKnave1eChoices = async () => {
  const out = { rolled: null, weapon: null };
  if (creationAbilities() === "lowest") {
    out.rolled = await promptSwap(await rollLowestAbilities());
    if (!out.rolled) return null;
  }
  if (startingKit() === "knave1e") {
    const weapons = await weaponChoices();
    if (weapons.length) {
      out.weapon = await promptWeapon(weapons);
      if (!out.weapon) return null;
    }
  }
  return out;
};

/** Show the six rolls; the player may swap two scores (p1). Resolves to the roll, swapped or not. */
export const promptSwap = async (rolled) => {
  const idp = foundry.utils.randomID();
  const opts = `<option value="">—</option>${ABILITIES.map((k) => `<option value="${k}">${esc(L(`KNAVERY.Ability.${k}`))}</option>`).join("")}`;
  const rows = ABILITIES.map((k) => `<li class="kn-lowest-row" data-ability="${k}"><strong>${esc(L(`KNAVERY.Ability.${k}`))}</strong>`
    + ` <span class="kn-lowest-score">${rolled.values[k]}</span> <span class="kn-lowest-dice">(${rolled.rolls[k].join(", ")})</span></li>`).join("");
  const content = `<p>${esc(L("KNAVERY.Gen.LowestBody"))}</p><ul class="kn-lowest">${rows}</ul>`
    + `<div class="form-group"><label for="kn-swap-a-${idp}">${esc(L("KNAVERY.Gen.SwapLabel"))}</label><div class="form-fields">`
    + `<select id="kn-swap-a-${idp}" name="a">${opts}</select><span>⇄</span><select name="b" aria-label="${esc(L("KNAVERY.Gen.SwapWith"))}">${opts}</select></div></div>`;
  return foundry.applications.api.DialogV2.prompt({
    classes: ["knavery", "knavery-lowest"],
    window: { title: L("KNAVERY.Gen.LowestTitle"), icon: "fas fa-dice" },
    position: { width: 420 },
    content,
    ok: {
      label: "KNAVERY.Gen.LowestKeep", icon: "fas fa-check",
      callback: (_e, b) => {
        const a = b.form.elements.a.value;
        const c = b.form.elements.b.value;
        if (!a || !c || a === c) return rolled;
        const values = { ...rolled.values, [a]: rolled.values[c], [c]: rolled.values[a] };
        return { ...rolled, values, swap: [a, c] };
      },
    },
    rejectClose: false,
  });
};

/** The weapon a Knave 1e character starts with: the player's choice (p1). */
export const promptWeapon = async (weapons) => {
  const idp = foundry.utils.randomID();
  const content = `<div class="form-group"><label for="kn-weapon-${idp}">${esc(L("KNAVERY.Gen.WeaponLabel"))}</label>`
    + `<div class="form-fields"><select id="kn-weapon-${idp}" name="weapon">${weapons.map((w) => `<option value="${esc(w.name)}">${esc(w.name)}</option>`).join("")}</select></div></div>`;
  return foundry.applications.api.DialogV2.prompt({
    classes: ["knavery", "knavery-weapon"],
    window: { title: L("KNAVERY.Gen.WeaponTitle"), icon: "fas fa-sword" },
    content,
    ok: { label: "KNAVERY.Gen.WeaponTake", icon: "fas fa-check", callback: (_e, b) => b.form.elements.weapon.value },
    rejectClose: false,
  });
};

const promptLevel = ({ min, max, initial }) => {
  const idp = foundry.utils.randomID(); // ids unique to this window
  return foundry.applications.api.DialogV2.prompt({
  classes: ["knavery"],
  window: { title: L("KNAVERY.Gen.ChooseLevel") },
  content: `<div class="form-group"><label>${L("KNAVERY.Level")}</label><select name="level">${Array.from(
    { length: max - min + 1 }, (_, i) => min + i).map((l) => `<option value="${l}"${l === initial ? " selected" : ""}>${l} — ${esc(L(`KNAVERY.LevelTitle.${l}`))}</option>`).join("")}</select></div>`
    + (creationAbilities() === "lowest" ? "" : `<div class="form-group"><label for="kn-level-place-${idp}">${esc(L("KNAVERY.Gen.PlacePoints"))}</label>`
    + `<div class="form-fields"><input type="checkbox" id="kn-level-place-${idp}" name="place" /></div></div>`),
  ok: { callback: (_e, b) => ({ level: Number(b.form.elements.level.value), place: !!b.form.elements.place?.checked }) },
  rejectClose: false,
  });
};

/* -------------------------------------------- */
/*  The creation dialog                          */
/* -------------------------------------------- */

/** The Create Character button: Random or Blank, and a level for Random. */
export const createCharacterInteractive = async () => {
  if (!game.user.isGM && !game.settings.get(SETTINGS_NS, "allow-player-generate")) {
    return ui.notifications.warn("KNAVERY.Notify.CreationClosed", { localize: true });
  }
  const { min, max } = creationLevels();
  const content = await foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/dialog/create-character.html`, {
    idp: foundry.utils.randomID(), // ids unique to this window
    levels: Array.from({ length: max - min + 1 }, (_, i) => ({ level: min + i, title: L(`KNAVERY.LevelTitle.${min + i}`) })),
    min,
    // Knave 1e rolls every score: there are no points to place.
    placeAllowed: creationAbilities() !== "lowest",
  });
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: L("KNAVERY.CreateCharacter"), icon: "fas fa-user-plus" },
    classes: ["knavery", "knavery-create"],
    position: { width: 480 },
    content,
    // Each choice is a big tile with its own one-line description (core escapes labels, so it goes in here).
    render: (_e, dialog) => {
      for (const [action, key] of [["random", "KNAVERY.Gen.RandomHint"], ["blank", "KNAVERY.Gen.BlankHint"]]) {
        const button = dialog.element.querySelector(`.form-footer button[data-action="${action}"]`);
        if (!button || button.querySelector(".kn-create-sub")) continue;
        const sub = document.createElement("span");
        sub.className = "kn-create-sub";
        sub.textContent = L(key);
        button.append(sub);
      }
    },
    buttons: [
      {
        action: "random", label: "KNAVERY.Gen.Random", icon: "fas fa-dice-d6", default: true,
        callback: (_e, b) => ({
          mode: "random", level: Number(b.form.elements.level.value) || min, name: b.form.elements.name.value.trim(),
          place: !!b.form.elements.place?.checked,
        }),
      },
      // A blank sheet is the Game Master's tool (user ruling 2026-11-14).
      ...(game.user.isGM ? [{
        action: "blank", label: "KNAVERY.Gen.Blank", icon: "fas fa-file-lines",
        callback: (_e, b) => ({ mode: "blank", level: Number(b.form.elements.level.value) || min, name: b.form.elements.name.value.trim() }),
      }] : []),
    ],
    rejectClose: false,
  });
  if (!choice) return null;
  choice.level = Math.min(max, Math.max(min, choice.level));
  // Random rolls the abilities (3d6) unless the player asked to place the 3 points.
  if (choice.mode === "random" && choice.place && creationAbilities() !== "lowest") {
    const points = await promptAbilityPoints();
    if (!points) return null;
    choice.abilities = points === "dice" ? null : points;
  }
  if (choice.mode === "random") {
    const extras = await promptKnave1eChoices();
    if (!extras) return null;
    Object.assign(choice, extras);
  }
  if (!game.user.can("ACTOR_CREATE")) {
    if (!game.users.activeGM) return ui.notifications.warn("KNAVERY.Notify.NoGmForCreation", { localize: true });
    emit("generatePC", {
      mode: choice.mode, level: choice.level, name: choice.name.slice(0, 80), abilities: choice.abilities ?? null,
      rolled: choice.rolled ?? null, weapon: choice.weapon ?? null,
    });
    return ui.notifications.info("KNAVERY.Notify.CreationRequested", { localize: true });
  }
  return createCharacter({ ...choice, owner: game.user.id });
};

/** Create (and, if random, generate) a character owned by `owner`. */
export const createCharacter = async ({ mode = "random", level = 1, name = "", owner = null, abilities = null, rolled = null, weapon = null } = {}) => {
  const ownership = { default: 0 };
  if (owner && !game.users.get(owner)?.isGM) ownership[owner] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const actor = await Actor.create({
    name: name || L("KNAVERY.DefaultCharacterName"),
    type: "character",
    ownership,
    system: { level, xp: levelLadder().find((r) => r.level === level)?.xp ?? 0, generationEnabled: true, hp: { value: 1, max: 1 } },
  });
  if (!actor) return null;
  if (mode === "random") {
    const built = await buildCharacter({ level, abilities, rolled, weapon });
    if (name) built.name = name;
    await applyBuilt(actor, built);
  } else {
    // A blank sheet keeps Foundry's blank portrait; its traits start rolled, to change in Char Gen Mode.
    const traits = await rollTraits();
    if (Object.keys(traits).length) await actor.update({ "system.traits": traits }, { knNoLog: true });
  }
  const user = game.users.get(owner);
  if (user && !user.isGM && !user.character) await user.update({ character: actor.id });
  if (!owner || owner === game.user.id) actor.sheet.render(true);
  return actor;
};

/** Players whose creation request this GM client is working on (a doubled click mints one, not two). */
const generationInFlight = new Set();

/** GM side of a player's creation request. The player is always answered. */
export const registerCreationSocket = () => {
  onSocket("generatePC", async (msg, senderId) => {
    if (!game.user.isActiveGM) return;
    const user = game.users.get(senderId);
    if (!user || generationInFlight.has(senderId)) return;
    const answer = (data) => emit("pcGenerated", data, { recipients: [senderId] });
    if (!game.settings.get(SETTINGS_NS, "allow-player-generate")) return answer({ refused: true });
    generationInFlight.add(senderId);
    try {
      const { min, max } = creationLevels();
      const level = Math.min(max, Math.max(min, Number(msg.level) || min));
      const actor = await createCharacter({
        // Players get random characters only: Blank Sheet is the GM's (2026-11-14).
        mode: "random", level, name: String(msg.name ?? "").slice(0, 80), owner: senderId,
        abilities: validPoints(msg.abilities), rolled: validRolled(msg.rolled),
        weapon: typeof msg.weapon === "string" ? msg.weapon.slice(0, 120) : null,
      });
      answer(actor ? { actorId: actor.id } : { failed: true });
    } catch (err) {
      console.error("Base Knavery | creating a character for a player failed", err);
      answer({ failed: true });
    } finally {
      generationInFlight.delete(senderId);
    }
  });
  onSocket("pcGenerated", (msg, senderId) => {
    if (!game.users.get(senderId)?.isGM) return;
    if (msg.refused) return ui.notifications.warn("KNAVERY.Notify.CreationClosed", { localize: true });
    if (msg.failed) return ui.notifications.error("KNAVERY.Notify.CreationFailed", { localize: true });
    game.actors.get(msg.actorId)?.sheet.render(true);
  });
};
