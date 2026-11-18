/**
 * Base Knavery — entry point.
 *
 * A Foundry VTT system for Knave, first and second editions. Base Knavery is an
 * independent production of Dom Bosco and is not affiliated with Questing
 * Beast LLC.
 */
import { SETTINGS_NS, SYS_PATH } from "./config.js";
import * as KNAVERY from "./config.js";
import { ACTOR_DATA_MODELS, ITEM_DATA_MODELS } from "./data-models.js";
import { KnaveryActor } from "./documents/actor.js";
import { KnaveryItem } from "./documents/item.js";
import { KnaveryCombat } from "./initiative.js";
import { KnaveryCombatTracker } from "./combat-tracker.js";
import { KnaveryActorSheet } from "./sheets/actor-sheet.js";
import { KnaveryItemSheet } from "./sheets/item-sheet.js";
import { registerSettings } from "./settings.js";
import { initSocket, onSocket } from "./socket.js";
import { bindRollCard, handleApplyDamage } from "./damage.js";
import { bindOfferCard, registerOfferSocket } from "./item-offer.js";
import { rebuildChangeLogCard } from "./change-log.js";
import { createCharacter, createCharacterInteractive, registerCreationSocket, updateCareerIcons } from "./character-generator.js";
import { createNpc, createNpcInteractive } from "./npc-generator.js";
import { openSpellGenerator } from "./spell-generator.js";
import { GmDashboard, openGmDashboard, openMarketplaceManager, registerCombatRefresh, registerPartyRefresh, registerRequestSocket, setToggle } from "./gm-dashboard.js";
import { openCreateItem } from "./create-item.js";
import { openMarketplace } from "./marketplace.js";
import { openTableImporter, importRows, parseRows } from "./table-importer.js";
import { rollAttack, rollCheck, rollDieOfFate, rollSave } from "./rolls.js";
import {
  canReadRulebook, hasRulebook, openRulebook, registerRulebook, showRulebookPage, toggleRulebook,
} from "./rulebook.js";
import { maybeOpenWelcome, openGuide, openWelcome } from "./welcome.js";
import { applyRules, currentRules, offerRulesSwitch, stampRules } from "./rules.js";
import { openRulebookTablesReview } from "./rulebook-import.js";
import { loadKeyIndexes, registerKeyIndexFields, stampTableKeys } from "./keys.js";
import { registerI18nHelpers } from "./i18n.js";
import { bindHazardCard, endTurn, registerClockSetting } from "./hazard.js";
import { bindMoraleCard, checkBreakingPoints, payWage, rally } from "./hirelings.js";

const L = (k) => game.i18n.localize(k);

Hooks.once("init", () => {
  console.log("Base Knavery | init");

  CONFIG.KNAVERY = KNAVERY;
  registerKeyIndexFields();
  registerI18nHelpers();
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
  // Under a side rule (`initiative-rule`: 1e d6 or 2e leaders) the sides are ordered instead (initiative.js).
  CONFIG.Combat.documentClass = KnaveryCombat;
  CONFIG.ui.combat = KnaveryCombatTracker;

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, SETTINGS_NS, KnaveryActorSheet, { makeDefault: true, label: "KNAVERY.SheetLabel" });
  DocumentSheetConfig.registerSheet(Item, SETTINGS_NS, KnaveryItemSheet, { makeDefault: true, label: "KNAVERY.SheetLabel" });

  registerSettings();
  registerClockSetting();
  initSocket();
  onSocket("applyDamage", handleApplyDamage);
  registerOfferSocket();
  registerCreationSocket();
  registerRequestSocket();
  registerPartyRefresh();
  registerCombatRefresh();
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
    `${SYS_PATH}/templates/parts/traits-block.html`,
    `${SYS_PATH}/templates/chat/roll-card.html`,
  ]);

  game.knavery = {
    endTurn,
    payWage,
    rally,
    config: KNAVERY,
    openDashboard: openGmDashboard,
    openMarketplace,
    openMarketplaceManager,
    openCreateItem,
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
    /** Knave 2e p27: generate a spell for a character (the dashboard's request opens this for the player). */
    openSpellGenerator,
    /** The edition this world plays ("1e", "2e" or "custom"), and setting every rule to one. */
    currentRules,
    applyRules,
    offerRulesSwitch,
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
  bindHazardCard(message, html);
  bindMoraleCard(message, html);
  bindOfferCard(message, html);
  rebuildChangeLogCard(message, html);
});

