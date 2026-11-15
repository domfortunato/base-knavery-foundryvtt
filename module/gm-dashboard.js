/**
 * The Game Master's Dashboard.
 *
 *   Requests  ask players for a check or save, saying WHY, or to generate a spell (Knave 2e p27). Each owning player
 *             gets the edge prompt with the reason and the difficulty locked;
 *             the results come back here as they land in chat.
 *   Damage    roll or type damage and apply it to chosen characters or to
 *             the selected/targeted tokens, normal or direct, with a source.
 *   Time      dungeon turns or travel watches: end one (the world clock moves on and
 *             the hazard die rolls), the party resting, the die on its own (hazard.js);
 *             hirelings' wages: when each is due, and Pay (hirelings.js).
 *   Dice      reaction, encounter distance, morale; events from the GM's 2e tables (weather,
 *             shifts, signs, city events, disasters), whispered to the GM.
 *   Party     every player character at a glance: HP, wounds, slots, coins, lights
 *             and spellbooks, each opening its sheet (user, 2026-11-14).
 *   XP        award XP: the same amount to each chosen character, a different
 *             amount to each, a total split evenly, or treasure brought back
 *             (treasure.js: Knave 2e p12, companions a half share p59).
 *   Market    the marketplace's aisles, their rows and prices; Create Item (marketplace.js, create-item.js).
 *   Toggles   the live switches for the players' tools, the portrait galleries and the random-portrait source.
 *   Tables    roll any table, import rows, the rulebook.
 */
import {
  ABILITIES, CHECK_BASE, DEFAULT_DIFFICULTY, FLAG_SCOPE, SAVE_CATEGORIES, SETTINGS_NS, SYS_PATH, TABLES,
} from "./config.js";
import { emit, onSocket } from "./socket.js";
import { isRollable, rollCheck, rollHazard, rollMorale, rollSave } from "./rolls.js";
import { actorFromUuid } from "./damage.js";
import { drawFrom, findTable } from "./compendium.js";
import { findByKey, tableLabel, worldTable } from "./keys.js";
import { openGuide } from "./welcome.js";
import { openTableImporter } from "./table-importer.js";
import { bindMarketPage, MARKET_ACTIONS, marketPageContext } from "./marketplace.js";
import { openCreateItem } from "./create-item.js";
import { hasRulebook, openRulebook, pickLocalRulebook, showRulebookPage, tablePage } from "./rulebook.js";
import { clock, clockLabel, endTurn, resetClock, setClock, TRAVEL_WATCHES_FREE } from "./hazard.js";
import { payWage, rally, wageRows } from "./hirelings.js";
import { initiativeRule, onPcSide, sidesOn } from "./initiative.js";
import { placeRail, placeRailSoon } from "./sheets/tab-rail.js";
import { openSpellGenerator } from "./spell-generator.js";
import { isLight, party } from "./hazard.js";
import { customPortraitFolder, GALLERIES, galleryOn, getCustomPortraitPaths, randomPortraitSource, refreshCustomPortraits } from "./art.js";
import { spellRule, usesQuality, usesWounds } from "./rules.js";
import { P, listOf } from "./i18n.js";
import { companionsOf, treasureCarried, treasureSplit, treasureXpOn, treasureXpRule, xpForTreasure } from "./treasure.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const { DialogV2 } = foundry.applications.api;

/** Requests sent this session, newest first: {id, label, reason, target, entries:[{actorId,name,state,total,success}]} */
const requestLog = [];

/** The Dice page's table rolls, by section: Knave 2e tables, built from the GM's book (never shipped). */
const RANDOM_TABLES = [
  { key: "Activity", table: "Activities", icon: "fa-person-running", page: 19, section: "encounters" },
  { key: "Weather", table: "Weather", icon: "fa-cloud-sun-rain", page: 9, section: "events" },
  { key: "TravelShift", table: "Travel Shifts", icon: "fa-route", page: 9, section: "events" },
  { key: "DelveShift", table: "Delve Shifts", icon: "fa-dungeon", page: 14, section: "events" },
  { key: "Sign", table: "Signs", icon: "fa-paw", page: 10, section: "events" },
  { key: "CityEvent", table: "City Events", icon: "fa-city", page: 46, section: "events" },
  { key: "Disaster", table: "Disasters", icon: "fa-volcano", page: 31, section: "events" },
  { key: "Monster", table: "Monsters", icon: "fa-dragon", page: 61, section: "fly" },
  { key: "Carousing", table: "Carousing Mishaps", icon: "fa-beer-mug-empty", page: 52, section: "downtime" },
];
/** A quick NPC (the Dice page): each of these that the world has, drawn into one card (pp54-57). */
const QUICK_NPC = [
  { key: "Name", tables: ["Names", "Surnames"] }, { key: "Personality", tables: ["Personalities"] },
  { key: "Profession", tables: ["Professions"] }, { key: "Detail", tables: ["NPC Details"] },
];

/** The edges a GM may set on a request. */
const EDGES = ["disadvantage", "normal", "advantage"];

const TOGGLES = [
  { key: "allow-player-marketplace", label: "KNAVERY.Macro.Marketplace", icon: "fa-store" },
  { key: "allow-player-generate", label: "KNAVERY.Macro.Creation", icon: "fa-user-plus" },
  { key: "allow-player-randomization", label: "KNAVERY.Macro.CreationTools", icon: "fa-dice-d20" },
  { key: "allow-player-level-xp", label: "KNAVERY.Macro.LevelXp", icon: "fa-arrow-up-1-9" },
  { key: "change-log", label: "KNAVERY.Macro.ChangeLog", icon: "fa-clipboard-list" },
  // One more live switch (user, 2026-11-14, D3): the rulebook for players.
  { key: "rulebook-for-players", label: "KNAVERY.Macro.Rulebook", icon: "fa-book-open" },
];

/** The Combat page's picture of the running fight (initiative.js). */
const combatContext = () => {
  const combat = game.combat;
  const rule = initiativeRule();
  const sides = sidesOn();
  const out = { active: !!combat?.started, sides, rule, leaders: rule === "2e-leaders" && !!combat, rally: !usesQuality(), pcs: [], foes: [] };
  if (!combat) return out;
  const group = combat.groupInitiative;
  const actingPcs = combat.combatant ? onPcSide(combat.combatant) : group?.pcsFirst;
  out.state = combat.started
    ? F("KNAVERY.Dashboard.CombatRound", { round: combat.round, side: L(actingPcs ? "KNAVERY.Initiative.SidePcs" : "KNAVERY.Initiative.SideFoes") })
    : "";
  const set = combat.leaders;
  for (const c of combat.combatants) {
    if (!c.actor) continue;
    (onPcSide(c) ? out.pcs : out.foes).push({ id: c.id, name: c.name, selected: c.id === (onPcSide(c) ? set.pc : set.enemy) });
  }
  return out;
};

/** Knave 2e's hazards (p21), numbers only; under Knave 1e, with no direct damage, they land on HP. */
const hazardPresets = () => {
  const direct = usesWounds();
  return [
    { id: "falling", formula: "1d6", direct }, { id: "fire", formula: "1d6", direct }, { id: "onfire", formula: "2d6", direct },
    { id: "freezing", formula: "1", direct }, { id: "lightning", formula: "3d6", direct },
  ].map((p) => ({ ...p, label: L(`KNAVERY.Dashboard.Hazards.${p.id}`), name: L(`KNAVERY.Dashboard.HazardNames.${p.id}`) }));
};

