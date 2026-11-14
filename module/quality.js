/**
 * Knave 1e quality and wear (Knave 1.0 p4, CC BY 4.0; user rulings 2026-11-14), under the 1e
 * attack rule (rules.js usesQuality):
 *   - a natural 20 on an attack costs the target's armor 1 point of quality; the target's
 *     owner (the GM for a monster) picks the worn piece from the card (`openWearDialog`);
 *   - a natural 1 costs the attacker's weapon 1 point (rolls.js);
 *   - at 0 quality the item is destroyed: it stays in the inventory marked Broken, and
 *   - each point costs 10% of the item's cost to repair (`repairItem`).
 * Under Knave 2e attacks a Broken item is mended for free (`repairBroken`; user, 2026-11-14).
 * Weapons and armor carry `system.wear` (points lost) and derive `system.quality`.
 */
import { FLAG_SCOPE, REPAIR_PER_POINT, defaultQualityMax } from "./config.js";
import { usesQuality } from "./rules.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Items that have quality. */
export const hasQuality = (item) => ["weapon", "armor"].includes(item?.type);

/** {value, max} for a weapon or armor; null for anything else. */
export const qualityOf = (item) => {
  if (!hasQuality(item)) return null;
  const s = item.system;
  if (s.quality) return s.quality;
  const max = s.qualityMax ?? defaultQualityMax(item.type, s);
  return { max, value: Math.max(0, max - (s.wear ?? 0)) };
};

/** Coins to repair every lost point: 10% of the cost per point, rounded up. */
export const repairCost = (item) => {
  const q = qualityOf(item);
  if (!q) return 0;
  const lost = q.max - q.value;
  // Rounded to a millionth first, so 10% of 10c is 1c and not 1.0000000000000002 rounded up to 2.
  return lost > 0 ? Math.ceil(Math.round(lost * (Number(item.system.cost) || 0) * REPAIR_PER_POINT * 1e6) / 1e6) : 0;
};

const whisperOwners = (actor) => [
  ...game.users.filter((u) => u.isGM).map((u) => u.id),
  ...game.users.filter((u) => !u.isGM && actor?.testUserPermission(u, "OWNER")).map((u) => u.id),
];

const postNote = (actor, text, icon = "fa-shield-halved") => ChatMessage.create({
  speaker: actor ? ChatMessage.getSpeaker({ actor }) : undefined,
  content: `<div class="knavery-roll-card kind-wear"><p class="card-note"><i class="fas ${icon}"></i> ${esc(text)}</p></div>`,
});

/**
 * Take `n` points of quality from an item its user owns. At 0 it is destroyed: marked Broken.
 * Returns {value, max, destroyed} or null when nothing changed.
 * @param {Item} item
 * @param {object} [o]
 * @param {number} [o.n]
 * @param {boolean} [o.post]  post a chat note (the attack card says it already for a weapon)
 */
export const wearItem = async (item, { n = 1, post = true } = {}) => {
  const q = qualityOf(item);
  if (!q || !item.isOwner || item.system.broken || q.value <= 0) return null;
  const value = Math.max(0, q.value - n);
  const destroyed = value === 0;
  await item.update({ "system.wear": q.max - value, ...(destroyed ? { "system.broken": true } : {}) }, { knNoLog: true });
  const out = { value, max: q.max, destroyed };
  if (post) {
    const data = { name: item.name, value, max: q.max };
    await postNote(item.actor, F(destroyed ? "KNAVERY.Quality.Destroyed" : "KNAVERY.Quality.Worn", data),
      destroyed ? "fa-link-slash" : "fa-shield-halved");
  }
  return out;
};

/** Repair every lost point, paid from the owner's coins. Returns the cost paid, or null. */
export const repairItem = async (item) => {
  const actor = item?.actor;
  const q = qualityOf(item);
  if (!q || !item.isOwner || q.value >= q.max) return null;
  const cost = repairCost(item);
  if (actor) {
    const coins = actor.system.coins ?? 0;
    if (coins < cost) {
      ui.notifications.warn("KNAVERY.Quality.CannotRepair", { format: { name: item.name, cost, coins } });
      return null;
    }
    if (cost) await actor.update({ "system.coins": coins - cost }, { knNoLog: true });
  }
  await item.update({ "system.wear": 0, "system.broken": false }, { knNoLog: true });
  if (actor) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: whisperOwners(actor),
      content: `<div class="knavery-roll-card kind-wear"><p class="card-note"><i class="fas fa-hammer"></i> ${esc(F("KNAVERY.Quality.Repaired", { name: item.name, cost, max: q.max }))}</p></div>`,
    });
  }
  return cost;
};

