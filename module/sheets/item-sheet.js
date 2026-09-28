/**
 * One item sheet for every item type. A career's sheet is also where a GM
 * builds a custom background: the fields it adds to the character sheet,
 * the items it grants, and its Active Effects (mechanical modifiers that
 * transfer to whoever holds the career).
 */
import { ARMOR_TYPES, FEATURE_TYPES, SYS_PATH } from "../config.js";
import { pickArt } from "../art.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;
const L = (k) => game.i18n.localize(k);

export class KnaveryItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["knavery", "sheet", "item"],
    position: { width: 560, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      editImage: KnaveryItemSheet.#onEditImage,
      addFeature: KnaveryItemSheet.#onAddFeature,
      removeFeature: KnaveryItemSheet.#onRemoveFeature,
      removeStartingItem: KnaveryItemSheet.#onRemoveStartingItem,
      createEffect: KnaveryItemSheet.#onCreateEffect,
      editEffect: KnaveryItemSheet.#onEditEffect,
      deleteEffect: KnaveryItemSheet.#onDeleteEffect,
      toggleEffect: KnaveryItemSheet.#onToggleEffect,
    },
  };

  static PARTS = {
    form: { template: `${SYS_PATH}/templates/item/item-sheet.html`, scrollable: [""] },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const s = item.system;
    Object.assign(context, {
      item,
      system: s,
      editable: this.isEditable,
      idp: this.id,
      isType: Object.fromEntries(["item", "weapon", "armor", "spellbook", "career", "transport"].map((t) => [t, item.type === t])),
      isInventory: item.type !== "career",
      armorTypes: ARMOR_TYPES.map((t) => ({ value: t, label: L(`KNAVERY.ArmorType.${t}`), selected: s.armorType === t })),
      featureTypes: FEATURE_TYPES.map((t) => ({ value: t, label: L(`KNAVERY.FeatureType.${t}`) })),
      features: (s.features ?? []).map((f, i) => ({ ...f, index: i })),
      startingItems: (s.startingItems ?? []).map((entry, i) => ({
        index: i, entry, label: entry.includes(".") ? (fromUuidSync(entry)?.name ?? entry) : entry,
      })),
      effects: item.effects.map((e) => ({ id: e.id, name: e.name, img: e.img, disabled: e.disabled })),
      enrichedDescription: await TextEditor.enrichHTML(s.description ?? "", { relativeTo: item, secrets: item.isOwner }),
      glog: game.settings.get("base-knavery", "enable-glog-grimoire"),
    });
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Starting items: type a name, or drop an Item onto the list.
    const input = this.element.querySelector(".starting-item-input");
    input?.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      await this.item.update({ "system.startingItems": [...this.item.system.startingItems, v] });
    });
    const drop = this.element.querySelector(".starting-items");
    drop?.addEventListener("dragover", (e) => e.preventDefault());
    drop?.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const data = TextEditor.getDragEventData(e);
      if (data?.type !== "Item" || !this.isEditable) return;
      await this.item.update({ "system.startingItems": [...this.item.system.startingItems, data.uuid] });
    });
  }

  /** Feature rows are an array: rebuild it from the flat form keys on submit. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const f = data.system?.features;
    if (f && !Array.isArray(f)) data.system.features = Object.keys(f).sort((a, b) => a - b).map((k) => f[k]);
    return data;
  }

  static async #onEditImage() {
    if (!this.isEditable) return;
    await pickArt({
      current: this.item.img, title: this.item.name, kind: "item",
      onPick: (src) => this.item.update({ img: src }),
    });
  }

  static async #onAddFeature() {
    const features = [...(this.item.system.features ?? []).map((f) => ({ ...f }))];
    features.push({ key: `feature${features.length + 1}`, label: L("KNAVERY.NewFeature"), type: "text", initial: "", max: 0, hint: "" });
    await this.item.update({ "system.features": features });
  }

  static async #onRemoveFeature(_e, target) {
    const i = Number(target.dataset.index);
    const features = (this.item.system.features ?? []).map((f) => ({ ...f })).filter((_, j) => j !== i);
    await this.item.update({ "system.features": features });
  }

  static async #onRemoveStartingItem(_e, target) {
    const i = Number(target.dataset.index);
    await this.item.update({ "system.startingItems": this.item.system.startingItems.filter((_, j) => j !== i) });
  }

  static async #onCreateEffect() {
    const [effect] = await this.item.createEmbeddedDocuments("ActiveEffect", [{
      name: L("KNAVERY.NewEffect"), img: this.item.img, transfer: true,
    }]);
    effect?.sheet.render(true);
  }

  static #onEditEffect(_e, target) {
    this.item.effects.get(target.closest("[data-effect-id]").dataset.effectId)?.sheet.render(true);
  }

  static async #onDeleteEffect(_e, target) {
    await this.item.effects.get(target.closest("[data-effect-id]").dataset.effectId)?.delete();
  }

  static async #onToggleEffect(_e, target) {
    const e = this.item.effects.get(target.closest("[data-effect-id]").dataset.effectId);
    await e?.update({ disabled: !e.disabled });
  }
}