export class GmDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  /** The aisle open on the Marketplace page (marketplace.js marketPageContext). */
  marketSelected = null;

  static DEFAULT_OPTIONS = {
    id: "knavery-gm-dashboard",
    tag: "form",
    classes: ["knavery", "knavery-gm-dashboard", "knavery-railed"],
    window: { title: "KNAVERY.Dashboard.Title", icon: "fas fa-clipboard-list", resizable: true },
    position: { width: 640, height: 720 },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      sendRequest: GmDashboard.#onSendRequest,
      rollForThem: GmDashboard.#onRollForThem,
      clearLog: GmDashboard.#onClearLog,
      applyDamage: GmDashboard.#onApplyDamage,
      rollInitiativeNow: GmDashboard.#onRollInitiativeNow,
      nextSide: () => game.combat?.nextSide(),
      surpriseSide: GmDashboard.#onSurpriseSide,
      markDefeated: GmDashboard.#onMarkDefeated,
      rallySelected: GmDashboard.#onRallySelected,
      awardXp: GmDashboard.#onAwardXp,
      hazard: GmDashboard.#onHazard,
      endTurn: GmDashboard.#onEndTurn,
      timeMode: GmDashboard.#onTimeMode,
      timeResting: GmDashboard.#onTimeResting,
      resetClock: () => resetClock(),
      payWage: GmDashboard.#onPayWage,
      reaction: GmDashboard.#onReaction,
      carouse: GmDashboard.#onCarouse,
      forage: GmDashboard.#onForage,
      encounterDistance: GmDashboard.#onEncounterDistance,
      morale: GmDashboard.#onMorale,
      rollTable: GmDashboard.#onRollTable,
      rollEvent: GmDashboard.#onRollEvent,
      surprise: GmDashboard.#onSurprise,
      quickNpc: GmDashboard.#onQuickNpc,
      // The rail's Guide opens the dashboard's page at the open page's section.
      openGuide() {
        // The Guide's headings carry these ids (tools/content/build-content.mjs), so a translated heading keeps its anchor.
        const anchors = { requests: "requests", damage: "combat", time: "time", party: "party", dice: "dice", xp: "xp", market: "marketplace", tools: "toggles", tables: "tables" };
        const anchor = anchors[this.tabGroups?.primary];
        return openGuide("The Game Master's Dashboard (GM)", { anchor: anchor ? `dashboard-${anchor}` : null });
      },
      importTable: GmDashboard.#onImportTable,
      // The Marketplace page's aisle actions (marketplace.js), run with the dashboard as `this`.
      ...MARKET_ACTIONS,
      createItem: () => openCreateItem(),
      toggleSetting: GmDashboard.#onToggleSetting,
      toggleGallery: GmDashboard.#onToggleGallery,
      rescanPortraits: GmDashboard.#onRescanPortraits,
      selectAll: GmDashboard.#onSelectAll,
      openSheet: (_e, target) => game.actors.get(target.dataset.id)?.sheet.render(true),
      openRulebook: GmDashboard.#onOpenRulebook,
      showRulebook: GmDashboard.#onShowRulebook,
      chooseRulebook: () => pickLocalRulebook(),
      buildTables: () => import("./rulebook-import.js").then((m) => m.openRulebookTablesReview()),
    },
  };

  static PARTS = {
    // The pages on a thumb-tab rail off the window's edge, as on the character sheet (user, 2026-11-14).
    rail: { template: `${SYS_PATH}/templates/parts/tab-rail.html` },
    requests: { template: `${SYS_PATH}/templates/dashboard/requests.html`, scrollable: [".request-log"] },
    damage: { template: `${SYS_PATH}/templates/dashboard/damage.html` },
    time: { template: `${SYS_PATH}/templates/dashboard/time.html` },
    party: { template: `${SYS_PATH}/templates/dashboard/party.html`, scrollable: [".dash-party"] },
    dice: { template: `${SYS_PATH}/templates/dashboard/dice.html` },
    xp: { template: `${SYS_PATH}/templates/dashboard/xp.html`, scrollable: [".dash-xp-rows"] },
    market: { template: `${SYS_PATH}/templates/dashboard/market.html`, scrollable: [".mm-rows"] },
    tools: { template: `${SYS_PATH}/templates/dashboard/tools.html` },
    tables: { template: `${SYS_PATH}/templates/dashboard/tables.html`, scrollable: [".table-list"] },
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "requests", icon: "fas fa-bullhorn", label: "KNAVERY.Dashboard.TabRequests" },
        { id: "damage", icon: "fas fa-hand-fist", label: "KNAVERY.Dashboard.TabDamage" },
        { id: "time", icon: "fas fa-hourglass-half", label: "KNAVERY.Dashboard.TabTime" },
        { id: "party", icon: "fas fa-users", label: "KNAVERY.Dashboard.TabParty" },
        { id: "dice", icon: "fas fa-dice", label: "KNAVERY.Dashboard.TabDice" },
        { id: "xp", icon: "fas fa-star", label: "KNAVERY.Dashboard.TabXp" },
        { id: "market", icon: "fas fa-coins", label: "KNAVERY.Dashboard.TabMarket" },
        { id: "tools", icon: "fas fa-sliders", label: "KNAVERY.Dashboard.TabTools" },
        { id: "tables", icon: "fas fa-table-list", label: "KNAVERY.Dashboard.TabTables" },
      ],
      initial: "requests",
    },
  };

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs?.[partId];
    if (partId === "market") Object.assign(context, await marketPageContext(this));
    if (partId === "damage") Object.assign(context, { combat: combatContext(), hazardPresets: hazardPresets() });
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const characters = game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner).map((a) => {
      const owners = game.users.filter((u) => !u.isGM && a.testUserPermission(u, "OWNER"));
      return {
        id: a.id, name: a.name, img: a.img, level: a.system.level, xp: a.system.xp,
        players: listOf(owners.map((u) => u.name)),
        online: owners.some((u) => u.active),
      };
    });
    const tableNames = [TABLES.careers, TABLES.spells, TABLES.namesA, TABLES.surnames, ...Object.values(TABLES.traits),
      TABLES.reaction, TABLES.mishaps, TABLES.spells1e, ...Object.values(TABLES.gear1e)];
    // Index lookups only: loading every compendium table to count its rows
    // took ten seconds on a small server. World tables are already in memory.
    const packIndex = game.packs.filter((p) => p.documentName === "RollTable").flatMap((p) => [...p.index]);
    // `name` is the English name the buttons pass back (findTable resolves it by key); `label` is shown.
    const listed = new Set();
    const tables = tableNames.map((name) => {
      const world = worldTable(name);
      const page = tablePage(name);
      if (world) {
        listed.add(world.id);
        return { name, label: tableLabel(name), world: true, exists: true, rows: world.results.size, page };
      }
      const shipped = !!findByKey(packIndex, name);
      return { name, label: tableLabel(name), world: false, exists: shipped, rows: shipped ? "—" : 0, page };
    });
    for (const t of game.tables.filter((x) => !listed.has(x.id))) {
      tables.push({ name: t.name, label: t.name, world: true, exists: true, rows: t.results.size, page: tablePage(t.name) });
    }
    const rulebook = hasRulebook();
    for (const t of tables) t.pageTip = t.page ? F("KNAVERY.Rulebook.OpenAt", { page: t.page }) : "";
    // The rail's tooltips: each page's name.
    for (const tab of Object.values(context.tabs ?? {})) tab.tip = L(tab.label);
    return Object.assign(context, {
      characters,
      abilities: ABILITIES.map((k) => ({ value: `ability:${k}`, label: L(`KNAVERY.Ability.${k}`) })),
      saves: Object.entries(SAVE_CATEGORIES).map(([k, a]) => ({ value: `save:${k}`, label: F("KNAVERY.WithAbility", { name: L(`KNAVERY.Save.${k}`), ability: L(`KNAVERY.AbilityShort.${a}`) }) })),
      difficulty: DEFAULT_DIFFICULTY,
      target: CHECK_BASE + DEFAULT_DIFFICULTY,
      log: requestLog.slice(0, 20),
      time: (() => {
        const c = clock();
        const travel = c.mode === "travel";
        return {
          ...c, travel, now: clockLabel(c),
          endLabel: L(travel ? "KNAVERY.Time.EndWatch" : "KNAVERY.Time.EndTurn"),
          travelledLine: travel && c.watch ? F("KNAVERY.Time.Travelled", { n: c.travelled, free: TRAVEL_WATCHES_FREE }) : "",
        };
      })(),
      wages: wageRows(),
      random: RANDOM_TABLES.reduce((out, e) => {
        const exists = !!worldTable(e.table);
        (out[e.section] ??= []).push({ ...e, label: L(`KNAVERY.Dashboard.Event.${e.key}`), exists,
          tip: exists ? F("KNAVERY.Dashboard.EventFrom", { name: tableLabel(e.table), page: e.page }) : F("KNAVERY.Dashboard.EventMissing", { name: tableLabel(e.table) }) });
        return out;
      }, {}),
      railGuide: true,
      party: partyRows(),
      usesWounds: usesWounds(),
      treasure: treasureContext(),
      tables,
      rulebook,
      toggles: TOGGLES.map((t) => ({ ...t, on: game.settings.get(SETTINGS_NS, t.key) })),
      // Toggles: the portrait galleries and where random portraits come from (art.js).
      galleries: GALLERIES.map((g) => ({ ...g, on: galleryOn(g.id) })),
      randomSource: {
        value: randomPortraitSource(),
        choices: [{ id: "any", label: L("KNAVERY.Dashboard.AnyGallery") }, ...GALLERIES.filter((g) => g.id !== "gameicons").map((g) => ({ id: g.id, label: L(g.label) }))],
      },
      customFolder: { path: customPortraitFolder(), count: getCustomPortraitPaths().length },
    });
  }

  /**
   * A re-render keeps what the GM was typing. Results arriving in chat re-render
   * the Requests part, and the importer and the rulebook re-render the whole
   * window; core restores focus and scroll but not values, so a half-composed
   * request or damage roll would be wiped by every incoming roll.
   */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if (!["requests", "damage", "xp"].includes(partId)) return;
    for (const el of priorElement.querySelectorAll("input[name], select[name], textarea[name]")) {
      const toggle = el.type === "checkbox" || el.type === "radio";
      const selector = `[name="${CSS.escape(el.name)}"]${toggle ? `[value="${CSS.escape(el.value)}"]` : ""}`;
      const twin = newElement.querySelector(selector);
      if (!twin) continue;
      if (toggle) twin.checked = el.checked;
      else twin.value = el.value;
    }
  }

  /**
   * A page's listeners are bound once per drawing of its part: `_onRender` runs on every render, and a
   * render of another part (the Party tab on every HP change, Requests on every result) keeps this section
   * and its listeners. Returns the section when it is freshly drawn, else null.
   */
  #freshPage(tab) {
    const el = this.element.querySelector(`section[data-tab="${tab}"]`);
    if (!el || el.dataset.knBound) return null;
    el.dataset.knBound = "1";
    return el;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    placeRailSoon(this);
    bindMarketPage(this);
    if (this.#freshPage("tools")) {
      this.element.querySelector('select[name="randomPortraitSource"]')?.addEventListener("change", (e) => {
        setWorldSetting("random-portrait-source", e.target.value).then((done) => { if (!done) this.render({ parts: ["tools"] }); });
      });
    }
    // Combat: the leaders' selects write the combat's flag; a hazard preset fills the damage box.
    if (this.#freshPage("damage")) {
      for (const name of ["leaderPc", "leaderEnemy"]) {
        this.element.querySelector(`select[name="${name}"]`)?.addEventListener("change", async () => {
          const combat = game.combat;
          if (!combat) return;
          const pc = this.element.querySelector('select[name="leaderPc"]')?.value || null;
          const enemy = this.element.querySelector('select[name="leaderEnemy"]')?.value || null;
          await combat.setFlag(FLAG_SCOPE, "leaders", { pc, enemy });
        });
      }
      this.element.querySelector('select[name="dmgPreset"]')?.addEventListener("change", (e) => {
        const o = e.target.selectedOptions[0];
        if (!o?.value) return;
        const formula = this.element.querySelector('[name="dmgFormula"]');
        const direct = this.element.querySelector('[name="dmgDirect"]');
        const source = this.element.querySelector('[name="dmgSource"]');
        if (formula) formula.value = o.dataset.formula;
        if (direct) direct.checked = o.dataset.direct === "true";
        if (source && !source.value) source.value = o.dataset.name ?? "";
      });
    }
    if (this.window?.title) this.window.title.textContent = this.title;
    const diff = this.element.querySelector('[name="difficulty"]');
    const out = this.element.querySelector(".request-target");
    const showTarget = () => { if (diff && out) out.textContent = CHECK_BASE + (Number(diff.value) || 0); };
    showTarget();
    // A spell request has no difficulty.
    const what = this.element.querySelector('[name="check"]');
    const showDifficulty = () => {
      for (const el of this.element.querySelectorAll(".dash-request-difficulty, .dash-request-edge")) el.toggleAttribute("hidden", what?.value === "spell:generate");
    };
    showDifficulty();
    if (this.#freshPage("requests")) {
      diff?.addEventListener("input", showTarget);
      what?.addEventListener("change", showDifficulty);
    }
    // XP: one amount for "same to each" and "split", a box per character for "different to each".
    const mode = this.element.querySelector('[name="xpMode"]');
    const showMode = () => {
      const individual = mode?.value === "individual";
      this.element.querySelector(".dash-xp-amount")?.toggleAttribute("hidden", individual || mode?.value === "treasure");
      this.element.querySelectorAll(".dash-xp-each").forEach((el) => el.toggleAttribute("hidden", !individual));
      this.element.querySelectorAll('.dash-xp-row input[name="xpPc"], .dash-xp-all').forEach((el) => el.toggleAttribute("hidden", individual));
    };
    // Treasure: the chosen PCs' uncounted treasure, plus coins typed in, as XP.
    const showTreasure = () => {
      const box = this.element.querySelector(".dash-xp-treasure");
      if (!box) return;
      const on = mode?.value === "treasure";
      box.toggleAttribute("hidden", !on);
      if (!on) return;
      const chosen = new Set([...this.element.querySelectorAll('input[name="xpPc"]:checked')].map((b) => b.value));
      for (const row of box.querySelectorAll(".dash-xp-treasure-item")) row.toggleAttribute("hidden", !chosen.has(row.dataset.actorId));
      const { coins, xp } = this.#treasureTotal();
      const pcs = [...chosen].map((id) => game.actors.get(id)).filter(Boolean);
      const companions = companionsOf(pcs).length;
      box.querySelector(".dash-xp-treasure-total").textContent = pcs.length
        ? (companions ? P("KNAVERY.Dashboard.TreasureTotalCompanions", companions, { coins, xp, n: pcs.length, companions }) : F("KNAVERY.Dashboard.TreasureTotal", { coins, xp, n: pcs.length }))
        : L("KNAVERY.Dashboard.TreasureChoose");
    };
    const showAll = () => { showMode(); showTreasure(); };
    showAll();
    const xpTab = this.#freshPage("xp");
    if (xpTab) {
      mode?.addEventListener("change", showAll);
      xpTab.addEventListener("change", showTreasure);
      xpTab.addEventListener("input", showTreasure);
    }
  }

  /** The treasure the XP tab counts now: typed coins plus the ticked items of chosen PCs. */
  #treasureTotal() {
    const root = this.element;
    const chosen = new Set([...root.querySelectorAll('input[name="xpPc"]:checked')].map((b) => b.value));
    const items = [...root.querySelectorAll('.dash-xp-treasure-item input[name="xpTreasure"]:checked')]
      .filter((b) => chosen.has(b.closest("[data-actor-id]")?.dataset.actorId));
    const coins = Math.max(0, Math.floor(Number(root.querySelector('[name="xpCoins"]')?.value) || 0))
      + items.reduce((sum, b) => sum + (Number(b.dataset.value) || 0), 0);
    return { coins, xp: xpForTreasure(coins), uuids: items.map((b) => b.value) };
  }

  /** Every move decides the rail's side again (tab-rail.js), as on the sheets. */
  _onPosition(position) {
    super._onPosition(position);
    placeRail(this, position);
  }

  /** The open page's name in the title bar (user, 2026-11-14). */
  get title() {
    const id = this.tabGroups?.primary;
    const tab = GmDashboard.TABS.primary.tabs.find((t) => t.id === id);
    return tab ? F("KNAVERY.Dashboard.TitlePage", { page: L(tab.label) }) : L(this.options.window.title);
  }

  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    if (this.window?.title) this.window.title.textContent = this.title;
  }

  #form() { return this.element; }

  /* -------------------------------------------- */
  /*  XP                                           */
  /* -------------------------------------------- */

  static async #onAwardXp() {
    const root = this.#form();
    const mode = root.querySelector('[name="xpMode"]')?.value ?? "each";
    const amount = Number(root.querySelector('[name="xpAmount"]')?.value) || 0;
    const all = [...root.querySelectorAll(".dash-xp-row input[name=\"xpPc\"]")].map((b) => game.actors.get(b.value)).filter(Boolean);
    const chosen = all.filter((a) => root.querySelector(`input[name="xpPc"][value="${CSS.escape(a.id)}"]`)?.checked);
    const valueFor = (a) => Number(root.querySelector(`[name="xpFor.${CSS.escape(a.id)}"]`)?.value) || 0;
    if (mode === "treasure") return this.#awardTreasure(chosen);
    const awards = xpAwards(mode, amount, mode === "individual" ? all : chosen, valueFor);
    if (!awards.length) return ui.notifications.warn("KNAVERY.Dashboard.XpNothing", { localize: true });
    await Actor.updateDocuments(awards.map(({ actor, xp }) => ({ _id: actor.id, "system.xp": actor._source.system.xp + xp })),
      { knLogAction: "KNAVERY.Dashboard.AwardXp" });
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ user: game.user }),
      content: `<div class="knavery-roll-card kind-xp"><header class="card-title"><h3><i class="fas fa-star"></i> ${esc(L("KNAVERY.Dashboard.XpCardTitle"))}</h3></header>`
        + `<ul>${awards.map(({ actor, xp }) => `<li>${esc(F("KNAVERY.Dashboard.XpCardLine", { name: actor.name, xp }))}</li>`).join("")}</ul></div>`,
      flags: { [FLAG_SCOPE]: { xpAward: awards.map(({ actor, xp }) => ({ actorId: actor.id, xp })) } },
    });
    for (const el of root.querySelectorAll('[name="xpAmount"], .dash-xp-each')) el.value = "";
    for (const el of root.querySelectorAll('input[name="xpPc"]')) el.checked = false;
    this.render({ parts: ["xp"] });
  }

  /** Treasure brought back: XP split evenly, companions a half share; each item counts once. */
  async #awardTreasure(chosen) {
    const { coins, xp, uuids } = this.#treasureTotal();
    const companions = companionsOf(chosen);
    const split = treasureSplit(xp, chosen, companions);
    const awards = split.pcs.filter((a) => a.xp > 0);
    if (!awards.length) return ui.notifications.warn("KNAVERY.Dashboard.TreasureNothing", { localize: true });
    await Actor.updateDocuments(awards.map(({ actor, xp: n }) => ({ _id: actor.id, "system.xp": actor._source.system.xp + n })),
      { knLogAction: "KNAVERY.Dashboard.AwardXp" });
    for (const uuid of uuids) {
      const item = fromUuidSync(uuid, { strict: false });
      if (item && !item.system.treasureCounted) await item.update({ "system.treasureCounted": true }, { knNoLog: true });
    }
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const lines = [
      ...awards.map(({ actor, xp: n }) => F("KNAVERY.Dashboard.XpCardLine", { name: actor.name, xp: n })),
      ...split.companions.filter((c) => c.xp > 0).map(({ actor, xp: n }) => F("KNAVERY.Dashboard.XpCardCompanion", { name: actor.name, xp: n })),
    ];
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ user: game.user }),
      content: `<div class="knavery-roll-card kind-xp"><header class="card-title"><h3><i class="fas fa-gem"></i> ${esc(L("KNAVERY.Dashboard.TreasureCardTitle"))}</h3></header>`
        + `<p class="card-note">${esc(F("KNAVERY.Dashboard.TreasureCardWorth", { coins, xp }))}</p>`
        + `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`,
      flags: { [FLAG_SCOPE]: { xpAward: awards.map(({ actor, xp: n }) => ({ actorId: actor.id, xp: n })), treasure: { coins, xp } } },
    });
    const root = this.#form();
    for (const el of root.querySelectorAll('[name="xpCoins"]')) el.value = "";
    for (const el of root.querySelectorAll('input[name="xpPc"]')) el.checked = false;
    this.render({ parts: ["xp", "party"] });
  }

  static #onSelectAll(_e, target) {
    const boxes = [...this.element.querySelectorAll(`input[name="${target.dataset.field}"]`)];
    const all = boxes.every((b) => b.checked);
    boxes.forEach((b) => { b.checked = !all; });
  }

  /* -------------------------------------------- */
  /*  Requests                                     */
  /* -------------------------------------------- */

  static async #onSendRequest() {
    const root = this.#form();
    const ids = [...root.querySelectorAll('input[name="pc"]:checked')].map((b) => b.value);
    if (!ids.length) return ui.notifications.warn("KNAVERY.Dashboard.PickSomeone", { localize: true });
    const [kind, key] = String(root.querySelector('[name="check"]').value).split(":");
    const difficulty = Math.max(0, Number(root.querySelector('[name="difficulty"]').value) || 0);
    // The edge the GM sets, or "" for the player's own choice.
    const edge = EDGES.includes(root.querySelector('[name="edge"]')?.value) ? root.querySelector('[name="edge"]').value : "";
    const edgeLabel = edge ? L(`KNAVERY.Roll.${edge === "advantage" ? "Advantage" : edge === "disadvantage" ? "Disadvantage" : "Normal"}`) : "";
    const reason = root.querySelector('[name="reason"]').value.trim().slice(0, 300);
    // Knave 2e p27: the player generates a spell (spell-generator.js); no roll against a target.
    if (kind === "spell") return this.#sendSpellRequest(ids, reason);
    const label = kind === "save"
      ? F("KNAVERY.Roll.SaveTitle", { save: L(`KNAVERY.Save.${key}`), ability: L(`KNAVERY.Ability.${SAVE_CATEGORIES[key]}`) })
      : F("KNAVERY.Roll.CheckTitle", { ability: L(`KNAVERY.Ability.${key}`) });
    const entry = { id: foundry.utils.randomID(), label, reason, target: CHECK_BASE + difficulty, kind, key, difficulty, edge, edgeLabel, entries: [] };
    for (const actorId of ids) {
      const actor = game.actors.get(actorId);
      if (!actor) continue;
      const players = game.users.filter((u) => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"));
      entry.entries.push({ actorId, name: actor.name, state: players.length ? "waiting" : "offline" });
      if (players.length) {
        emit("requestRoll", { requestId: entry.id, actorId, kind, key, difficulty, reason, edge },
          { recipients: players.map((u) => u.id) });
      }
    }
    requestLog.unshift(entry);
    await ChatMessage.create({
      speaker: { alias: L("KNAVERY.GameMaster") },
      content: `<div class="knavery-roll-card kind-request"><header class="card-title"><h3><i class="fas fa-bullhorn"></i> ${foundry.utils.escapeHTML(label)}</h3></header>`
        + `<p>${foundry.utils.escapeHTML(listOf(entry.entries.map((e) => e.name)))} — ${foundry.utils.escapeHTML(F("KNAVERY.Roll.VsTarget", { target: entry.target }))}${edgeLabel ? `, ${foundry.utils.escapeHTML(edgeLabel)}` : ""}</p>`
        + (reason ? `<p class="roll-reason"><i class="fas fa-bullhorn"></i> ${foundry.utils.escapeHTML(reason)}</p>` : "") + "</div>",
    });
    this.render({ parts: ["requests"] });
  }

  /** Ask the chosen characters' players to generate a spell (Knave 2e p27). */
  async #sendSpellRequest(ids, reason) {
    const label = L("KNAVERY.SpellGen.RequestLabel");
    const entry = { id: foundry.utils.randomID(), label, reason, target: null, kind: "spell", key: "generate", difficulty: 0, entries: [] };
    for (const actorId of ids) {
      const actor = game.actors.get(actorId);
      if (!actor) continue;
      const players = game.users.filter((u) => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"));
      entry.entries.push({ actorId, name: actor.name, state: players.length ? "waiting" : "offline" });
      if (players.length) emit("requestRoll", { requestId: entry.id, actorId, kind: "spell", key: "generate", reason }, { recipients: players.map((u) => u.id) });
    }
    requestLog.unshift(entry);
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    await ChatMessage.create({
      speaker: { alias: L("KNAVERY.GameMaster") },
      content: `<div class="knavery-roll-card kind-request"><header class="card-title"><h3><i class="fas fa-wand-sparkles"></i> ${esc(label)}</h3></header>`
        + `<p>${esc(game.i18n.getListFormatter().format(entry.entries.map((e) => e.name)))}</p>`
        + (reason ? `<p class="roll-reason"><i class="fas fa-bullhorn"></i> ${esc(reason)}</p>` : "") + "</div>",
    });
    this.render({ parts: ["requests"] });
  }

  /** Roll a request on behalf of a character whose player is away. */
  static async #onRollForThem(_e, target) {
    const req = requestLog.find((r) => r.id === target.dataset.request);
    const actor = game.actors.get(target.dataset.actor);
    if (!req || !actor) return;
    if (req.kind === "spell") return openSpellGenerator(actor, { requestId: req.id, reason: req.reason });
    const opts = { difficulty: req.difficulty, reason: req.reason, requestId: req.id, lockEdge: req.edge || null };
    if (req.kind === "save") await rollSave(actor, req.key, opts);
    else await rollCheck(actor, req.key, opts);
  }

  static #onClearLog() {
    requestLog.length = 0;
    this.render({ parts: ["requests"] });
  }

  /** Called from the createChatMessage hook: a requested roll came back. */
  static noteResult(message) {
    const spell = message.getFlag?.(FLAG_SCOPE, "spellGen");
    if (spell) {
      // One spell answers every request the player's window gathered (a re-send before they added the book).
      const ids = spell.requestIds ?? (spell.requestId ? [spell.requestId] : []);
      let found = false;
      for (const id of ids) {
        const e = requestLog.find((r) => r.id === id)?.entries.find((x) => x.actorId === message.speaker?.actor);
        if (!e) continue;
        Object.assign(e, { state: "done", total: String(spell.name ?? "") });
        found = true;
      }
      if (found) foundry.applications.instances.get("knavery-gm-dashboard")?.render({ parts: ["requests"] });
      return;
    }
    const check = message.getFlag?.(FLAG_SCOPE, "check");
    if (!check?.requestId) return;
    const req = requestLog.find((r) => r.id === check.requestId);
    const actorId = message.speaker?.actor;
    const e = req?.entries.find((x) => x.actorId === actorId);
    if (!e) return;
    Object.assign(e, { state: check.success ? "success" : "failure", total: check.total });
    foundry.applications.instances.get("knavery-gm-dashboard")?.render({ parts: ["requests"] });
  }

  /* -------------------------------------------- */
  /*  Damage                                       */
  /* -------------------------------------------- */

  static async #onApplyDamage() {
    const root = this.#form();
    const formula = root.querySelector('[name="dmgFormula"]').value.trim() || "1d6";
    const direct = root.querySelector('[name="dmgDirect"]').checked;
    const source = root.querySelector('[name="dmgSource"]').value.trim().slice(0, 200);
    const scope = root.querySelector('[name="dmgTargets"]').value;
    let actors = [];
    if (scope === "pcs") actors = [...root.querySelectorAll('input[name="dmgPc"]:checked')].map((b) => game.actors.get(b.value)).filter(Boolean);
    else {
      const tokens = scope === "targeted" ? [...game.user.targets] : (canvas.tokens?.controlled ?? []);
      actors = tokens.map((t) => actorFromUuid(t.document.uuid)).filter(Boolean);
    }
    if (!actors.length) return ui.notifications.warn("KNAVERY.Notify.NoTargets", { localize: true });
    if (!isRollable(formula)) return ui.notifications.warn("KNAVERY.Notify.NotADamageFormula", { format: { formula } });
    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({
      speaker: { alias: L("KNAVERY.GameMaster") },
      flavor: F(direct ? "KNAVERY.Dashboard.DirectDamageFlavor" : "KNAVERY.Dashboard.DamageFlavor", { source: source || "—" }),
    });
    for (const a of actors) await a.applyDamage(roll.total, { direct, source });
  }

  /* -------------------------------------------- */
  /*  Dice                                         */
  /* -------------------------------------------- */

  static async #onHazard(_e, target) {
    await rollHazard(target.dataset.kind, { resting: clock().resting });
  }

  /* -------------------------------------------- */
  /*  Time                                         */
  /* -------------------------------------------- */

  /** End the turn or watch: the clock moves on and the hazard die rolls. */
  static async #onEndTurn() {
    const travelling = this.element.querySelector('[name="timeTravelling"]')?.checked ?? true;
    await endTurn({ travelling });
  }

  static async #onTimeMode(_e, target) {
    if (target.value && target.value !== clock().mode) await setClock({ mode: target.value });
  }

  static async #onTimeResting(_e, target) {
    await setClock({ resting: target.checked });
  }

  /** Pay a hireling's month from their employer. */
  static async #onPayWage(_e, target) {
    const paid = await payWage(game.actors.get(target.dataset.id));
    if (paid) this.render({ parts: ["time"] });
  }

  static async #onReaction() {
    const table = await findTable(TABLES.reaction);
    const real = table?.results.filter((r) => !r.getFlag(FLAG_SCOPE, "placeholder")) ?? [];
    // messageMode "gm" (a private GM roll); `rollMode` and CONST.DICE_ROLL_MODES
    // are deprecated {since: 14, until: 16}.
    if (real.length) return table.draw({ messageMode: "gm" });
    const roll = await new Roll("2d6").evaluate();
    return roll.toMessage({ flavor: L("KNAVERY.Dashboard.Reaction"), speaker: { alias: L("KNAVERY.GameMaster") } },
      { messageMode: "gm" });
  }

  static async #onEncounterDistance(_e, target) {
    const wild = target.dataset.where === "wilderness";
    const roll = await new Roll(wild ? "4d6 * 30" : "2d6 * 10").evaluate();
    return roll.toMessage({
      flavor: F("KNAVERY.Dashboard.DistanceFlavor", { where: L(wild ? "KNAVERY.Dashboard.Wilderness" : "KNAVERY.Dashboard.Dungeon") }),
      speaker: { alias: L("KNAVERY.GameMaster") },
    }, { messageMode: "gm" });
  }

  /** Combat: the round's order by the world's rule (1e d6, 2e leaders' check, or everyone's roll). */
  static async #onRollInitiativeNow() {
    const combat = game.combat;
    if (!combat) return ui.notifications.warn("KNAVERY.Dashboard.CombatNotStarted", { localize: true });
    if (sidesOn()) await combat.rollGroupInitiative(Math.max(1, combat.round));
    else await combat.rollAll();
    this.render({ parts: ["damage"] });
  }

  /** Combat: surprise decides round 1 (2e p19); "they" = the PCs caught them. */
  static async #onSurpriseSide(_e, target) {
    const combat = game.combat;
    if (!combat) return ui.notifications.warn("KNAVERY.Dashboard.CombatNotStarted", { localize: true });
    await combat.setSurprise(target.dataset.side === "they");
    this.render({ parts: ["damage"] });
  }

  /** Combat: the selected tokens' combatants are marked defeated, with the overlay. */
  static async #onMarkDefeated() {
    const combat = game.combat;
    const tokens = canvas.tokens?.controlled ?? [];
    if (!combat || !tokens.length) return ui.notifications.warn("KNAVERY.Notify.NoTargets", { localize: true });
    for (const t of tokens) {
      const c = combat.combatants.find((x) => x.tokenId === t.id);
      if (c && !c.isDefeated) await c.update({ defeated: true });
      await t.actor?.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true });
    }
  }

  /** Combat (2e): the leader rallies the selected NPC after a failed morale test. */
  static async #onRallySelected() {
    const actor = (canvas.tokens?.controlled ?? []).map((t) => t.actor).find((a) => a?.type === "npc");
    if (!actor) return ui.notifications.warn("KNAVERY.Dashboard.SelectNpcs", { localize: true });
    await rally(actor);
  }

  /**
   * Carousing (Knave 2e p52): a whole night and d10 × 50c in a village, 100c in a town, 200c in a city,
   * XP equal to the coins spent; a CON check in the morning, or a mishap from the GM's table.
   */
  static async #onCarouse() {
    const pcs = party();
    if (!pcs.length) return ui.notifications.warn("KNAVERY.Time.NoParty", { localize: true });
    const idp = foundry.utils.randomID();
    const options = pcs.map((a) => `<option value="${a.id}">${esc(a.name)} (${a.system.coins ?? 0}c)</option>`).join("");
    const where = ["village", "town", "city"].map((w, i) =>
      `<label><input type="radio" name="where" value="${w}"${i === 1 ? " checked" : ""} /> ${esc(L(`KNAVERY.Carousing.${w}`))}</label>`).join(" ");
    const choice = await DialogV2.prompt({
      classes: ["knavery"],
      window: { title: L("KNAVERY.Carousing.Title"), icon: "fas fa-wine-bottle" },
      content: `<p class="hint">${esc(L("KNAVERY.Carousing.Help"))}</p>`
        + `<div class="form-group"><label for="kn-carouse-${idp}">${esc(L("KNAVERY.Carousing.Who"))}</label><div class="form-fields"><select name="pc" id="kn-carouse-${idp}">${options}</select></div></div>`
        + `<div class="form-group"><label>${esc(L("KNAVERY.Carousing.Where"))}</label><div class="form-fields kn-carouse-where">${where}</div></div>`,
      ok: {
        label: "KNAVERY.Carousing.Go", icon: "fas fa-wine-bottle",
        callback: (_e, b) => ({ pc: b.form.elements.pc.value, where: b.form.querySelector('input[name="where"]:checked')?.value ?? "town" }),
      },
      rejectClose: false,
    });
    const actor = choice ? game.actors.get(choice.pc) : null;
    if (!actor) return;
    const mult = { village: 50, town: 100, city: 200 }[choice.where] ?? 100;
    const roll = await new Roll(`1d10 * ${mult}`).evaluate();
    const coins = actor.system.coins ?? 0;
    const spent = Math.min(roll.total, coins);
    await actor.update({ "system.coins": coins - spent, "system.xp": (actor.system.xp ?? 0) + spent }, { knLogAction: "KNAVERY.Carousing.Title" });
    const check = await rollCheck(actor, "CON", { reason: L("KNAVERY.Carousing.MorningReason") });
    const lines = [F("KNAVERY.Carousing.Spent", { name: actor.name, where: L(`KNAVERY.Carousing.${choice.where}`), rolled: roll.total, spent })];
    if (spent < roll.total) lines.push(F("KNAVERY.Carousing.Short", { short: roll.total - spent }));
    if (check === null) lines.push(L("KNAVERY.Carousing.NoCheck"));
    else if (check?.success) lines.push(L("KNAVERY.Carousing.Passed"));
    else {
      lines.push(L("KNAVERY.Carousing.Failed"));
      const table = await findTable("Carousing Mishaps");
      if (table?.results.some((r) => !r.getFlag(FLAG_SCOPE, "placeholder"))) await table.draw({ messageMode: "gm" });
      else lines.push(L("KNAVERY.Carousing.NoTable"));
    }
    await ChatMessage.create({
      speaker: { alias: L("KNAVERY.GameMaster") },
      whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
      content: `<div class="knavery-roll-card kind-carousing"><header class="card-title"><h3><i class="fas fa-wine-bottle"></i> ${esc(L("KNAVERY.Carousing.Title"))}</h3></header>`
        + `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`,
    });
  }

  /** Foraging (Knave 2e p8): a watch and a WIS check for d6 rations; the watch then ends. */
  static async #onForage() {
    const pcs = party();
    if (!pcs.length) return ui.notifications.warn("KNAVERY.Time.NoParty", { localize: true });
    const idp = foundry.utils.randomID();
    const options = pcs.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    const id = await DialogV2.prompt({
      classes: ["knavery"],
      window: { title: L("KNAVERY.Time.ForageTitle"), icon: "fas fa-seedling" },
      content: `<p class="hint">${esc(L("KNAVERY.Time.ForageHelp"))}</p>`
        + `<div class="form-group"><label for="kn-forage-${idp}">${esc(L("KNAVERY.Time.ForageWho"))}</label><div class="form-fields"><select name="pc" id="kn-forage-${idp}">${options}</select></div></div>`,
      ok: { label: "KNAVERY.Time.ForageGo", icon: "fas fa-dice-d20", callback: (_e, b) => b.form.elements.pc.value },
      rejectClose: false,
    });
    const actor = id ? game.actors.get(id) : null;
    if (!actor) return;
    const check = await rollCheck(actor, "WIS", { reason: L("KNAVERY.Time.ForageReason") });
    if (check === null) return;
    let line;
    if (check.success) {
      const n = (await new Roll("1d6").evaluate()).total;
      const { findItemByName } = await import("./character-generator.js");
      const doc = await findItemByName("Rations");
      const data = doc ? doc.toObject() : { name: "Rations", type: "item", system: { slots: 1 } };
      for (const k of ["_id", "folder", "ownership", "sort", "_stats"]) delete data[k];
      data.system = { ...data.system, quantity: n };
      await actor.addItems([data], { knNoLog: true });
      line = P("KNAVERY.Time.ForageFound", n, { name: actor.name });
    } else line = F("KNAVERY.Time.ForageNothing", { name: actor.name });
    await ChatMessage.create({ speaker: { alias: L("KNAVERY.GameMaster") }, content: `<div class="knavery-roll-card kind-forage"><p>${esc(line)}</p></div>` });
    // The watch is spent: the clock moves and the travel hazard die rolls; no ground covered.
    await endTurn({ travelling: false });
  }

  static async #onMorale() {
    const actors = (canvas.tokens?.controlled ?? []).map((t) => t.actor).filter((a) => a?.type === "npc");
    if (!actors.length) return ui.notifications.warn("KNAVERY.Dashboard.SelectNpcs", { localize: true });
    for (const a of actors) await rollMorale(a);
  }

  /* -------------------------------------------- */
  /*  Tables and switches                          */
  /* -------------------------------------------- */

  /** An event table (the Dice page), whispered to the GM like the page's other rolls. */
  static async #onRollEvent(_e, target) {
    const table = await findTable(target.dataset.table);
    if (!table) return ui.notifications.warn("KNAVERY.Dashboard.EventMissing", { format: { name: tableLabel(target.dataset.table) } });
    // messageMode "gm", as #onReaction: `rollMode` and CONST.DICE_ROLL_MODES are deprecated {since: 14, until: 16}.
    await table.draw({ messageMode: "gm" });
  }

  /**
   * Surprise (p19): within 80', the closest PC makes a WIS check against the closest creature's WIS;
   * winning by 5 or more surprises. Sets the request up on Requests; the GM ticks that PC and sends.
   */
  static #onSurprise() {
    this.changeTab("requests", "primary");
    const root = this.element;
    const what = root.querySelector('[name="check"]');
    if (what) { what.value = "ability:WIS"; what.dispatchEvent(new Event("change", { bubbles: true })); }
    const reason = root.querySelector('[name="reason"]');
    if (reason) reason.value = L("KNAVERY.Dashboard.SurpriseReason");
    root.querySelector('[name="difficulty"]')?.focus();
  }

  /** A quick NPC: a name, a personality, a profession and a detail from the tables the world has, whispered. */
  static async #onQuickNpc() {
    const lines = [];
    for (const { key, tables } of QUICK_NPC) {
      const words = [];
      for (const name of tables) {
        const text = (await drawFrom(name, { warn: false }))?.text;
        if (text) words.push(text);
      }
      if (words.length) lines.push({ label: L(`KNAVERY.Dashboard.Npc.${key}`), text: words.join(" ") });
    }
    if (!lines.length) return ui.notifications.warn("KNAVERY.Dashboard.QuickNpcMissing", { localize: true });
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    await ChatMessage.create({
      speaker: { alias: L("KNAVERY.GameMaster") },
      whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
      content: `<div class="knavery-roll-card kind-npc"><header class="card-title"><h3><i class="fas fa-user-secret"></i> ${esc(L("KNAVERY.Dashboard.QuickNpc"))}</h3></header>`
        + `<ul>${lines.map((l) => `<li><strong>${esc(l.label)}:</strong> ${esc(l.text)}</li>`).join("")}</ul></div>`,
      flags: { [FLAG_SCOPE]: { quickNpc: true } },
    });
  }

  static async #onRollTable(_e, target) {
    const table = await findTable(target.closest("[data-table]").dataset.table);
    if (table) await table.draw();
  }

  static #onImportTable(_e, target) {
    openTableImporter(target.closest("[data-table]")?.dataset.table ?? "");
  }

  /** A table's book icon carries its page; the Rulebook row reads its page input. */
  static #onOpenRulebook(_e, target) {
    const page = Number(target.dataset.page) || Number(this.element.querySelector('[name="rulebook-page"]')?.value) || null;
    openRulebook({ page });
  }

  static #onShowRulebook() {
    const reader = foundry.applications.instances.get("knavery-rulebook");
    const page = Number(this.element.querySelector('[name="rulebook-page"]')?.value) || reader?.currentPage || 1;
    showRulebookPage(page);
  }

  static async #onToggleSetting(_e, target) {
    const key = target.dataset.key;
    await setToggle(key, !game.settings.get(SETTINGS_NS, key));
    this.render({ parts: ["tools"] });
  }

  /** Toggles: a portrait gallery on or off; one switched off stops being the random source. */
  static async #onToggleGallery(_e, target) {
    const id = target.dataset.id;
    const now = { ...game.settings.get(SETTINGS_NS, "portrait-galleries") };
    now[id] = !galleryOn(id);
    if (!(await setWorldSetting("portrait-galleries", now))) return;
    if (!now[id] && randomPortraitSource() === id) await setWorldSetting("random-portrait-source", "any");
    this.render({ parts: ["tools"] });
  }

  /** Toggles: walk the GM's portrait folder again (it writes the list as a world setting). */
  static async #onRescanPortraits(_e, target) {
    if (!canModifySettings()) return;
    target.classList.add("disabled");
    await refreshCustomPortraits();
    this.render({ parts: ["tools"] });
  }
}

