/**
 * Treasure and selling (user rulings 2026-11-14).
 *
 *   Treasure XP  Knave 2e p12: 1 XP per coin of treasure recovered from a dungeon and
 *                returned to civilization, split evenly among the PCs who helped; a
 *                companion takes a half share (p59). Knave 1e gives XP for
 *                accomplishments, and its designer's note allows XP for gold instead
 *                (Knave 1.0 p5, CC BY 4.0: a gold piece is 100 copper). Rule
 *                `treasure-xp`: "coin" (2e), "off" (1e as written), "gold" (1 XP per 100c).
 *                An item ticked Treasure counts once: the award marks it counted.
 *   Selling      an item sells for half its price, treasure for its full value.
 *                Neither book says; the user's ruling.
 */
import { COMPANION_SHARE, SELL_RATE, TREASURE_COINS_PER_XP } from "./config.js";
import { rule } from "./rules.js";
import { P } from "./i18n.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** "coin", "gold" or "off". */
export const treasureXpRule = () => rule("treasure-xp");
export const treasureXpOn = () => Boolean(TREASURE_COINS_PER_XP[treasureXpRule()]);

/** XP for `coins` worth of treasure, before the split. */
export const xpForTreasure = (coins, mode = treasureXpRule()) => {
  const per = TREASURE_COINS_PER_XP[mode];
  return per ? Math.floor(Math.max(0, Number(coins) || 0) / per) : 0;
};

/** What one of an item fetches: half its price, or all of it for treasure. */
export const sellEach = (item) => (Number(item?.system?.cost) || 0) * (item?.system?.treasure ? 1 : SELL_RATE);
/** What `n` of an item fetch, in whole coins (rounded down: a 1c item sells for nothing). */
export const sellPrice = (item, n = 1) => Math.floor(Math.round(sellEach(item) * n * 1e6) / 1e6);

/** An item worth selling, carried by an actor (a career is not for sale). */
export const canSell = (item) => Boolean(item?.actor) && item.type !== "career" && sellPrice(item, Math.max(1, item.system.quantity ?? 1)) > 0;

/** The treasure an item still counts for XP: its full value, every one of the stack. */
export const treasureValue = (item) => (item?.system?.treasure && !item.system.treasureCounted
  ? (Number(item.system.cost) || 0) * Math.max(1, item.system.quantity ?? 1) : 0);

/** Treasure not yet counted, carried by these actors: [{actor, item, value}]. */
export const treasureCarried = (actors) => actors.flatMap((actor) => actor.items
  .filter((item) => treasureValue(item) > 0)
  .map((item) => ({ actor, item, value: treasureValue(item) })));

/** A chosen PC's companions: NPCs with the companion role whose employer is that PC (p59). */
export const companionsOf = (pcs) => {
  const ids = new Set(pcs.map((a) => a.id));
  return game.actors.filter((a) => a.type === "npc" && a.system.role === "companion" && ids.has(a.system.employer));
};

/**
 * Split treasure XP evenly: a PC takes a share, a companion half of one (p59). Whole XP,
 * rounded down. Pure, for the probe.
 * @returns {{pcs: {actor, xp}[], companions: {actor, xp}[]}}
 */
export const treasureSplit = (xp, pcs, companions = []) => {
  const shares = pcs.length + companions.length * COMPANION_SHARE;
  if (!shares || xp <= 0) return { pcs: [], companions: [] };
  const share = xp / shares;
  return {
    pcs: pcs.map((actor) => ({ actor, xp: Math.floor(share) })),
    companions: companions.map((actor) => ({ actor, xp: Math.floor(share * COMPANION_SHARE) })),
  };
};

const whisperOwners = (actor) => [
  ...game.users.filter((u) => u.isGM).map((u) => u.id),
  ...game.users.filter((u) => !u.isGM && actor?.testUserPermission(u, "OWNER")).map((u) => u.id),
];

/**
 * Sell an item (or some of a stack) for coins: asks how many and shows the price first.
 * Returns the coins received, or null.
 */
export const sellItem = async (item) => {
  const actor = item?.actor;
  if (!actor?.isOwner || !canSell(item)) return null;
  const have = Math.max(1, item.system.quantity ?? 1);
  const idp = foundry.utils.randomID();
  const priceLine = (n) => F(item.system.treasure ? "KNAVERY.Sell.PriceTreasure" : "KNAVERY.Sell.PriceHalf",
    { n, name: item.name, price: sellPrice(item, n) });
  const content = `<p class="kn-sell-price">${esc(priceLine(have))}</p>`
    + (have > 1 ? `<div class="form-group"><label for="${idp}-n">${esc(L("KNAVERY.Sell.HowMany"))}</label>`
      + `<input type="number" id="${idp}-n" name="n" value="${have}" min="1" max="${have}" step="1"></div>` : "")
    + `<p class="hint">${esc(L(item.system.treasure ? "KNAVERY.Sell.TreasureHint" : "KNAVERY.Sell.HalfHint"))}</p>`;
  const n = await foundry.applications.api.DialogV2.prompt({
    classes: ["knavery", "knavery-sell"],
    window: { title: F("KNAVERY.Sell.Title", { name: item.name }), icon: "fa-solid fa-coins" },
    content,
    render: (_e, dialog) => {
      const input = dialog.element.querySelector('input[name="n"]');
      const out = dialog.element.querySelector(".kn-sell-price");
      input?.addEventListener("input", () => {
        const k = Math.min(have, Math.max(1, Math.floor(Number(input.value) || 1)));
        out.textContent = priceLine(k);
      });
    },
    ok: {
      label: "KNAVERY.Sell.Ok", icon: "fa-solid fa-coins",
      callback: (_e, b) => Math.min(have, Math.max(1, Math.floor(Number(b.form.elements.n?.value ?? have) || 1))),
    },
    rejectClose: false,
  });
  if (!n) return null;
  // Re-read: the stack may have changed while the window was open.
  const left = Math.max(1, item.system.quantity ?? 1);
  const sold = Math.min(n, left);
  const price = sellPrice(item, sold);
  await actor.update({ "system.coins": (actor.system.coins ?? 0) + price }, { knNoLog: true });
  if (sold >= left) await item.delete({ knNoLog: true });
  else await item.update({ "system.quantity": left - sold }, { knNoLog: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: whisperOwners(actor),
    content: `<div class="knavery-roll-card kind-sell"><p class="card-note"><i class="fas fa-coins"></i> ${esc(P("KNAVERY.Sell.Sold", sold, { name: item.name, price }))}</p></div>`,
  });
  return price;
};
