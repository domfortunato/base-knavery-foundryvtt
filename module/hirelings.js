/**
 * Morale and wages (Knave 2e p26, p59; user rulings 2026-11-14).
 *
 * Morale: in a running combat the active GM's client watches for the book's breaking
 * points it can see, each once per battle: a side's first casualty, half a side fallen,
 * and an NPC left alone on its side at half HP or less. Each whispers the GM a card
 * whose button rolls morale for that side's NPCs. A failed morale test offers the
 * leader's CHA check for a reroll, once per side per battle. Companions never test
 * morale (p59). A leader killed or a feared foe are the GM's call.
 *
 * Wages: a hireling's sheet names the character who employs them. The Time tab lists
 * each hireling's monthly wage and when it is due (a month is 30 days of the world
 * clock); Pay takes the coins from the employer and moves the due date on a month.
 * A Knave 1e henchman is paid by the day (p3; `system.wagePeriod`): Pay settles every day
 * owed since the last payment, at least one (user ruling 2026-11-14).
 */
import { FLAG_SCOPE } from "./config.js";
import { usesQuality } from "./rules.js";
import { onPcSide } from "./initiative.js";

const { DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const DAY_SECONDS = 24 * 60 * 60;
export const MONTH_DAYS = 30;
export const MONTH_SECONDS = MONTH_DAYS * DAY_SECONDS;

/** NPCs who test morale: every NPC but a companion. */
export const testsMorale = (actor) => actor?.type === "npc" && actor.system.role !== "companion";

const gmIds = () => game.users.filter((u) => u.isGM).map((u) => u.id);

/* -------------------------------------------- */
/*  Breaking points                              */
/* -------------------------------------------- */

const fallen = (c) => !!(c.isDefeated || c.actor?.system?.dead);
const sideKey = (c) => (onPcSide(c) ? "pcs" : "foes");
/** The running combat `actor` fights in (any scene's), and its combatant. */
const inCombat = (actor) => {
  for (const combat of game.combats) {
    if (!combat.started) continue;
    const combatant = combat.combatants.find((c) => c.actor && (c.actor === actor || c.actor.uuid === actor.uuid));
    if (combatant) return { combat, combatant };
  }
  return null;
};

/** What this GM client has already prompted, per combat (the flag is the record; this stops a double post). */
const seen = new Map();

const breakingState = (combat) => {
  const local = seen.get(combat.id) ?? new Set(combat.getFlag(FLAG_SCOPE, "breaking") ?? []);
  seen.set(combat.id, local);
  return local;
};

/** Whisper the GM a breaking-point card: who tests, and the button. */
const promptMorale = async (combat, reason, actors) => {
  if (!actors.length) return null;
  const uuids = actors.map((a) => a.uuid);
  return ChatMessage.create({
    speaker: { alias: L("KNAVERY.GameMaster") },
    whisper: gmIds(),
    content: `<div class="knavery-roll-card kind-morale-prompt"><header class="card-title"><h3>${esc(L("KNAVERY.MoraleTest.BreakingPoint"))}</h3></header>`
      + `<p class="roll-reason"><i class="fas fa-flag"></i> ${esc(reason)}</p>`
      + `<p class="card-note">${esc(F("KNAVERY.MoraleTest.WhoTests", { names: actors.map((a) => a.name).join(", ") }))}</p>`
      + `<div class="card-apply card-morale-test"><button type="button" data-kn-morale-test='${esc(JSON.stringify(uuids))}'>`
      + `<i class="fas fa-dice"></i> ${esc(L("KNAVERY.MoraleTest.RollAll"))}</button></div></div>`,
    flags: { [FLAG_SCOPE]: { breaking: { combat: combat.id, reason } } },
  });
};

/**
 * After an actor's HP, wounds or defeat change: any breaking point newly reached in the
 * active combat. Active GM only; each point fires once per battle.
 */
export const checkBreakingPoints = async (actor) => {
  if (!game.user.isActiveGM) return;
  const found = inCombat(actor);
  if (!found) return;
  const { combat, combatant: mine } = found;
  const side = sideKey(mine);
  const members = combat.combatants.filter((c) => sideKey(c) === side && c.actor);
  const down = members.filter(fallen);
  const standing = members.filter((c) => !fallen(c));
  const testers = standing.filter((c) => testsMorale(c.actor)).map((c) => c.actor);
  const state = breakingState(combat);
  const sideName = L(side === "pcs" ? "KNAVERY.MoraleTest.SidePcs" : "KNAVERY.MoraleTest.SideFoes");
  const fire = async (key, reason, who) => {
    if (state.has(key) || !who.length) return;
    state.add(key);
    await combat.setFlag(FLAG_SCOPE, "breaking", [...state]);
    await promptMorale(combat, reason, who);
  };

  // The side's first casualty (Knave 2e only, p20; 1e p5 names none), then half the side fallen
  // (both at once on a side of two: one card).
  if (down.length >= 1 && members.length > 1) {
    const half = down.length * 2 >= members.length;
    if (!usesQuality() && !state.has(`first:${side}`)) {
      if (half) state.add(`half:${side}`);
      await fire(`first:${side}`, F("KNAVERY.MoraleTest.FirstCasualty", { side: sideName }), testers);
    } else if (half) {
      await fire(`half:${side}`, F("KNAVERY.MoraleTest.HalfFallen", { side: sideName }), testers);
    }
  }
  // The side's leader down (both editions): the one the GM set or the tracker picks (initiative.js).
  if (fallen(mine) && typeof combat.pickLeaders === "function") {
    const leaders = combat.pickLeaders();
    const leader = side === "pcs" ? leaders.pc : leaders.enemy;
    if (leader && leader.id === mine.id) await fire(`leader:${side}`, F("KNAVERY.MoraleTest.LeaderDown", { name: actor.name }), testers);
  }
  // An NPC alone on its side at half HP or less.
  if (testers.length === 1 && standing.length === 1 && testsMorale(actor) && standing[0] === mine) {
    const hp = actor.system.hp;
    if (hp.max > 0 && hp.value > 0 && hp.value * 2 <= hp.max) {
      await fire(`alone:${mine.id}`, F("KNAVERY.MoraleTest.AloneHalfHp", { name: actor.name }), [actor]);
    }
  }
};

/* -------------------------------------------- */
/*  The leader's rally                           */
/* -------------------------------------------- */

/** The side `actor` fights on in the active combat, or null outside one. */
const combatSide = (actor) => {
  const found = inCombat(actor);
  if (!found) return null;
  const { combat, combatant: c } = found;
  return { combat, side: sideKey(c), members: combat.combatants.filter((x) => sideKey(x) === sideKey(c) && x.actor && !fallen(x)) };
};

/**
 * A failed morale test: the leader's CHA check, and on a pass a reroll. In a battle each
 * side may try once. The leader is chosen from the side (outside a battle: the NPC
 * itself or a player character).
 */
export const rally = async (actor) => {
  // Knave 1e (p5) has no rally: a failed morale test stands.
  if (usesQuality()) return ui.notifications.warn("KNAVERY.MoraleTest.NoRally1e", { localize: true });
  const where = combatSide(actor);
  if (where) {
    const used = where.combat.getFlag(FLAG_SCOPE, "rallied") ?? [];
    if (used.includes(where.side)) return ui.notifications.warn("KNAVERY.MoraleTest.RallyUsed", { localize: true });
  }
  const leaders = where ? where.members.map((c) => c.actor)
    : [actor, ...game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner)];
  const unique = [...new Map(leaders.map((a) => [a.uuid, a])).values()]
    .sort((a, b) => (b.system.level ?? 0) - (a.system.level ?? 0));
  const options = unique.map((a) => `<option value="${esc(a.uuid)}">${esc(a.name)}</option>`).join("");
  const uuid = await DialogV2.prompt({
    classes: ["knavery"],
    window: { title: L("KNAVERY.MoraleTest.RallyTitle"), icon: "fas fa-flag" },
    content: `<p class="hint">${esc(F("KNAVERY.MoraleTest.RallyHelp", { name: actor.name }))}</p>`
      + `<div class="form-group"><label>${esc(L("KNAVERY.MoraleTest.Leader"))}</label><div class="form-fields"><select name="leader">${options}</select></div></div>`,
    ok: { label: "KNAVERY.MoraleTest.RallyRoll", icon: "fas fa-dice-d20", callback: (_e, b) => b.form.elements.leader.value },
    rejectClose: false,
  });
  if (!uuid) return null;
  const leader = await fromUuid(uuid);
  if (!leader) return null;
  if (where) await where.combat.setFlag(FLAG_SCOPE, "rallied", [...(where.combat.getFlag(FLAG_SCOPE, "rallied") ?? []), where.side]);
  const { rollCheck, rollMorale } = await import("./rolls.js");
  const check = await rollCheck(leader, "CHA", { reason: F("KNAVERY.MoraleTest.RallyReason", { name: actor.name }) });
  if (check?.success) return rollMorale(actor, { rallied: true });
  return check;
};

