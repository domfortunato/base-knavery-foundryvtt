/**
 * Every roll a sheet or the GM can ask for: checks and saves, attacks with
 * optional damage in the same card, damage alone, spellcasting, the Die of
 * Fate, morale and the hazard die.
 *
 * Checks, saves and attacks always open the edge prompt first — Disadvantage,
 * Normal (default) or Advantage — and resolve it per the GM's paradigm:
 *   raw   Knave 2e as written: ±5 per edge.
 *   2d20  roll two d20s and keep the higher (advantage) or lower.
 */
import {
  ADVANTAGE_BONUS, CHECK_BASE, DEFAULT_DIFFICULTY, FLAG_SCOPE, HAZARD_DICE, MANEUVER_THRESHOLD,
  SAVE_CATEGORIES, SETTINGS_NS, SYS_PATH,
} from "./config.js";

const { DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** "d6" -> "1d6"; "2d6+1" stays. */
export const normalizeDice = (formula) => String(formula ?? "").trim().replace(/(^|[^\d)])d(\d)/g, "$11d$2");

/** Double every die count in a formula (power attacks). */
export const doubleDice = (formula) => normalizeDice(formula).replace(/(\d+)d(\d+)/g, (_, n, f) => `${Number(n) * 2}d${f}`);

const advantageMode = () => game.settings.get(SETTINGS_NS, "advantage-mode");

/* -------------------------------------------- */
/*  The edge prompt                              */
/* -------------------------------------------- */

/**
 * Ask Disadvantage / Normal / Advantage.
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.reason]      shown to the player, e.g. a GM's request
 * @param {boolean} [o.attack]     show the attack options
 * @param {boolean} [o.melee]      offer a power attack (PC melee only)
 * @param {boolean} [o.difficulty] show the difficulty field (checks)
 * @param {number} [o.defaultDifficulty]
 * @returns {Promise<null|{edge:string, modifier:number, difficulty:number, rollDamage:boolean, power:boolean}>}
 */
export const promptEdge = async ({
  title, reason = "", attack = false, melee = false, difficulty = false,
  defaultDifficulty = DEFAULT_DIFFICULTY, lockDifficulty = false,
} = {}) => {
  const mode = advantageMode();
  const content = await foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/dialog/roll-prompt.html`, {
    reason,
    attack,
    melee,
    difficulty,
    lockDifficulty,
    defaultDifficulty,
    target: CHECK_BASE + defaultDifficulty,
    rollDamage: game.settings.get(SETTINGS_NS, "roll-damage-default"),
    modeHint: L(mode === "2d20" ? "KNAVERY.Roll.Mode2d20Hint" : "KNAVERY.Roll.ModeRawHint"),
  });
  const read = (edge) => (_event, button) => {
    const f = button.form.elements;
    return {
      edge,
      modifier: Number(f.modifier?.value) || 0,
      difficulty: difficulty ? Math.max(0, Number(f.difficulty?.value) || 0) : defaultDifficulty,
      rollDamage: attack ? !!f.rollDamage?.checked : false,
      power: melee ? !!f.power?.checked : false,
    };
  };
  return DialogV2.wait({
    window: { title, icon: "fas fa-dice-d20" },
    classes: ["knavery", "knavery-roll-prompt"],
    position: { width: 420 },
    content,
    buttons: [
      { action: "disadvantage", label: "KNAVERY.Roll.Disadvantage", icon: "fas fa-angles-down", callback: read("disadvantage") },
      { action: "normal", label: "KNAVERY.Roll.Normal", icon: "fas fa-dice-d20", default: true, callback: read("normal") },
      { action: "advantage", label: "KNAVERY.Roll.Advantage", icon: "fas fa-angles-up", callback: read("advantage") },
    ],
    rejectClose: false,
  });
};

/** Build the d20 formula for a bonus, an edge and a situational modifier. */
export const d20Formula = (bonus, edge, modifier = 0) => {
  const mode = advantageMode();
  let die = "1d20";
  let edgeMod = 0;
  if (mode === "2d20") {
    if (edge === "advantage") die = "2d20kh";
    else if (edge === "disadvantage") die = "2d20kl";
  } else {
    if (edge === "advantage") edgeMod = ADVANTAGE_BONUS;
    else if (edge === "disadvantage") edgeMod = -ADVANTAGE_BONUS;
  }
  const parts = [die];
  if (bonus) parts.push(`${bonus}`);
  if (edgeMod) parts.push(`${edgeMod}`);
  if (modifier) parts.push(`${modifier}`);
  return parts.join(" + ").replace(/\+ -/g, "- ");
};

const naturalOf = (roll) => roll.dice[0]?.total ?? null;

const edgeLabel = (edge) => (edge === "normal" ? "" : L(`KNAVERY.Roll.${edge === "advantage" ? "Advantage" : "Disadvantage"}`));

const renderCard = (data) =>
  foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/chat/roll-card.html`, data);

const speakerFor = (actor) => (actor?.token
  ? ChatMessage.getSpeaker({ token: actor.token })
  : ChatMessage.getSpeaker({ actor }));

