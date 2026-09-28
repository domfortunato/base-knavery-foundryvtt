/**
 * The manual-change log: a whispered card listing what a player (or the GM)
 * changed on a sheet by hand, so nobody has to wonder where 400 coins came from.
 *
 * "Manual" means an update made without the option `knNoLog`. Generation,
 * damage, level-up, the marketplace and item offers pass it (or pass
 * `knLogAction` to name themselves on the card instead of staying silent).
 * Gated by the `change-log` world setting.
 */
import { ABILITIES, FLAG_SCOPE, SETTINGS_NS } from "./config.js";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);

/** Tracked scalar fields: source path -> label thunk. */
export const AUDIT_LABELS = {
  "name": () => L("KNAVERY.Name"),
  "system.hp.value": () => L("KNAVERY.HP"),
  "system.hp.max": () => game.i18n.format("KNAVERY.ChangeLog.MaxOf", { label: L("KNAVERY.HP") }),
  "system.coins": () => L("KNAVERY.Coins"),
  "system.xp": () => L("KNAVERY.XP"),
  "system.level": () => L("KNAVERY.Level"),
  "system.wounds": () => L("KNAVERY.Wounds"),
  "system.acOverride": () => L("KNAVERY.AC"),
  "system.pronouns": () => L("KNAVERY.Pronouns"),
};
for (const k of ABILITIES) AUDIT_LABELS[`system.abilities.${k}.value`] = () => L(`KNAVERY.Ability.${k}`);

/** Named actions a button may stamp on its card. */
const AUDIT_ACTIONS = new Set(["KNAVERY.Rest", "KNAVERY.LevelUp", "KNAVERY.HealWound"]);
const MAX_LINES = 200;

const value = (v) => {
  if (v === "" || v === undefined || v === null) return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  return typeof v === "string" ? v : "—";
};

const line = (e) => {
  if (!e || typeof e !== "object") return null;
  const name = typeof e.name === "string" ? e.name : "";
  switch (e.k) {
    case "field":
      if (typeof e.p !== "string" || !Object.hasOwn(AUDIT_LABELS, e.p)) return null;
      return game.i18n.format("KNAVERY.ChangeLog.Field",
        { label: AUDIT_LABELS[e.p](), from: value(e.from), to: value(e.to) });
    case "item":
      if (!name) return null;
      return game.i18n.format(e.added === true ? "KNAVERY.ChangeLog.ItemAdded" : "KNAVERY.ChangeLog.ItemRemoved", { name });
    case "qty":
      if (!name) return null;
      return game.i18n.format("KNAVERY.ChangeLog.Field", { label: name, from: value(Number(e.from)), to: value(Number(e.to)) });
    case "equip":
      if (!name) return null;
      return game.i18n.format(e.on === true ? "KNAVERY.ChangeLog.Equipped" : "KNAVERY.ChangeLog.Unequipped", { name });
    default:
      return null;
  }
};

export const changeLogBody = ({ user, action, entries }) => {
  const who = game.users.get(String(user ?? ""))?.name ?? String(user ?? "");
  const actionKey = AUDIT_ACTIONS.has(action) ? action : null;
  const lines = (Array.isArray(entries) ? entries.slice(0, MAX_LINES) : []).map(line).filter(Boolean);
  return `<div class="change-log">`
    + `<p class="change-log-user">${esc(game.i18n.format("KNAVERY.ChangeLog.By", { user: who }))}</p>`
    + (actionKey ? `<p class="change-log-action">${esc(L(actionKey))}</p>` : "")
    + `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`;
};

const enabled = () => {
  try { return game.settings.get(SETTINGS_NS, "change-log"); } catch { return false; }
};

/** Snapshot the audited fields that an update is about to touch. */
export const stashAudit = (actor, changed) => {
  if (!enabled()) return null;
  const flat = foundry.utils.flattenObject(changed);
  const src = actor.toObject();
  const audit = {};
  for (const p of Object.keys(AUDIT_LABELS)) {
    if (p in flat) audit[p] = foundry.utils.getProperty(src, p) ?? null;
  }
  return Object.keys(audit).length ? audit : null;
};

const post = (actor, entries, userId, action = null) => {
  const speaker = actor.token
    ? ChatMessage.getSpeaker({ token: actor.token })
    : ChatMessage.getSpeaker({ actor });
  const whisper = game.users.filter((u) => actor.testUserPermission(u, "OBSERVER")).map((u) => u.id);
  const data = { user: userId, action, entries };
  return ChatMessage.create({
    speaker, content: changeLogBody(data), whisper,
    flags: { [FLAG_SCOPE]: { changeLog: data } },
  });
};

/** After an actor update: diff against the stash and post. */
export const postActorChanges = (actor, before, options, userId) => {
  if (!before || userId !== game.user.id || options.knNoLog || !enabled()) return;
  const src = actor.toObject();
  const entries = [];
  for (const p of Object.keys(before)) {
    const now = foundry.utils.getProperty(src, p) ?? null;
    if (now !== before[p]) entries.push({ k: "field", p, from: before[p], to: now });
  }
  if (entries.length) post(actor, entries, userId, options.knLogAction ?? null);
};

/** After items were created or deleted on an actor. */
export const postItemChanges = (actor, added, documents, options, userId) => {
  if (userId !== game.user.id || options.knNoLog || !enabled()) return;
  const entries = documents.map((d) => ({ k: "item", added, name: d.name }));
  if (entries.length) post(actor, entries, userId);
};

/** Before embedded item updates: remember quantity and equip state. */
export const stashItemAudit = (actor, changes, options) => {
  if (!enabled()) return;
  for (const change of changes) {
    const item = actor.items.get(change._id);
    if (!item) continue;
    const flat = foundry.utils.flattenObject(change);
    const audit = {};
    if ("system.quantity" in flat) audit.quantity = item._source.system.quantity ?? 1;
    if ("system.equipped" in flat) audit.equipped = item._source.system.equipped === true;
    if (Object.keys(audit).length) ((options.knavery ??= {})[change._id] ??= {}).itemAudit = audit;
  }
};

/** After embedded item updates. */
export const postItemUpdates = (actor, documents, options, userId) => {
  if (userId !== game.user.id || options.knNoLog || !enabled()) return;
  const entries = [];
  for (const d of documents) {
    const before = options.knavery?.[d.id]?.itemAudit;
    if (!before) continue;
    if (before.quantity !== undefined && d._source.system.quantity !== before.quantity) {
      entries.push({ k: "qty", name: d.name, from: before.quantity, to: d._source.system.quantity });
    }
    if (before.equipped !== undefined && d._source.system.equipped !== before.equipped) {
      entries.push({ k: "equip", name: d.name, on: d._source.system.equipped === true });
    }
  }
  if (entries.length) post(actor, entries, userId);
};

/** Rebuild the card from its flag, so crafted HTML in content never renders. */
export const rebuildChangeLogCard = (message, html) => {
  const data = message?.getFlag?.(FLAG_SCOPE, "changeLog");
  if (!data || typeof data !== "object" || !Array.isArray(data.entries)) return;
  const body = html.querySelector(".message-content");
  if (body?.querySelector(".change-log")) body.innerHTML = changeLogBody(data);
};
