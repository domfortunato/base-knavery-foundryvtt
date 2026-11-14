/**
 * The Actor document: inventory arithmetic, damage and wounds, rest, level-up
 * bookkeeping and the change log. Rolls live in rolls.js; the sheet only calls.
 */
import { ABILITIES, FLAG_SCOPE, MAX_ARMOR_POINTS, SETTINGS_NS, SYS_PATH } from "../config.js";
import {
  postActorChanges, postItemChanges, postItemUpdates, stashAudit, stashItemAudit,
} from "../change-log.js";
import { stripLockedChanges } from "../edit-gates.js";
import { healingRule, usesWounds } from "../rules.js";

/** Food: an item named Ration(s). */
export const RATIONS_RE = /\brations?\b/i;
export const isRations = (item) => item?.type === "item" && RATIONS_RE.test(String(item.name ?? ""));
/** The GM's rations-per-slot setting, 1 when it cannot be read yet. */
export const rationsPerSlot = () => {
  try { return Math.max(1, Number(game.settings.get(SETTINGS_NS, "rations-per-slot")) || 1); } catch { return 1; }
};

/** How many inventory slots one owned item fills. */
export const slotsForItem = (item) => {
  const s = item.system;
  if (item.type === "career") return 0;
  if (s.weightless) return 0;
  const qty = Math.max(0, s.quantity ?? 1);
  // Rations share a slot by the GM's setting (default 1, as both books read).
  const bundle = isRations(item) ? rationsPerSlot() : Math.max(1, s.bundle ?? 1);
  return Math.ceil(qty / bundle) * (s.slots ?? 1);
};

/** Types that live in the inventory list (careers do not). */
export const INVENTORY_TYPES = ["item", "weapon", "armor", "spellbook", "transport"];

export class KnaveryActor extends Actor {
  /* -------------------------------------------- */
  /*  Creation defaults                            */
  /* -------------------------------------------- */

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    // Defaults only: what the creation data says wins, so a duplicate or an
    // import keeps the token the GM set up (Air Bladder's rule).
    const updates = {};
    const token = data.prototypeToken ?? {};
    const D = CONST.TOKEN_DISPOSITIONS;
    if (this.type === "character") {
      if (token.actorLink === undefined) updates["prototypeToken.actorLink"] = true;
      // The party can see each other's portrait and name (the LIMITED view).
      if ((data.ownership?.default ?? 0) === 0) updates["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
      if (token.disposition === undefined) updates["prototypeToken.disposition"] = D.FRIENDLY;
      // Foundry's blank portrait until one is picked or rolled (user, 2026-11-14).
      if (!data.img) updates.img = CONST.DEFAULT_TOKEN;
    } else {
      // Monsters are hostile, people met on the road neutral, the party's hirelings and companions friendly.
      const role = data.system?.role ?? "monster";
      const disposition = role === "monster" ? D.HOSTILE : (role === "npc" ? D.NEUTRAL : D.FRIENDLY);
      if (token.disposition === undefined) updates["prototypeToken.disposition"] = disposition;
      if (!data.img) updates.img = `${SYS_PATH}/icons/monster.svg`;
    }
    if (token.bar1?.attribute === undefined) updates["prototypeToken.bar1.attribute"] = "hp";
    this.updateSource(updates);
    return true;
  }

  /* -------------------------------------------- */
  /*  Derived inventory values                     */
  /* -------------------------------------------- */

  /** Inventory items in sheet order. */
  get inventory() {
    return this.items.filter((i) => INVENTORY_TYPES.includes(i.type))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }

  /** Armor points from worn armor: one per equipped, unbroken piece, max seven. */
  calcArmorPoints() {
    const ap = this.items
      .filter((i) => i.type === "armor" && i.system.equipped && !i.system.broken)
      .reduce((n, i) => n + (i.system.points ?? 1), 0);
    return Math.min(ap, MAX_ARMOR_POINTS);
  }

  calcSlotsUsed() {
    const s = this.system;
    const items = this.inventory.reduce((n, i) => n + slotsForItem(i), 0);
    return items + (s.coinSlots ?? 0) + (this.type === "character" ? (s.wounds ?? 0) : 0);
  }

  /**
   * Lay the inventory out slot by slot, the way the rules read wounds: they
   * fill slots from the highest down, and whatever sits in a wounded slot must
   * be dropped. Returns a map itemId -> { first, last, wounded }.
   */
  slotLayout() {
    const s = this.system;
    const max = s.slotsMax ?? 0;
    const firstWounded = max - (s.wounds ?? 0) + 1;
    const layout = new Map();
    let cursor = 1;
    for (const item of this.inventory) {
      const n = slotsForItem(item);
      if (!n) { layout.set(item.id, { first: null, last: null, wounded: false }); continue; }
      const first = cursor;
      const last = cursor + n - 1;
      cursor = last + 1;
      layout.set(item.id, { first, last, wounded: (s.wounds ?? 0) > 0 && last >= firstWounded });
    }
    return layout;
  }

