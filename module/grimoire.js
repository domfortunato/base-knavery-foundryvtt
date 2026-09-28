/**
 * The GLOG hack: grimoires and Magic Dice. Off by default (Hacks settings).
 *
 * A Grimoire is an `item` with `system.grimoire`. Spellbooks can be BOUND into
 * it: a bound spell takes no slot of its own (the book carries it) and is cast
 * with Magic Dice instead of the once-per-day Knave rule.
 *
 *   Magic Dice (MD)   the character's level, at least 1, at most 4; a rest
 *                     refills them.
 *   Casting           invest 1..MD dice and roll them as d6s. The spell text
 *                     may use [dice] and [sum]. Dice showing 1–3 return to
 *                     the pool; 4–6 are spent for the day.
 *   Doubles           roll on the "GLOG Mishaps" table (a shell to fill).
 *   Triples           doom — the card says so; what doom means is the GM's.
 *
 * Unbound spellbooks still cast the Knave way while the hack is on.
 */
import { FLAG_SCOPE, SETTINGS_NS, SYS_PATH, TABLES } from "./config.js";
import { drawFrom } from "./compendium.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const glogEnabled = () => game.settings.get(SETTINGS_NS, "enable-glog-grimoire") === true;

export const grimoireOf = (actor) => actor.items.find((i) => i.type === "item" && i.system.grimoire);

export const magicDiceMax = (actor) => Math.min(4, Math.max(1, actor.system.level ?? 1));

export const magicDiceLeft = (actor) => {
  const g = grimoireOf(actor);
  const spent = Number(g?.getFlag(FLAG_SCOPE, "mdSpent")) || 0;
  return Math.max(0, magicDiceMax(actor) - spent);
};

/** The context the sheet needs for the Grimoire block. */
export const grimoireContext = (actor) => {
  if (!glogEnabled() || actor.type !== "character") return null;
  const g = grimoireOf(actor);
  if (!g) return { exists: false };
  return {
    exists: true,
    id: g.id,
    name: g.name,
    mdLeft: magicDiceLeft(actor),
    mdMax: magicDiceMax(actor),
    pages: actor.items.filter((i) => i.type === "spellbook" && i.system.bound && i.system.boundTo === g.id)
      .map((i) => ({ id: i.id, name: i.name })),
  };
};

export const createGrimoire = async (actor) => {
  if (grimoireOf(actor)) return ui.notifications.warn("KNAVERY.Glog.AlreadyHasOne", { localize: true });
  const [g] = await actor.createEmbeddedDocuments("Item", [{
    name: L("KNAVERY.Glog.Grimoire"),
    type: "item",
    img: `${SYS_PATH}/icons/spellbook.svg`,
    system: { grimoire: true, slots: 1 },
    flags: { [FLAG_SCOPE]: { mdSpent: 0 } },
  }]);
  return g;
};

export const bindSpell = async (actor, book) => {
  const g = grimoireOf(actor);
  if (!g) return ui.notifications.warn("KNAVERY.Glog.NoGrimoire", { localize: true });
  if (book.system.scroll) return ui.notifications.warn("KNAVERY.Glog.NoScrolls", { localize: true });
  await book.update({ "system.bound": true, "system.boundTo": g.id, "system.equipped": false });
};

export const unbindSpell = async (book) => book.update({ "system.bound": false, "system.boundTo": "" });

/** A rest refills the Magic Dice. */
export const refillMagicDice = async (actor) => {
  const g = grimoireOf(actor);
  if (g && g.getFlag(FLAG_SCOPE, "mdSpent")) await g.setFlag(FLAG_SCOPE, "mdSpent", 0);
};

const substitute = (html, dice, sum) => String(html ?? "")
  .replace(/\[dice\]/gi, String(dice)).replace(/\[sum\]/gi, String(sum));

/** Cast a bound spell with Magic Dice. */
export const castWithMagicDice = async (actor, book) => {
  const g = grimoireOf(actor);
  const left = magicDiceLeft(actor);
  if (!g || !left) return ui.notifications.warn("KNAVERY.Glog.NoDiceLeft", { localize: true });
  const options = Array.from({ length: left }, (_, i) => `<option value="${i + 1}"${i === 0 ? " selected" : ""}>${i + 1}</option>`).join("");
  const n = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("KNAVERY.Glog.CastTitle", { name: book.name }), icon: "fas fa-hand-sparkles" },
    content: `<div class="form-group"><label>${L("KNAVERY.Glog.InvestDice")}</label><select name="md">${options}</select></div>`
      + `<p class="hint">${F("KNAVERY.Glog.DiceLeft", { n: left, max: magicDiceMax(actor) })}</p>`,
    ok: { label: "KNAVERY.Glog.Cast", callback: (_e, b) => Number(b.form.elements.md.value) },
    rejectClose: false,
  });
  if (!n) return;
  const roll = await new Roll(`${n}d6`).evaluate();
  const faces = roll.dice[0].results.map((r) => r.result);
  const spent = faces.filter((f) => f >= 4).length;
  const counts = faces.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map());
  const most = Math.max(...counts.values());
  await g.setFlag(FLAG_SCOPE, "mdSpent", (Number(g.getFlag(FLAG_SCOPE, "mdSpent")) || 0) + spent);

  const text = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    substitute(book.system.description, n, roll.total), { relativeTo: book });
  let mishap = "";
  if (most === 2) {
    const r = await drawFrom(TABLES.glogMishaps, { warn: false });
    mishap = r ? F("KNAVERY.Glog.MishapRolled", { text: r.text }) : L("KNAVERY.Glog.Mishap");
  }
  const doom = most >= 3 ? `<p class="card-note fumble"><i class="fas fa-skull"></i> ${esc(L("KNAVERY.Glog.Doom"))}</p>` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `<div class="knavery-roll-card kind-spell glog"><header class="card-title"><h3><i class="fas fa-hand-sparkles"></i> ${esc(F("KNAVERY.Glog.CastTitle", { name: book.name }))}</h3></header>`
      + `${await roll.render()}<p class="card-note">${esc(F("KNAVERY.Glog.DiceSummary", { dice: n, sum: roll.total, spent }))}</p>`
      + (mishap ? `<p class="card-note fumble"><i class="fas fa-bolt"></i> ${esc(mishap)}</p>` : "")
      + `${doom}<div class="card-spell-text">${text}</div></div>`,
    flags: { [FLAG_SCOPE]: { glogCast: { dice: n, sum: roll.total } } },
  });
};

export const registerGrimoire = () => {
  // A deleted grimoire frees its pages back into the inventory.
  Hooks.on("deleteItem", async (item, _options, userId) => {
    if (userId !== game.user.id || !item.system?.grimoire || !item.actor) return;
    const pages = item.actor.items.filter((i) => i.type === "spellbook" && i.system.boundTo === item.id);
    if (pages.length) {
      await item.actor.updateEmbeddedDocuments("Item", pages.map((p) => ({ _id: p.id, "system.bound": false, "system.boundTo": "" })));
    }
  });
};
