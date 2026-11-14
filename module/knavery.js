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
import { KnaveryCombat } from "./initiative.js";
import { KnaveryActorSheet } from "./sheets/actor-sheet.js";
import { KnaveryItemSheet } from "./sheets/item-sheet.js";
import { applyTextScale, registerSettings } from "./settings.js";
import { initSocket, onSocket } from "./socket.js";
import { bindRollCard, handleApplyDamage } from "./damage.js";
import { bindOfferCard, registerOfferSocket } from "./item-offer.js";
import { rebuildChangeLogCard } from "./change-log.js";
import { createCharacter, createCharacterInteractive, registerCreationSocket, updateCareerIcons } from "./character-generator.js";
import { createNpc, createNpcInteractive } from "./npc-generator.js";
import { GmDashboard, openGmDashboard, registerRequestSocket, setToggle } from "./gm-dashboard.js";
import { openMarketplace, openMarketplaceManager } from "./marketplace.js";
import { openTableImporter, importRows, parseRows } from "./table-importer.js";
import { rollAttack, rollCheck, rollDieOfFate, rollSave } from "./rolls.js";
import {
  canReadRulebook, hasRulebook, openRulebook, registerRulebook, showRulebookPage, toggleRulebook,
} from "./rulebook.js";
import { maybeOpenWelcome, openWelcome } from "./welcome.js";
import { openRulebookTablesReview } from "./rulebook-import.js";

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
  // Under the GM's hack `knave1e-initiative`, one d6 a round orders the two sides instead.
  CONFIG.Combat.documentClass = KnaveryCombat;

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, SETTINGS_NS, KnaveryActorSheet, { makeDefault: true, label: "KNAVERY.SheetLabel" });
  DocumentSheetConfig.registerSheet(Item, SETTINGS_NS, KnaveryItemSheet, { makeDefault: true, label: "KNAVERY.SheetLabel" });

  registerSettings();
  applyTextScale();
  initSocket();
  onSocket("applyDamage", handleApplyDamage);
  registerOfferSocket();
  registerCreationSocket();
  registerRequestSocket();
  registerRulebook();

  game.keybindings.register(SETTINGS_NS, "openRulebook", {
    name: "KNAVERY.Rulebook.Key",
    hint: "KNAVERY.Rulebook.KeyHint",
    editable: [{ key: "KeyB" }],
    onDown: () => { toggleRulebook(); return true; },
    restricted: false,
  });

  foundry.applications.handlebars.loadTemplates([
    `${SYS_PATH}/templates/parts/ability-list.html`,
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
    createNpc,
    createNpcInteractive,
    rollCheck,
    rollSave,
    rollAttack,
    rollDieOfFate,
    openRulebook,
    toggleRulebook,
    showRulebookPage,
    openWelcome,
    buildRulebookTables: openRulebookTablesReview,
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
    btn("fa-users", "KNAVERY.CreateNpc", () => createNpcInteractive());
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

/* -------------------------------------------- */
/*  The Settings sidebar: welcome, rulebook      */
/* -------------------------------------------- */

Hooks.on("renderSettings", (_app, html) => {
  html.querySelector(".knavery-sidebar-tools")?.remove();
  const info = html.querySelector("section.info");
  if (!info) return;
  const section = document.createElement("section");
  section.className = "knavery-sidebar-tools flexcol";
  const heading = document.createElement("h4");
  heading.className = "divider";
  heading.textContent = game.system.title;
  section.append(heading);
  const btn = (icon, key, fn, { disabled = false, tip = null } = {}) => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<i class="${icon}" inert></i> ${L(key)}`;
    b.disabled = disabled;
    if (tip) b.dataset.tooltipText = L(tip);
    b.addEventListener("click", fn);
    section.append(b);
  };
  btn("fa-solid fa-dungeon", "KNAVERY.Welcome.Sidebar", () => openWelcome());
  const readable = hasRulebook() && canReadRulebook();
  if (game.user.isGM || readable) {
    btn("fa-solid fa-book-open", "KNAVERY.Rulebook.Title", () => toggleRulebook());
  } else {
    btn("fa-solid fa-book-open", "KNAVERY.Rulebook.Title", () => {}, { disabled: true, tip: "KNAVERY.Rulebook.NoCopy" });
  }
  if (game.user.isGM) btn("fa-solid fa-clipboard-list", "KNAVERY.Dashboard.Title", () => openGmDashboard());
  info.after(section);
});

Hooks.once("ready", () => {
  console.log("Base Knavery | ready");
  maybeOpenWelcome();
  updateCareerIcons().catch((err) => console.error("Base Knavery | updating career art failed", err));
});