const postRolls = async (actor, rolls, content, flags = {}) => ChatMessage.create({
  speaker: speakerFor(actor),
  rolls,
  content,
  sound: CONFIG.sounds.dice,
  flags: { [FLAG_SCOPE]: flags },
});

/* -------------------------------------------- */
/*  Checks and saves                             */
/* -------------------------------------------- */

/**
 * An ability check: d20 + ability vs 11 + difficulty.
 * @param {Actor} actor
 * @param {string} ability
 * @param {object} [o]
 * @param {string} [o.save]        a SAVE_CATEGORIES key, for "Save vs X"
 * @param {number} [o.difficulty]  preset (a GM request)
 * @param {string} [o.reason]
 * @param {string} [o.requestId]   a GM roll request this answers
 * @param {boolean} [o.skipPrompt]
 */
export const rollCheck = async (actor, ability, {
  save = null, difficulty = null, reason = "", requestId = null, edge = null,
} = {}) => {
  const abilityLabel = L(`KNAVERY.Ability.${ability}`);
  const title = save
    ? F("KNAVERY.Roll.SaveTitle", { save: L(`KNAVERY.Save.${save}`), ability: abilityLabel })
    : F("KNAVERY.Roll.CheckTitle", { ability: abilityLabel });
  let choice;
  if (edge) choice = { edge, modifier: 0, difficulty: difficulty ?? DEFAULT_DIFFICULTY };
  else {
    choice = await promptEdge({
      title, reason, difficulty: true, lockDifficulty: difficulty !== null,
      defaultDifficulty: difficulty ?? DEFAULT_DIFFICULTY,
    });
  }
  if (!choice) return null;
  const bonus = actor.abilityBonus(ability);
  const formula = d20Formula(bonus, choice.edge, choice.modifier);
  const roll = await new Roll(formula).evaluate();
  const target = CHECK_BASE + choice.difficulty;
  const success = roll.total >= target;
  const content = await renderCard({
    kind: "check",
    title,
    reason,
    edge: edgeLabel(choice.edge),
    rollHtml: await roll.render(),
    target,
    success,
    resultLabel: L(success ? "KNAVERY.Roll.Success" : "KNAVERY.Roll.Failure"),
  });
  await postRolls(actor, [roll], content, {
    check: { ability, save, target, success, total: roll.total, requestId },
  });
  return { roll, success, target };
};

/** A save from another game's vocabulary, resolved as the mapped ability check. */
export const rollSave = (actor, save, opts = {}) =>
  rollCheck(actor, SAVE_CATEGORIES[save] ?? "WIS", { ...opts, save });

/* -------------------------------------------- */
/*  Attacks and damage                           */
/* -------------------------------------------- */

/** The tokens this user is targeting, as {uuid, name, ac}. */
const currentTargets = () => [...game.user.targets].map((t) => ({
  uuid: t.document.uuid,
  name: t.document.name,
  ac: t.actor?.system?.ac ?? null,
}));

/**
 * Attack with a weapon: d20 + STR (melee) or WIS (ranged) against each
 * targeted token's AC, optionally rolling damage in the same card.
 */
export const rollAttack = async (actor, weapon, { reason = "" } = {}) => {
  const ability = weapon.attackAbility;
  const melee = weapon.system.attackType === "melee";
  const title = F("KNAVERY.Roll.AttackTitle", { weapon: weapon.name });
  const choice = await promptEdge({
    title, reason, attack: true, melee: melee && actor.type === "character",
  });
  if (!choice) return null;

  const bonus = actor.abilityBonus(ability);
  const formula = d20Formula(bonus, choice.edge, choice.modifier);
  const roll = await new Roll(formula).evaluate();
  const natural = naturalOf(roll);
  const targets = currentTargets().map((t) => ({
    ...t, hit: t.ac === null ? null : roll.total >= t.ac,
  }));
  const anyHit = targets.length ? targets.some((t) => t.hit) : true;
  const fumble = natural === 1;
  const maneuver = roll.total >= MANEUVER_THRESHOLD;

  const rolls = [roll];
  let damage = null;
  const power = choice.power && anyHit;
  if (choice.rollDamage && anyHit && weapon.system.damage) {
    const dmgFormula = power ? doubleDice(weapon.system.damage) : normalizeDice(weapon.system.damage);
    const dmgRoll = await new Roll(dmgFormula).evaluate();
    rolls.push(dmgRoll);
    damage = { total: dmgRoll.total, html: await dmgRoll.render() };
  }

  const breaks = (fumble && game.settings.get(SETTINGS_NS, "weapon-breaks-on-1")) || power;
  if (breaks && weapon.isOwner && !weapon.system.broken) {
    await weapon.update({ "system.broken": true }, { knNoLog: true });
  }

  const hitTargets = targets.filter((t) => t.hit !== false);
  const content = await renderCard({
    kind: "attack",
    title,
    reason,
    edge: edgeLabel(choice.edge),
    rollHtml: await roll.render(),
    targets: targets.map((t) => ({
      ...t,
      label: t.hit === null ? "" : L(t.hit ? "KNAVERY.Roll.Hit" : "KNAVERY.Roll.Miss"),
      cls: t.hit === null ? "" : (t.hit ? "success" : "failure"),
    })),
    maneuver,
    fumble,
    broke: breaks,
    power,
    damage,
    applyTargets: JSON.stringify(hitTargets.map((t) => t.uuid)),
    canRollDamage: !damage && anyHit && !!weapon.system.damage,
    weaponUuid: weapon.uuid,
    actorUuid: actor.uuid,
    powerFlag: power ? 1 : 0,
  });
  await postRolls(actor, rolls, content, {
    attack: { weapon: weapon.name, total: roll.total, natural, damage: damage?.total ?? null },
  });
  return { roll, targets, damage };
};