  /**
   * Add items, stacking plain items onto an identical unequipped row (same
   * name, image and bundle) instead of adding a second row.
   */
  async addItems(dataList, options = {}) {
    const create = [];
    const bump = new Map();
    for (const data of dataList) {
      const qty = Number(data.system?.quantity ?? 1) || 1;
      // Never onto a career's own item: that mark belongs to that one row.
      const same = data.type === "item" && this.items.find((i) => i.type === "item" && i.name === data.name
        && i.img === data.img && !i.system.equipped && (i.system.bundle ?? 1) === (data.system?.bundle ?? 1)
        && !i.getFlag(FLAG_SCOPE, "fromCareer"));
      if (same) bump.set(same.id, (bump.get(same.id) ?? same.system.quantity ?? 1) + qty);
      else {
        const pending = create.find((c) => c.type === "item" && data.type === "item" && c.name === data.name && c.img === data.img);
        if (pending) pending.system.quantity = (pending.system.quantity ?? 1) + qty;
        else create.push(foundry.utils.deepClone(data));
      }
    }
    if (bump.size) {
      await this.updateEmbeddedDocuments("Item", [...bump].map(([_id, q]) => ({ _id, "system.quantity": q })), options);
    }
    return create.length ? this.createEmbeddedDocuments("Item", create, options) : [];
  }

  get overburdened() {
    return this.type === "character" && this.calcSlotsUsed() > (this.system.slotsMax ?? 0);
  }

  getRollData() {
    const data = super.getRollData();
    for (const k of ABILITIES) data[k] = this.type === "npc" ? this.system.bonusFor(k) : this.system.abilities[k].value;
    data.LVL = this.system.level ?? 0;
    return data;
  }

  /** The bonus added to a check with `ability`. */
  abilityBonus(ability) {
    if (this.type === "npc") return this.system.bonusFor(ability);
    return this.system.abilities[ability]?.value ?? 0;
  }

  /* -------------------------------------------- */
  /*  Damage, wounds and healing                   */
  /* -------------------------------------------- */

  /**
   * Apply damage the Knave way.
   *   character: HP first, then each point beyond fills a slot with a wound.
   *              Direct damage skips HP and wounds straight away.
   *              Under Knave 1e's death rule (p5): HP only, to -1 at most; 0 is
   *              unconscious, below 0 dead; direct damage is ordinary damage.
   *   npc:       HP only; direct damage is tripled. Dead at 0 HP.
   * @returns {Promise<{hpLost:number, wounds:number, dead:boolean}>}
   */
  async applyDamage(amount, { direct = false, source = "" } = {}) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    const s = this.system;
    const out = { hpLost: 0, wounds: 0, dead: false, amount, direct };
    if (!amount) return out;

