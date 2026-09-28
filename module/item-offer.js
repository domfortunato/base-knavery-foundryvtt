/**
 * Giving and receiving items between actors (ported from Air Bladder).
 *
 * Peer to peer: the giver's client posts an offer card; the receiving
 * actor's owner accepts or declines on it; the giver's client releases the
 * item data, the acceptor creates the item FIRST, and only then does the giver
 * delete its copy. No GM needs to be online. When one user owns both sides the
 * transfer runs locally.
 */
import { FLAG_SCOPE } from "./config.js";
import { emit, onSocket } from "./socket.js";

const FLAG = "itemOffer";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);
const REFUSALS = {
  answered: "KNAVERY.Offer.Refused.Answered",
  busy: "KNAVERY.Offer.Refused.Busy",
  lapsed: "KNAVERY.Offer.Refused.Lapsed",
  targetGone: "KNAVERY.Offer.Refused.TargetGone",
  notYours: "KNAVERY.Offer.Refused.NotYours",
};
const OFFERABLE = ["item", "weapon", "armor", "spellbook", "transport"];
const pendingAccepts = new Map();
const inFlight = new Map();

/* -------------------------------------------- */
/*  Eligibility and payload                      */
/* -------------------------------------------- */

export const canOfferItem = (item) => !!item?.actor?.isOwner && OFFERABLE.includes(item.type)
  && !item.system?.bound && !item.system?.grimoire;

export const canReceiveOffer = (actor, giver = null) =>
  !!actor && !actor.pack && !actor.isToken && actor.uuid !== giver?.uuid;

const buildItemData = (item) => {
  const data = item.toObject();
  delete data._id;
  data.sort = 0;
  data.system = { ...data.system, equipped: false, quantity: 1 };
  return data;
};

const sanitize = (data) => {
  if (!data || typeof data !== "object" || !OFFERABLE.includes(data.type)) return null;
  if (data.system?.bound || data.system?.grimoire) return null;
  const out = foundry.utils.deepClone(data);
  delete out._id;
  out.sort = 0;
  out.system = { ...(out.system ?? {}), equipped: false, quantity: 1 };
  return out;
};

/** "ok", "overburden" (fits only by going over) or "full" (no slots at all). */
const capacityVerdict = (actor, need) => {
  const max = actor.system.slotsMax ?? 0;
  if (!max || !need) return "ok";
  return actor.calcSlotsUsed() + need > max ? "overburden" : "ok";
};

/** Slots one unit of an item takes (bundled small items count as a whole slot). */
const unitSlots = (item) => (item.system.weightless ? 0 : (item.system.slots ?? 1));

const answerersFor = (actor) => game.users.filter((u) => !u.isGM && actor.testUserPermission(u, "OWNER"));

/* -------------------------------------------- */
/*  Picker and card                              */
/* -------------------------------------------- */

/** Choose who to give `item` to, then post the offer. */
export const promptOfferTarget = async (item) => {
  const giver = item.actor;
  if (!canOfferItem(item)) return ui.notifications.warn("KNAVERY.Offer.CannotGive", { localize: true });
  const targets = game.actors.filter((a) => canReceiveOffer(a, giver) && a.visible)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!targets.length) return ui.notifications.warn("KNAVERY.Offer.NoTargets", { localize: true });
  const groups = [
    ["KNAVERY.Offer.GroupCharacters", (a) => a.type === "character"],
    ["KNAVERY.Offer.GroupPeople", (a) => a.type === "npc" && a.system.role !== "monster"],
    ["KNAVERY.Offer.GroupMonsters", (a) => a.type === "npc" && a.system.role === "monster"],
  ];
  let rows = "";
  let first = true;
  for (const [key, match] of groups) {
    const members = targets.filter(match);
    if (!members.length) continue;
    rows += `<h4 class="knavery-offer-group">${esc(L(key))}</h4>`;
    for (const a of members) {
      const players = answerersFor(a).map((u) => u.name).join(", ");
      rows += `<label class="kn-pick-row"><input type="radio" name="offerTarget" value="${esc(a.uuid)}"${first ? " checked" : ""} />`
        + `<span class="kn-pick-label">${esc(a.name)}${players ? ` <em>(${esc(players)})</em>` : ""}</span></label>`;
      first = false;
    }
  }
  const target = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("KNAVERY.Offer.PickerTitle", { item: item.name }), icon: "fas fa-hand-holding" },
    classes: ["knavery", "knavery-picker"],
    position: { width: 420 },
    content: `<div class="kn-picker"><p>${esc(game.i18n.format("KNAVERY.Offer.PickerBody", { item: item.name, giver: giver.name }))}</p>`
      + `<div class="kn-pick-list">${rows}</div></div>`,
    buttons: [{
      action: "offer", label: "KNAVERY.Offer.Give", icon: "fas fa-hand-holding", default: true,
      callback: (_e, button) => fromUuidSync(button.form.elements.offerTarget?.value ?? "") ?? null,
    }],
    rejectClose: false,
  });
  if (!target) return null;
  const message = await createItemOffer(giver, item, target);
  if (message && target.isOwner && !answerersFor(target).some((u) => u !== game.user)) {
    await onAccept(message);
  }
  return message;
};

