/**
 * Time in the dungeon and on the road (Knave 2e p14, p19, p86): the GM's Time tab
 * ends a 10-minute turn or a 4-hour watch, moves the world clock on and rolls the
 * hazard die. A fatigue, burn or depletion card carries one button that applies it,
 * and nothing on a sheet changes until the GM clicks (user ruling 2026-11-14).
 *
 *   fatigue    1 damage to each party member who isn't resting (the GM unticks the
 *              ones who will rest); ignored while the party rests
 *   burn       every lit torch burns out: one torch of the stack is used up
 *   depletion  a d6 for each ration; on a 1 it has gone bad
 *   travel     each watch of travel after the third in a day: 1 direct damage
 *              unless a CON check is passed (a note on the card; the GM asks)
 *
 * The party is every character a player owns (user, 2026-11-14). Torches, candles
 * and lanterns carry a lit toggle on the Inventory row; burn only touches torches.
 */
import { FLAG_SCOPE, SETTINGS_NS } from "./config.js";
import { isKind } from "./keys.js";
import { isRations, isTorch } from "./documents/actor.js";

const { DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const TURN_SECONDS = 10 * 60;
export const WATCH_SECONDS = 4 * 60 * 60;
export const WATCHES_PER_DAY = 6;
/** Watches of travel a day before forced marching hurts (p86). */
export const TRAVEL_WATCHES_FREE = 3;

/** Light sources: a torch, candle or lantern (keys.js kinds). Only torches (documents/actor.js isTorch) burn out on a 3. */
export const isLight = (item) => ["torch", "candle", "lantern"].some((k) => isKind(item, k));

/** The party: every character a player owns. */
export const party = () => game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner);

/* -------------------------------------------- */
/*  The clock                                    */
/* -------------------------------------------- */

const CLOCK_KEY = "time-clock";
const DEFAULT_CLOCK = { mode: "dungeon", turn: 0, day: 1, watch: 0, travelled: 0, resting: false };

export const registerClockSetting = () => game.settings.register(SETTINGS_NS, CLOCK_KEY, {
  scope: "world", config: false, type: Object, default: {},
  onChange: () => foundry.applications.instances.get("knavery-gm-dashboard")?.render({ parts: ["time"] }),
});

export const clock = () => ({ ...DEFAULT_CLOCK, ...(game.settings.get(SETTINGS_NS, CLOCK_KEY) ?? {}) });
export const setClock = (patch) => game.settings.set(SETTINGS_NS, CLOCK_KEY, { ...clock(), ...patch });
export const resetClock = () => game.settings.set(SETTINGS_NS, CLOCK_KEY, { mode: clock().mode });

/** "Turn 7" or "Day 2, watch 3", for the Time tab and the card. */
export const clockLabel = (c = clock()) => (c.mode === "travel"
  ? (c.watch ? F("KNAVERY.Time.DayWatch", { day: c.day, watch: c.watch }) : L("KNAVERY.Time.NotStarted"))
  : (c.turn ? F("KNAVERY.Time.Turn", { turn: c.turn }) : L("KNAVERY.Time.NotStarted")));

/**
 * End the current turn or watch: count it, move the world clock on, roll the die.
 * `travelling`: a watch spent on the move (it counts toward the day's three).
 */
export const endTurn = async ({ travelling = true } = {}) => {
  if (!game.user.isGM) return null;
  const c = clock();
  let patch;
  let forcedMarch = false;
  if (c.mode === "travel") {
    let { watch, day, travelled } = c;
    watch += 1;
    if (watch > WATCHES_PER_DAY) { watch = 1; day += 1; travelled = 0; }
    if (travelling && !c.resting) travelled += 1;
    forcedMarch = travelling && !c.resting && travelled > TRAVEL_WATCHES_FREE;
    patch = { watch, day, travelled };
  } else {
    patch = { turn: c.turn + 1 };
  }
  await setClock(patch);
  await game.time.advance(c.mode === "travel" ? WATCH_SECONDS : TURN_SECONDS);
  const { rollHazard } = await import("./rolls.js");
  return rollHazard(c.mode, { resting: c.resting, forcedMarch, when: clockLabel({ ...c, ...patch }) });
};

/* -------------------------------------------- */
/*  Applying a result                            */
/* -------------------------------------------- */