/** Wire the breaking-point and rally buttons. */
export const bindMoraleCard = (message, html) => {
  const test = html.querySelector("[data-kn-morale-test]");
  if (test) {
    if (!game.user.isGM) test.closest(".card-morale-test")?.remove();
    else {
      test.addEventListener("click", async (event) => {
        event.preventDefault();
        test.disabled = true;
        let uuids = [];
        try { uuids = JSON.parse(test.dataset.knMoraleTest || "[]"); } catch { uuids = []; }
        const { rollMorale } = await import("./rolls.js");
        for (const uuid of uuids) {
          const a = await fromUuid(uuid);
          const actor = a?.actor ?? a;
          if (actor && !actor.system?.dead) await rollMorale(actor);
        }
      });
    }
  }
  const btn = html.querySelector("[data-kn-rally]");
  if (btn) {
    const actor = fromUuidSync(btn.dataset.knRally, { strict: false });
    const target = actor?.actor ?? actor;
    if (!target?.isOwner) { btn.closest(".card-morale-rally")?.remove(); return; }
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      await rally(target);
    });
  }
};

/* -------------------------------------------- */
/*  Wages                                        */
/* -------------------------------------------- */

/** Days a daily wage owes at `now`: from the due date on, counting today; none paid yet is one. */
export const daysOwed = (due, now) => {
  if (!Number.isFinite(due)) return 1;
  return due > now ? 0 : Math.floor((now - due) / DAY_SECONDS) + 1;
};

