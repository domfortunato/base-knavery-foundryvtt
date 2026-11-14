/**
 * The Create NPC window (GM only, user ruling 2026-11-14): a monster from the
 * bestiary, a person met on the road, or a hireling, mercenary or expert.
 *
 * Numbers are the book's mechanics:
 *   monsters (p67)   HP = level × 4, or level d8s
 *   hirelings (p59)  hireling 300c: AC 11, HP 3, LVL 1, punch d2, morale 4
 *                    mercenary 600c: AC 15, HP 3, LVL 1, weapon d6, morale 8
 *                    expert 600c / 1200c / 2400c: AC 11, HP 3, LVL 1, punch d2, morale 7
 *                    all with 10 item slots
 * A person takes the hireling's line (AC 11, HP 3, LVL 1) with the default morale.
 * On Knave 1e's price list (rule `price-list`) the hirelings are 1e's henchmen (p3), with daily
 * wages in copper on the line of the 2e hireling nearest each (config.js HENCHMEN_1E).
 */
import { HENCHMEN_1E, SYS_PATH } from "./config.js";
import { usesPrices1e } from "./rules.js";
import { randomPortraitPair, setActorArt } from "./art.js";
import { rollFullName, rollTraits } from "./character-generator.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const MONSTER_PACK = "base-knavery.monsters";

/** The book's hireling lines (p59). */
export const HIRELINGS = {
  hireling: { armorClass: 11, morale: 4, wage: 300, weapon: "punch" },
  mercenary: { armorClass: 15, morale: 8, wage: 600, weapon: "weapon" },
  expertCommon: { armorClass: 11, morale: 7, wage: 600, weapon: "punch" },
  expertUncommon: { armorClass: 11, morale: 7, wage: 1200, weapon: "punch" },
  expertRare: { armorClass: 11, morale: 7, wage: 2400, weapon: "punch" },
};

/** The hirelings Create NPC offers: {key: {line, wage, period, label}}. */
export const hirelingChoices = () => (usesPrices1e()
  ? Object.fromEntries(Object.entries(HENCHMEN_1E).map(([key, h]) => [key, {
    ...HIRELINGS[h.line], wage: h.wage, period: "day", label: `KNAVERY.Npc.Henchman.${key}`,
  }]))
  : Object.fromEntries(Object.entries(HIRELINGS).map(([key, h]) => [key, { ...h, period: "month", label: `KNAVERY.Npc.Hireling.${key}` }])));

const WEAPONS = {
  punch: () => ({ name: L("KNAVERY.Npc.Punch"), type: "weapon", img: `${SYS_PATH}/icons/weapons.svg`, system: { damage: "d2", attackType: "melee", slots: 0, equipped: true } }),
  weapon: () => ({ name: L("KNAVERY.Npc.Weapon"), type: "weapon", img: `${SYS_PATH}/icons/weapons.svg`, system: { damage: "d6", attackType: "melee", slots: 1, equipped: true } }),
};

/** Max HP for a monster of `level`: rolled level d8s, or level × 4. */
export const monsterHp = async (level, how = "roll") => {
  const lvl = Math.max(0, Number(level) || 0);
  if (how === "average" || lvl === 0) return { max: Math.max(1, lvl * 4), roll: null };
  const roll = await new Roll(`${lvl}d8`).evaluate();
  return { max: Math.max(1, roll.total), roll };
};

/** A random name, its traits and a portrait, onto a fresh person or hireling. */
const dressPerson = async (actor, name) => {
  const rolled = name || (await rollFullName()) || actor.name;
  const traits = await rollTraits();
  await actor.update({ name: rolled, "prototypeToken.name": rolled, ...(Object.keys(traits).length ? { "system.traits": traits } : {}) });
  const art = await randomPortraitPair("person");
  if (art) await setActorArt(actor, art.img);
};

/**
 * Make one NPC.
 * @param {object} o
 * @param {"monster"|"person"|"hireling"} o.kind
 * @param {string} [o.name]      blank for random (the monster's own name for a monster)
 * @param {string} [o.monster]   a bestiary entry's id, or "" for a random one
 * @param {"roll"|"average"} [o.hp]
 * @param {string} [o.hireling]  a key of hirelingChoices()
 * @returns {Promise<Actor|null>}
 */