/** A whispered report to the GM. */
const report = (title, lines, rolls = []) => ChatMessage.create({
  speaker: { alias: L("KNAVERY.GameMaster") },
  whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
  rolls,
  content: `<div class="knavery-roll-card kind-hazard-report"><header class="card-title"><h3>${esc(title)}</h3></header>`
    + (lines.length ? `<ul class="card-hazard-report">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
      : `<p class="card-note">${esc(L("KNAVERY.Time.NothingToDo"))}</p>`)
    + "</div>",
});

/** Fatigue: the GM unticks whoever will rest the next turn or watch; the rest take 1 damage. */
export const applyFatigue = async () => {
  const members = party();
  if (!members.length) return ui.notifications.warn("KNAVERY.Time.NoParty", { localize: true });
  const idp = foundry.utils.randomID();
  const rows = members.map((a) => `<div class="form-group"><label for="kn-fatigue-${a.id}-${idp}">${esc(a.name)}</label>`
    + `<div class="form-fields"><input type="checkbox" id="kn-fatigue-${a.id}-${idp}" name="hit" value="${a.id}" checked /></div></div>`).join("");
  const ids = await DialogV2.prompt({
    classes: ["knavery"],
    window: { title: L("KNAVERY.Time.FatigueTitle"), icon: "fas fa-person-falling" },
    content: `<p class="hint">${esc(L("KNAVERY.Time.FatigueHelp"))}</p>${rows}`,
    ok: {
      label: "KNAVERY.Time.FatigueApply", icon: "fas fa-burst",
      callback: (_e, b) => [...b.form.querySelectorAll('input[name="hit"]:checked')].map((i) => i.value),
    },
    rejectClose: false,
  });
  if (!Array.isArray(ids)) return null;
  for (const id of ids) await game.actors.get(id)?.applyDamage(1, { source: L("KNAVERY.Hazard.Face.fatigue") });
  return ids.length;
};

/** Burn: each lit torch burns out. A stack loses one torch and goes dark. */
export const applyBurn = async () => {
  const lines = [];
  for (const actor of party()) {
    const lit = actor.items.filter((i) => isTorch(i) && i.system.lit);
    for (const torch of lit) {
      const qty = torch.system.quantity ?? 1;
      if (qty > 1) await torch.update({ "system.quantity": qty - 1, "system.lit": false });
      else await torch.delete();
      lines.push(F("KNAVERY.Time.BurntOut", { name: actor.name, item: torch.name, left: Math.max(0, qty - 1) }));
    }
  }
  await report(L("KNAVERY.Time.BurnTitle"), lines);
  return lines.length;
};

/** Depletion: a d6 for each ration; every 1 has gone bad. */
export const applyDepletion = async () => {
  const lines = [];
  const rolls = [];
  for (const actor of party()) {
    for (const food of actor.items.filter((i) => isRations(i))) {
      const qty = Math.max(0, food.system.quantity ?? 1);
      if (!qty) continue;
      const roll = await new Roll(`${qty}d6`).evaluate();
      rolls.push(roll);
      const bad = roll.dice[0].results.filter((r) => r.result === 1).length;
      if (bad >= qty) await food.delete();
      else if (bad) await food.update({ "system.quantity": qty - bad });
      lines.push(F("KNAVERY.Time.Spoiled", { name: actor.name, item: food.name, bad, of: qty }));
    }
  }
  await report(L("KNAVERY.Time.DepletionTitle"), lines, rolls);
  return lines.length;
};

const APPLY = { fatigue: applyFatigue, burn: applyBurn, depletion: applyDepletion };

/** Wire a hazard card's button: the GM's only; a second click asks first. */
export const bindHazardCard = (message, html) => {
  const btn = html.querySelector("[data-kn-hazard]");
  if (!btn) return;
  if (!game.user.isGM) { btn.closest(".card-hazard-apply")?.remove(); return; }
  const applied = message.getFlag(FLAG_SCOPE, "hazardApplied") === true;
  if (applied) {
    const box = btn.closest(".card-hazard-apply");
    box?.classList.add("applied");
    box?.insertAdjacentHTML("afterbegin", `<span class="card-applied"><i class="fas fa-check"></i> ${esc(L("KNAVERY.Roll.Applied"))}</span>`);
  }
  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (message.getFlag(FLAG_SCOPE, "hazardApplied") === true) {
      const again = await DialogV2.confirm({
        classes: ["knavery"],
        window: { title: L("KNAVERY.Time.AgainTitle") },
        content: `<p>${esc(F("KNAVERY.Time.AgainBody", { action: btn.textContent.trim() }))}</p>`,
        rejectClose: false,
      });
      if (!again) return;
    }
    const done = await APPLY[btn.dataset.knHazard]?.();
    if (done !== null && done !== undefined) await message.setFlag(FLAG_SCOPE, "hazardApplied", true);
  });
};