export const createItemOffer = async (giver, item, target) => {
  const flag = {
    state: "open", settled: false,
    giverActorUuid: giver.uuid, targetActorUuid: target.uuid,
    itemId: item.id, acceptorUserId: null,
    item: { name: item.name, img: item.img, slots: unitSlots(item) },
  };
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: giver }),
    content: `<div class="knavery-offer-card">${esc(game.i18n.format("KNAVERY.Offer.CardBody", { giver: giver.name, item: item.name, target: target.name }))}</div>`,
    flags: { [FLAG_SCOPE]: { [FLAG]: flag } },
  });
  ui.notifications.info(game.i18n.format("KNAVERY.Offer.Posted", { item: item.name, target: target.name }));
  return message;
};

const names = (offer) => ({
  giver: fromUuidSync(offer?.giverActorUuid ?? "")?.name ?? "?",
  target: fromUuidSync(offer?.targetActorUuid ?? "")?.name ?? "?",
  item: offer?.item?.name ?? "?",
});

/** Render the card's current state and its buttons. */
export const bindOfferCard = (message, html) => {
  const offer = message.getFlag(FLAG_SCOPE, FLAG);
  if (!offer) return;
  const card = html.querySelector(".knavery-offer-card");
  if (!card) return;
  const n = names(offer);
  card.innerHTML = `<div class="knavery-offer-body"><img src="${esc(offer.item?.img ?? "")}" alt="" />`
    + `<span>${esc(game.i18n.format("KNAVERY.Offer.CardBody", n))}</span></div>`
    + `<div class="knavery-offer-state">${esc(game.i18n.format(`KNAVERY.Offer.State.${offer.state}`, n))}</div>`;
  if (offer.state !== "open") return;
  const target = fromUuidSync(offer.targetActorUuid);
  const canAnswer = !!target && (game.user.isGM || target.testUserPermission(game.user, "OWNER"));
  const canCancel = game.user.isGM || message.isAuthor;
  if (!canAnswer && !canCancel) return;
  const actions = document.createElement("div");
  actions.className = "knavery-offer-actions";
  const button = (key, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = L(key);
    b.addEventListener("click", () => fn(message));
    actions.append(b);
  };
  if (canAnswer) {
    button("KNAVERY.Offer.Accept", onAccept);
    button("KNAVERY.Offer.Decline", onDecline);
  }
  if (canCancel) button("KNAVERY.Offer.Cancel", onCancel);
  card.append(actions);
};

/* -------------------------------------------- */
/*  Clicks                                       */
/* -------------------------------------------- */

const onAccept = async (message) => {
  const offer = message.getFlag(FLAG_SCOPE, FLAG);
  if (!offer || offer.state !== "open") return ui.notifications.warn(REFUSALS.answered, { localize: true });
  const target = fromUuidSync(offer.targetActorUuid);
  if (!target) return ui.notifications.warn(game.i18n.format(REFUSALS.targetGone, names(offer)));
  if (!(game.user.isGM || target.testUserPermission(game.user, "OWNER"))) {
    return ui.notifications.warn(game.i18n.format(REFUSALS.notYours, names(offer)));
  }
  if (capacityVerdict(target, offer.item?.slots ?? 1) === "overburden") {
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("KNAVERY.Offer.OverburdenTitle") },
      content: `<p>${esc(game.i18n.format("KNAVERY.Offer.OverburdenBody", names(offer)))}</p>`,
      rejectClose: false,
    });
    if (!yes) return;
  }
  const giver = fromUuidSync(offer.giverActorUuid);
  if ((game.user.isGM || message.isAuthor) && giver?.isOwner && target.isOwner) return runLocal(message);
  if (!message.author?.active) return ui.notifications.warn(game.i18n.format("KNAVERY.Offer.GiverOffline", names(offer)));
  pendingAccepts.set(message.id, true);
  emit("offerAccept", { messageId: message.id }, { recipients: [message.author.id] });
};