    if (this.type === "npc") {
      const dmg = direct ? amount * 3 : amount;
      const hp = Math.max(0, s.hp.value - dmg);
      out.hpLost = s.hp.value - hp;
      out.dead = hp <= 0;
      await this.update({ "system.hp.value": hp }, { knNoLog: true });
    } else if (!usesWounds()) {
      const hp = Math.max(-1, s.hp.value - amount);
      out.hpLost = s.hp.value - hp;
      out.dead = hp < 0;
      out.unconscious = hp === 0;
      out.direct = false;
      await this.update({ "system.hp.value": hp }, { knNoLog: true });
    } else {
      let remaining = amount;
      let hp = s.hp.value;
      if (!direct) {
        const soak = Math.min(hp, remaining);
        hp -= soak;
        remaining -= soak;
        out.hpLost = soak;
      }
      const woundsBefore = s.wounds;
      const wounds = Math.min(s.slotsMax, woundsBefore + remaining);
      out.wounds = wounds - woundsBefore;
      out.dead = wounds >= s.slotsMax;
      await this.update({ "system.hp.value": hp, "system.wounds": wounds }, { knNoLog: true });
      if (out.wounds && game.settings.get(SETTINGS_NS, "hard-mode-wounds")) await this.#breakWoundedItems();
    }
    await this.#postDamageCard(out, source);
    return out;
  }

  /** Hard mode: whatever sits in a wounded slot breaks. */
  async #breakWoundedItems() {
    const layout = this.slotLayout();
    const updates = this.inventory
      .filter((i) => layout.get(i.id)?.wounded && !i.system.broken && i.type !== "career")
      .map((i) => ({ _id: i.id, "system.broken": true }));
    if (updates.length) await this.updateEmbeddedDocuments("Item", updates, { knNoLog: true });
  }

  async #postDamageCard(out, source) {
    const name = foundry.utils.escapeHTML(this.token?.name ?? this.prototypeToken?.name ?? this.name);
    const parts = [];
    if (out.hpLost) parts.push(game.i18n.format("KNAVERY.Damage.HpLost", { n: out.hpLost }));
    if (out.wounds) parts.push(game.i18n.format(out.wounds === 1 ? "KNAVERY.Damage.WoundsTakenOne" : "KNAVERY.Damage.WoundsTaken", { n: out.wounds }));
    if (!parts.length) parts.push(game.i18n.localize("KNAVERY.Damage.NoEffect"));
    const src = source ? `<p class="dmg-source">${foundry.utils.escapeHTML(source)}</p>` : "";
    const dead = out.dead
      ? `<div class="status-banner status-dead"><i class="fas fa-skull"></i> ${game.i18n.format("KNAVERY.Damage.Dead", { name })}</div>`
      : out.unconscious
        ? `<div class="status-banner status-unconscious"><i class="fas fa-bed"></i> ${game.i18n.format("KNAVERY.Damage.Unconscious", { name })}</div>`
        : "";
    const drop = out.wounds && this.type === "character"
      ? `<p class="dmg-drop">${game.i18n.localize("KNAVERY.Damage.DropWounded")}</p>` : "";
    // A token hidden from the players keeps its name and fate between the GMs.
    const whisper = this.token?.hidden ? game.users.filter((u) => u.isGM).map((u) => u.id) : [];
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="knavery-damage-card"><h3>${game.i18n.format(out.direct ? "KNAVERY.Damage.DirectTitle" : "KNAVERY.Damage.Title", { name, n: out.amount })}</h3>`
        + `${src}<p>${parts.join(" · ")}</p>${drop}${dead}</div>`,
      whisper,
    });
  }

  /**
   * A night's rest (Knave 2e p12). Spellbooks are ready again (a new day). HP
   * returns to max only if the character slept two watches and ate a meal; in a
   * safe haven that night also heals one wound. With no arguments: a full night.
   * Under Knave 1e's healing rule (p5) the night heals d8 + CON bonus, and a safe
   * haven all HP; the dead do not heal.
   * Posts a short card saying what happened.
   */
  async rest({ slept = true, ate = true, haven = false } = {}) {
    const s = this.system;
    const F = (k, d) => game.i18n.format(k, d);
    const healed = slept && ate;
    const k1e = healingRule() === "knave1e" && this.type === "character";
    const healWound = !k1e && healed && haven && s.wounds > 0;
    const update = { "system.spellsCastToday": 0 };
    let hpLine;
    if (k1e && healed && s.hp.value < 0) hpLine = game.i18n.localize("KNAVERY.RestCard.Dead");
    else if (k1e && healed && !haven) {
      const con = s.abilities.CON?.value ?? 0;
      const roll = await new Roll(`1d8 + ${con}`).evaluate();
      const hp = Math.min(s.hp.max, s.hp.value + Math.max(0, roll.total));
      update["system.hp.value"] = hp;
      hpLine = F("KNAVERY.RestCard.Healed1e", { n: hp - s.hp.value, die: roll.dice[0].total, con, hp, max: s.hp.max });
    } else if (healed) {
      update["system.hp.value"] = s.hp.max;
      hpLine = F(k1e ? "KNAVERY.RestCard.Haven1e" : "KNAVERY.RestCard.Hp", { max: s.hp.max });
    } else hpLine = F(k1e ? "KNAVERY.RestCard.NoHp1e" : "KNAVERY.RestCard.NoHp", { hp: s.hp.value });
    if (healWound) update["system.wounds"] = s.wounds - 1;
    await this.update(update, { knLogAction: "KNAVERY.Rest" });
    const books = this.items.filter((i) => i.type === "spellbook" && i.system.castToday)
      .map((i) => ({ _id: i.id, "system.castToday": false }));
    if (books.length) await this.updateEmbeddedDocuments("Item", books, { knNoLog: true });
    const lines = [
      hpLine,
      ...(healWound ? [game.i18n.localize("KNAVERY.RestCard.Wound")] : []),
      game.i18n.localize("KNAVERY.RestCard.Spells"),
    ];
    const esc = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="knavery-roll-card kind-rest"><header class="card-title"><h3><i class="fas fa-campfire"></i> `
        + `${esc(F("KNAVERY.RestCard.Title", { name: this.name }))}</h3></header>`
        + `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`,
    });
  }

  async healWound() {
    if (!this.system.wounds) return;
    await this.update({ "system.wounds": this.system.wounds - 1 }, { knLogAction: "KNAVERY.HealWound" });
  }

  /* -------------------------------------------- */
  /*  Change log plumbing                          */
  /* -------------------------------------------- */

  async _preUpdate(changed, options, user) {
    if ((await super._preUpdate(changed, options, user)) === false) return false;
    if (stripLockedChanges(this, changed, options, user) && user.id === game.user.id) {
      ui.notifications.warn("KNAVERY.Notify.FieldLocked", { localize: true });
    }
    const audit = stashAudit(this, changed);
    if (audit) (options.knavery ??= {})[this.id] = { audit };
    return true;
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    postActorChanges(this, options.knavery?.[this.id]?.audit, options, userId);
  }

  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (parent === this && collection === "items") postItemChanges(this, true, documents, options, userId);
  }

  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (parent === this && collection === "items") postItemChanges(this, false, documents, options, userId);
  }

  _preUpdateDescendantDocuments(parent, collection, changes, options, userId) {
    super._preUpdateDescendantDocuments(parent, collection, changes, options, userId);
    if (parent === this && collection === "items") stashItemAudit(this, changes, options);
  }

  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (parent === this && collection === "items") postItemUpdates(this, documents, options, userId);
  }
}
