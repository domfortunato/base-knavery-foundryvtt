/**
 * Character creation: one dialog that branches between a RANDOM character
 * (rolled the Knave way, at a level the player chooses within the GM's range)
 * and a BLANK sheet the player builds by hand with Character Creation Mode on.
 *
 * Generation, level by level:
 *   1. 3d6: each die adds +1 to the ability matching its face (1 STR … 6 CHA).
 *   2. For each level above 1: +1 to three different abilities, and reroll
 *      max HP with one d6 per level (no higher than before -> old max + 1).
 *   3. XP set to the chosen level's threshold.
 *   4. Two careers from the Careers table, with their starting items.
 *   5. 3d6 × 10 coins and the standard kit; one random spellbook per INT.
 *   6. Name, traits and portrait from the tables and galleries.
 *
 * Every table is a shell until the GM fills it. A step whose table is empty is
 * skipped and listed on the summary card, never faked.
 */
import {
  ABILITIES, ABILITY_MAX, FLAG_SCOPE, LEVELS, SETTINGS_NS, STARTING_COINS, SYS_PATH, TABLES,
} from "./config.js";
import { drawFrom, pickFromList, plainText, realResults, findTable, resultText } from "./compendium.js";
import { randomAbilityPicks, rollLevelHp } from "./level-up.js";
import { randomPortraitPair, pairedTokenFor } from "./art.js";
import { emit, onSocket } from "./socket.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Standard kit every PC may take: looked up by name in the gear packs. */
const STANDARD_KIT = [
  { name: "Rations", quantity: 2 },
  { name: "Rope (50')", quantity: 1 },
  { name: "Torch", quantity: 2 },
];

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
  for (const pack of game.packs.filter((p) => p.documentName === "Item")) {
    const entry = pack.index.find(match);
    if (entry) return pack.getDocument(entry._id);
  }
  return null;
};

const itemData = (doc, overrides = {}) => {
  const data = doc.toObject();
  delete data._id;
  foundry.utils.mergeObject(data, overrides);
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { core: { sourceId: doc.uuid } });
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
 * Add a career Item to an actor. In creation mode its starting items come too,
 * and each feature field is seeded with its initial value.
 */
export const addCareer = async (actor, career, { grantItems = null } = {}) => {
  const data = career instanceof Item ? itemData(career) : foundry.utils.deepClone(career);
  data.system ??= {};
  data.system.key ||= slug(data.name);
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
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
    if (items.length) await actor.createEmbeddedDocuments("Item", items);
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
    img: `${SYS_PATH}/icons/background.svg`,
    system: {
      startingItems: rest ? rest.split(/\s*,\s*/).filter(Boolean) : [],
      source: result?.parent?.name ?? "",
    },
  };
};

export const careerFromText = async (actor, result, text) => addCareer(actor, await careerFromResult(result, text));

/** The pick-list for careers: career Items everywhere, plus Careers table rows. */
export const pickCareerItem = async (actor) => {
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
  if (!chosen) return;
  if (chosen.startsWith("row:")) {
    const r = table.results.get(chosen.slice(4));
    return careerFromText(actor, r, plainText(resultText(r)));
  }
  const doc = await fromUuid(chosen);
  if (doc) return addCareer(actor, doc);
};

/* -------------------------------------------- */
/*  Generation                                   */
/* -------------------------------------------- */

/** 3d6, each face raising its ability. Returns {values, faces}. */
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
export const buildCharacter = async ({ level = 1 } = {}) => {
  const notes = [];
  const { values, faces } = await rollAbilities();
  notes.push(F("KNAVERY.Gen.AbilityRoll", { faces: faces.join(", ") }));

  const hpRoll = await new Roll("1d6").evaluate();
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
  for (let i = 0; i < 2; i++) {
    const r = await drawFrom(TABLES.careers, { warn: false });
    if (!r) { notes.push(L("KNAVERY.Gen.NoCareerTable")); break; }
    careers.push(await careerFromResult(r.result, r.text));
  }

  const items = [];
  for (const k of STANDARD_KIT) {
    const doc = await findItemByName(k.name);
    if (doc) items.push(itemData(doc, { system: { quantity: k.quantity } }));
  }
  for (let i = 0; i < values.INT; i++) {
    const r = await drawFrom(TABLES.spells, { warn: false });
    if (!r) { if (values.INT) notes.push(L("KNAVERY.Gen.NoSpellTable")); break; }
    const linked = r.result.documentUuid ? await fromUuid(r.result.documentUuid).catch(() => null) : null;
    items.push(linked?.type === "spellbook" ? itemData(linked)
      : { name: r.text, type: "spellbook", img: `${SYS_PATH}/icons/spellbook.svg`, system: { slots: 1 } });
  }

  const coins = (await new Roll(STARTING_COINS).evaluate()).total;
  const first = await drawFrom(TABLES.namesA, { warn: false });
  const last = first ? await drawFrom(TABLES.surnames, { warn: false }) : null;
  const name = first ? [first.text, last?.text].filter(Boolean).join(" ") : L("KNAVERY.DefaultCharacterName");
  if (!first) notes.push(L("KNAVERY.Gen.NoNameTable"));

  const traits = {};
  for (const [key, table] of Object.entries(TABLES.traits)) {
    const r = await drawFrom(table, { warn: false });
    if (r) traits[key] = r.text;
  }
  const art = await randomPortraitPair("person");

  return {
    name,
    img: art?.img ?? `${SYS_PATH}/icons/background.svg`,
    token: art?.token ?? art?.img ?? null,
    system: {
      abilities: Object.fromEntries(ABILITIES.map((k) => [k, { value: values[k] }])),
      hp: { value: hpMax, max: hpMax },
      level,
      xp: LEVELS.find((r) => r.level === level)?.xp ?? 0,
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
  }, { knNoLog: true });
  for (const c of built.careers) await addCareer(actor, c, { grantItems: true });
  if (built.items.length) await actor.createEmbeddedDocuments("Item", built.items, { knNoLog: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter((u) => u.isGM || actor.testUserPermission(u, "OWNER")).map((u) => u.id),
    content: `<div class="knavery-roll-card kind-generation"><header class="card-title"><h3><i class="fas fa-dice-d6"></i> `
      + `${esc(F("KNAVERY.Gen.Summary", { name: built.name, level: built.system.level }))}</h3></header>`
      + `<ul>${built.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`,
    flags: { [FLAG_SCOPE]: { generation: true } },
  });
};