const onDecline = async (message) => {
  const offer = message.getFlag(FLAG_SCOPE, FLAG);
  if (!offer || offer.state !== "open") return;
  if (game.user.isGM || message.isAuthor) {
    if (!inFlight.has(message.id)) await message.setFlag(FLAG_SCOPE, FLAG, { state: "declined" });
    return;
  }
  if (!message.author?.active) return ui.notifications.warn(game.i18n.format("KNAVERY.Offer.GiverOffline", names(offer)));
  emit("offerDecline", { messageId: message.id }, { recipients: [message.author.id] });
};

const onCancel = async (message) => {
  const offer = message.getFlag(FLAG_SCOPE, FLAG);
  if (!offer || offer.state !== "open" || !(game.user.isGM || message.isAuthor) || inFlight.has(message.id)) return;
  await message.setFlag(FLAG_SCOPE, FLAG, { state: "cancelled" });
};

/* -------------------------------------------- */
/*  The transaction                              */
/* -------------------------------------------- */

const findStack = (actor, data) => actor.items.find((i) => i.type === data.type && i.name === data.name
  && i.img === data.img && !i.system.equipped && (data.system?.bundle ?? 1) === (i.system.bundle ?? 1)
  && ["item"].includes(i.type));

const deliver = async (target, raw) => {
  const data = sanitize(raw);
  if (!data || !canReceiveOffer(target)) return null;
  const stack = findStack(target, data);
  if (stack) {
    await stack.update({ "system.quantity": (stack.system.quantity ?? 1) + 1 }, { knNoLog: true });
    return stack;
  }
  const [created] = await target.createEmbeddedDocuments("Item", [data]);
  return created ?? null;
};

const removeGiverHalf = async (giver, itemId) => {
  const item = giver?.items.get(itemId);
  if (!item) return;
  const q = (item.system.quantity ?? 1) - 1;
  if (q > 0) await item.update({ "system.quantity": q });
  else await item.delete();
};

const runLocal = async (message) => {
  if (inFlight.has(message.id)) return;
  inFlight.set(message.id, game.user.id);
  try {
    const offer = message.getFlag(FLAG_SCOPE, FLAG);
    if (offer?.state !== "open") return;
    const giver = fromUuidSync(offer.giverActorUuid);
    const target = fromUuidSync(offer.targetActorUuid);
    const item = giver?.items.get(offer.itemId);
    if (!item) {
      await message.setFlag(FLAG_SCOPE, FLAG, { state: "lapsed" });
      return;
    }
    await message.setFlag(FLAG_SCOPE, FLAG, { state: "accepted", acceptorUserId: game.user.id });
    const created = await deliver(target, buildItemData(item));
    if (!created) {
      await message.setFlag(FLAG_SCOPE, FLAG, { state: "open", acceptorUserId: null });
      return ui.notifications.warn("KNAVERY.Offer.Failed", { localize: true });
    }
    await removeGiverHalf(giver, offer.itemId);
    await message.setFlag(FLAG_SCOPE, FLAG, { settled: true });
  } finally {
    inFlight.delete(message.id);
  }
};

/* -------------------------------------------- */
/*  Socket protocol                              */
/* -------------------------------------------- */

const reply = (action, messageId, extra, userId) => emit(action, { messageId, ...extra }, { recipients: [userId] });

