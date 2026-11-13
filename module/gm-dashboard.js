/**
 * The Game Master's Dashboard.
 *
 *   Requests  ask players for a check or save, saying WHY. Each owning player
 *             gets the edge prompt with the reason and the difficulty locked;
 *             the results come back here as they land in chat.
 *   Damage    roll or type damage and apply it to chosen characters or to
 *             the selected/targeted tokens, normal or direct, with a source.
 *   Dice      hazard dice, reaction, encounter distance, morale.
 *   XP        award XP: the same amount to each chosen character, a different
 *             amount to each, or a total split evenly (the book's treasure rule).
 *   Tables    roll any table, import rows, open the Marketplace Manager, and
 *             the live switches for the players' tools.
 */
import {
  ABILITIES, CHECK_BASE, DEFAULT_DIFFICULTY, FLAG_SCOPE, SAVE_CATEGORIES, SETTINGS_NS, SYS_PATH, TABLES,
} from "./config.js";
import { emit, onSocket } from "./socket.js";
import { isRollable, rollCheck, rollHazard, rollMorale, rollSave } from "./rolls.js";
import { actorFromUuid } from "./damage.js";
import { findTable } from "./compendium.js";
import { openTableImporter } from "./table-importer.js";
import { openMarketplaceManager } from "./marketplace.js";
import { hasRulebook, openRulebook, pickLocalRulebook, showRulebookPage, tablePage } from "./rulebook.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** Requests sent this session, newest first: {id, label, reason, target, entries:[{actorId,name,state,total,success}]} */
const requestLog = [];

const TOGGLES = [
  { key: "allow-player-marketplace", label: "KNAVERY.Macro.Marketplace", icon: "fa-store" },
  { key: "allow-player-generate", label: "KNAVERY.Macro.Creation", icon: "fa-user-plus" },
  { key: "allow-player-randomization", label: "KNAVERY.Macro.CreationTools", icon: "fa-dice-d20" },
  { key: "allow-player-level-xp", label: "KNAVERY.Macro.LevelXp", icon: "fa-arrow-up-1-9" },
  { key: "change-log", label: "KNAVERY.Macro.ChangeLog", icon: "fa-clipboard-list" },
];