export const createNpc = async ({ kind = "monster", name = "", monster = "", hp = "roll", hireling = "hireling" } = {}) => {
  if (!game.user.isGM) return null;
  let actor = null;
  if (kind === "monster") {
    const pack = game.packs.get(MONSTER_PACK);
    const index = pack ? await pack.getIndex() : null;
    if (!index?.size) { ui.notifications.warn("KNAVERY.Npc.NoBestiary", { localize: true }); return null; }
    const id = monster && index.has(monster) ? monster : [...index.keys()][Math.floor(Math.random() * index.size)];
    const doc = await pack.getDocument(id);
    const data = doc.toObject();
    delete data._id;
    const life = await monsterHp(data.system?.level, hp);
    foundry.utils.setProperty(data, "system.hp", { value: life.max, max: life.max });
    if (name) { data.name = name; foundry.utils.setProperty(data, "prototypeToken.name", name); }
    actor = await Actor.create(data);
    if (actor && life.roll) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
        rolls: [life.roll],
        content: `<div class="knavery-roll-card kind-generation"><p>${esc(F("KNAVERY.Npc.HpCard", { name: actor.name, formula: life.roll.formula, max: life.max }))}</p></div>`,
      });
    }
  } else {
    const choices = hirelingChoices();
    const line = kind === "hireling" ? (choices[hireling] ?? Object.values(choices)[0])
      : { armorClass: 11, morale: 7, wage: 0, weapon: "punch", period: "month", label: "KNAVERY.Npc.Kind.person" };
    actor = await Actor.create({
      name: L(line.label),
      type: "npc",
      system: {
        role: kind === "hireling" ? "hireling" : "npc",
        level: 1, hp: { value: 3, max: 3 }, armorClass: line.armorClass, morale: line.morale, wage: line.wage, wagePeriod: line.period,
        movement: "40'",
      },
    });
    if (actor) {
      await actor.createEmbeddedDocuments("Item", [WEAPONS[line.weapon]()], { knNoLog: true });
      await dressPerson(actor, name);
    }
  }
  actor?.sheet.render(true);
  return actor;
};

/** The Create NPC window: name, the monster and hireling choices, and three tiles. */
export const createNpcInteractive = async () => {
  if (!game.user.isGM) return null;
  const pack = game.packs.get(MONSTER_PACK);
  const index = pack ? await pack.getIndex() : [];
  const monsters = [...index].map((e) => ({ id: e._id, name: e.name })).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  const content = await foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/dialog/create-npc.html`, {
    idp: foundry.utils.randomID(), // ids unique to this window
    monsters,
    hirelings: Object.entries(hirelingChoices()).map(([key, h]) => ({
      key, label: F(h.period === "day" ? "KNAVERY.Npc.HirelingWageDay" : "KNAVERY.Npc.HirelingWage", { kind: L(h.label), wage: h.wage }),
    })),
  });
  const read = (kind) => (_e, b) => {
    const f = b.form.elements;
    return { kind, name: f.name.value.trim(), monster: f.monster?.value ?? "", hp: f.hp?.value ?? "roll", hireling: f.hireling?.value ?? "" };
  };
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: L("KNAVERY.CreateNpc"), icon: "fas fa-users" },
    classes: ["knavery", "knavery-create", "knavery-create-npc"],
    position: { width: 560 },
    content,
    // Each tile carries its own line (core escapes labels, so it goes in here).
    render: (_e, dialog) => {
      for (const kind of ["monster", "person", "hireling"]) {
        const button = dialog.element.querySelector(`.form-footer button[data-action="${kind}"]`);
        if (!button || button.querySelector(".kn-create-sub")) continue;
        const sub = document.createElement("span");
        sub.className = "kn-create-sub";
        sub.textContent = L(`KNAVERY.Npc.Hint.${kind}`);
        button.append(sub);
      }
    },
    buttons: [
      { action: "monster", label: "KNAVERY.Npc.Kind.monster", icon: "fas fa-dragon", default: true, callback: read("monster") },
      { action: "person", label: "KNAVERY.Npc.Kind.person", icon: "fas fa-user", callback: read("person") },
      { action: "hireling", label: "KNAVERY.Npc.Kind.hireling", icon: "fas fa-coins", callback: read("hireling") },
    ],
    rejectClose: false,
  });
  if (!choice || typeof choice !== "object") return null;
  return createNpc(choice);
};
