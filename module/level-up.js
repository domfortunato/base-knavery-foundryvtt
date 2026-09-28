/**
 * Levelling up: +1 to three different abilities (chosen or random, max 10),
 * then reroll max HP with one d6 per level — if the new total is not greater
 * than the old maximum, the maximum goes up by one instead.
 *
 * The sheet shows the Level Up button only while Character Creation Mode is
 * on AND the character's XP has reached the next threshold.
 */
import { ABILITIES, ABILITY_MAX, FLAG_SCOPE, LEVEL_UP_ABILITIES, MAX_LEVEL, SYS_PATH } from "./config.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** Three different abilities still under the cap, at random. */
export const randomAbilityPicks = (values) => {
  const open = ABILITIES.filter((k) => (values[k] ?? 0) < ABILITY_MAX);
  const picks = [];
  while (picks.length < LEVEL_UP_ABILITIES && open.length) {
    picks.push(...open.splice(Math.floor(Math.random() * open.length), 1));
  }
  return picks;
};

/** Reroll max HP for `level`: {max, rolled, dice}. */
export const rollLevelHp = async (level, oldMax) => {
  const roll = await new Roll(`${level}d6`).evaluate();
  const max = roll.total > oldMax ? roll.total : oldMax + 1;
  return { max, rolled: roll.total, roll };
};

/**
 * Apply one level to an actor. `picks` are the abilities to raise; omitted
 * means random. Posts a chat card and returns the new level.
 */
export const applyLevelUp = async (actor, picks = null) => {
  const s = actor.system;
  if (s.level >= MAX_LEVEL) return null;
  const values = Object.fromEntries(ABILITIES.map((k) => [k, s.abilities[k].value]));
  const chosen = (picks?.length ? picks : randomAbilityPicks(values)).slice(0, LEVEL_UP_ABILITIES);
  const level = s.level + 1;
  const hp = await rollLevelHp(level, s.hp.max);
  const update = { "system.level": level, "system.hp.max": hp.max, "system.hp.value": s.hp.value + Math.max(0, hp.max - s.hp.max) };
  for (const k of chosen) update[`system.abilities.${k}.value`] = Math.min(ABILITY_MAX, values[k] + 1);
  await actor.update(update, { knLogAction: "KNAVERY.LevelUp" });
  const content = await foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/chat/level-up-card.html`, {
    name: actor.name,
    level,
    title: L(`KNAVERY.LevelTitle.${level}`),
    abilities: chosen.map((k) => L(`KNAVERY.AbilityShort.${k}`)).join(", "),
    rolled: hp.rolled,
    max: hp.max,
    kept: hp.rolled <= s.hp.max,
    rollHtml: await hp.roll.render(),
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [hp.roll],
    flags: { [FLAG_SCOPE]: { levelUp: level } },
  });
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
    + `<div class="kn-levelup-grid">${rows}</div><p class="hint">${F("KNAVERY.LevelUpHpHint", { level: s.level + 1, max: s.hp.max })}</p></div>`;
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
      { action: "random", label: "KNAVERY.LevelUpRandom", icon: "fas fa-dice", callback: () => [] },
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
    return ui.notifications.warn(F("KNAVERY.Notify.PickThree", { n: LEVEL_UP_ABILITIES }));
  }
  await applyLevelUp(actor, picks);
};