/** Re-roll an existing character in place (title-bar Roll Character). */
export const regenerateCharacter = async (actor) => {
  if (actor.type !== "character") return ui.notifications.info("KNAVERY.Notify.NpcRollManual", { localize: true });
  const { min, max } = creationLevels();
  const level = await promptLevel({ min, max, initial: Math.max(min, actor.system.level) });
  if (!level) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("KNAVERY.RollCharacter") },
    content: `<p>${esc(F("KNAVERY.Gen.RerollConfirm", { name: actor.name }))}</p>`,
    rejectClose: false,
  });
  if (!ok) return;
  await applyBuilt(actor, await buildCharacter({ level }));
};

const promptLevel = ({ min, max, initial }) => foundry.applications.api.DialogV2.prompt({
  window: { title: L("KNAVERY.Gen.ChooseLevel") },
  content: `<div class="form-group"><label>${L("KNAVERY.Level")}</label><select name="level">${Array.from(
    { length: max - min + 1 }, (_, i) => min + i).map((l) => `<option value="${l}"${l === initial ? " selected" : ""}>${l} — ${esc(L(`KNAVERY.LevelTitle.${l}`))}</option>`).join("")}</select></div>`,
  ok: { callback: (_e, b) => Number(b.form.elements.level.value) },
  rejectClose: false,
});

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
    levels: Array.from({ length: max - min + 1 }, (_, i) => ({ level: min + i, title: L(`KNAVERY.LevelTitle.${min + i}`) })),
    min,
  });
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: L("KNAVERY.CreateCharacter"), icon: "fas fa-user-plus" },
    classes: ["knavery", "knavery-create"],
    position: { width: 440 },
    content,
    buttons: [
      {
        action: "random", label: "KNAVERY.Gen.Random", icon: "fas fa-dice-d6", default: true,
        callback: (_e, b) => ({ mode: "random", level: Number(b.form.elements.level.value) || min, name: b.form.elements.name.value.trim() }),
      },
      {
        action: "blank", label: "KNAVERY.Gen.Blank", icon: "fas fa-file",
        callback: (_e, b) => ({ mode: "blank", level: Number(b.form.elements.level.value) || min, name: b.form.elements.name.value.trim() }),
      },
    ],
    rejectClose: false,
  });
  if (!choice) return null;
  choice.level = Math.min(max, Math.max(min, choice.level));
  if (!game.user.can("ACTOR_CREATE")) {
    if (!game.users.activeGM) return ui.notifications.warn("KNAVERY.Notify.NoGmForCreation", { localize: true });
    emit("generatePC", { mode: choice.mode, level: choice.level, name: choice.name.slice(0, 80) });
    return ui.notifications.info("KNAVERY.Notify.CreationRequested", { localize: true });
  }
  return createCharacter({ ...choice, owner: game.user.id });
};

/** Create (and, if random, generate) a character owned by `owner`. */
export const createCharacter = async ({ mode = "random", level = 1, name = "", owner = null } = {}) => {
  const ownership = { default: 0 };
  if (owner && !game.users.get(owner)?.isGM) ownership[owner] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const actor = await Actor.create({
    name: name || L("KNAVERY.DefaultCharacterName"),
    type: "character",
    ownership,
    system: { level, xp: LEVELS.find((r) => r.level === level)?.xp ?? 0, generationEnabled: true, hp: { value: 1, max: 1 } },
  });
  if (!actor) return null;
  if (mode === "random") {
    const built = await buildCharacter({ level });
    if (name) built.name = name;
    await applyBuilt(actor, built);
  } else {
    const art = await randomPortraitPair("person");
    if (art) await actor.update({ img: art.img, "prototypeToken.texture.src": (await pairedTokenFor(art.img)) ?? art.img }, { knNoLog: true });
  }
  const user = game.users.get(owner);
  if (user && !user.isGM && !user.character) await user.update({ character: actor.id });
  if (!owner || owner === game.user.id) actor.sheet.render(true);
  return actor;
};

/** GM side of a player's creation request. */
export const registerCreationSocket = () => {
  onSocket("generatePC", async (msg, senderId) => {
    if (!game.user.isActiveGM) return;
    const user = game.users.get(senderId);
    if (!user || !game.settings.get(SETTINGS_NS, "allow-player-generate")) return;
    const { min, max } = creationLevels();
    const level = Math.min(max, Math.max(min, Number(msg.level) || min));
    const actor = await createCharacter({
      mode: msg.mode === "blank" ? "blank" : "random", level, name: String(msg.name ?? "").slice(0, 80), owner: senderId,
    });
    if (actor) emit("pcGenerated", { actorId: actor.id }, { recipients: [senderId] });
  });
  onSocket("pcGenerated", (msg, senderId) => {
    if (!game.users.get(senderId)?.isGM) return;
    game.actors.get(msg.actorId)?.sheet.render(true);
  });
};
