/**
 * Applying damage from chat cards. A player may apply damage to anything they
 * own; everything else is relayed to the active GM over the socket.
 */
import { emit } from "./socket.js";
import { rollDamage } from "./rolls.js";

/** Resolve a token or actor UUID to an Actor. */
export const actorFromUuid = (uuid) => {
  const doc = fromUuidSync(uuid);
  if (!doc) return null;
  if (doc instanceof Actor) return doc;
  return doc.actor ?? null;
};

/**
 * Apply `amount` to every target. Owned targets are updated here; the rest go
 * to the GM in one request.
 */
export const applyDamageToTargets = async (uuids, amount, { direct = false, source = "" } = {}) => {
  const relay = [];
  for (const uuid of uuids) {
    const actor = actorFromUuid(uuid);
    if (!actor) continue;
    if (actor.isOwner) await actor.applyDamage(amount, { direct, source });
    else relay.push(uuid);
  }
  if (relay.length) {
    if (!game.users.activeGM) {
      ui.notifications.warn("KNAVERY.Notify.NoGmForDamage", { localize: true });
      return;
    }
    emit("applyDamage", { targets: relay, amount, direct, source });
  }
};

/**
 * Socket handler, run on the active GM only. Any logged-in player may ask:
 * damage in Knave is applied by whoever rolled it, and the GM sees the card.
 */
export const handleApplyDamage = async (msg, senderId) => {
  if (!game.user.isActiveGM || !game.users.get(senderId)) return;
  const targets = Array.isArray(msg.targets) ? msg.targets.filter((t) => typeof t === "string").slice(0, 50) : [];
  const amount = Math.max(0, Math.floor(Number(msg.amount) || 0));
  for (const uuid of targets) {
    const actor = actorFromUuid(uuid);
    if (actor) await actor.applyDamage(amount, { direct: msg.direct === true, source: String(msg.source ?? "").slice(0, 200) });
  }
};

/** Wire the buttons on our roll cards. Called from renderChatMessageHTML. */
export const bindRollCard = (message, html) => {
  const card = html.querySelector(".knavery-roll-card");
  if (!card) return;

  for (const btn of card.querySelectorAll("[data-kn-apply]")) {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const amount = Number(btn.dataset.amount);
      const direct = btn.dataset.knApply === "direct";
      let targets = [];
      try { targets = JSON.parse(btn.dataset.targets || "[]"); } catch { targets = []; }
      if (!targets.length) targets = [...game.user.targets].map((t) => t.document.uuid);
      if (!targets.length) targets = canvas.tokens?.controlled.map((t) => t.document.uuid) ?? [];
      if (!targets.length) return ui.notifications.warn("KNAVERY.Notify.NoTargets", { localize: true });
      await applyDamageToTargets(targets, amount, { direct });
    });
  }

  const rollBtn = card.querySelector("[data-kn-roll-damage]");
  rollBtn?.addEventListener("click", async (event) => {
    event.preventDefault();
    const weapon = await fromUuid(rollBtn.dataset.weapon);
    const actor = weapon?.actor ?? (await fromUuid(rollBtn.dataset.actor));
    if (!weapon || !actor) return;
    if (!actor.isOwner) return ui.notifications.warn("KNAVERY.Notify.NotYourAttack", { localize: true });
    let targets = [];
    try { targets = JSON.parse(rollBtn.dataset.targets || "[]"); } catch { targets = []; }
    await rollDamage(actor, {
      formula: weapon.system.damage,
      label: weapon.name,
      power: rollBtn.dataset.power === "1",
      targets,
    });
  });
};
