/**
 * World settings, shown through four grouped Configure Settings submenus
 * (ported from Air Bladder's SettingsGroupMenu). Every setting is `config:
 * false`; the order a GM sees is each group's `keys`.
 */
import { ADVANTAGE_MODES, FIRST_LEVEL_HP, LEVEL_HP_RULES, MAX_LEVEL, RULEBOOK, RULES_PRESETS, SETTINGS_NS, SYS_PATH, TABLES } from "./config.js";
import { rulesFor, usesCareers } from "./rules.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Re-render every open actor sheet, so a live toggle takes effect at once. */
/**
 * Recompute every actor's derived data after a setting it reads changes: world actors and
 * the synthetic actors of unlinked tokens. reset() rebuilds from the source first, so Active
 * Effects apply once (prepareData alone would stack them again; review #2).
 */
export const reprepareActors = (filter = () => true) => {
  const seen = new Set();
  const redo = (a) => { if (a && !seen.has(a) && filter(a)) { seen.add(a); a.reset(); } };
  for (const a of game.actors) redo(a);
  for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink) redo(t.actor);
};

/** Traits that live on the Knave page, each behind its Knave 1e switch (user, 2026-11-14). */
export const KNAVE_PAGE_TRAITS = ["alignment", "background"];
/** Knave 2e's own traits: their tables come only from the GM's book. */
const BOOK_TRAITS = ["personality", "mannerism"];
/**
 * Whether a trait shows (and is rolled): the Knave-page ones only while their switch is on;
 * Knave 2e's own traits under careers (2e), or once the world has their table (built or imported).
 */
export const traitShown = (key) => {
  if (BOOK_TRAITS.includes(key)) {
    try { return usesCareers() || !!game.tables?.getName(TABLES.traits[key]); } catch { return true; }
  }
  if (!KNAVE_PAGE_TRAITS.includes(key)) return true;
  try { return game.settings.get(SETTINGS_NS, `show-${key}`) === true; } catch { return true; }
};

export const rerenderActorSheets = () => {
  for (const app of foundry.applications.instances.values()) {
    if (app.document instanceof Actor) app.render();
  }
};

export const SETTING_GROUPS = [
  {
    id: "general",
    title: "KNAVERY.Settings.GroupGeneral",
    button: "KNAVERY.Settings.GroupGeneralButton",
    hint: "KNAVERY.Settings.GroupGeneralHint",
    icon: "fa-solid fa-gears",
    keys: ["roll-damage-default", "show-traits", "change-log", "welcome-on-start", "show-hazard-dice"],
  },
  {
    id: "generation",
    title: "KNAVERY.Settings.GroupGeneration",
    button: "KNAVERY.Settings.GroupGenerationButton",
    hint: "KNAVERY.Settings.GroupGenerationHint",
    icon: "fa-solid fa-user-plus",
    keys: [
      "allow-player-generate", "allow-player-randomization", "allow-player-level-xp", "min-creation-level",
      "max-creation-level", "custom-portrait-folder",
    ],
  },
  {
    id: "inventory",
    title: "KNAVERY.Settings.GroupInventory",
    button: "KNAVERY.Settings.GroupInventoryButton",
    hint: "KNAVERY.Settings.GroupInventoryHint",
    icon: "fa-solid fa-weight-hanging",
    // A "#name" key is a section heading (its label is Settings.Section.<name> in the language file), not a setting (0.3.0).
    keys: ["allow-player-marketplace", "coins-take-slots", "#hacks", "rations-per-slot", "torches-per-slot"],
  },
  {
    id: "hacks",
    title: "KNAVERY.Settings.GroupHacks",
    button: "KNAVERY.Settings.GroupHacksButton",
    hint: "KNAVERY.Settings.GroupHacksHint",
    icon: "fa-solid fa-flask",
    // The Rules choice heads this window: it sets every rule below to one edition (rules.js).
    preset: true,
    keys: [
      "#creation", "creation-abilities", "starting-kit", "show-alignment", "show-background",
      "#hp", "first-level-hp", "level-hp-rule",
      "#death", "death-rule", "hard-mode-wounds", "healing-rule",
      "#spells", "spell-rule", "spell-list",
      "#combat", "advantage-mode", "attack-rule", "weapon-breaks-on-1", "initiative-rule",
      "#money", "price-list", "coins-per-slot",
      "#advancement", "knave1e-xp", "treasure-xp", "knave1e-random-raises",
    ],
  },
  {
    id: "rulebook",
    title: "KNAVERY.Settings.GroupRulebook",
    button: "KNAVERY.Settings.GroupRulebookButton",
    hint: "KNAVERY.Settings.GroupRulebookHint",
    icon: "fa-solid fa-book",
    keys: ["rulebook-pdf", "rulebook-for-players", "rulebook-page-offset"],
  },
];