/**
 * Who gets how much XP. `each`: `amount` to every actor; `split`: `amount`
 * shared evenly, rounded down; `individual`: each actor's own value. Whole,
 * positive amounts only.
 * @returns {{actor: Actor, xp: number}[]}
 */
export const xpAwards = (mode, amount, actors, valueFor = () => 0) => {
  const whole = (n) => Math.max(0, Math.floor(Number(n) || 0));
  let list;
  if (mode === "individual") list = actors.map((actor) => ({ actor, xp: whole(valueFor(actor)) }));
  else if (mode === "split") list = actors.map((actor) => ({ actor, xp: actors.length ? whole(whole(amount) / actors.length) : 0 }));
  else list = actors.map((actor) => ({ actor, xp: whole(amount) }));
  return list.filter((a) => a.xp > 0);
};

/** The Party tab's rows: every character a player owns. */
export const partyRows = () => {
  const capped = spellRule() === "int-per-day";
  return party().map((a) => {
    const s = a.system;
    const owners = game.users.filter((u) => !u.isGM && a.testUserPermission(u, "OWNER"));
    const books = a.items.filter((i) => i.type === "spellbook" && !i.system.scroll);
    const ready = books.filter((i) => !i.system.castToday).length;
    const spellsLeft = Math.max(0, (s.spellsPerDay ?? 0) - (s.spellsCastToday ?? 0));
    const slotsUsed = a.calcSlotsUsed();
    return {
      id: a.id, name: a.name, img: a.img, level: s.level,
      players: listOf(owners.map((u) => u.name)),
      hp: { value: s.hp?.value ?? 0, max: s.hp?.max ?? 0 },
      dead: s.dead, unconscious: s.unconscious,
      status: s.dead ? L("KNAVERY.Party.Dead") : (s.unconscious ? L("KNAVERY.Party.Unconscious") : ""),
      wounds: s.wounds ?? 0,
      slotsUsed, slotsMax: s.slotsMax ?? 0, over: slotsUsed > (s.slotsMax ?? 0),
      coins: s.coins ?? 0,
      books: books.length,
      // Knave 2e caps spells a day at INT; Knave 1e only once a book (rules.js spell-rule).
      booksLine: capped ? F("KNAVERY.Party.BooksCapped", { ready, total: books.length, left: spellsLeft })
        : F("KNAVERY.Party.Books", { ready, total: books.length }),
      lights: a.items.filter((i) => isLight(i)).map((i) => ({
        lit: i.system.lit,
        label: (i.system.quantity ?? 1) > 1 ? `${i.name} ×${i.system.quantity}` : i.name,
      })).sort((x, y) => Number(y.lit) - Number(x.lit)),
    };
  });
};

