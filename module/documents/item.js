/**
 * The Item document: default art per type and a few derived display flags.
 */
import { SYS_PATH } from "../config.js";
import { INVENTORY_TYPES, isRations, rationsPerSlot } from "./actor.js";

/**
 * Where an arriving item goes on a character's list (user, 2026-11-14, on every
 * add): weapons, then armor, then spellbooks, then everything else.
 */
const BANDS = { weapon: 0, armor: 1, spellbook: 2 };
const bandOf = (type) => BANDS[type] ?? 3;

const ICONS = {
  item: "generic-item",
  weapon: "weapons",
  armor: "armor",
  spellbook: "spellbook",
  career: "career",
  transport: "cart",
};

export const defaultItemImg = (type, system = {}) => {
  if (type === "spellbook" && system.scroll) return `${SYS_PATH}/icons/spellscroll.svg`;
  return `${SYS_PATH}/icons/${ICONS[type] ?? "generic-item"}.svg`;
};

export class KnaveryItem extends Item {
  /**
   * Place each arriving inventory item, whatever sort it brings (a world or
   * compendium item carries its sidebar's), directly under the
   * last row of its band or a band above it, in the list as the sheet shows it.
   * A new weapon lands under the last weapon, armor under the last armor, and
   * anything else at the bottom. Rows already there keep their order; when two
   * neighbours leave no integer between them (an old sheet with every sort 0),
   * the list is renumbered once, in its current order. `knKeepSort` opts out.
   */
  static async _preCreateOperation(documents, operation, user) {
    if ((await super._preCreateOperation(documents, operation, user)) === false) return false;
    const parent = operation.parent;
    if (parent?.documentName !== "Actor") return undefined;
    const inventory = (d) => INVENTORY_TYPES.includes(d.type);
    if (operation.knKeepSort) return undefined;
    const placing = documents.filter(inventory);
    if (!placing.length) return undefined;
    const D = CONST.SORT_INTEGER_DENSITY;
    const rows = parent.items.filter(inventory)
      .map((i) => ({ id: i.id, band: bandOf(i.type), sort: i.sort ?? 0 }))
      .sort((a, b) => a.sort - b.sort);
    const renumber = async () => {
      const updates = [];
      rows.forEach((r, i) => {
        r.sort = (i + 1) * D;
        if (r.id) updates.push({ _id: r.id, sort: r.sort });
        else r.doc.updateSource({ sort: r.sort });
      });
      if (updates.length) await parent.updateEmbeddedDocuments("Item", updates, { knNoLog: true, render: false });
    };
    for (const doc of placing) {
      const band = bandOf(doc.type);
      let at = 0;
      rows.forEach((r, i) => { if (r.band <= band) at = i + 1; });
      const gap = () => {
        const lo = at > 0 ? rows[at - 1].sort : null;
        const hi = at < rows.length ? rows[at].sort : null;
        if (lo === null && hi === null) return D;
        if (hi === null) return lo + D;
        if (lo === null) return hi - D;
        return hi - lo >= 2 ? Math.floor((lo + hi) / 2) : null;
      };
      let sort = gap();
      if (sort === null) { await renumber(); sort = gap(); }
      doc.updateSource({ sort });
      rows.splice(at, 0, { doc, band, sort });
    }
    return undefined;
  }

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (!data.img || data.img === Item.DEFAULT_ICON) {
      this.updateSource({ img: defaultItemImg(this.type, data.system) });
    }
    return true;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const s = this.system;
    s.isEquipable = ["weapon", "armor"].includes(this.type);
    s.isAttack = this.type === "weapon";
    s.canCast = this.type === "spellbook";
    s.hasPlusMinus = ["item", "weapon"].includes(this.type)
      && ((s.quantity ?? 1) > 1 || (s.bundle ?? 1) > 1 || (isRations(this) && rationsPerSlot() > 1));
    s.canGive = this.isEmbedded && this.type !== "career";
  }

  /** The ability an attack with this weapon rolls. */
  get attackAbility() {
    return this.system.attackType === "ranged" ? "WIS" : "STR";
  }
}
