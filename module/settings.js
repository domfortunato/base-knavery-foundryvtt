/**
 * World settings, shown through four grouped Configure Settings submenus
 * (ported from Air Bladder's SettingsGroupMenu). Every setting is `config:
 * false`; the order a GM sees is each group's `keys`.
 */
import { ADVANTAGE_MODES, MAX_LEVEL, SETTINGS_NS, SYS_PATH } from "./config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Re-render every open actor sheet, so a live toggle takes effect at once. */
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
    keys: ["advantage-mode", "roll-damage-default", "weapon-breaks-on-1", "show-traits", "change-log"],
  },
  {
    id: "generation",
    title: "KNAVERY.Settings.GroupGeneration",
    button: "KNAVERY.Settings.GroupGenerationButton",
    hint: "KNAVERY.Settings.GroupGenerationHint",
    icon: "fa-solid fa-user-plus",
    keys: [
      "allow-player-generate", "allow-player-randomization", "min-creation-level",
      "max-creation-level", "custom-portrait-folder",
    ],
  },
  {
    id: "inventory",
    title: "KNAVERY.Settings.GroupInventory",
    button: "KNAVERY.Settings.GroupInventoryButton",
    hint: "KNAVERY.Settings.GroupInventoryHint",
    icon: "fa-solid fa-weight-hanging",
    keys: ["allow-player-marketplace", "coins-take-slots"],
  },
  {
    id: "hacks",
    title: "KNAVERY.Settings.GroupHacks",
    button: "KNAVERY.Settings.GroupHacksButton",
    hint: "KNAVERY.Settings.GroupHacksHint",
    icon: "fa-solid fa-flask",
    keys: ["enable-glog-grimoire", "hard-mode-wounds", "show-hazard-dice"],
  },
];

export const registerSettings = () => {
  const reg = (key, data) => game.settings.register(SETTINGS_NS, key, {
    scope: "world", config: false, ...data,
    name: `KNAVERY.Settings.${data.label}`, hint: `KNAVERY.Settings.${data.label}Hint`,
  });

  /* General */
  reg("advantage-mode", { label: "AdvantageMode", type: String, choices: ADVANTAGE_MODES, default: "raw" });
  reg("roll-damage-default", { label: "RollDamageDefault", type: Boolean, default: true });
  reg("weapon-breaks-on-1", { label: "WeaponBreaks", type: Boolean, default: true });
  reg("show-traits", { label: "ShowTraits", type: Boolean, default: true, onChange: rerenderActorSheets });
  reg("change-log", { label: "ChangeLog", type: Boolean, default: true });

  /* Character creation */
  reg("allow-player-generate", {
    label: "AllowPlayerGenerate", type: Boolean, default: true,
    onChange: () => { ui.actors?.render(); rerenderActorSheets(); },
  });
  reg("allow-player-randomization", {
    label: "AllowPlayerRandomization", type: Boolean, default: true, onChange: rerenderActorSheets,
  });
  const levels = Object.fromEntries(Array.from({ length: MAX_LEVEL }, (_, i) => [i + 1, String(i + 1)]));
  reg("min-creation-level", { label: "MinCreationLevel", type: Number, choices: levels, default: 1 });
  reg("max-creation-level", { label: "MaxCreationLevel", type: Number, choices: levels, default: MAX_LEVEL });
  reg("custom-portrait-folder", {
    label: "CustomPortraitFolder",
    type: new foundry.data.fields.FilePathField({ categories: [], blank: true, initial: "knavery-portraits" }),
    default: "knavery-portraits",
  });

  /* Inventory */
  reg("allow-player-marketplace", {
    label: "AllowPlayerMarketplace", type: Boolean, default: true, onChange: rerenderActorSheets,
  });
  reg("coins-take-slots", { label: "CoinsTakeSlots", type: Boolean, default: true, onChange: rerenderActorSheets });

  /* Hacks */
  reg("enable-glog-grimoire", {
    label: "EnableGlogGrimoire", type: Boolean, default: false, onChange: rerenderActorSheets,
  });
  reg("hard-mode-wounds", { label: "HardModeWounds", type: Boolean, default: false });
  reg("show-hazard-dice", { label: "ShowHazardDice", type: Boolean, default: true });

  /* Hidden state */
  game.settings.register(SETTINGS_NS, "market-hidden-aisles", {
    scope: "world", config: false, type: Array, default: [],
  });
  game.settings.register(SETTINGS_NS, "custom-portrait-list", {
    scope: "world", config: false, type: Array, default: [],
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
    classes: ["knavery-settings-menu"],
    window: { contentClasses: ["standard-form"], title: "", icon: "fa-solid fa-gears" },
    position: { width: 600, height: "auto" },
    form: { closeOnSubmit: true, handler: SettingsGroupMenu.#onSubmit },
    actions: { resetDefaults: SettingsGroupMenu.#onResetDefaults },
  };

  static PARTS = {
    body: { template: `${SYS_PATH}/templates/apps/settings-group.html` },
    footer: { template: "templates/generic/form-footer.hbs" },
  };

  async _prepareContext() {
    const ns = this.constructor.NAMESPACE;
    const fields = foundry.data.fields;
    const entries = [];
    for (const key of this.constructor.GROUP.keys) {
      const id = `${ns}.${key}`;
      const setting = game.settings.settings.get(id);
      if (!setting) continue;
      let field;
      if (setting.type instanceof fields.DataField) field = setting.type;
      else if (setting.type === Boolean) field = new fields.BooleanField({ initial: setting.default ?? false });
      else if (setting.type === Number) {
        const { min, max, step } = setting.range ?? {};
        field = new fields.NumberField({ required: true, choices: setting.choices, initial: setting.default, min, max, step });
      } else field = new fields.StringField({ required: true, choices: setting.choices });
      field.name = id;
      field.label ||= game.i18n.localize(setting.name ?? "");
      field.hint ||= game.i18n.localize(setting.hint ?? "");
      entries.push({ key, field, value: game.settings.get(ns, key) });
    }
    return {
      entries,
      rootId: this.id,
      buttons: [
        { type: "button", action: "resetDefaults", icon: "fa-solid fa-arrow-rotate-left", label: "SETTINGS.Reset" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" },
      ],
    };
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