/** The XP tab's treasure mode: the rule, and the party's uncounted treasure. */
const treasureContext = () => {
  if (!treasureXpOn()) return { on: false };
  const owners = party();
  return {
    on: true,
    hint: L(treasureXpRule() === "gold" ? "KNAVERY.Dashboard.TreasureHintGold" : "KNAVERY.Dashboard.TreasureHintCoin"),
    items: treasureCarried(owners).map(({ actor, item, value }) => ({
      actorId: actor.id, uuid: item.uuid, img: item.img, owner: actor.name, value,
      name: (item.system.quantity ?? 1) > 1 ? `${item.name} ×${item.system.quantity}` : item.name,
    })),
  };
};

/** Redraw the Party tab (and the XP tab's treasure) when a party member or their gear changes. */
export const registerPartyRefresh = () => {
  const redraw = foundry.utils.debounce(() => {
    const app = foundry.applications.instances.get("knavery-gm-dashboard");
    if (app?.rendered) app.render({ parts: ["party", "xp"] });
  }, 150);
  const isParty = (actor) => actor?.type === "character" && actor.hasPlayerOwner;
  const onActor = (actor) => { if (game.user.isGM && isParty(actor)) redraw(); };
  const onItem = (item) => onActor(item?.parent);
  Hooks.on("updateActor", onActor);
  Hooks.on("createActor", onActor);
  Hooks.on("deleteActor", onActor);
  Hooks.on("createItem", onItem);
  Hooks.on("updateItem", onItem);
  Hooks.on("deleteItem", onItem);
};

