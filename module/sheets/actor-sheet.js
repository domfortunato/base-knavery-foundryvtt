/**
 * The actor sheet — one ApplicationV2 class for characters and NPCs. Its pages
 * are turned from a thumb-tab rail hung off the window's edge (tab-rail.js): the
 * Knave page carries the head (portrait, name, careers, level, coins) over the
 * six abilities, the vitals (AC, HP and wounds as bars, Rest, Heal Wound, Die of
 * Fate) and the attacks; then Inventory, Growth and Description. The frame
 * carries Roll Character, the Char Gen Mode toggle, the Level Up arrow, Pop Out
 * and Print.
 */
import {
  ABILITIES, LEVEL_UP_ABILITIES, NPC_ROLES, SETTINGS_NS, SYS_PATH, TABLES,
} from "../config.js";
import { slotsForItem } from "../documents/actor.js";
import { levelLadder } from "../data-models.js";
import { mayEditAbilities, mayEditCareers, mayEditLevelXp, mayUseCharGen } from "../edit-gates.js";
import { scaledPosition } from "../settings.js";
import { attackRow, castSpell, openAttack, rollAttack, rollCheck, rollDamage, rollDieOfFate, rollMorale } from "../rolls.js";
import { pickArt, randomPortraitPair, setActorArt } from "../art.js";
import { drawFrom, pickFrom } from "../compendium.js";
import {
  addCareer, careerFromText, chooseCareer, drawCareerExcept, pickCareerItem, regenerateCharacter,
  removeCareer, replaceCareer, rollFullName, rollTraits,
} from "../character-generator.js";
import { hpRuleHint, openLevelUp } from "../level-up.js";
import { canOfferItem, offerFromDrop, promptOfferTarget } from "../item-offer.js";
import { openMarketplace, playerMarketClosed } from "../marketplace.js";
import { printActorSheet } from "../print.js";
import { placeRail, placeRailSoon } from "./tab-rail.js";
import { enrichForSheet } from "../clean-html.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/**
 * Form inputs render the STORED value: the form submits whole on every change,
 * so an input showing an Active-Effect-modified value would write it back to
 * source, and a career's "+2 max HP" would compound on every edit. Where an
 * effect changes a field, its input is marked and its tooltip gives the value
 * in play. Returns the attribute string for the input ("" when unmodified).
 */
const effectAttrs = (actor, path) => {
  const live = foundry.utils.getProperty(actor.system, path);
  const stored = foundry.utils.getProperty(actor._source.system, path);
  if (live === stored || live === undefined) return "";
  const tip = foundry.utils.escapeHTML(F("KNAVERY.EffectModified", { value: live }));
  return ` data-kn-modified data-tooltip-text="${tip}"`;
};

/**
 * The pages, by id, each with its label and its icon on the rail (parts/tab-rail.html),
 * and the set each actor type shows. Both types open on `knave`: a character's
 * Knave page, an NPC's creature page under a different label and icon.
 */
const TABS = {
  knave: { label: "KNAVERY.Tab.Knave", icon: "fa-solid fa-mask" },
  inventory: { label: "KNAVERY.Tab.Inventory", icon: "fa-solid fa-sack" },
  growth: { label: "KNAVERY.Tab.Growth", icon: "fa-solid fa-seedling" },
  description: { label: "KNAVERY.Tab.Description", icon: "fa-solid fa-feather" },
};
const NPC_KNAVE_TAB = { label: "KNAVERY.Tab.Npc", icon: "fa-solid fa-dragon" };
const TAB_IDS = {
  character: ["knave", "inventory", "growth", "description"],
  npc: ["knave", "inventory", "description"],
};

/** Guard: the sheet must be editable by this user. */
const owned = (fn) => function (event, target) {
  if (!this.isEditable) {
    ui.notifications.warn(F("KNAVERY.Notify.NotEditable", { name: this.document.name }));
    return undefined;
  }
  return fn.call(this, event, target);
};

/** Guard: careers change only while this user may (players: level 1, Char Gen Mode). */
const careerGate = (fn) => function (event, target) {
  if (!mayEditCareers(this.actor)) {
    ui.notifications.warn("KNAVERY.Notify.CareersLocked", { localize: true });
    return undefined;
  }
  return fn.call(this, event, target);
};

/** Guard: Char Gen Mode must be allowed for this user. */
const mayRandomize = (fn) => function (event, target) {
  if (!this._mayRandomize()) {
    ui.notifications.warn("KNAVERY.Notify.RandomizationDisabled", { localize: true });
    return undefined;
  }
  return fn.call(this, event, target);
};

