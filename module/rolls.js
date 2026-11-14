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
import { scaledPosition } from "./settings.js";

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
  defaultDifficulty = DEFAULT_DIFFICULTY, lockDifficulty = false, weapons = null, actor = null,
} = {}) => {
  const mode = advantageMode();
  // The Attack window's Target list: the tokens this user can see on the viewed scene.
  const targetList = attack ? visibleTargets(actor) : null;
  const current = [...game.user.targets];
  const preset = current.length === 1 ? targetList?.find((t) => t.id === current[0].id) : null;
  if (preset) preset.selected = true;
  const hidePcsBox = !!targetList && actor?.type === "character" && targetList.some((t) => t.pc);
  const content = await foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/dialog/roll-prompt.html`, {
    idp: foundry.utils.randomID(), // ids unique to this window
    reason,
    attack,
    melee,
    difficulty,
    lockDifficulty,
    defaultDifficulty,
    target: CHECK_BASE + defaultDifficulty,
    rollDamage: game.settings.get(SETTINGS_NS, "roll-damage-default"),
    weapons,
    targets: targetList,
    targetsCurrent: targetList && current.length > 1 ? current.map((t) => tokenName(t)).join(", ") : null,
    hidePcsBox,
    // A player character already targeted on purpose stays in the list.
    hidePcs: hidePcsBox && !preset?.pc,
  });
  const read = (edge) => (_event, button) => {
    const f = button.form.elements;
    return {
      edge,
      modifier: Number(f.modifier?.value) || 0,
      difficulty: difficulty ? Math.max(0, Number(f.difficulty?.value) || 0) : defaultDifficulty,
      rollDamage: attack ? !!f.rollDamage?.checked : false,
      power: melee ? !!f.power?.checked : false,
      weaponId: weapons ? (f.weapon?.value ?? null) : null,
      targetId: targetList ? (f.target?.value ?? "") : null,
    };
  };
  return DialogV2.wait({
    window: { title, icon: "fas fa-dice-d20" },
    classes: ["knavery", "knavery-roll-prompt"],
    // Grows with the text size, so the three edges always fit on one row.
    position: scaledPosition({ width: 440 }),
    content,
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form") ?? dialog.element;
      // Each edge says what it does to the roll, by the GM's paradigm.
      const tips = mode === "2d20"
        ? { disadvantage: "KNAVERY.Roll.TipDis2d20", normal: "KNAVERY.Roll.TipStraight", advantage: "KNAVERY.Roll.TipAdv2d20" }
        : { disadvantage: "KNAVERY.Roll.TipDisRaw", normal: "KNAVERY.Roll.TipStraight", advantage: "KNAVERY.Roll.TipAdvRaw" };
      for (const [action, key] of Object.entries(tips)) {
        const button = dialog.element.querySelector(`footer button[data-action="${action}"]`);
        if (button) button.dataset.tooltip = F(key, { n: ADVANTAGE_BONUS });
      }
      // "Hide other player characters" takes them out of the Target list.
      const select = form.querySelector('select[name="target"]');
      const hidePcs = form.querySelector('input[name="hidePcs"]');
      if (select && hidePcs) {
        const syncPcs = () => {
          for (const o of select.options) {
            if (!o.dataset.pc) continue;
            o.hidden = hidePcs.checked;
            o.disabled = hidePcs.checked;
          }
          if (select.selectedOptions[0]?.disabled) select.value = "";
        };
        hidePcs.addEventListener("change", syncPcs);
        syncPcs();
      }
      // The Attack window: Power attack shows only while a melee weapon is chosen.
      if (!weapons || !melee) return;
      const power = form.querySelector(".power-group");
      const sync = () => {
        const chosen = form.querySelector('input[name="weapon"]:checked');
        const isMelee = chosen?.closest(".kn-attack-weapon")?.dataset.melee === "1";
        if (power) power.hidden = !isMelee;
        if (!isMelee && power) power.querySelector("input").checked = false;
      };
      form.querySelectorAll('input[name="weapon"]').forEach((r) => r.addEventListener("change", sync));
      sync();
    },
    // Only Normal is a submit button: Enter in the Modifier or Difficulty field
    // submits through the first submit button in the form, so the edges are
    // plain buttons (DialogV2 still runs their callbacks on click).
    buttons: [
      { action: "disadvantage", type: "button", label: "KNAVERY.Roll.WithDisadvantage", icon: "fas fa-angles-down", callback: read("disadvantage") },
      { action: "normal", label: "KNAVERY.Roll.Straight", icon: "fas fa-dice-d20", default: true, callback: read("normal") },
      { action: "advantage", type: "button", label: "KNAVERY.Roll.WithAdvantage", icon: "fas fa-angles-up", callback: read("advantage") },
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

/** The chat visibility the user picked in the chat controls. */
export const currentMessageMode = () => game.settings.get("core", "messageMode");

/** Is `formula` a dice formula Foundry can roll? */
export const isRollable = (formula) => !!formula && foundry.dice.Roll.validate(String(formula));

const postRolls = async (actor, rolls, content, flags = {}) => ChatMessage.create({
  speaker: speakerFor(actor),
  rolls,
  content,
  sound: CONFIG.sounds.dice,
  flags: { [FLAG_SCOPE]: flags },
}, { messageMode: currentMessageMode() });

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

/**
 * A token's name as this user may read it: what its nameplate would show. A token whose
 * Display Name keeps it from this user, or a secret one they don't own, reads "Unknown
 * creature" (review #2: the Target list must not tell players what the GM hid).
 */
const tokenName = (t) => {
  if (game.user.isGM) return t.document.name;
  const M = CONST.TOKEN_DISPLAY_MODES;
  const owner = t.isOwner;
  const secret = t.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET && !owner;
  const mode = t.document.displayName;
  const shown = !secret && (mode === M.ALWAYS || mode === M.HOVER || (owner && mode !== M.NONE));
  return shown ? t.document.name : L("KNAVERY.Roll.UnknownTarget");
};

/** A token as an attack's target: {uuid, name, ac}. */
const targetInfo = (t) => ({ uuid: t.document.uuid, name: tokenName(t), ac: t.actor?.system?.ac ?? null });

/** The tokens this user is targeting. */
const currentTargets = () => [...game.user.targets].map(targetInfo);

/**
 * The Attack window's Target list: tokens on the viewed scene this user can
 * see, nearest the attacker first, never the attacker's own. Players never
 * get hidden tokens; a second token of one name is numbered. AC is not shown.
 * Null when no scene is on the canvas.
 */
const visibleTargets = (actor) => {
  if (!canvas?.ready || !canvas.tokens) return null;
  const own = actor?.getActiveTokens?.() ?? [];
  const from = own[0] ?? null;
  const tokens = canvas.tokens.placeables.filter((t) => t.actor && t.visible && !own.includes(t)
    && (game.user.isGM || !t.document.hidden));
  const away = (t) => (from ? Math.hypot(t.center.x - from.center.x, t.center.y - from.center.y) : 0);
  tokens.sort((a, b) => away(a) - away(b) || tokenName(a).localeCompare(tokenName(b)));
  const seen = new Map();
  return tokens.map((t) => {
    const name = tokenName(t);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return {
      id: t.id, name: n > 1 ? `${name} ${n}` : name,
      pc: t.actor.type === "character" && t.actor.hasPlayerOwner, selected: false,
    };
  });
};

/**
 * The Target chosen in the Attack window. `null` (no list was shown) or
 * "current" keeps the user's own targets; a token is targeted on the canvas
 * too, and "No target" clears them.
 */
const chosenTargets = (targetId) => {
  if (targetId === null || targetId === undefined || targetId === "current") return currentTargets();
  const token = targetId ? canvas.tokens?.get(targetId) : null;
  canvas.tokens?.setTargets(token ? [token.id] : [], { mode: "replace" });
  return token ? [targetInfo(token)] : [];
};

/**
 * Attack with a weapon: d20 + STR (melee) or WIS (ranged) against each
 * targeted token's AC, optionally rolling damage in the same card.
 */
export const rollAttack = async (actor, weapon, { reason = "" } = {}) => {
  const melee = weapon.system.attackType === "melee";
  const choice = await promptEdge({
    title: F("KNAVERY.Roll.AttackTitle", { weapon: weapon.name }), reason, attack: true, melee: melee && actor.type === "character", actor,
  });
  if (!choice) return null;
  return attackWith(actor, weapon, choice, { reason });
};

/** One equipped weapon as the sheet and the Attack window show it. */
export const attackRow = (actor, w) => {
  const ability = w.attackAbility;
  const bonus = actor.abilityBonus(ability);
  return {
    id: w.id, name: w.name, damage: w.system.damage, broken: w.system.broken, melee: w.system.attackType !== "ranged",
    kind: L(w.system.attackType === "ranged" ? "KNAVERY.Ranged" : "KNAVERY.Melee"),
    ability: L(`KNAVERY.AbilityShort.${ability}`),
    bonus: bonus >= 0 ? `+${bonus}` : `${bonus}`,
    range: w.system.range,
  };
};

/**
 * The improvised attack every character has (user ruling 2026-11-14): a fist,
 * a rock, a chair leg. d4 with STR, no item and no slot, so nothing breaks.
 */
export const IMPROVISED_ID = "improvised";
const improvisedWeapon = () => ({
  id: IMPROVISED_ID, name: L("KNAVERY.Improvised"), uuid: null, isOwner: false, attackAbility: "STR",
  system: { damage: "d4", attackType: "melee", broken: false, range: "" },
});

/** The weapon each actor last attacked with from the Attack window, for this browser session. */
const lastWeapon = new Map();

/**
 * The character sheet's Attack button: one window to choose an equipped
 * weapon, the edge, a modifier, damage in the same card and a power attack.
 */
export const openAttack = async (actor, { reason = "" } = {}) => {
  const weapons = actor.items.filter((i) => i.type === "weapon" && i.system.equipped).sort((a, b) => a.sort - b.sort);
  const improvised = improvisedWeapon();
  const all = [...weapons, improvised];
  const last = lastWeapon.get(actor.id);
  const selected = all.some((w) => w.id === last) ? last : all[0].id;
  const rows = all.map((w) => ({
    ...attackRow(actor, w), checked: w.id === selected,
    improvised: w.id === IMPROVISED_ID, hint: w.id === IMPROVISED_ID ? L("KNAVERY.ImprovisedHint") : "",
  }));
  const canPower = actor.type === "character";
  const choice = await promptEdge({
    title: L("KNAVERY.Roll.AttackTitleAny"), reason, attack: true, melee: canPower && rows.some((r) => r.melee), weapons: rows, actor,
  });
  if (!choice) return null;
  const pick = (id) => (id === IMPROVISED_ID ? improvised : actor.items.get(id));
  const weapon = pick(choice.weaponId) ?? pick(selected);
  if (!weapon) return null;
  lastWeapon.set(actor.id, weapon.id);
  const power = choice.power && canPower && weapon.system.attackType === "melee";
  return attackWith(actor, weapon, { ...choice, power }, { reason });
};

/** Roll an attack whose edge and options are chosen: the card, damage, targets and breakage. */
const attackWith = async (actor, weapon, choice, { reason = "" } = {}) => {
  const ability = weapon.attackAbility;
  const title = F("KNAVERY.Roll.AttackTitle", { weapon: weapon.name });
  const bonus = actor.abilityBonus(ability);
  const formula = d20Formula(bonus, choice.edge, choice.modifier);
  const roll = await new Roll(formula).evaluate();
  const natural = naturalOf(roll);
  const targets = chosenTargets(choice.targetId).map((t) => ({
    ...t, hit: t.ac === null ? null : roll.total >= t.ac,
  }));
  const anyHit = targets.length ? targets.some((t) => t.hit) : true;
  const fumble = natural === 1;
  const maneuver = roll.total >= MANEUVER_THRESHOLD;

  const rolls = [roll];
  let damage = null;
  const power = choice.power && anyHit;
  // A free-text damage entry ("special") posts the attack without a damage roll.
  const rollableDamage = isRollable(normalizeDice(weapon.system.damage));
  if (choice.rollDamage && anyHit && rollableDamage) {
    const dmgFormula = power ? doubleDice(weapon.system.damage) : normalizeDice(weapon.system.damage);
    const dmgRoll = await new Roll(dmgFormula).evaluate();
    rolls.push(dmgRoll);
    damage = { total: dmgRoll.total, html: await dmgRoll.render() };
  }

  // An improvised attack has no item to break.
  const breaks = !!weapon.uuid && ((fumble && game.settings.get(SETTINGS_NS, "weapon-breaks-on-1")) || power);
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
    canRollDamage: !damage && anyHit && rollableDamage,
    weaponUuid: weapon.uuid ?? "",
    weaponDamage: weapon.system.damage,
    weaponName: weapon.name,
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
  if (!isRollable(f)) {
    ui.notifications.warn("KNAVERY.Notify.NotADamageFormula", { format: { formula: String(formula ?? "") } });
    return null;
  }
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
  // A character's INT; a monster's level, when its stat block uses no abilities.
  const int = actor.abilityBonus("INT");
  if (!s.scroll && actor.type === "character") {
    if (s.castToday) return ui.notifications.warn("KNAVERY.Spell.AlreadyCast", { format: { name: book.name } });
    if (actor.system.spellsCastToday >= int) {
      return ui.notifications.warn(int === 1 ? "KNAVERY.Spell.DailyLimitOne" : "KNAVERY.Spell.DailyLimit", { format: { n: int } });
    }
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
  await ChatMessage.create({ speaker: speakerFor(actor), content, flags: { [FLAG_SCOPE]: { spell: book.name } } },
    { messageMode: currentMessageMode() });
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
/**
 * Roll a hazard die and whisper the card to the GM. Fatigue, burn and depletion carry the
 * button that applies them (hazard.js); `resting` sets fatigue aside, `forcedMarch` adds the
 * p86 note, `when` names the turn or watch the Time tab just ended.
 */
export const rollHazard = async (kind = "dungeon", { resting = false, forcedMarch = false, when = "" } = {}) => {
  const roll = await new Roll("1d6").evaluate();
  const face = HAZARD_DICE[kind]?.[roll.total - 1] ?? "free";
  const ignored = face === "fatigue" && resting;
  const action = ignored ? null : { fatigue: "fatigue", burn: "burn", depletion: "depletion" }[face] ?? null;
  const content = await renderCard({
    kind: "hazard",
    title: L(`KNAVERY.Hazard.${kind}`),
    hazardWhen: when,
    rollHtml: await roll.render(),
    resultLabel: L(`KNAVERY.Hazard.Face.${face}`),
    hazardHint: L(`KNAVERY.Hazard.Hint.${face}`),
    hazardIgnored: ignored,
    hazardAction: action,
    hazardButton: action ? L(`KNAVERY.Hazard.Apply.${action}`) : "",
    forcedMarch,
  });
  return ChatMessage.create({
    speaker: { alias: L("KNAVERY.GameMaster") },
    rolls: [roll],
    content,
    flags: { [FLAG_SCOPE]: { hazard: { kind, face } } },
    whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    sound: CONFIG.sounds.dice,
  });
};