/** Whether this GM may write a world setting: an Assistant GM may have had "Modify Configuration Settings" taken away. */
const canModifySettings = () => {
  if (game.user.can("SETTINGS_MODIFY")) return true;
  ui.notifications.warn("KNAVERY.Notify.NoSettingsPermission", { localize: true });
  return false;
};

/** Write a world setting from the dashboard, or warn and write nothing. Resolves to whether it was written. */
const setWorldSetting = async (key, value) => {
  if (!canModifySettings()) return false;
  await game.settings.set(SETTINGS_NS, key, value);
  return true;
};

/** Flip a player-tool switch and announce it (shared with the macros). */
export const setToggle = async (key, value) => {
  if (!(await setWorldSetting(key, value))) return;
  const t = TOGGLES.find((x) => x.key === key);
  ui.notifications.info(value ? "KNAVERY.Macro.TurnedOn" : "KNAVERY.Macro.TurnedOff", { format: { what: L(t?.label ?? key) } });
};

/** Redraw the Combat page when the fight changes: a start or end, a turn or round, a combatant joining, falling or leaving. */
export const registerCombatRefresh = () => {
  const redraw = foundry.utils.debounce(() => {
    const app = foundry.applications.instances.get("knavery-gm-dashboard");
    if (app?.rendered) app.render({ parts: ["damage"] });
  }, 150);
  const onChange = () => { if (game.user.isGM) redraw(); };
  for (const hook of ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) Hooks.on(hook, onChange);
};

