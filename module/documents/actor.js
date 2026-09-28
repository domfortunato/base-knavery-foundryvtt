/**
 * The Actor document: inventory arithmetic, damage and wounds, rest, level-up
 * bookkeeping and the change log. Rolls live in rolls.js; the sheet only calls.
 */
import { ABILITIES, MAX_ARMOR_POINTS, SETTINGS_NS, SYS_PATH } from "../config.js";
import {
  postActorChanges, postItemChanges, postItemUpdates, stashAudit, stashItemAudit,
} from "../change-log.js";
import { refillMagicDice } from "../grimoire.js";

/** How many inventory slots one owned item fills. */
export const slotsForItem = (item) => {
  const s = item.system;
  if (item.type === "career") return 0;
  if (s.weightless) return 0;
  if (item.type === "spellbook" && s.bound) return 0;
  const qty = Math.max(0, s.quantity ?? 1);
  const bundle = Math.max(1, s.bundle ?? 1);
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
    const updates = {};
    if (this.type === "character") {
      updates["prototypeToken.actorLink"] = true;
      // The party can see each other's portrait and name (the LIMITED view).
      if ((data.ownership?.default ?? 0) === 0) updates["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
      updates["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      if (!data.img) updates.img = `${SYS_PATH}/icons/background.svg`;
    } else {
      updates["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.HOSTILE;
      if (!data.img) updates.img = `${SYS_PATH}/icons/monster.svg`;
    }
    updates["prototypeToken.bar1.attribute"] = "hp";
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
    if (out.wounds) parts.push(game.i18n.format("KNAVERY.Damage.WoundsTaken", { n: out.wounds }));
    if (!parts.length) parts.push(game.i18n.localize("KNAVERY.Damage.NoEffect"));
    const src = source ? `<p class="dmg-source">${foundry.utils.escapeHTML(source)}</p>` : "";
    const dead = out.dead
      ? `<div class="status-banner status-dead"><i class="fas fa-skull"></i> ${game.i18n.format("KNAVERY.Damage.Dead", { name })}</div>`
      : "";
    const drop = out.wounds && this.type === "character"
      ? `<p class="dmg-drop">${game.i18n.localize("KNAVERY.Damage.DropWounded")}</p>` : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="knavery-damage-card"><h3>${game.i18n.format(out.direct ? "KNAVERY.Damage.DirectTitle" : "KNAVERY.Damage.Title", { name, n: out.amount })}</h3>`
        + `${src}<p>${parts.join(" · ")}</p>${drop}${dead}</div>`,
    });
  }

  /** A night's rest: full HP, spellbooks ready again. */
  async rest() {
    const s = this.system;
    await this.update({ "system.hp.value": s.hp.max, "system.spellsCastToday": 0 }, { knLogAction: "KNAVERY.Rest" });
    const books = this.items.filter((i) => i.type === "spellbook" && i.system.castToday)
      .map((i) => ({ _id: i.id, "system.castToday": false }));
    if (books.length) await this.updateEmbeddedDocuments("Item", books, { knNoLog: true });
    await refillMagicDice(this);
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