/** The rulebook reader, the dashboard and the Settings sidebar listen for this. */
const rulebookChanged = () => Hooks.callAll("knaveryRulebookChanged");

export const registerSettings = () => {
  const reg = (key, data) => game.settings.register(SETTINGS_NS, key, {
    scope: "world", config: false, ...data,
    name: `KNAVERY.Settings.${data.label}`, hint: `KNAVERY.Settings.${data.label}Hint`,
  });

  /* General */
  // Advantage follows the edition (1e p4: 2d20; 2e p7: ±5), so it sits with the Rules (0.3.0).
  reg("advantage-mode", { label: "AdvantageMode", type: String, choices: ADVANTAGE_MODES, default: RULES_PRESETS["1e"]["advantage-mode"] });
  reg("roll-damage-default", { label: "RollDamageDefault", type: Boolean, default: true });
  reg("weapon-breaks-on-1", { label: "WeaponBreaks", type: Boolean, default: true });
  reg("show-traits", { label: "ShowTraits", type: Boolean, default: true, onChange: rerenderActorSheets });
  reg("change-log", { label: "ChangeLog", type: Boolean, default: true });
  reg("welcome-on-start", { label: "WelcomeOnStart", type: Boolean, default: true });

  /* Character creation */
  reg("allow-player-generate", {
    label: "AllowPlayerGenerate", type: Boolean, default: true,
    onChange: () => { ui.actors?.render(); rerenderActorSheets(); },
  });
  reg("allow-player-randomization", {
    label: "AllowPlayerRandomization", type: Boolean, default: true, onChange: rerenderActorSheets,
  });
  reg("allow-player-level-xp", {
    label: "AllowPlayerLevelXp", type: Boolean, default: true, onChange: rerenderActorSheets,
  });
  // The rules' defaults are Knave 1e's (RULES_PRESETS); an older world was stamped 2e (rules.js).
  const D = RULES_PRESETS["1e"];
  reg("first-level-hp", { label: "FirstLevelHp", type: String, choices: FIRST_LEVEL_HP, default: D["first-level-hp"], onChange: rerenderActorSheets });
  reg("spell-list", {
    label: "SpellList", type: String, default: D["spell-list"],
    choices: { auto: "KNAVERY.Settings.SpellListAuto", "1e": "KNAVERY.Settings.SpellList1e" },
  });
  reg("level-hp-rule", { label: "LevelHpRule", type: String, choices: LEVEL_HP_RULES, default: D["level-hp-rule"], onChange: rerenderActorSheets });
  const levels = Object.fromEntries(Array.from({ length: MAX_LEVEL }, (_, i) => [i + 1, String(i + 1)]));
  reg("min-creation-level", { label: "MinCreationLevel", type: Number, choices: levels, default: 1 });
  reg("max-creation-level", { label: "MaxCreationLevel", type: Number, choices: levels, default: MAX_LEVEL });
  reg("custom-portrait-folder", {
    label: "CustomPortraitFolder", type: String, filePicker: "folder", default: "knavery-portraits",
  });

  /* Inventory */
  reg("allow-player-marketplace", {
    label: "AllowPlayerMarketplace", type: Boolean, default: true, onChange: rerenderActorSheets,
  });
  reg("coins-take-slots", { label: "CoinsTakeSlots", type: Boolean, default: true, onChange: rerenderActorSheets });
  // Both books count a day's rations as one slot; a GM may bundle them (user, 2026-11-14). Torches
  // likewise (user, 2026-11-14: Inventory's Hacks; candles and arrows keep the books' own bundles).
  const bundles = () => { reprepareActors(); rerenderActorSheets(); };
  reg("rations-per-slot", { label: "RationsPerSlot", type: Number, default: 1, range: { min: 1, max: 10, step: 1 }, onChange: bundles });
  reg("torches-per-slot", { label: "TorchesPerSlot", type: Number, default: 1, range: { min: 1, max: 5, step: 1 }, onChange: bundles });

  /* Rules */
  const choices = (prefix, keys) => Object.fromEntries(keys.map((k) => [k, `KNAVERY.Settings.${prefix}.${k}`]));
  const characters = () => { reprepareActors((a) => a.type === "character"); rerenderActorSheets(); };
  reg("creation-abilities", {
    label: "CreationAbilities", type: String, choices: choices("CreationAbilitiesChoice", ["lowest", "points"]),
    default: D["creation-abilities"],
  });
  reg("starting-kit", {
    label: "StartingKit", type: String, choices: choices("StartingKitChoice", ["knave1e", "careers", "careers-1e-gear"]),
    default: D["starting-kit"], onChange: rerenderActorSheets,
  });
  reg("death-rule", {
    label: "DeathRule", type: String, choices: choices("DeathRuleChoice", ["knave1e", "wounds"]),
    default: D["death-rule"], onChange: characters,
  });
  reg("healing-rule", {
    label: "HealingRule", type: String, choices: choices("HealingRuleChoice", ["knave1e", "knave2e"]), default: D["healing-rule"],
  });
  reg("spell-rule", {
    label: "SpellRule", type: String, choices: choices("SpellRuleChoice", ["book-per-day", "int-per-day"]),
    default: D["spell-rule"], onChange: rerenderActorSheets,
  });
  // Retired in 0.2.0 (now starting-kit "careers-1e-gear"); kept registered so the stamp can read it.
  reg("knave1e-starting-gear", { label: "Knave1eStartingGear", type: Boolean, default: false });
  reg("show-alignment", { label: "Knave1eAlignment", type: Boolean, default: D["show-alignment"], onChange: rerenderActorSheets });
  reg("show-background", { label: "Knave1eBackground", type: Boolean, default: D["show-background"], onChange: rerenderActorSheets });
  // Knave 1e rules, one switch each (data-models.js levelLadder, level-up.js, initiative.js).
  reg("knave1e-xp", {
    label: "Knave1eXp", type: Boolean, default: D["knave1e-xp"],
    // The XP ladder is derived data: recompute every character before redrawing.
    onChange: () => { reprepareActors((a) => a.type === "character"); rerenderActorSheets(); },
  });
  // XP for treasure brought back (treasure.js): Knave 2e p12, or Knave 1e's designer's note.
  reg("treasure-xp", {
    label: "TreasureXp", type: String, choices: choices("TreasureXpChoice", ["off", "gold", "coin"]),
    default: D["treasure-xp"], onChange: () => foundry.applications.instances.get("knavery-gm-dashboard")?.render({ parts: ["xp"] }),
  });
  reg("knave1e-random-raises", { label: "Knave1eRandomRaises", type: Boolean, default: false });
  // Initiative by side, each edition's way, or Foundry's own (initiative.js, combat-tracker.js; 0.3.0).
  reg("initiative-rule", {
    label: "InitiativeRule", type: String, choices: choices("InitiativeChoice", ["1e-d6", "2e-leaders", "individual"]),
    default: D["initiative-rule"], onChange: () => ui.combat?.render(),
  });
  reg("hard-mode-wounds", { label: "HardModeWounds", type: Boolean, default: false });
  // Knave 1e's attacks, prices and coin slots (p2-p4); 2e's under the 2e preset.
  reg("attack-rule", {
    label: "AttackRule", type: String, choices: choices("AttackRuleChoice", ["knave1e", "knave2e"]),
    default: D["attack-rule"], onChange: rerenderActorSheets,
  });
  reg("price-list", {
    label: "PriceList", type: String, choices: choices("PriceListChoice", ["knave1e", "knave2e"]),
    default: D["price-list"], onChange: rerenderActorSheets,
  });
  reg("coins-per-slot", {
    label: "CoinsPerSlot", type: String, choices: choices("CoinsPerSlotChoice", ["100", "500"]),
    default: D["coins-per-slot"], onChange: () => { reprepareActors(); rerenderActorSheets(); },
  });
  reg("show-hazard-dice", { label: "ShowHazardDice", type: Boolean, default: true });

  /* Rulebook: the GM's own PDF (module/rulebook.js). Only a path is stored. */
  reg("rulebook-pdf", { label: "RulebookPdf", type: String, filePicker: "text", default: "", onChange: rulebookChanged });
  reg("rulebook-for-players", { label: "RulebookForPlayers", type: Boolean, default: false, onChange: rulebookChanged });
  reg("rulebook-page-offset", {
    label: "RulebookPageOffset", type: Number, default: RULEBOOK.pageOffset, range: { min: 0, max: 20, step: 1 },
  });

  /* Hidden state */
  game.settings.register(SETTINGS_NS, "market-hidden-aisles", {
    scope: "world", config: false, type: Array, default: [],
  });
  // The 1e price list's own; its services and property (p3) ship hidden: the GM shows them (user, 2026-11-14).
  game.settings.register(SETTINGS_NS, "market-hidden-aisles-1e", {
    scope: "world", config: false, type: Array, default: ["Lodging & Meals", "Buildings"],
  });
  game.settings.register(SETTINGS_NS, "custom-portrait-list", {
    scope: "world", config: false, type: Array, default: [],
  });
  // Which portrait galleries are on ({id: false} switches one off) and where random portraits come
  // from ("any" or a gallery id): the dashboard's Toggles page (art.js GALLERIES; user, 2026-11-14).
  game.settings.register(SETTINGS_NS, "portrait-galleries", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(SETTINGS_NS, "random-portrait-source", { scope: "world", config: false, type: String, default: "any" });
  // Which edition this world was stamped with at its first GM login on 0.2.0 or later (rules.js stampRules).
  game.settings.register(SETTINGS_NS, "rules-stamp", {
    scope: "world", config: false, type: String, default: "",
  });
  // The rule keys this world has been given a value for (rules.js topUpRules).
  game.settings.register(SETTINGS_NS, "rules-keys", {
    scope: "world", config: false, type: Array, default: [],
  });
  // The system version the welcome window last opened for (module/welcome.js).
  game.settings.register(SETTINGS_NS, "welcome-shown-version", {
    scope: "world", config: false, type: String, default: "",
  });

  registerSettingMenus(SETTINGS_NS, SETTING_GROUPS);
};

/* -------------------------------------------- */
/*  Grouped settings submenu                     */
/* -------------------------------------------- */

export class SettingsGroupMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  static GROUP = null;
  static NAMESPACE = null;

  static DEFAULT_OPTIONS = {
    tag: "form",
    // `knavery` too, so every system window's shared rules apply (a lone checkbox on its label's line).
    classes: ["knavery", "knavery-settings-menu"],
    window: { contentClasses: ["standard-form"], title: "", icon: "fa-solid fa-gears" },
    position: { width: 600, height: "auto" },
    form: { closeOnSubmit: true, handler: SettingsGroupMenu.#onSubmit },
    actions: { resetDefaults: SettingsGroupMenu.#onResetDefaults },
  };

  static PARTS = {
    // The rows scroll under the pinned footer (css .knavery-settings-rows); core keeps their scroll position.
    body: { template: `${SYS_PATH}/templates/apps/settings-group.html`, scrollable: [""] },
    footer: { template: "templates/generic/form-footer.hbs" },
  };

  async _prepareContext() {
    const ns = this.constructor.NAMESPACE;
    const fields = foundry.data.fields;
    const entries = [];
    for (const key of this.constructor.GROUP.keys) {
      if (key.startsWith("#")) { entries.push({ key, heading: game.i18n.localize(`KNAVERY.Settings.Section.${key.slice(1)}`) }); continue; }
      const id = `${ns}.${key}`;
      const setting = game.settings.settings.get(id);
      if (!setting) continue;
      let field;
      let input;
      if (setting.type instanceof fields.DataField) field = setting.type;
      else if (setting.type === Boolean) field = new fields.BooleanField({ initial: setting.default ?? false });
      else if (setting.type === Number) {
        const { min, max, step } = setting.range ?? {};
        field = new fields.NumberField({ required: true, choices: setting.choices, initial: setting.default, min, max, step });
      } else if (setting.filePicker) {
        // A path setting gets core's file picker (with its Browse and Upload),
        // as the main settings window gives one; `filePicker` is its type.
        field = new fields.StringField({ required: true, blank: true });
        input = (_field, config) => foundry.applications.elements.HTMLFilePickerElement.create({
          ...config, type: setting.filePicker,
        });
      } else field = new fields.StringField({ required: true, choices: setting.choices });
      field.name = id;
      field.label ||= game.i18n.localize(setting.name ?? "");
      // A hint only where the language file has one: a row whose label and choices say it all has none.
      field.hint ||= setting.hint && game.i18n.has(setting.hint) ? game.i18n.localize(setting.hint) : "";
      entries.push({ key, field, input, value: game.settings.get(ns, key) });
    }
    const group = this.constructor.GROUP;
    const preset = group.preset ? {
      field: Object.assign(new fields.StringField({
        required: true,
        choices: { "1e": "KNAVERY.Settings.Rules1e", "2e": "KNAVERY.Settings.Rules2e", custom: "KNAVERY.Settings.RulesCustom" },
      }), { name: "knavery-rules", label: game.i18n.localize("KNAVERY.Settings.Rules"), hint: game.i18n.localize("KNAVERY.Settings.RulesHint") }),
      value: rulesFor(Object.fromEntries(Object.keys(RULES_PRESETS["1e"]).map((k) => [k, game.settings.get(ns, k)]))),
    } : null;
    return {
      entries,
      preset,
      rootId: this.id,
      buttons: [
        { type: "button", action: "resetDefaults", icon: "fa-solid fa-arrow-rotate-left", label: "SETTINGS.Reset" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" },
      ],
    };
  }

  /** The Rules window: the edition choice sets the rows; changing a row shows which edition they match. */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const select = this.element.querySelector('select[name="knavery-rules"]');
    if (!select) return;
    const ns = this.constructor.NAMESPACE;
    const keys = Object.keys(RULES_PRESETS["1e"]);
    const input = (k) => this.element.querySelector(`[name="${ns}.${k}"]`);
    const read = (el) => (el.type === "checkbox" ? el.checked : el.value);
    select.addEventListener("change", () => {
      const preset = RULES_PRESETS[select.value];
      if (!preset) return;
      for (const k of keys) {
        const el = input(k);
        if (!el) continue;
        if (el.type === "checkbox") el.checked = preset[k];
        else el.value = preset[k];
      }
    });
    for (const k of keys) {
      input(k)?.addEventListener("change", () => {
        select.value = rulesFor(Object.fromEntries(keys.map((key) => [key, input(key) ? read(input(key)) : game.settings.get(ns, key)])));
      });
    }
  }

  static async #onResetDefaults() {
    const ns = this.constructor.NAMESPACE;
    for (const key of this.constructor.GROUP.keys) {
      const id = `${ns}.${key}`;
      const setting = game.settings.settings.get(id);
      const input = this.form.elements[id];
      if (!setting || !input || input.disabled) continue;
      if (input.type === "checkbox") input.checked = setting.default;
      else input.value = setting.default;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    ui.notifications.info("SETTINGS.ResetInfo", { localize: true });
  }

  static async #onSubmit(_event, _form, formData) {
    let reload = false;
    for (const [id, value] of Object.entries(formData.object)) {
      const setting = game.settings.settings.get(id);
      if (!setting) continue;
      const prior = game.settings.get(setting.namespace, setting.key);
      if (prior === value) continue;
      try {
        await game.settings.set(setting.namespace, setting.key, value);
      } catch (error) {
        ui.notifications.error(error);
      }
      reload ||= setting.requiresReload;
    }
    if (reload) await foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
  }
}

const makeGroupMenu = (namespace, group) => class extends SettingsGroupMenu {
  static GROUP = group;
  static NAMESPACE = namespace;
  static DEFAULT_OPTIONS = {
    id: `knavery-settings-${group.id}`,
    window: { title: group.title, icon: group.icon },
  };
};

const registerSettingMenus = (namespace, groups) => {
  for (const group of groups) {
    game.settings.registerMenu(namespace, group.id, {
      name: group.title,
      label: group.button,
      hint: group.hint,
      icon: group.icon,
      type: makeGroupMenu(namespace, group),
      restricted: true,
    });
  }
};

export const setting = (key) => game.settings.get(SETTINGS_NS, key);
