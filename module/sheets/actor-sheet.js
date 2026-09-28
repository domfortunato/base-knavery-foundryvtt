/**
 * The actor sheet — one ApplicationV2 class for characters and NPCs, laid out
 * after Air Bladder's: portrait, name block, three buttons (Rest, Heal Wound,
 * Die of Fate), the ability grid, then tabs. The frame carries Roll Character,
 * the Character Creation Mode toggle, Pop Out and Print.
 */
import {
  ABILITIES, LEVELS, NPC_ROLES, SAVE_CATEGORIES, SETTINGS_NS, SYS_PATH, TABLES,
} from "../config.js";
import { slotsForItem } from "../documents/actor.js";
import { castSpell, rollAttack, rollCheck, rollDamage, rollDieOfFate, rollMorale, rollSave } from "../rolls.js";
import { pickArt, randomPortraitPair, setActorArt } from "../art.js";
import { drawFrom, pickFrom } from "../compendium.js";
import { addCareer, careerFromText, pickCareerItem, regenerateCharacter } from "../character-generator.js";
import { openLevelUp } from "../level-up.js";
import { canOfferItem, offerFromDrop, promptOfferTarget } from "../item-offer.js";
import { openMarketplace, playerMarketClosed } from "../marketplace.js";
import { printActorSheet } from "../print.js";
import { bindSpell, castWithMagicDice, createGrimoire, glogEnabled, grimoireContext, unbindSpell } from "../grimoire.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

const TAB_LABELS = {
  items: "KNAVERY.Tab.Items",
  description: "KNAVERY.Tab.Description",
  notes: "KNAVERY.Tab.Notes",
};

/** Guard: the sheet must be editable by this user. */
const owned = (fn) => function (event, target) {
  if (!this.isEditable) {
    ui.notifications.warn(F("KNAVERY.Notify.NotEditable", { name: this.document.name }));
    return undefined;
  }
  return fn.call(this, event, target);
};

/** Guard: creation tools must be allowed for this user. */
const mayRandomize = (fn) => function (event, target) {
  if (!this._mayRandomize()) {
    ui.notifications.warn("KNAVERY.Notify.RandomizationDisabled", { localize: true });
    return undefined;
  }
  return fn.call(this, event, target);
};