/* Morale: a breaking point reached in a running combat (hirelings.js; the active GM acts). */
Hooks.on("updateActor", (actor, changed) => {
  const s = changed.system ?? {};
  if (s.hp?.value !== undefined || s.wounds !== undefined) checkBreakingPoints(actor);
});
Hooks.on("updateCombatant", (combatant, changed) => {
  if ("defeated" in changed && combatant.actor) checkBreakingPoints(combatant.actor);
});

Hooks.on("createChatMessage", (message) => {
  if (game.user.isGM) GmDashboard.noteResult(message);
});

/* -------------------------------------------- */
/*  The actors sidebar: Create Character         */
/* -------------------------------------------- */

/* The Items directory: the GM's Create Item window (create-item.js, 0.3.0). */
Hooks.on("renderItemDirectory", (_app, html) => {
  if (!game.user.isGM) return;
  html.querySelector("#knavery-item-directory-buttons")?.remove();
  const header = html.querySelector(".directory-header");
  if (!header) return;
  const row = document.createElement("div");
  row.id = "knavery-item-directory-buttons";
  row.className = "header-actions action-buttons flexrow";
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<i class="fas fa-box-open"></i> ${L("KNAVERY.ItemMaker.Title")}`;
  b.addEventListener("click", () => openCreateItem());
  row.append(b);
  header.append(row);
});

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

/**
 * The GM's big dashboard button, at the top of the left toolbar (user, 2026-11-14): in the
 * column's own flow before the scene controls, so Foundry moves them down rather than the
 * button covering them. The controls re-render only their own element, so it stays.
 */
Hooks.on("renderSceneControls", () => {
  if (!game.user.isGM || document.getElementById("knavery-dashboard-hud")) return;
  const column = document.getElementById("ui-left-column-1");
  if (!column) return;
  const b = document.createElement("button");
  b.type = "button";
  b.id = "knavery-dashboard-hud";
  b.className = "knavery-dashboard-hud";
  b.setAttribute("aria-label", L("KNAVERY.Dashboard.Title"));
  b.dataset.tooltip = L("KNAVERY.Dashboard.Title");
  b.dataset.tooltipDirection = "RIGHT";
  b.innerHTML = '<i class="fas fa-clipboard-list" inert></i>';
  b.addEventListener("click", () => openGmDashboard());
  column.prepend(b);
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
  // The Guide, on its reader's page (a player: Your Knave; the GM: Start Here), without the welcome.
  btn("fa-solid fa-book-open-reader", "KNAVERY.Welcome.OpenGuide", () => openGuide());
  if (game.user.isGM) btn("fa-solid fa-clipboard-list", "KNAVERY.Dashboard.Title", () => openGmDashboard());
  info.after(section);
});

Hooks.once("ready", async () => {
  console.log("Base Knavery | ready");
  // The packs' indexes with the key flags (keys.js), before anything looks a table or item up.
  await loadKeyIndexes();
  // An older world keeps Knave 2e, a new one plays 1e (rules.js), before the welcome says which.
  await stampRules().catch((err) => console.error("Base Knavery | stamping the rules failed", err));
  maybeOpenWelcome();
  updateCareerIcons().catch((err) => console.error("Base Knavery | updating career art failed", err));
  stampTableKeys().catch((err) => console.error("Base Knavery | stamping the table keys failed", err));
});