/** Open the dashboard, on a page when one is named (a tab id: "market", "tools"...). */
export const openGmDashboard = async (tab = null) => {
  if (!game.user.isGM) return;
  const app = foundry.applications.instances.get("knavery-gm-dashboard") ?? new GmDashboard();
  await app.render({ force: true });
  if (tab) app.changeTab(tab, "primary");
};
/** The Marketplace Manager of old (`game.knavery` API, probes): the dashboard's Marketplace page. */
export const openMarketplaceManager = () => openGmDashboard("market");

/* -------------------------------------------- */
/*  The player side of a request                 */
/* -------------------------------------------- */

export const registerRequestSocket = () => {
  onSocket("requestRoll", async (msg, senderId) => {
    if (!game.users.get(senderId)?.isGM) return;
    const actor = game.actors.get(String(msg.actorId ?? ""));
    if (!actor?.isOwner) return;
    const reason = String(msg.reason ?? "").slice(0, 300);
    const difficulty = Math.max(0, Number(msg.difficulty) || 0);
    const opts = { difficulty, reason, requestId: String(msg.requestId ?? ""), lockEdge: EDGES.includes(msg.edge) ? msg.edge : null };
    if (msg.kind === "spell") return openSpellGenerator(actor, { requestId: opts.requestId, reason });
    if (msg.kind === "save" && Object.hasOwn(SAVE_CATEGORIES, msg.key)) await rollSave(actor, msg.key, opts);
    else if (ABILITIES.includes(msg.key)) await rollCheck(actor, msg.key, opts);
  });
};
