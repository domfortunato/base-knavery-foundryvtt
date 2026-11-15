/**
 * Levelling up: +1 to three different abilities (chosen or random, max 10),
 * then max HP grows by the GM's rule (setting `level-hp-rule`):
 *   reroll      Knave 2e: reroll one d6 per level; not higher, +1.
 *   add1d6      add one d6.
 *   rerollBest  reroll, and keep the higher of the roll and the old max.
 *   knave1e     Knave 1e: roll one d8 per level; below the old max, +1.
 * Under the two d6 reroll rules the first die is the first-level formula
 * (setting `first-level-hp`: 1d6, 1d4+2 or 1d8).
 *
 * The Random button raises three different abilities at random.
 *
 * The sheet offers Level Up (the title-bar arrow and the Growth button) only
 * while Char Gen Mode is on AND the character's XP has reached the next level.
 */
import {
  ABILITIES, ABILITY_MAX, CREATION_POINTS, FLAG_SCOPE, LEVEL_UP_ABILITIES, LOWEST_DIE_MAX, MAX_LEVEL, SETTINGS_NS, SYS_PATH,
} from "./config.js";
import { creationAbilities } from "./rules.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/**
 * What a character of `level` may have in its abilities by the rules (Char
 * Gen Mode holds every sheet to it, GM's too; user ruling 2026-11-14): 3
 * points at level 1 and +1 to three different abilities a level, so no score
 * above level + 2. Knave 1e's creation rolls each score as the
 * lowest of 3d6 (p1), so no total holds there, and a score is at most 6 + a point a level.
 */
export const abilityBudget = (level) => {
  const l = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
  if (creationAbilities() === "lowest") return { level: l, total: null, cap: Math.min(ABILITY_MAX, LOWEST_DIE_MAX + l - 1) };
  return {
    level: l,
    total: CREATION_POINTS + LEVEL_UP_ABILITIES * (l - 1),
    cap: Math.min(ABILITY_MAX, CREATION_POINTS + l - 1),
  };
};

/** Three different abilities still under the cap, at random. */
export const randomAbilityPicks = (values) => {
  const open = ABILITIES.filter((k) => (values[k] ?? 0) < ABILITY_MAX);
  const picks = [];
  while (picks.length < LEVEL_UP_ABILITIES && open.length) {
    picks.push(...open.splice(Math.floor(Math.random() * open.length), 1));
  }
  return picks;
};

const hpRule = () => game.settings.get(SETTINGS_NS, "level-hp-rule");
/** The first-level HP formula: 1d6, 1d4+2 or 1d8. */
export const firstLevelHpFormula = () => ({ "1d4+2": "1d4 + 2", "1d8": "1d8" })[game.settings.get(SETTINGS_NS, "first-level-hp")] ?? "1d6";
/**
 * The reroll formula for `level`: under Knave 1e, one d8 per level; otherwise
 * the first-level formula plus a d6 for each level after the first.
 */
export const levelHpFormula = (level) => {
  if (hpRule() === "knave1e") return `${level}d8`;
  return level > 1 ? `${firstLevelHpFormula()} + ${level - 1}d6` : firstLevelHpFormula();
};

/** Max HP for reaching `level` from `oldMax`, by the GM's rule: {max, rolled, roll, note}. */
export const rollLevelHp = async (level, oldMax) => {
  const rule = hpRule();
  if (rule === "add1d6") {
    const roll = await new Roll("1d6").evaluate();
    const max = oldMax + roll.total;
    return { max, rolled: roll.total, roll, note: F("KNAVERY.LevelUpHpAdded", { rolled: roll.total, max }) };
  }
  const roll = await new Roll(levelHpFormula(level)).evaluate();
  if (rule === "knave1e") {
    // Knave 1e: only a result below the previous maximum gives that maximum + 1.
    const lower = roll.total < oldMax;
    const max = lower ? oldMax + 1 : roll.total;
    return { max, rolled: roll.total, roll, note: lower ? F("KNAVERY.LevelUpHpKeptLower", { rolled: roll.total, max }) : F("KNAVERY.LevelUpHpNew", { max }) };
  }
  const higher = roll.total > oldMax;
  const max = higher ? roll.total : (rule === "rerollBest" ? oldMax : oldMax + 1);
  const note = higher ? F("KNAVERY.LevelUpHpNew", { max })
    : F(rule === "rerollBest" ? "KNAVERY.LevelUpHpKeptBest" : "KNAVERY.LevelUpHpKept", { rolled: roll.total, max });
  return { max, rolled: roll.total, roll, note };
};

/**
 * Max HP for a character of `level`, rolled the generator's way: the
 * first-level die, then each level by the GM's rule. Returns the max, the
 * rolls and one line per level.
 */
export const rollHpForLevel = async (level) => {
  const first = await new Roll(firstLevelHpFormula()).evaluate();
  let max = first.total;
  const rolls = [first];
  const notes = [F("KNAVERY.Gen.HpRoll", { level: 1, rolled: first.total, max })];
  for (let l = 2; l <= level; l++) {
    const hp = await rollLevelHp(l, max);
    rolls.push(hp.roll);
    notes.push(F("KNAVERY.Gen.HpRoll", { level: l, rolled: hp.rolled, max: hp.max }));
    max = hp.max;
  }
  return { max, rolls, notes };
};

/** One sentence: how max HP will change on reaching `level` from `max`. */
export const hpRuleHint = (level, max) => {
  const rule = hpRule();
  if (rule === "add1d6") return F("KNAVERY.HpHint.Add", { max });
  if (rule === "knave1e") return F("KNAVERY.HpHint.Knave1e", { formula: levelHpFormula(level), max, next: max + 1 });
  return F(rule === "rerollBest" ? "KNAVERY.HpHint.Best" : "KNAVERY.HpHint.Reroll", { formula: levelHpFormula(level), max, next: max + 1 });
};

/**
 * Apply one level to an actor. `picks` are the abilities to raise; omitted
 * means random. Posts a chat card and returns the new level.
 */
export const applyLevelUp = async (actor, picks = null) => {
  // The stored values, not the ones Active Effects modify: what is written back
  // must not fold a career's bonus into the character for good.
  const s = actor._source.system;
  if (s.level >= MAX_LEVEL) return null;
  const values = Object.fromEntries(ABILITIES.map((k) => [k, s.abilities[k].value]));
  const chosen = (picks?.length ? picks : randomAbilityPicks(values)).slice(0, LEVEL_UP_ABILITIES);
  const level = s.level + 1;
  const hp = await rollLevelHp(level, s.hp.max);
  const update = { "system.level": level, "system.hp.max": hp.max, "system.hp.value": s.hp.value + Math.max(0, hp.max - s.hp.max) };
  for (const k of chosen) update[`system.abilities.${k}.value`] = Math.min(ABILITY_MAX, values[k] + 1);
  await actor.update(update, { knLogAction: "KNAVERY.LevelUp", knLevelUp: true });
  const content = await foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/chat/level-up-card.html`, {
    name: actor.name,
    level,
    title: L(`KNAVERY.LevelTitle.${level}`),
    abilities: chosen.map((k) => L(`KNAVERY.AbilityShort.${k}`)).join(", "),
    hpNote: hp.note,
    rollHtml: await hp.roll.render(),
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [hp.roll],
    flags: { [FLAG_SCOPE]: { levelUp: level } },
  }, { messageMode: game.settings.get("core", "messageMode") });
  return level;
};

/** The Level Up dialog: pick three abilities or let the dice choose. */
export const openLevelUp = async (actor) => {
  const s = actor.system;
  if (!s.canLevelUp) return ui.notifications.warn("KNAVERY.Notify.NotEnoughXp", { localize: true });
  const rows = ABILITIES.map((k) => {
    const v = s.abilities[k].value;
    const capped = v >= ABILITY_MAX;
    return `<label class="kn-levelup-ability${capped ? " capped" : ""}"><input type="checkbox" name="pick" value="${k}"${capped ? " disabled" : ""} />`
      + ` <strong>${L(`KNAVERY.AbilityShort.${k}`)}</strong> ${v} → ${Math.min(ABILITY_MAX, v + 1)}</label>`;
  }).join("");
  const content = `<div class="kn-levelup"><p>${F("KNAVERY.LevelUpBody", { level: s.level + 1, n: LEVEL_UP_ABILITIES })}</p>`
    + `<div class="kn-levelup-grid">${rows}</div><p class="hint">${hpRuleHint(s.level + 1, actor._source.system.hp.max)}</p></div>`;
  const picks = await foundry.applications.api.DialogV2.wait({
    window: { title: F("KNAVERY.LevelUpTitle", { name: actor.name }), icon: "fas fa-angles-up" },
    classes: ["knavery"],
    position: { width: 420 },
    content,
    render: (_e, dialog) => {
      const boxes = [...dialog.element.querySelectorAll('input[name="pick"]')];
      const sync = () => {
        const n = boxes.filter((b) => b.checked).length;
        for (const b of boxes) if (!b.checked && !b.closest(".capped")) b.disabled = n >= LEVEL_UP_ABILITIES;
      };
      boxes.forEach((b) => b.addEventListener("change", sync));
    },
    buttons: [
      // A plain button: Enter on a ticked box submits through the first submit
      // button, which must be Level Up, not Random.
      { action: "random", type: "button", label: "KNAVERY.LevelUpRandom", icon: "fas fa-dice", callback: () => [] },
      {
        action: "ok", label: "KNAVERY.LevelUp", icon: "fas fa-angles-up", default: true,
        callback: (_e, button) => [...button.form.querySelectorAll('input[name="pick"]:checked')].map((b) => b.value),
      },
    ],
    rejectClose: false,
  });
  if (!picks) return;
  const openCount = ABILITIES.filter((k) => s.abilities[k].value < ABILITY_MAX).length;
  if (picks.length && picks.length < Math.min(LEVEL_UP_ABILITIES, openCount)) {
    return ui.notifications.warn("KNAVERY.Notify.PickThree", { format: { n: LEVEL_UP_ABILITIES } });
  }
  await applyLevelUp(actor, picks);
};
