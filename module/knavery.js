/**
 * Base Knavery — entry point.
 *
 * A Foundry VTT system compatible with Knave 2e. Base Knavery is an
 * independent production of Dom Bosco and is not affiliated with Questing
 * Beast LLC.
 */
import { SETTINGS_NS, SYS_PATH } from "./config.js";
import * as KNAVERY from "./config.js";
import { ACTOR_DATA_MODELS, ITEM_DATA_MODELS } from "./data-models.js";
import { KnaveryActor } from "./documents/actor.js";
import { KnaveryItem } from "./documents/item.js";
import { KnaveryActorSheet } from "./sheets/actor-sheet.js";
import { KnaveryItemSheet } from "./sheets/item-sheet.js";
import { registerSettings } from "./settings.js";
import { initSocket, onSocket } from "./socket.js";
import { bindRollCard, handleApplyDamage } from "./damage.js";
import { bindOfferCard, registerOfferSocket } from "./item-offer.js";
import { rebuildChangeLogCard } from "./change-log.js";
import { createCharacter, createCharacterInteractive, registerCreationSocket } from "./character-generator.js";
import { GmDashboard, openGmDashboard, registerRequestSocket, setToggle } from "./gm-dashboard.js";
import { openMarketplace, openMarketplaceManager } from "./marketplace.js";
import { openTableImporter, importRows, parseRows } from "./table-importer.js";
import { rollAttack, rollCheck, rollDieOfFate, rollSave } from "./rolls.js";
import { registerGrimoire } from "./grimoire.js";

const L = (k) => game.i18n.localize(k);

Hooks.once("init", () => {
  console.log("Base Knavery | init");

  CONFIG.KNAVERY = KNAVERY;
  CONFIG.Actor.documentClass = KnaveryActor;
  CONFIG.Item.documentClass = KnaveryItem;
  Object.assign(CONFIG.Actor.dataModels, ACTOR_DATA_MODELS);
  Object.assign(CONFIG.Item.dataModels, ITEM_DATA_MODELS);
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["hp"], value: ["wounds", "xp", "coins"] },
    npc: { bar: ["hp"], value: ["level", "morale"] },
  };
  // Initiative: each side's leader rolls CHA vs CHA; per-token it is d20 + CHA.
  CONFIG.Combat.initiative = { formula: "1d20 + @CHA", decimals: 0 };

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, SETTINGS_NS, KnaveryActorSheet, { makeDefault: true, label: "KNAVERY.SheetLabel" });
  DocumentSheetConfig.registerSheet(Item, SETTINGS_NS, KnaveryItemSheet, { makeDefault: true, label: "KNAVERY.SheetLabel" });

  registerSettings();
  initSocket();
  onSocket("applyDamage", handleApplyDamage);
  registerOfferSocket();
  registerCreationSocket();
  registerRequestSocket();
  registerGrimoire();

  foundry.applications.handlebars.loadTemplates([
    `${SYS_PATH}/templates/parts/items-list.html`,
    `${SYS_PATH}/templates/parts/careers-block.html`,
    `${SYS_PATH}/templates/chat/roll-card.html`,
  ]);

  game.knavery = {
    config: KNAVERY,
    openDashboard: openGmDashboard,
    openMarketplace,
    openMarketplaceManager,
    openTableImporter,
    importRows,
    parseRows,
    createCharacter,
    createCharacterInteractive,
    rollCheck,
    rollSave,
    rollAttack,
    rollDieOfFate,
    /** Flip one of the player-tool switches (used by the shipped macros). */
    toggle: async (key) => {
      if (!game.user.isGM) return ui.notifications.warn("KNAVERY.Notify.GmOnly", { localize: true });
      await setToggle(key, !game.settings.get(SETTINGS_NS, key));
    },
    /** Hotbar: roll an owned weapon's attack or cast an owned spellbook. */
    rollItemMacro: async (actorId, itemId) => {
      const actor = game.actors.get(actorId);
      const item = actor?.items.get(itemId);
      if (!item) return ui.notifications.warn("KNAVERY.Notify.MacroItemMissing", { localize: true });
      if (item.type === "weapon") return rollAttack(actor, item);
      if (item.type === "spellbook") return (await import("./rolls.js")).castSpell(actor, item);
      return item.sheet.render(true);
    },
  };
});

/* -------------------------------------------- */
/*  Chat                                         */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  bindRollCard(message, html);
  bindOfferCard(message, html);
  rebuildChangeLogCard(message, html);
});

Hooks.on("createChatMessage", (message) => {
  if (game.user.isGM) GmDashboard.noteResult(message);
});

/* -------------------------------------------- */
/*  The actors sidebar: Create Character         */
/* -------------------------------------------- */

Hooks.on("renderActorDirectory", (_app, html) => {
  html.querySelector("#knavery-directory-buttons")?.remove();
  const allowGen = game.user.isGM || game.settings.get(SETTINGS_NS, "allow-player-generate");
  const header = html.querySelector(".directory-header");
  if (!header) return;
  const row = document.createElement("div");
  row.id = "knavery-directory-buttons";
  row.className = "header-actions action-buttons flexrow";
  const btn = (icon, key, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<i class="fas ${icon}"></i> ${L(key)}`;
    b.addEventListener("click", fn);
    row.append(b);
  };
  if (allowGen) btn("fa-dice-d6", "KNAVERY.CreateCharacter", () => createCharacterInteractive());
  if (game.user.isGM) {
    btn("fa-dragon", "KNAVERY.CreateMonster", async () => {
      const a = await Actor.create({ name: L("KNAVERY.NewMonster"), type: "npc", system: { role: "monster" } });
      a?.sheet.render(true);
    });
    btn("fa-clipboard-list", "KNAVERY.Dashboard.Title", () => openGmDashboard());
  }
  if (row.children.length) header.append(row);
});

/* -------------------------------------------- */
/*  Scene controls, hotbar                       */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  const tools = controls?.tokens?.tools;
  if (!tools) return;
  tools.knaveryDashboard = {
    name: "knaveryDashboard",
    title: "KNAVERY.Dashboard.Title",
    icon: "fas fa-clipboard-list",
    order: Object.keys(tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => openGmDashboard(),
  };
});

Hooks.on("hotbarDrop", (_bar, data, slot) => {
  if (data?.type !== "Item") return;
  const item = fromUuidSync(data.uuid);
  if (!item?.actor || !["weapon", "spellbook"].includes(item.type)) return;
  (async () => {
    const command = `game.knavery.rollItemMacro("${item.actor.id}", "${item.id}");`;
    let macro = game.macros.find((m) => m.command === command);
    macro ??= await Macro.create({ name: `${item.actor.name}: ${item.name}`, type: "script", img: item.img, command });
    await game.user.assignHotbarMacro(macro, slot);
  })();
  return false;
});

Hooks.once("ready", () => {
  console.log("Base Knavery | ready");
});