const onGiverSide = async (msg, senderId) => {
  const message = game.messages.get(msg?.messageId ?? "");
  if (!message?.isAuthor) return;
  const offer = message.getFlag(FLAG_SCOPE, FLAG);
  const sender = game.users.get(senderId);
  if (!offer || offer.state !== "open") {
    if (offer?.acceptorUserId === senderId) return;
    return reply("offerRefused", msg.messageId, { reason: "answered" }, senderId);
  }
  if (inFlight.has(message.id)) {
    if (inFlight.get(message.id) === senderId) return;
    return reply("offerRefused", msg.messageId, { reason: "busy" }, senderId);
  }
  const target = fromUuidSync(offer.targetActorUuid);
  if (!target) return reply("offerRefused", msg.messageId, { reason: "targetGone" }, senderId);
  if (!sender || !(sender.isGM || target.testUserPermission(sender, "OWNER"))) {
    return reply("offerRefused", msg.messageId, { reason: "notYours" }, senderId);
  }
  if (msg.action === "offerDecline") {
    await message.setFlag(FLAG_SCOPE, FLAG, { state: "declined" });
    return;
  }
  inFlight.set(message.id, senderId);
  try {
    const giver = fromUuidSync(offer.giverActorUuid);
    const item = giver?.items.get(offer.itemId);
    if (!item) {
      await message.setFlag(FLAG_SCOPE, FLAG, { state: "lapsed" });
      return reply("offerRefused", msg.messageId, { reason: "lapsed" }, senderId);
    }
    await message.setFlag(FLAG_SCOPE, FLAG, { state: "accepted", acceptorUserId: senderId });
    reply("offerRelease", msg.messageId, { itemData: buildItemData(item) }, senderId);
  } finally {
    inFlight.delete(message.id);
  }
};

const onRelease = async (msg, senderId) => {
  if (!pendingAccepts.has(msg.messageId)) return;
  const message = game.messages.get(msg.messageId ?? "");
  if (!message || message.author?.id !== senderId) return;
  pendingAccepts.delete(msg.messageId);
  const offer = message.getFlag(FLAG_SCOPE, FLAG);
  const target = fromUuidSync(offer?.targetActorUuid ?? "");
  try {
    const created = target ? await deliver(target, msg.itemData) : null;
    if (!created) throw new Error("delivery refused");
    reply("offerDone", msg.messageId, {}, senderId);
  } catch (err) {
    console.error("Base Knavery | offer delivery failed", err);
    ui.notifications.warn("KNAVERY.Offer.Failed", { localize: true });
    reply("offerFail", msg.messageId, {}, senderId);
  }
};

const onDone = async (msg, senderId) => {
  const message = game.messages.get(msg.messageId ?? "");
  if (!message?.isAuthor) return;
  const offer = message.getFlag(FLAG_SCOPE, FLAG);
  if (offer?.state !== "accepted" || offer.settled || senderId !== offer.acceptorUserId) return;
  if (msg.action === "offerFail") {
    await message.setFlag(FLAG_SCOPE, FLAG, { state: "open", acceptorUserId: null });
    return;
  }
  await removeGiverHalf(fromUuidSync(offer.giverActorUuid), offer.itemId);
  await message.setFlag(FLAG_SCOPE, FLAG, { settled: true });
};

const onRefused = (msg, senderId) => {
  const message = game.messages.get(msg.messageId ?? "");
  if (!pendingAccepts.has(msg.messageId) && !message) return;
  if (message && message.author?.id !== senderId) return;
  pendingAccepts.delete(msg.messageId);
  const key = REFUSALS[msg.reason];
  if (key) ui.notifications.warn(game.i18n.format(key, names(message?.getFlag(FLAG_SCOPE, FLAG))));
};

export const registerOfferSocket = () => {
  onSocket("offerAccept", onGiverSide);
  onSocket("offerDecline", onGiverSide);
  onSocket("offerRelease", onRelease);
  onSocket("offerDone", onDone);
  onSocket("offerFail", onDone);
  onSocket("offerRefused", onRefused);
};

/* -------------------------------------------- */
/*  The drag route                               */
/* -------------------------------------------- */

/** Dropping an item onto a sheet this user does not own offers it instead. */
export const offerFromDrop = async (targetActor, item) => {
  const giver = item?.actor;
  if (!canReceiveOffer(targetActor, giver) || !giver?.isOwner || !canOfferItem(item)) {
    ui.notifications.warn("KNAVERY.Offer.CannotGive", { localize: true });
    return null;
  }
  const yes = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.format("KNAVERY.Offer.DragTitle", { item: item.name }) },
    content: `<p>${esc(game.i18n.format("KNAVERY.Offer.DragBody", { item: item.name, target: targetActor.name }))}</p>`,
    rejectClose: false,
  });
  if (yes) await createItemOffer(giver, item, targetActor);
  return null;
};