/** World hirelings with a wage, as the Time tab lists them. */
export const wageRows = () => {
  const now = game.time.worldTime;
  return game.actors.filter((a) => a.type === "npc" && a.system.role === "hireling" && a.system.wage > 0).map((a) => {
    const s = a.system;
    const employer = s.employer ? game.actors.get(s.employer) : null;
    const due = Number.isFinite(s.wageDue) ? s.wageDue : null;
    const days = due === null ? null : Math.ceil((due - now) / DAY_SECONDS);
    let status;
    if (due === null || days <= 0) status = days !== null && days < 0 ? F("KNAVERY.Wages.Overdue", { n: -days }) : L("KNAVERY.Wages.DueNow");
    else status = days === 1 ? L("KNAVERY.Wages.DueTomorrow") : F("KNAVERY.Wages.DueIn", { n: days });
    const daily = s.wagePeriod === "day";
    if (daily) {
      const owed = daysOwed(due, now);
      status = owed ? F(owed === 1 ? "KNAVERY.Wages.OwedOne" : "KNAVERY.Wages.Owed", { n: owed, total: owed * s.wage }) : L("KNAVERY.Wages.PaidUp");
    }
    return {
      id: a.id, name: a.name, img: a.img, wage: s.wage, status, overdue: daily ? daysOwed(due, now) > 0 : due === null || days <= 0,
      amount: F(daily ? "KNAVERY.Wages.PerDay" : "KNAVERY.Wages.PerMonth", { wage: s.wage }),
      employer: employer?.name ?? L("KNAVERY.Wages.NoEmployer"), hasEmployer: !!employer,
    };
  }).sort((x, y) => Number(y.overdue) - Number(x.overdue) || x.name.localeCompare(y.name));
};

/** Pay a month (or, by the day, every day owed): from the employer's coins; the due date moves on. GM only. */
export const payWage = async (hireling) => {
  if (!game.user.isGM || !hireling) return null;
  const s = hireling.system;
  const employer = s.employer ? game.actors.get(s.employer) : null;
  if (!employer) return ui.notifications.warn("KNAVERY.Wages.ChooseEmployer", { format: { name: hireling.name } });
  const coins = employer.system.coins ?? 0;
  const now = game.time.worldTime;
  const daily = s.wagePeriod === "day";
  const days = daily ? Math.max(1, daysOwed(s.wageDue, now)) : MONTH_DAYS;
  const wage = daily ? s.wage * days : s.wage;
  if (coins < wage) {
    return ui.notifications.warn("KNAVERY.Wages.CannotPay", { format: { name: employer.name, coins, wage } });
  }
  // A month runs from today or the due date, whichever is later; days owed run from the due date.
  const from = Number.isFinite(s.wageDue) ? (daily ? s.wageDue : Math.max(now, s.wageDue)) : now;
  const due = from + days * DAY_SECONDS;
  await employer.update({ "system.coins": coins - wage });
  await hireling.update({ "system.wageDue": due });
  const owners = game.users.filter((u) => !u.isGM && employer.testUserPermission(u, "OWNER")).map((u) => u.id);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: employer }),
    whisper: [...gmIds(), ...owners],
    content: `<div class="knavery-roll-card kind-wages"><p>${esc(F(daily ? (days === 1 ? "KNAVERY.Wages.PaidDay" : "KNAVERY.Wages.PaidDays") : "KNAVERY.Wages.Paid", { employer: employer.name, name: hireling.name, wage, days }))}</p></div>`,
  });
  return due;
};