export class KnaveryActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["knavery", "sheet", "actor"],
    position: { width: 640, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollActor: owned(mayRandomize(KnaveryActorSheet.#onRollActor)),
      toggleGeneration: owned(mayRandomize(KnaveryActorSheet.#onToggleGeneration)),
      printSheet: KnaveryActorSheet.#onPrint,
      editPortrait: owned(KnaveryActorSheet.#onEditPortrait),
      rollPortrait: owned(mayRandomize(KnaveryActorSheet.#onRollPortrait)),
      rollName: owned(mayRandomize(KnaveryActorSheet.#onRollName)),
      pickName: owned(mayRandomize(KnaveryActorSheet.#onPickName)),
      rollTrait: owned(mayRandomize(KnaveryActorSheet.#onRollTrait)),
      pickTrait: owned(mayRandomize(KnaveryActorSheet.#onPickTrait)),
      rollCareer: owned(mayRandomize(KnaveryActorSheet.#onRollCareer)),
      pickCareer: owned(mayRandomize(KnaveryActorSheet.#onPickCareer)),
      removeCareer: owned(KnaveryActorSheet.#onRemoveCareer),
      openCareer: KnaveryActorSheet.#onOpenCareer,
      rollAbility: KnaveryActorSheet.#onRollAbility,
      rollSave: KnaveryActorSheet.#onRollSave,
      rollMorale: KnaveryActorSheet.#onRollMorale,
      attack: KnaveryActorSheet.#onAttack,
      rollWeaponDamage: KnaveryActorSheet.#onRollWeaponDamage,
      castSpell: owned(KnaveryActorSheet.#onCastSpell),
      dieOfFate: KnaveryActorSheet.#onDieOfFate,
      rest: owned(KnaveryActorSheet.#onRest),
      healWound: owned(KnaveryActorSheet.#onHealWound),
      addWound: owned(KnaveryActorSheet.#onAddWound),
      levelUp: owned(KnaveryActorSheet.#onLevelUp),
      acReset: owned(KnaveryActorSheet.#onAcReset),
      itemCreate: owned(KnaveryActorSheet.#onItemCreate),
      itemEdit: KnaveryActorSheet.#onItemEdit,
      itemDelete: owned(KnaveryActorSheet.#onItemDelete),
      itemToggleEquipped: owned(KnaveryActorSheet.#onItemToggleEquipped),
      itemAddQty: owned(KnaveryActorSheet.#onItemAddQty),
      itemRemoveQty: owned(KnaveryActorSheet.#onItemRemoveQty),
      itemDescription: KnaveryActorSheet.#onItemDescription,
      itemGive: owned(KnaveryActorSheet.#onItemGive),
      itemShop: owned(KnaveryActorSheet.#onItemShop),
      toggleTraits: KnaveryActorSheet.#onToggleTraits,
      featureTrack: owned(KnaveryActorSheet.#onFeatureTrack),
      rollFeatureDie: KnaveryActorSheet.#onRollFeatureDie,
      createGrimoire: owned(KnaveryActorSheet.#onCreateGrimoire),
      bindSpell: owned(KnaveryActorSheet.#onBindSpell),
      unbindSpell: owned(KnaveryActorSheet.#onUnbindSpell),
      castGlog: owned(KnaveryActorSheet.#onCastGlog),
    },
  };

  static PARTS = {
    form: {
      template: `${SYS_PATH}/templates/actor/character-sheet.html`,
      templates: [`${SYS_PATH}/templates/parts/items-list.html`, `${SYS_PATH}/templates/parts/careers-block.html`],
      scrollable: [""],
    },
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "items", label: TAB_LABELS.items },
        { id: "description", label: TAB_LABELS.description },
        { id: "notes", label: TAB_LABELS.notes },
      ],
      initial: "items",
    },
  };

  #expandedRows = new Set();
  #traitsCollapsed = true;
  #dragDrop = null;

  _initializeApplicationOptions(options) {
    const applied = super._initializeApplicationOptions(options);
    if (options.document?.type === "npc") applied.classes.push("knavery-npc-sheet");
    return applied;
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.form.template = `${SYS_PATH}/templates/actor/${this.actor.type}-sheet.html`;
    return parts;
  }

  /* -------------------------------------------- */
  /*  Frame                                        */
  /* -------------------------------------------- */

  _getFrameButtons() {
    const buttons = super._getFrameButtons();
    const popOut = { action: "detach", icon: "fas fa-arrow-up-right-from-square", label: "KNAVERY.PopOut" };
    const print = { action: "printSheet", icon: "fas fa-print", label: "KNAVERY.Print" };
    if (!this.actor.isOwner) return [popOut, print, ...buttons];
    const isChar = this.actor.type === "character";
    return [
      { action: "rollActor", icon: isChar ? "fas fa-dice-d6" : "fas fa-dragon", label: isChar ? "KNAVERY.RollCharacter" : "KNAVERY.RollNpc" },
      { action: "toggleGeneration", icon: "fas fa-toggle-on", label: "KNAVERY.CreationModeOn" },
      popOut,
      print,
      ...buttons,
    ];
  }

  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    for (const action of ["rollActor", "toggleGeneration", "detach", "printSheet"]) {
      const button = frame.querySelector(`.window-header button[data-action="${action}"]`);
      if (!button) continue;
      const glyph = [...button.classList].filter((c) => c === "fas" || c.startsWith("fa-"));
      button.classList.remove(...glyph, "icon");
      button.classList.add("knavery-header-button");
      const icon = document.createElement("i");
      icon.className = glyph.join(" ");
      button.removeAttribute("data-tooltip");
      button.append(icon, document.createTextNode(button.getAttribute("aria-label") ?? ""));
    }
    const header = frame.querySelector(".window-header");
    const controls = header?.querySelector('button[data-action="toggleControls"]');
    const close = header?.querySelector('button[data-action="close"]');
    if (controls && close) close.before(controls);
    this.#syncFrameButtons(frame);
    return frame;
  }

  _mayRandomize() {
    if (game.user.isGM) return true;
    if (this.actor.type !== "character") return false;
    return game.settings.get(SETTINGS_NS, "allow-player-randomization");
  }

  #syncFrameButtons(root = this.element) {
    root?.querySelector('.window-header button[data-action="printSheet"]')
      ?.classList.toggle("knavery-header-hidden", this.document.limited);
    const roll = root?.querySelector('.window-header button[data-action="rollActor"]');
    const toggle = root?.querySelector('.window-header button[data-action="toggleGeneration"]');
    const denied = !this._mayRandomize();
    const on = this.actor.system.generationEnabled === true;
    toggle?.classList.toggle("knavery-header-hidden", denied);
    roll?.classList.toggle("knavery-header-hidden", !on || denied);
    if (!toggle) return;
    const label = L(on ? "KNAVERY.CreationModeOn" : "KNAVERY.CreationModeOff");
    toggle.setAttribute("aria-label", label);
    toggle.lastChild.textContent = label;
    toggle.dataset.tooltip = on ? "KNAVERY.CreationModeHintOn" : "KNAVERY.CreationModeHintOff";
    toggle.querySelector("i")?.classList.replace(on ? "fa-toggle-off" : "fa-toggle-on", on ? "fa-toggle-on" : "fa-toggle-off");
  }

  _onDetach(from, to) { super._onDetach?.(from, to); this.#syncPopOut(); }
  _onAttach(from, to) { super._onAttach?.(from, to); this.#syncPopOut(); }
  #syncPopOut() {
    this.element?.querySelector('.window-header button[data-action="detach"]')
      ?.classList.toggle("knavery-header-hidden", !this._canDetach?.());
  }

  /* -------------------------------------------- */
  /*  Context                                      */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const s = actor.system;
    const isChar = actor.type === "character";
    const gen = s.generationEnabled === true && this._mayRandomize() && this.isEditable;
    const layout = actor.slotLayout();
    const glog = glogEnabled();
    const grimoire = grimoireContext(actor);
    const inventory = actor.inventory.filter((i) => !(glog && i.type === "spellbook" && i.system.bound));

    const items = inventory.map((item) => {
      const slots = slotsForItem(item);
      const pos = layout.get(item.id);
      const tags = [];
      if (item.type === "weapon") {
        tags.push(item.system.damage);
        tags.push(L(item.system.attackType === "ranged" ? "KNAVERY.Ranged" : "KNAVERY.Melee"));
        if (item.system.hands === 2) tags.push(L("KNAVERY.TwoHanded"));
      }
      if (item.type === "armor") tags.push(F("KNAVERY.NAp", { n: item.system.points }));
      if (item.type === "spellbook") tags.push(L(item.system.scroll ? "KNAVERY.Scroll" : "KNAVERY.Spellbook"));
      if (item.system.quantity > 1) tags.push(F("KNAVERY.NQuantity", { n: item.system.quantity }));
      return {
        id: item.id,
        uuid: item.uuid,
        name: item.name,
        img: item.img,
        type: item.type,
        system: item.system,
        tags,
        slots,
        slotLabel: slots === 0 ? "—" : (pos?.first === pos?.last ? `${pos.first}` : `${pos.first}–${pos.last}`),
        wounded: pos?.wounded ?? false,
        broken: item.system.broken,
        canAttack: item.type === "weapon" && item.system.equipped,
        canCast: item.type === "spellbook" && !item.system.bound,
        canBind: !!grimoire?.exists && item.type === "spellbook" && !item.system.scroll && !item.system.bound,
        isGrimoire: item.type === "item" && item.system.grimoire,
        castToday: item.type === "spellbook" && item.system.castToday,
        canGive: this.isEditable && canOfferItem(item),
        expanded: this.#expandedRows.has(item.id),
      };
    });
    for (const row of items) {
      if (row.expanded) {
        row.enriched = await TextEditor.enrichHTML(row.system.description ?? "", {
          relativeTo: actor.items.get(row.id), secrets: actor.isOwner,
        });
      }
    }

    const attacks = inventory.filter((i) => i.type === "weapon" && i.system.equipped).map((w) => {
      const ability = w.attackAbility;
      const bonus = actor.abilityBonus(ability);
      return {
        id: w.id, name: w.name, damage: w.system.damage, broken: w.system.broken,
        kind: L(w.system.attackType === "ranged" ? "KNAVERY.Ranged" : "KNAVERY.Melee"),
        ability: L(`KNAVERY.AbilityShort.${ability}`),
        bonus: bonus >= 0 ? `+${bonus}` : `${bonus}`,
        range: w.system.range,
      };
    });

    const abilities = ABILITIES.map((key) => ({
      key,
      label: L(`KNAVERY.AbilityShort.${key}`),
      name: L(`KNAVERY.Ability.${key}`),
      value: s.abilities[key].value,
      defense: s.abilities[key].defense,
      tip: F("KNAVERY.AbilityTip", { name: L(`KNAVERY.Ability.${key}`), defense: s.abilities[key].defense }),
    }));

    const saves = Object.entries(SAVE_CATEGORIES).map(([key, ability]) => ({
      key, label: L(`KNAVERY.Save.${key}`), ability: L(`KNAVERY.AbilityShort.${ability}`),
    }));

    const banners = [];
    if (s.dead) banners.push({ key: "dead", icon: "fa-skull", label: L("KNAVERY.Status.Dead"), text: L("KNAVERY.Status.DeadText") });
    else if (isChar && s.hp.value <= 0) banners.push({ key: "critical", icon: "fa-heart-crack", label: L("KNAVERY.Status.NoHp"), text: L("KNAVERY.Status.NoHpText") });
    if (isChar && items.some((i) => i.wounded)) banners.push({ key: "wounded", icon: "fa-droplet", label: L("KNAVERY.Status.Wounded"), text: L("KNAVERY.Status.WoundedText") });
    if (actor.overburdened) banners.push({ key: "overburdened", icon: "fa-weight-hanging", label: L("KNAVERY.Status.Overburdened"), text: L("KNAVERY.Status.OverburdenedText") });

    const careers = await this.#careerContext(gen);
    const levelRow = LEVELS.find((r) => r.level === s.level);

    const traitKeys = Object.keys(TABLES.traits);
    const traitRows = traitKeys.map((key) => ({
      key, label: L(`KNAVERY.Trait.${key}`), value: s.traits?.[key] ?? "", table: TABLES.traits[key],
    }));

    Object.assign(context, {
      actor,
      system: s,
      source: actor._source.system,
      isCharacter: isChar,
      isNpc: actor.type === "npc",
      isGM: game.user.isGM,
      editable: this.isEditable,
      limitedView: actor.limited && !actor.isOwner,
      idp: this.id,
      generationEnabled: gen,
      abilities,
      abilityRows: [abilities.slice(0, 3), abilities.slice(3)],
      saves,
      attacks,
      items,
      coinRows: Array.from({ length: s.coinSlots ?? 0 }, (_, i) => i),
      woundRows: isChar ? Array.from({ length: s.wounds ?? 0 }, (_, i) => i) : [],
      slotsUsed: actor.calcSlotsUsed(),
      slotsMax: s.slotsMax,
      banners,
      careers,
      levelTitle: levelRow ? L(`KNAVERY.LevelTitle.${levelRow.level}`) : "",
      showLevelUp: isChar && s.canLevelUp && s.generationEnabled === true && this.isEditable,
      hpLow: s.hp.value < s.hp.max,
      hpPeril: s.hp.value <= 0,
      woundPeril: isChar && s.wounds > 0,
      traitRows,
      showTraits: game.settings.get(SETTINGS_NS, "show-traits"),
      traitsCollapsed: this.#traitsCollapsed,
      showShop: isChar && this.isEditable && !playerMarketClosed(),
      roles: NPC_ROLES.map((r) => ({ value: r, label: L(`KNAVERY.Role.${r}`) })),
      enrichedNotes: await TextEditor.enrichHTML(s.notes ?? "", { relativeTo: actor, secrets: actor.isOwner }),
      enrichedBio: await TextEditor.enrichHTML(s.biography ?? s.description ?? "", { relativeTo: actor, secrets: actor.isOwner }),
      grimoire,
      spellsLeft: isChar ? Math.max(0, s.spellsPerDay - s.spellsCastToday) : null,
      disclaimer: L("KNAVERY.Disclaimer"),
      logo: `${SYS_PATH}/logo/made-for-knave-black.png`,
    });
    return context;
  }

  /** Careers on the actor, with the feature fields they add to the sheet. */
  async #careerContext(gen) {
    const s = this.actor.system;
    const out = [];
    for (const career of this.actor.items.filter((i) => i.type === "career")) {
      const ckey = career.system.key || career.id;
      const features = (career.system.features ?? []).filter((f) => f.key).map((f) => {
        const path = `system.features.${ckey}.${f.key}`;
        const stored = foundry.utils.getProperty(s.features ?? {}, `${ckey}.${f.key}`);
        const value = stored ?? (f.type === "number" || f.type === "track" ? Number(f.initial) || 0
          : f.type === "checkbox" ? f.initial === "true" : f.initial);
        return {
          ...f, path, value,
          isText: f.type === "text",
          isNumber: f.type === "number",
          isCheckbox: f.type === "checkbox",
          isTrack: f.type === "track",
          isDie: f.type === "die",
          pips: f.type === "track" ? Array.from({ length: Math.max(0, f.max || 0) }, (_, i) => ({ i: i + 1, on: i < value })) : [],
        };
      });
      out.push({
        id: career.id,
        name: career.name,
        img: career.img,
        description: await TextEditor.enrichHTML(career.system.description ?? "", { relativeTo: career }),
        features,
        effects: career.effects.filter((e) => !e.disabled).map((e) => e.name),
        canRemove: gen || game.user.isGM,
      });
    }
    return out;
  }

  /* -------------------------------------------- */
  /*  Rendering and listeners                      */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    this.#syncFrameButtons();
    const root = this.element;
    // The Die of Fate and the rolls stay live on sheets this user cannot edit.
    root.querySelectorAll("[data-always-live]").forEach((el) => { el.disabled = false; });

    // AC is derived; typing a value sets an override, the reset icon clears it.
    root.querySelector(".ac-input")?.addEventListener("change", async (ev) => {
      const v = ev.currentTarget.value.trim();
      const n = Number(v);
      await this.actor.update({ "system.acOverride": v === "" || !Number.isFinite(n) || n === this.actor.system.acDerived ? null : Math.floor(n) });
    });
  }

  /** Rows drag by their own element; Foundry's default selector is `.draggable`. */
  get _dragDrop() {
    return this.#dragDrop ??= new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".knavery-items-list-row[data-item-id]",
      permissions: {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this),
      },
      callbacks: {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this),
      },
    });
  }

  _canDragStart() { return this.isEditable; }

  /** Owners drop freely; anyone else's drop becomes an offer. */
  _canDragDrop() { return this.isEditable || !this.actor.isOwner; }

  /** A drop onto a sheet this user does not own becomes an item offer. */
  async _onDropItem(event, item) {
    if (!this.actor.isOwner) {
      await offerFromDrop(this.actor, item);
      return null;
    }
    if (item.parent === this.actor) return super._onDropItem(event, item);
    if (item.type === "career") {
      await addCareer(this.actor, item);
      return null;
    }
    // A move between two sheets this user owns: create here, delete there.
    const result = await super._onDropItem(event, item);
    if (result && item.parent instanceof Actor && item.parent !== this.actor && item.parent.isOwner) {
      await item.delete();
    }
    return result;
  }

  /* -------------------------------------------- */
  /*  Actions: frame                               */
  /* -------------------------------------------- */

  static async #onRollActor() {
    await regenerateCharacter(this.actor);
  }

  static async #onToggleGeneration() {
    await this.actor.update({ "system.generationEnabled": !this.actor.system.generationEnabled }, { knNoLog: true });
  }

  static async #onPrint() {
    if (this.document.limited) return;
    await printActorSheet(this.actor);
  }

  /* -------------------------------------------- */
  /*  Actions: identity                            */
  /* -------------------------------------------- */

  static async #onEditPortrait() {
    await pickArt({
      current: this.actor.img,
      title: F("KNAVERY.Art.ChooseFor", { name: this.actor.name }),
      kind: this.actor.type === "npc" && this.actor.system.role === "monster" ? "monster" : "person",
      onPick: (src) => setActorArt(this.actor, src),
    });
  }

  static async #onRollPortrait() {
    const kind = this.actor.type === "npc" && this.actor.system.role === "monster" ? "monster" : "person";
    const pair = await randomPortraitPair(kind);
    if (pair) await setActorArt(this.actor, pair.img);
  }

  static async #onRollName() {
    const first = await drawFrom(TABLES.namesA);
    if (!first) return;
    const last = await drawFrom(TABLES.surnames, { warn: false });
    await this.actor.update({ name: last ? `${first.text} ${last.text}` : first.text,
      "prototypeToken.name": last ? `${first.text} ${last.text}` : first.text });
  }

  static async #onPickName() {
    const pick = await pickFrom(TABLES.namesA, { title: L("KNAVERY.PickName") });
    if (pick) await this.actor.update({ name: pick.text, "prototypeToken.name": pick.text });
  }

  static async #onRollTrait(_event, target) {
    const key = target.dataset.key;
    const r = await drawFrom(TABLES.traits[key]);
    if (r) await this.actor.update({ [`system.traits.${key}`]: r.text });
  }

  static async #onPickTrait(_event, target) {
    const key = target.dataset.key;
    const r = await pickFrom(TABLES.traits[key], { title: L(`KNAVERY.Trait.${key}`) });
    if (r) await this.actor.update({ [`system.traits.${key}`]: r.text });
  }

  static async #onRollCareer() {
    const r = await drawFrom(TABLES.careers);
    if (r) await careerFromText(this.actor, r.result, r.text);
  }

  static async #onPickCareer() {
    await pickCareerItem(this.actor);
  }

  static async #onRemoveCareer(_event, target) {
    const item = this.actor.items.get(target.closest("[data-career-id]")?.dataset.careerId);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("KNAVERY.RemoveCareer") },
      content: `<p>${F("KNAVERY.RemoveCareerConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`,
    });
    if (ok) await item.delete();
  }

  static #onOpenCareer(_event, target) {
    this.actor.items.get(target.closest("[data-career-id]")?.dataset.careerId)?.sheet.render(true);
  }

  static #onToggleTraits() {
    this.#traitsCollapsed = !this.#traitsCollapsed;
    this.render();
  }

  static async #onFeatureTrack(_event, target) {
    const path = target.dataset.path;
    const i = Number(target.dataset.i);
    const now = Number(foundry.utils.getProperty(this.actor, path)) || 0;
    await this.actor.update({ [path]: now === i ? i - 1 : i });
  }

  static async #onRollFeatureDie(_event, target) {
    const formula = target.dataset.formula;
    if (!formula) return;
    const roll = await new Roll(formula.replace(/^d/, "1d")).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: target.dataset.label });
  }

  /* -------------------------------------------- */
  /*  Actions: rolls                               */
  /* -------------------------------------------- */

  static async #onRollAbility(_event, target) {
    if (!this.actor.isOwner) return;
    await rollCheck(this.actor, target.dataset.ability);
  }

  static async #onRollSave(_event, target) {
    if (!this.actor.isOwner) return;
    await rollSave(this.actor, target.dataset.save);
  }

  static async #onRollMorale() {
    await rollMorale(this.actor);
  }

  static async #onAttack(_event, target) {
    if (!this.actor.isOwner) return;
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) await rollAttack(this.actor, item);
  }

  static async #onRollWeaponDamage(_event, target) {
    if (!this.actor.isOwner) return;
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) await rollDamage(this.actor, { formula: item.system.damage, label: item.name });
  }

  static async #onCastSpell(_event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) await castSpell(this.actor, item);
  }

  static async #onDieOfFate() {
    await rollDieOfFate(this.actor);
  }

  static async #onRest() {
    await this.actor.rest();
  }

  static async #onHealWound() {
    await this.actor.healWound();
  }

  static async #onAddWound() {
    await this.actor.update({ "system.wounds": Math.min(this.actor.system.slotsMax, this.actor.system.wounds + 1) });
  }

  static async #onLevelUp() {
    await openLevelUp(this.actor);
  }

  static async #onAcReset() {
    await this.actor.update({ "system.acOverride": null });
  }

  /* -------------------------------------------- */
  /*  Actions: items                               */
  /* -------------------------------------------- */

  #itemFrom(target) {
    return this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static async #onItemCreate(_event, target) {
    const type = target.dataset.type ?? "item";
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{
      name: F("KNAVERY.NewItem", { type: L(`TYPES.Item.${type}`) }), type,
    }]);
    item?.sheet.render(true);
  }

  static #onItemEdit(_event, target) {
    this.#itemFrom(target)?.sheet.render(true);
  }

  static async #onItemDelete(_event, target) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("KNAVERY.DeleteItem") },
      content: `<p>${F("KNAVERY.DeleteItemConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`,
    });
    if (ok) await item.delete();
  }

  static async #onItemToggleEquipped(_event, target) {
    const item = this.#itemFrom(target);
    if (item) await item.update({ "system.equipped": !item.system.equipped });
  }

  static async #onItemAddQty(_event, target) {
    const item = this.#itemFrom(target);
    if (item) await item.update({ "system.quantity": (item.system.quantity ?? 1) + 1 });
  }

  static async #onItemRemoveQty(_event, target) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const q = (item.system.quantity ?? 1) - 1;
    if (q <= 0) return KnaveryActorSheet.#onItemDelete.call(this, _event, target);
    await item.update({ "system.quantity": q });
  }

  static #onItemDescription(_event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (!id) return;
    if (this.#expandedRows.has(id)) this.#expandedRows.delete(id);
    else this.#expandedRows.add(id);
    this.render();
  }

  static async #onItemGive(_event, target) {
    const item = this.#itemFrom(target);
    if (item) await promptOfferTarget(item);
  }

  static async #onCreateGrimoire() {
    await createGrimoire(this.actor);
  }

  static async #onBindSpell(_event, target) {
    const item = this.#itemFrom(target);
    if (item) await bindSpell(this.actor, item);
  }

  static async #onUnbindSpell(_event, target) {
    const item = this.#itemFrom(target);
    if (item) await unbindSpell(item);
  }

  static async #onCastGlog(_event, target) {
    const item = this.#itemFrom(target);
    if (item) await castWithMagicDice(this.actor, item);
  }

  static async #onItemShop() {
    await openMarketplace(this.actor);
  }
}
