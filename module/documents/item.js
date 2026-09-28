/**
 * The Item document: default art per type and a few derived display flags.
 */
import { SYS_PATH } from "../config.js";

const ICONS = {
  item: "generic-item",
  weapon: "weapons",
  armor: "armor",
  spellbook: "spellbook",
  career: "background",
  transport: "cart",
};

export const defaultItemImg = (type, system = {}) => {
  if (type === "spellbook" && system.scroll) return `${SYS_PATH}/icons/spellscroll.svg`;
  return `${SYS_PATH}/icons/${ICONS[type] ?? "generic-item"}.svg`;
};

export class KnaveryItem extends Item {
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
    s.canCast = this.type === "spellbook" && !s.bound;
    s.hasPlusMinus = ["item", "weapon"].includes(this.type) && ((s.quantity ?? 1) > 1 || (s.bundle ?? 1) > 1);
    s.canGive = this.isEmbedded && this.type !== "career";
  }

  /** The ability an attack with this weapon rolls. */
  get attackAbility() {
    return this.system.attackType === "ranged" ? "WIS" : "STR";
  }
}