/** A character sheet's width before the text size scales it. NPCs keep DEFAULT_OPTIONS' 640. */
const CHARACTER_SHEET_WIDTH = 440;
/** Tall enough for the Knave page and no more; the longer pages scroll (user, 2026-11-14). */
const CHARACTER_SHEET_HEIGHT = 660;

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
      rollCareer: owned(mayRandomize(careerGate(KnaveryActorSheet.#onRollCareer))),
      pickCareer: owned(mayRandomize(careerGate(KnaveryActorSheet.#onPickCareer))),
      changeCareer: owned(careerGate(KnaveryActorSheet.#onChangeCareer)),
      removeCareer: owned(careerGate(KnaveryActorSheet.#onRemoveCareer)),
      rollAllTraits: owned(mayRandomize(KnaveryActorSheet.#onRollAllTraits)),
      openCareer: KnaveryActorSheet.#onOpenCareer,
      rollAbility: KnaveryActorSheet.#onRollAbility,
      rollMorale: KnaveryActorSheet.#onRollMorale,
      attack: KnaveryActorSheet.#onAttack,
      rollWeaponDamage: KnaveryActorSheet.#onRollWeaponDamage,
      castSpell: owned(KnaveryActorSheet.#onCastSpell),
      dieOfFate: KnaveryActorSheet.#onDieOfFate,
      rest: owned(KnaveryActorSheet.#onRest),
      healWound: owned(KnaveryActorSheet.#onHealWound),
      addWound: owned(KnaveryActorSheet.#onAddWound),
      hpUp: owned(KnaveryActorSheet.#onHpStep),
      hpDown: owned(KnaveryActorSheet.#onHpStep),
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
    },
  };

  /**
   * The rail first, then the sheet. Both render into `.window-content`, where
   * core's changeTab looks for the tabs; the rail takes no room there, hanging
   * outside the window (tab-rail.js and the stylesheet).
   */
  static PARTS = {
    rail: {
      template: `${SYS_PATH}/templates/parts/tab-rail.html`,
    },
    form: {
      template: `${SYS_PATH}/templates/actor/character-sheet.html`,
      templates: [
        `${SYS_PATH}/templates/parts/ability-list.html`,
        `${SYS_PATH}/templates/parts/items-list.html`,
        `${SYS_PATH}/templates/parts/careers-block.html`,
      ],
      scrollable: [""],
    },
  };

  static TABS = {
    primary: {
      tabs: TAB_IDS.character.map((id) => ({ id, ...TABS[id] })),
      initial: "knave",
    },
  };

  #expandedRows = new Set();
  #traitsCollapsed = false;
  #dragDrop = null;

  _initializeApplicationOptions(options) {
    const applied = super._initializeApplicationOptions(options);
    if (options.document?.type === "npc") applied.classes.push("knavery-npc-sheet");
    // A character's sheet is as wide as its abilities and vitals (user, 2026-11-14); attacks are a window.
    else Object.assign(applied.position, { width: CHARACTER_SHEET_WIDTH, height: CHARACTER_SHEET_HEIGHT });
    // Opens larger with the player's text size.
    applied.position = scaledPosition(applied.position);
    return applied;
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.form.template = `${SYS_PATH}/templates/actor/${this.actor.type}-sheet.html`;
    return parts;
  }

  /** Each actor type shows its own page set; an NPC's first page wears its own label and icon. */
  _getTabsConfig(group) {
    const base = super._getTabsConfig(group);
    if (group !== "primary" || !base) return base;
    const ids = TAB_IDS[this.actor.type] ?? TAB_IDS.character;
    const tabFor = (id) => (id === "knave" && this.actor.type === "npc" ? NPC_KNAVE_TAB : TABS[id]);
    return { ...base, tabs: ids.map((id) => ({ id, ...tabFor(id) })) };
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
      ...(isChar ? [{ action: "levelUp", icon: "fas fa-circle-up", label: "KNAVERY.LevelUpArrow" }] : []),
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
    // The Level Up arrow stays a bare icon (core's frame button, with its tooltip), lit in the accent.
    frame.querySelector('.window-header button[data-action="levelUp"]')?.classList.add("knavery-levelup-arrow");
    const header = frame.querySelector(".window-header");
    const controls = header?.querySelector('button[data-action="toggleControls"]');
    const close = header?.querySelector('button[data-action="close"]');
    if (controls && close) close.before(controls);
    this.#syncFrameButtons(frame);
    return frame;
  }

  _mayRandomize() {
    return mayUseCharGen(this.actor);
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
    // Up arrow: Char Gen Mode on and XP enough for the next level.
    root?.querySelector('.window-header button[data-action="levelUp"]')
      ?.classList.toggle("knavery-header-hidden", denied || !on || !this.actor.system.canLevelUp || !this.isEditable);
    if (!toggle) return;
    const label = L(on ? "KNAVERY.CreationModeOn" : "KNAVERY.CreationModeOff");
    toggle.setAttribute("aria-label", label);
    toggle.lastChild.textContent = label;
    toggle.dataset.tooltip = on ? "KNAVERY.CreationModeHintOn" : "KNAVERY.CreationModeHintOff";
    toggle.querySelector("i")?.classList.replace(on ? "fa-toggle-off" : "fa-toggle-on", on ? "fa-toggle-on" : "fa-toggle-off");
  }

  /** A move between browser windows: the rail's side is decided against the new one. */
  _onDetach(from, to) { super._onDetach?.(from, to); this.#syncPopOut(); placeRailSoon(this); }
  _onAttach(from, to) { super._onAttach?.(from, to); this.#syncPopOut(); placeRailSoon(this); }
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
    const coinSlotStart = 1 + Math.max(0, ...[...layout.values()].map((l) => l.last ?? 0));
    const inventory = actor.inventory;

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
        canCast: item.type === "spellbook",
        castToday: item.type === "spellbook" && item.system.castToday,
        canGive: this.isEditable && canOfferItem(item),
        expanded: this.#expandedRows.has(item.id),
      };
    });
    for (const row of items) {
      if (row.expanded) {
        row.enriched = await enrichForSheet(row.system.description ?? "", {
          relativeTo: actor.items.get(row.id), secrets: actor.isOwner,
        });
      }
    }

    const attacks = inventory.filter((i) => i.type === "weapon" && i.system.equipped).map((w) => attackRow(actor, w));

    const abilities = ABILITIES.map((key) => ({
      key,
      label: L(`KNAVERY.AbilityShort.${key}`),
      name: L(`KNAVERY.Ability.${key}`),
      hint: L(`KNAVERY.AbilityHint.${key}`),
      value: actor._source.system.abilities?.[key]?.value ?? 0,
      effAttrs: effectAttrs(actor, `abilities.${key}.value`),
      defense: s.abilities[key].defense,
      tip: F("KNAVERY.AbilityTip", { name: L(`KNAVERY.Ability.${key}`), defense: s.abilities[key].defense }),
    }));

    const banners = [];
    if (s.dead) banners.push({ key: "dead", icon: "fa-skull", label: L("KNAVERY.Status.Dead"), text: L("KNAVERY.Status.DeadText") });
    else if (isChar && s.hp.value <= 0) banners.push({ key: "critical", icon: "fa-heart-crack", label: L("KNAVERY.Status.NoHp"), text: L("KNAVERY.Status.NoHpText") });
    if (isChar && items.some((i) => i.wounded)) banners.push({ key: "wounded", icon: "fa-droplet", label: L("KNAVERY.Status.Wounded"), text: L("KNAVERY.Status.WoundedText") });
    if (actor.overburdened) banners.push({ key: "overburdened", icon: "fa-weight-hanging", label: L("KNAVERY.Status.Overburdened"), text: L("KNAVERY.Status.OverburdenedText") });

    // Careers change at creation only: players in Char Gen Mode at level 1; the GM in Char Gen Mode at any level.
    const careerEdit = gen && isChar && mayEditCareers(actor);
    const careers = await this.#careerContext(careerEdit);
    const ladder = levelLadder();
    const levelRow = ladder.find((r) => r.level === s.level);

    // The bars and the Growth page's ladder: shares of a whole, clamped to 0–100.
    const percent = (value, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round((100 * value) / max))) : 0);
    const xpFloor = levelRow?.xp ?? 0;
    const levelLadderRows = isChar ? ladder.map((r) => ({
      level: r.level, xp: r.xp, title: L(`KNAVERY.LevelTitle.${r.level}`),
      current: r.level === s.level, reached: s.xp >= r.xp,
    })) : [];
    const slotsUsed = actor.calcSlotsUsed();
    const showLevelUp = isChar && s.canLevelUp && s.generationEnabled === true && this.isEditable && this._mayRandomize();
    // What a new level brings, by the GM's HP rule (stored max: effects are not rolled into it).
    const levelRule = !isChar ? "" : s.nextXp === null ? L("KNAVERY.Growth.TopLevel")
      : F("KNAVERY.Growth.EachLevel", { n: LEVEL_UP_ABILITIES, hp: hpRuleHint(s.level + 1, actor._source.system.hp.max) });

    const traitKeys = Object.keys(TABLES.traits);
    // Knave 2e's traits first (filled from the GM's PDF), then Knave 1e's (shipped); each group headed once.
    const KNAVE_2E_TRAITS = ["personality", "mannerism"];
    const traitRows = traitKeys.map((key, i) => {
      const group = KNAVE_2E_TRAITS.includes(key) ? "2e" : "1e";
      const prev = i ? (KNAVE_2E_TRAITS.includes(traitKeys[i - 1]) ? "2e" : "1e") : null;
      return {
        key, label: L(`KNAVERY.Trait.${key}`), value: actor._source.system.traits?.[key] ?? "", table: TABLES.traits[key],
        heading: group !== prev ? L(group === "2e" ? "KNAVERY.TraitGroup2e" : "KNAVERY.TraitGroup1e") : null,
      };
    });

    Object.assign(context, {
      actor,
      system: s,
      source: actor._source.system,
      effAttrs: Object.fromEntries([
        ["level", "level"], ["xp", "xp"], ["coins", "coins"], ["hpMax", "hp.max"], ["hpValue", "hp.value"],
        ["wounds", "wounds"], ["morale", "morale"],
      ].map(([k, path]) => [k, effectAttrs(actor, path)])),
      isCharacter: isChar,
      isNpc: actor.type === "npc",
      isGM: game.user.isGM,
      editable: this.isEditable,
      limitedView: actor.limited && !actor.isOwner,
      idp: this.id,
      generationEnabled: gen,
      mayEditAbilities: this.isEditable && mayEditAbilities(actor),
      mayEditLevelXp: this.isEditable && mayEditLevelXp(actor),
      levelRule,
      gmNotes: isChar ? {
        editable: game.user.isGM,
        value: s.gmNotes ?? "",
        enriched: await enrichForSheet(s.gmNotes ?? "", { relativeTo: actor, secrets: game.user.isGM }),
      } : null,
      careerEdit,
      coinsTakeSlots: game.settings.get(SETTINGS_NS, "coins-take-slots"),
      abilities,
      attacks,
      items,
      // Coin slots follow the items, so a wound with no empty slot reaches them before any item.
      coinRows: Array.from({ length: s.coinSlots ?? 0 }, (_, i) => ({
        wounded: isChar && (s.wounds ?? 0) > 0 && coinSlotStart + i >= (s.slotsMax ?? 0) - (s.wounds ?? 0) + 1,
      })),
      woundRows: isChar ? Array.from({ length: s.wounds ?? 0 }, (_, i) => i) : [],
      slotsUsed,
      slotsMax: s.slotsMax,
      overburdened: actor.overburdened,
      banners,
      careers,
      levelTitle: levelRow ? L(`KNAVERY.LevelTitle.${levelRow.level}`) : "",
      levelLadder: levelLadderRows,
      hpFull: isChar && s.hp.value >= s.hp.max,
      woundsFull: isChar && s.wounds >= s.slotsMax,
      xpPercent: isChar ? (s.nextXp ? percent(s.xp - xpFloor, s.nextXp - xpFloor) : 100) : 0,
      showLevelUp,
      hpLow: s.hp.value < s.hp.max,
      hpPeril: s.hp.value <= 0,
      hpPercent: percent(s.hp.value, s.hp.max),
      woundPeril: isChar && s.wounds > 0,
      woundPercent: isChar ? percent(s.wounds, s.slotsMax) : 0,
      traitRows,
      showTraits: game.settings.get(SETTINGS_NS, "show-traits"),
      traitsCollapsed: this.#traitsCollapsed,
      showShop: isChar && this.isEditable && !playerMarketClosed(),
      roles: NPC_ROLES.map((r) => ({ value: r, label: L(`KNAVERY.Role.${r}`) })),
      enrichedNotes: await enrichForSheet(s.notes ?? "", { relativeTo: actor, secrets: actor.isOwner }),
      enrichedBio: await enrichForSheet(s.biography ?? s.description ?? "", { relativeTo: actor, secrets: actor.isOwner }),
      spellsLeft: isChar ? Math.max(0, s.spellsPerDay - s.spellsCastToday) : null,
      // The sheet's footer is the short line; the welcome window carries the full disclaimer and credit.
      disclaimer: L("KNAVERY.DisclaimerShort"),
      logo: `${SYS_PATH}/logo/made-for-knave-black.png`,
      logoDark: `${SYS_PATH}/logo/made-for-knave-white.png`,
    });
    // The rail's tooltips: each page's own word, the Inventory's with its slots; Growth marks a level-up waiting.
    // A LIMITED viewer sees only portrait and name, so no rail and no slot count.
    for (const tab of Object.values(context.tabs ?? {})) {
      tab.tip = tab.id === "inventory" && s.slotsMax && !context.limitedView
        ? F("KNAVERY.Tab.InventoryCount", { used: slotsUsed, max: s.slotsMax })
        : L(tab.label);
      tab.attention = tab.id === "growth" && showLevelUp;
    }
    return context;
  }

  /** Careers on the actor, with the feature fields they add to the sheet. */
  async #careerContext(careerEdit) {
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
        description: await enrichForSheet(career.system.description ?? "", { relativeTo: career }),
        features,
        effects: career.effects.filter((e) => !e.disabled).map((e) => e.name),
        canRemove: careerEdit,
        canChange: careerEdit,
      });
    }
    return out;
  }

  /* -------------------------------------------- */
  /*  Rendering and listeners                      */
  /* -------------------------------------------- */

  async _onRender(context, options) {
    // Awaited: DocumentSheetV2._onRender disables every form control of a sheet
    // this user cannot edit only after its own await, so re-enabling before it
    // finished was undone (Air Bladder review #18).
    await super._onRender(context, options);
    this.#syncFrameButtons();
    const root = this.element;
    // The rail, the Die of Fate and the rolls stay live on sheets this user cannot edit.
    root.querySelectorAll("[data-always-live]").forEach((el) => { el.disabled = false; });

    // A character's AC is derived; typing a value sets an override, the reset
    // icon clears it. An NPC's AC input is a plain form field (it has a name).
    root.querySelector(".ac-input:not([name])")?.addEventListener("change", async (ev) => {
      const v = ev.currentTarget.value.trim();
      const n = Number(v);
      await this.actor.update({ "system.acOverride": v === "" || !Number.isFinite(n) || n === this.actor.system.acDerived ? null : Math.floor(n) });
    });
    placeRailSoon(this);
  }

  /** Every move, a drag's every frame included, decides the rail's side again (tab-rail.js). */
  _onPosition(position) {
    super._onPosition(position);
    placeRail(this, position);
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
      onRoll: this.actor.system.generationEnabled === true && this._mayRandomize()
        ? () => KnaveryActorSheet.#onRollPortrait.call(this) : null,
    });
  }

  static async #onRollPortrait() {
    const kind = this.actor.type === "npc" && this.actor.system.role === "monster" ? "monster" : "person";
    const pair = await randomPortraitPair(kind);
    if (pair) await setActorArt(this.actor, pair.img);
  }

  static async #onRollName() {
    const name = await rollFullName({ warn: true });
    if (name) await this.actor.update({ name, "prototypeToken.name": name });
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
    if (ok) await removeCareer(this.actor, item);
  }

  /** Swap one career (or the failed career) for another: rolled, or picked from the list. */
  static async #onChangeCareer(_event, target) {
    const old = this.actor.items.get(target.closest("[data-career-id]")?.dataset.careerId);
    if (!old) return;
    const others = this.actor.items.filter((i) => i.type === "career").map((i) => i.name);
    const next = target.dataset.mode === "pick" ? await chooseCareer() : await drawCareerExcept(others);
    if (!next) return target.dataset.mode === "pick" ? null : ui.notifications.warn("KNAVERY.Notify.NoCareers", { localize: true });
    await replaceCareer(this.actor, old, next);
  }

  static async #onRollAllTraits() {
    const traits = await rollTraits();
    if (Object.keys(traits).length) await this.actor.update({ "system.traits": traits });
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
    // The same fallback the pips are drawn with: an unclicked track reads its initial value.
    const stored = foundry.utils.getProperty(this.actor, path);
    const now = Number(stored ?? target.dataset.initial) || 0;
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

  static async #onRollMorale() {
    await rollMorale(this.actor);
  }

  /** A weapon's own d20 (Inventory, NPCs) attacks with it; the character's Attack button asks which weapon. */
  static async #onAttack(_event, target) {
    if (!this.actor.isOwner) return;
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (!id) return openAttack(this.actor);
    const item = this.actor.items.get(id);
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

  /** The HP bar's + and −: one point, between 0 and max. A manual step never spills into wounds. */
  static async #onHpStep(_event, target) {
    const { value, max } = this.actor.system.hp;
    const next = Math.max(0, Math.min(max, value + (target.dataset.action === "hpUp" ? 1 : -1)));
    if (next !== value) await this.actor.update({ "system.hp.value": next });
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

  static async #onItemShop() {
    await openMarketplace(this.actor);
  }
}