export class GmDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "knavery-gm-dashboard",
    tag: "form",
    classes: ["knavery", "knavery-gm-dashboard"],
    window: { title: "KNAVERY.Dashboard.Title", icon: "fas fa-clipboard-list", resizable: true },
    position: { width: 640, height: 720 },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      sendRequest: GmDashboard.#onSendRequest,
      rollForThem: GmDashboard.#onRollForThem,
      clearLog: GmDashboard.#onClearLog,
      applyDamage: GmDashboard.#onApplyDamage,
      awardXp: GmDashboard.#onAwardXp,
      hazard: GmDashboard.#onHazard,
      reaction: GmDashboard.#onReaction,
      encounterDistance: GmDashboard.#onEncounterDistance,
      morale: GmDashboard.#onMorale,
      rollTable: GmDashboard.#onRollTable,
      importTable: GmDashboard.#onImportTable,
      marketManager: () => openMarketplaceManager(),
      toggleSetting: GmDashboard.#onToggleSetting,
      selectAll: GmDashboard.#onSelectAll,
      openRulebook: GmDashboard.#onOpenRulebook,
      showRulebook: GmDashboard.#onShowRulebook,
      chooseRulebook: () => pickLocalRulebook(),
      buildTables: () => import("./rulebook-import.js").then((m) => m.openRulebookTablesReview()),
    },
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    requests: { template: `${SYS_PATH}/templates/dashboard/requests.html`, scrollable: [".request-log"] },
    damage: { template: `${SYS_PATH}/templates/dashboard/damage.html` },
    dice: { template: `${SYS_PATH}/templates/dashboard/dice.html` },
    xp: { template: `${SYS_PATH}/templates/dashboard/xp.html`, scrollable: [".dash-xp-rows"] },
    tables: { template: `${SYS_PATH}/templates/dashboard/tables.html`, scrollable: [".table-list"] },
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "requests", icon: "fas fa-bullhorn", label: "KNAVERY.Dashboard.TabRequests" },
        { id: "damage", icon: "fas fa-skull-crossbones", label: "KNAVERY.Dashboard.TabDamage" },
        { id: "dice", icon: "fas fa-dice", label: "KNAVERY.Dashboard.TabDice" },
        { id: "xp", icon: "fas fa-star", label: "KNAVERY.Dashboard.TabXp" },
        { id: "tables", icon: "fas fa-table-list", label: "KNAVERY.Dashboard.TabTables" },
      ],
      initial: "requests",
    },
  };

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs?.[partId];
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const characters = game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner).map((a) => {
      const owners = game.users.filter((u) => !u.isGM && a.testUserPermission(u, "OWNER"));
      return {
        id: a.id, name: a.name, img: a.img, level: a.system.level, xp: a.system.xp,
        players: owners.map((u) => u.name).join(", "),
        online: owners.some((u) => u.active),
      };
    });
    const tableNames = [TABLES.careers, TABLES.spells, TABLES.namesA, TABLES.surnames, ...Object.values(TABLES.traits),
      TABLES.reaction, TABLES.mishaps];
    // Index lookups only: loading every compendium table to count its rows
    // took ten seconds on a small server. World tables are already in memory.
    const packIndex = game.packs.filter((p) => p.documentName === "RollTable").flatMap((p) => [...p.index]);
    const tables = tableNames.map((name) => {
      const world = game.tables.getName(name);
      const page = tablePage(name);
      if (world) return { name, world: true, exists: true, rows: world.results.size, page };
      const shipped = packIndex.some((e) => e.name === name);
      return { name, world: false, exists: shipped, rows: shipped ? "—" : 0, page };
    });
    for (const t of game.tables.filter((x) => !tableNames.includes(x.name))) {
      tables.push({ name: t.name, world: true, exists: true, rows: t.results.size, page: tablePage(t.name) });
    }
    const rulebook = hasRulebook();
    for (const t of tables) t.pageTip = t.page ? F("KNAVERY.Rulebook.OpenAt", { page: t.page }) : "";
    return Object.assign(context, {
      characters,
      abilities: ABILITIES.map((k) => ({ value: `ability:${k}`, label: L(`KNAVERY.Ability.${k}`) })),
      saves: Object.entries(SAVE_CATEGORIES).map(([k, a]) => ({ value: `save:${k}`, label: `${L(`KNAVERY.Save.${k}`)} (${L(`KNAVERY.AbilityShort.${a}`)})` })),
      difficulty: DEFAULT_DIFFICULTY,
      target: CHECK_BASE + DEFAULT_DIFFICULTY,
      log: requestLog.slice(0, 20),
      showHazard: game.settings.get(SETTINGS_NS, "show-hazard-dice"),
      tables,
      rulebook,
      toggles: TOGGLES.map((t) => ({ ...t, on: game.settings.get(SETTINGS_NS, t.key) })),
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

  _onRender(context, options) {
    super._onRender(context, options);
    const diff = this.element.querySelector('[name="difficulty"]');
    const out = this.element.querySelector(".request-target");
    const showTarget = () => { if (diff && out) out.textContent = CHECK_BASE + (Number(diff.value) || 0); };
    showTarget();
    diff?.addEventListener("input", showTarget);
    // XP: one amount for "same to each" and "split", a box per character for "different to each".
    const mode = this.element.querySelector('[name="xpMode"]');
    const showMode = () => {
      const individual = mode?.value === "individual";
      this.element.querySelector(".dash-xp-amount")?.toggleAttribute("hidden", individual);
      this.element.querySelectorAll(".dash-xp-each").forEach((el) => el.toggleAttribute("hidden", !individual));
      this.element.querySelectorAll('.dash-xp-row input[name="xpPc"], .dash-xp-all').forEach((el) => el.toggleAttribute("hidden", individual));
    };
    showMode();
    mode?.addEventListener("change", showMode);
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
    const reason = root.querySelector('[name="reason"]').value.trim().slice(0, 300);
    const label = kind === "save"
      ? F("KNAVERY.Roll.SaveTitle", { save: L(`KNAVERY.Save.${key}`), ability: L(`KNAVERY.Ability.${SAVE_CATEGORIES[key]}`) })
      : F("KNAVERY.Roll.CheckTitle", { ability: L(`KNAVERY.Ability.${key}`) });
    const entry = { id: foundry.utils.randomID(), label, reason, target: CHECK_BASE + difficulty, kind, key, difficulty, entries: [] };
    for (const actorId of ids) {
      const actor = game.actors.get(actorId);
      if (!actor) continue;
      const players = game.users.filter((u) => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"));
      entry.entries.push({ actorId, name: actor.name, state: players.length ? "waiting" : "offline" });
      if (players.length) {
        emit("requestRoll", { requestId: entry.id, actorId, kind, key, difficulty, reason },
          { recipients: players.map((u) => u.id) });
      }
    }
    requestLog.unshift(entry);
    await ChatMessage.create({
      speaker: { alias: L("KNAVERY.GameMaster") },
      content: `<div class="knavery-roll-card kind-request"><header class="card-title"><h3><i class="fas fa-bullhorn"></i> ${foundry.utils.escapeHTML(label)}</h3></header>`
        + `<p>${foundry.utils.escapeHTML(entry.entries.map((e) => e.name).join(", "))} — ${foundry.utils.escapeHTML(F("KNAVERY.Roll.VsTarget", { target: entry.target }))}</p>`
        + (reason ? `<p class="roll-reason"><i class="fas fa-bullhorn"></i> ${foundry.utils.escapeHTML(reason)}</p>` : "") + "</div>",
    });
    this.render({ parts: ["requests"] });
  }

  /** Roll a request on behalf of a character whose player is away. */
  static async #onRollForThem(_e, target) {
    const req = requestLog.find((r) => r.id === target.dataset.request);
    const actor = game.actors.get(target.dataset.actor);
    if (!req || !actor) return;
    const opts = { difficulty: req.difficulty, reason: req.reason, requestId: req.id };
    if (req.kind === "save") await rollSave(actor, req.key, opts);
    else await rollCheck(actor, req.key, opts);
  }

  static #onClearLog() {
    requestLog.length = 0;
    this.render({ parts: ["requests"] });
  }

  /** Called from the createChatMessage hook: a requested roll came back. */
  static noteResult(message) {
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
    if (!isRollable(formula)) return ui.notifications.warn(F("KNAVERY.Notify.NotADamageFormula", { formula }));
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
    await rollHazard(target.dataset.kind);
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

  static async #onMorale() {
    const actors = (canvas.tokens?.controlled ?? []).map((t) => t.actor).filter((a) => a?.type === "npc");
    if (!actors.length) return ui.notifications.warn("KNAVERY.Dashboard.SelectNpcs", { localize: true });
    for (const a of actors) await rollMorale(a);
  }

  /* -------------------------------------------- */
  /*  Tables and switches                          */
  /* -------------------------------------------- */

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
    this.render({ parts: ["tables"] });
  }
}

/** Flip a player-tool switch and announce it (shared with the macros). */
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

export const setToggle = async (key, value) => {
  // An Assistant GM may have had "Modify Configuration Settings" taken away.
  if (!game.user.can("SETTINGS_MODIFY")) {
    return ui.notifications.warn("KNAVERY.Notify.NoSettingsPermission", { localize: true });
  }
  await game.settings.set(SETTINGS_NS, key, value);
  const t = TOGGLES.find((x) => x.key === key);
  ui.notifications.info(F(value ? "KNAVERY.Macro.TurnedOn" : "KNAVERY.Macro.TurnedOff", { what: L(t?.label ?? key) }));
};

export const openGmDashboard = () => {
  if (!game.user.isGM) return;
  const app = foundry.applications.instances.get("knavery-gm-dashboard") ?? new GmDashboard();
  app.render(true);
};

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
    const opts = { difficulty, reason, requestId: String(msg.requestId ?? "") };
    if (msg.kind === "save" && Object.hasOwn(SAVE_CATEGORIES, msg.key)) await rollSave(actor, msg.key, opts);
    else if (ABILITIES.includes(msg.key)) await rollCheck(actor, msg.key, opts);
  });
};
