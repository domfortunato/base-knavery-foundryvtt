/**
 * Applying damage from chat cards. Damage in Knave is applied by whoever
 * rolled it: the card's author (and the GM) get the Apply buttons. Targets the
 * roller owns are updated on their own client; the rest are relayed to the
 * active GM, who checks the request against the card it came from.
 */
import { FLAG_SCOPE } from "./config.js";
import { emit } from "./socket.js";
import { rollDamage } from "./rolls.js";

const { DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);

/** Most targets one relayed request may name. */
const MAX_RELAY_TARGETS = 50;

/** Resolve a token or actor UUID to an Actor. */
export const actorFromUuid = (uuid) => {
  const doc = fromUuidSync(uuid, { strict: false });
  if (!doc) return null;
  if (doc instanceof Actor) return doc;
  return doc.actor ?? null;
};

/** The damage total a roll card carries, or null when it is not a damage card. */
const cardDamage = (message) => {
  const f = message?.flags?.[FLAG_SCOPE];
  const total = f?.damage?.total ?? f?.attack?.damage;
  return Number.isFinite(total) ? total : null;
};

/**
 * May `user` aim damage at `uuid`? A token they can see on the scene (not
 * hidden), or an actor they hold at least LIMITED on.
 */
const userMayTarget = (user, uuid) => {
  const doc = fromUuidSync(uuid, { strict: false });
  if (!doc) return false;
  if (doc instanceof Actor) return doc.testUserPermission(user, "LIMITED");
  const actor = doc.actor;
  if (!actor) return false;
  if (actor.testUserPermission(user, "OWNER")) return true;
  return !doc.hidden || actor.testUserPermission(user, "LIMITED");
};

/**
 * Apply `amount` to every target. Owned targets are updated here; the rest go
 * to the GM in one request that names the card they came from.
 */
export const applyDamageToTargets = async (uuids, amount, { direct = false, source = "", messageId = null } = {}) => {
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
    emit("applyDamage", { targets: relay, amount, direct, source, messageId });
  }
};

/**
 * Socket handler, run on the active GM only. The request must come from the
 * author of a damage card, for that card's total, at targets the sender can
 * see; anything else is dropped.
 */
export const handleApplyDamage = async (msg, senderId) => {
  const sender = game.users.get(senderId);
  if (!game.user.isActiveGM || !sender) return;
  const message = game.messages.get(String(msg?.messageId ?? ""));
  const total = cardDamage(message);
  if (!message || message.author?.id !== senderId || total === null) return;
  const amount = Math.max(0, Math.floor(Number(msg.amount) || 0));
  if (amount !== total) return;
  const targets = Array.isArray(msg.targets)
    ? msg.targets.filter((t) => typeof t === "string" && userMayTarget(sender, t)).slice(0, MAX_RELAY_TARGETS) : [];
  for (const uuid of targets) {
    const actor = actorFromUuid(uuid);
    if (actor) await actor.applyDamage(amount, { direct: msg.direct === true, source: String(msg.source ?? "").slice(0, 200) });
  }
  if (targets.length) await markApplied(message);
};

/** Stamp a card as applied, so a second Apply asks first. */
const markApplied = (message) => (message.isOwner
  ? message.setFlag(FLAG_SCOPE, "damageApplied", true) : null);

/** Wire the buttons on our roll cards. Called from renderChatMessageHTML. */
export const bindRollCard = (message, html) => {
  const card = html.querySelector(".knavery-roll-card");
  if (!card) return;

  const mayApply = game.user.isGM || message.isAuthor;
  const applied = message.getFlag(FLAG_SCOPE, "damageApplied") === true;
  if (!mayApply) card.querySelector(".card-apply")?.remove();
  else if (applied) {
    const box = card.querySelector(".card-apply");
    box?.classList.add("applied");
    box?.insertAdjacentHTML("afterbegin", `<span class="card-applied"><i class="fas fa-check"></i> ${foundry.utils.escapeHTML(L("KNAVERY.Roll.Applied"))}</span>`);
  }

  for (const btn of card.querySelectorAll("[data-kn-apply]")) {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      if (message.getFlag(FLAG_SCOPE, "damageApplied") === true) {
        const again = await DialogV2.confirm({
          window: { title: L("KNAVERY.Roll.AppliedTitle") },
          content: `<p>${foundry.utils.escapeHTML(L("KNAVERY.Roll.AppliedAgain"))}</p>`,
          rejectClose: false,
        });
        if (!again) return;
      }
      const amount = Number(btn.dataset.amount);
      const direct = btn.dataset.knApply === "direct";
      let targets = [];
      try { targets = JSON.parse(btn.dataset.targets || "[]"); } catch { targets = []; }
      if (!targets.length) targets = [...game.user.targets].map((t) => t.document.uuid);
      if (!targets.length) targets = canvas.tokens?.controlled.map((t) => t.document.uuid) ?? [];
      if (!targets.length) return ui.notifications.warn("KNAVERY.Notify.NoTargets", { localize: true });
      await applyDamageToTargets(targets, amount, { direct, messageId: message.id });
      // The roller's own client stamps the card when it applied something
      // locally; the GM stamps it after a relay.
      if (targets.some((t) => actorFromUuid(t)?.isOwner)) await markApplied(message);
    });
  }

  const rollBtn = card.querySelector("[data-kn-roll-damage]");
  rollBtn?.addEventListener("click", async (event) => {
    event.preventDefault();
    // An improvised attack has no weapon item: the card carries its formula and label.
    const weapon = rollBtn.dataset.weapon ? await fromUuid(rollBtn.dataset.weapon) : null;
    const actor = weapon?.actor ?? (await fromUuid(rollBtn.dataset.actor));
    const formula = weapon?.system.damage ?? rollBtn.dataset.formula;
    if (!actor || !formula) return;
    if (!actor.isOwner) return ui.notifications.warn("KNAVERY.Notify.NotYourAttack", { localize: true });
    let targets = [];
    try { targets = JSON.parse(rollBtn.dataset.targets || "[]"); } catch { targets = []; }
    await rollDamage(actor, {
      formula,
      label: weapon?.name ?? rollBtn.dataset.label ?? "",
      power: rollBtn.dataset.power === "1",
      targets,
    });
  });
};