/** Roll a weapon's (or any) damage formula alone and post an apply card. */
export const rollDamage = async (actor, { formula, label = "", power = false, targets = null, direct = false } = {}) => {
  const f = power ? doubleDice(formula) : normalizeDice(formula);
  const roll = await new Roll(f).evaluate();
  const tgt = targets ?? currentTargets().map((t) => t.uuid);
  const content = await renderCard({
    kind: "damage",
    title: label ? F("KNAVERY.Roll.DamageTitleNamed", { name: label }) : L("KNAVERY.Roll.DamageTitle"),
    damage: { total: roll.total, html: await roll.render() },
    applyTargets: JSON.stringify(tgt),
    direct,
  });
  await postRolls(actor, [roll], content, { damage: { total: roll.total } });
  return roll;
};

/* -------------------------------------------- */
/*  Spells                                       */
/* -------------------------------------------- */

/**
 * Cast from a spellbook. A PC may use INT spellbooks per day; each book once
 * per day. A scroll ignores the limit and is used up. The spell's level is up
 * to the caster's INT.
 */
export const castSpell = async (actor, book) => {
  const s = book.system;
  const int = actor.system.abilities?.INT?.value ?? actor.system.level ?? 0;
  if (!s.scroll && actor.type === "character") {
    if (s.castToday) return ui.notifications.warn(F("KNAVERY.Spell.AlreadyCast", { name: book.name }));
    if (actor.system.spellsCastToday >= int) return ui.notifications.warn(F("KNAVERY.Spell.DailyLimit", { n: int }));
  }
  const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.description ?? "", {
    relativeTo: book, secrets: false,
  });
  const content = await renderCard({
    kind: "spell",
    title: F("KNAVERY.Spell.CastTitle", { name: book.name }),
    level: int,
    description,
    chaos: s.chaos,
    scroll: s.scroll,
  });
  await ChatMessage.create({ speaker: speakerFor(actor), content, flags: { [FLAG_SCOPE]: { spell: book.name } } });
  if (s.scroll) {
    if ((s.quantity ?? 1) > 1) await book.update({ "system.quantity": s.quantity - 1 }, { knNoLog: true });
    else await book.delete({ knNoLog: true });
  } else if (actor.type === "character") {
    await book.update({ "system.castToday": true }, { knNoLog: true });
    await actor.update({ "system.spellsCastToday": actor.system.spellsCastToday + 1 }, { knNoLog: true });
  }
  return true;
};

/* -------------------------------------------- */
/*  Small dice                                   */
/* -------------------------------------------- */

/** The Die of Fate: a d6 anyone may roll from any sheet. */
export const rollDieOfFate = async (actor) => {
  const roll = await new Roll("1d6").evaluate();
  return roll.toMessage({
    speaker: speakerFor(actor),
    flavor: L("KNAVERY.DieOfFate"),
    flags: { [FLAG_SCOPE]: { rollFlavor: "dieOfFate" } },
  });
};

/** Morale: 2d6 at or under MRL holds. */
export const rollMorale = async (actor) => {
  const roll = await new Roll("2d6").evaluate();
  const mrl = actor.system.morale ?? 7;
  const holds = roll.total <= mrl;
  const content = await renderCard({
    kind: "check",
    title: F("KNAVERY.Roll.MoraleTitle", { n: mrl }),
    rollHtml: await roll.render(),
    success: holds,
    resultLabel: L(holds ? "KNAVERY.Roll.MoraleHolds" : "KNAVERY.Roll.MoraleBreaks"),
  });
  return postRolls(actor, [roll], content, { morale: { total: roll.total, holds } });
};

/** A hazard die (travel or dungeon), rolled by the GM. */
export const rollHazard = async (kind = "dungeon") => {
  const roll = await new Roll("1d6").evaluate();
  const face = HAZARD_DICE[kind]?.[roll.total - 1] ?? "free";
  const content = await renderCard({
    kind: "hazard",
    title: L(`KNAVERY.Hazard.${kind}`),
    rollHtml: await roll.render(),
    resultLabel: L(`KNAVERY.Hazard.Face.${face}`),
  });
  return ChatMessage.create({
    speaker: { alias: L("KNAVERY.GameMaster") },
    rolls: [roll],
    content,
    whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    sound: CONFIG.sounds.dice,
  });
};