/**
 * Mend a Broken item at no cost (user ruling 2026-11-14): Knave 2e has no repair rule, so
 * under its attacks (and for gear without quality) Repair just clears Broken.
 */
export const repairBroken = async (item) => {
  if (!item?.isOwner || !item.system.broken) return null;
  await item.update({ "system.broken": false }, { knNoLog: true });
  const actor = item.actor;
  if (actor) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: whisperOwners(actor),
      content: `<div class="knavery-roll-card kind-wear"><p class="card-note"><i class="fas fa-hammer"></i> ${esc(F("KNAVERY.Quality.RepairedFree", { name: item.name }))}</p></div>`,
    });
  }
  return 0;
};

/** Whether Repair costs coins: a worn weapon or armor under Knave 1e attacks (10% a point). */
export const repairsByQuality = (item) => usesQuality() && hasQuality(item) && (qualityOf(item)?.value ?? 0) < (qualityOf(item)?.max ?? 0);

/** Whether the item can be repaired now: worn under 1e, or marked Broken. */
export const canRepair = (item) => repairsByQuality(item) || Boolean(item?.system?.broken);

/** Repair: 1e quality at 10% a point, or a Broken item mended for free. */
export const repairAny = (item) => (repairsByQuality(item) ? repairItem(item) : repairBroken(item));

/* -------------------------------------------- */
/*  A critical hit's armor wear, from the card    */
/* -------------------------------------------- */

const WORN_BY = "wornBy";
const WORN_KEEP = 20;

/** Whether this target already took the wear of the attack card `messageId`. */
export const wearTaken = (actor, messageId) => (actor?.getFlag(FLAG_SCOPE, WORN_BY) ?? []).includes(messageId);

/** The target's worn armor that can still lose quality. */
export const wornArmor = (actor) => (actor?.items ?? []).filter((i) => i.type === "armor" && i.system.equipped && !i.system.broken)
  .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

/**
 * The target's owner picks which worn piece the critical hit wears (user, 2026-11-14).
 * Records the card on the actor, so the card's button reads "Armor worn" afterwards.
 */
export const openWearDialog = async (actor, messageId) => {
  if (!actor?.isOwner) return null;
  if (wearTaken(actor, messageId)) return null;
  const pieces = wornArmor(actor);
  const mark = async () => {
    const list = [...(actor.getFlag(FLAG_SCOPE, WORN_BY) ?? []), messageId].slice(-WORN_KEEP);
    await actor.setFlag(FLAG_SCOPE, WORN_BY, list);
  };
  if (!pieces.length) {
    ui.notifications.info("KNAVERY.Quality.NoArmor", { format: { name: actor.name } });
    await mark();
    return null;
  }
  const idp = foundry.utils.randomID();
  const rows = pieces.map((p, i) => {
    const q = qualityOf(p);
    return `<label class="kn-wear-row" for="${idp}-${p.id}"><input type="radio" id="${idp}-${p.id}" name="piece" value="${p.id}"${i === 0 ? " checked" : ""}>`
      + ` <img src="${esc(p.img)}" alt="" width="24" height="24"> <span class="kn-wear-name">${esc(p.name)}</span>`
      + ` <span class="kn-wear-q">${esc(F("KNAVERY.Quality.Short", { value: q.value, max: q.max }))}</span></label>`;
  }).join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    classes: ["knavery", "knavery-wear"],
    window: { title: F("KNAVERY.Quality.WearTitle", { name: actor.name }), icon: "fa-solid fa-shield-halved" },
    content: `<p>${esc(L("KNAVERY.Quality.WearBody"))}</p><div class="kn-wear-list">${rows}</div>`,
    ok: { label: "KNAVERY.Quality.WearOk", icon: "fa-solid fa-check", callback: (_e, b) => b.form.elements.piece?.value ?? null },
    rejectClose: false,
  });
  const piece = id ? actor.items.get(id) : null;
  if (!piece) return null;
  await mark();
  return wearItem(piece);
};
