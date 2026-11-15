/**
 * Initiative by side, as both editions play it (the rule `initiative-rule`, 0.3.0):
 * - "1e-d6" (Knave 1e p4): at the start of each round one d6 decides which side acts first,
 *   1–3 the enemies, 4–6 the PCs, rerolled every round. The Game Master rolls.
 * - "2e-leaders" (Knave 2e p20): one CHA check between the sides' leaders decides which side acts
 *   first, and the order holds for the fight (the book names no reroll). The leaders are the PC
 *   with the highest CHA and the enemy with the highest level, unless the GM sets them (the
 *   dashboard's Combat page; flag `leaders`).
 * - "individual": Foundry's own roll per combatant; the Combat behaves as core's.
 *
 * Under a side rule every combatant on the side that acts first gets initiative 2, the rest 1,
 * so the tracker orders the sides and core's turn order does the rest. The round's result is
 * kept in the flag `groupInitiative` ({round, pcsFirst, how}), so a combatant who joins mid-round
 * takes its side's place without a new roll. Surprise (2e p19) sets round 1 without a roll
 * (`setSides`), and "Next side" jumps the turn to the other side's first combatant.
 *
 * Who rolls: the Game Master. Their own Begin Combat and Next Round roll before the round
 * changes, so the first turn goes to the right side. Core keeps the turn with its holder through
 * the re-sort (Combatant._preUpdateOperation), so the holder's turn is the one that ends; when the
 * sides swap, core also reports the turns after the holder's new place as skipped (observed on
 * the fleet, review #2, and the same before it). A round a player advances (by ending the last
 * turn) is rolled by the active GM's client once it changes, since only a GM may update every
 * combatant; its turn goes to the first combatant of the new order, skipping the defeated when
 * core's setting says so, and is stored, so a client that reloads agrees.
 */
import { FLAG_SCOPE, SETTINGS_NS } from "./config.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** The world's initiative rule: "1e-d6", "2e-leaders" or "individual" (before it can be read: individual). */
export const initiativeRule = () => {
  try { return String(game.settings.get(SETTINGS_NS, "initiative-rule") || "individual"); } catch { return "individual"; }
};
/** Whether combat runs by side (either edition's rule) rather than one combatant at a time. */
export const sidesOn = () => initiativeRule() !== "individual";

/** Whether a combatant fights on the PCs' side: a character, a player's token, or a friendly one (hirelings). */
export const onPcSide = (c) => c.actor?.type === "character" || c.hasPlayerOwner
  || c.token?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;

const sideValue = (c, pcsFirst) => (onPcSide(c) === pcsFirst ? 2 : 1);
const sideName = (pcsFirst) => L(pcsFirst ? "KNAVERY.Initiative.PcsFirst" : "KNAVERY.Initiative.EnemiesFirst");
const signed = (n) => (n >= 0 ? `+${n}` : String(n));
/** A combatant's CHA for the leaders' check: a character's CHA; an NPC's level stands in, as for its checks. */
const chaBonus = (c) => Number(c?.actor?.system?.abilities?.CHA?.value ?? c?.actor?.system?.level ?? 0) || 0;

export class KnaveryCombat extends foundry.documents.Combat {
  /** This combat's last side roll, {round, pcsFirst, how}, or null. */
  get groupInitiative() { return this.getFlag(FLAG_SCOPE, "groupInitiative") ?? null; }

  /** The GM's chosen leaders, {pc, enemy} combatant ids, or {}. */
  get leaders() { return this.getFlag(FLAG_SCOPE, "leaders") ?? {}; }

  /** The two leaders: the GM's choice, else the PC with the highest CHA and the enemy with the highest level. */
  pickLeaders() {
    const set = this.leaders;
    const best = (list, score) => [...list].sort((a, b) => score(b) - score(a))[0] ?? null;
    const pcs = this.combatants.filter((c) => onPcSide(c) && c.actor);
    const foes = this.combatants.filter((c) => !onPcSide(c) && c.actor);
    return {
      pc: (set.pc && this.combatants.get(set.pc)) || best(pcs, chaBonus),
      enemy: (set.enemy && this.combatants.get(set.enemy)) || best(foes, (c) => Number(c.actor?.system?.level ?? 0) || 0),
    };
  }

  /**
   * Line both sides up for `round`, the PCs first or not, and post how it was decided. GM only.
   * `firstTurn`: the round has already changed, so the turn goes to the first combatant of the
   * new order (else core keeps it with its holder). `roll` and `flavor` make the chat message;
   * `how` is kept in the flag ("d6", "leaders", "surprise", "kept").
   */
  async setSides(pcsFirst, round = this.round, { firstTurn = false, how = "set", roll = null, flavor = null } = {}) {
    await this.setFlag(FLAG_SCOPE, "groupInitiative", { round, pcsFirst, how });
    const options = { turnEvents: false };
    const updates = this.combatants.map((c) => ({ _id: c.id, initiative: sideValue(c, pcsFirst) }));
    const stored = this.turn;
    let first = null;
    if (firstTurn && stored !== null && updates.length) {
      const value = new Map(updates.map((u) => [u._id, u.initiative]));
      const order = this.combatants.contents
        .map((c) => ({ id: c.id, initiative: value.get(c.id), defeated: c.isDefeated }))
        .sort(this._sortCombatants);
      first = this.settings.skipDefeated ? Math.max(0, order.findIndex((o) => !o.defeated)) : 0;
      options.combatTurn = first; // every client lands on it (core applies combatTurn locally)
    }
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates, options);
    // combatTurn is never stored: store it, so a reloading client agrees. Unchanged locally, so no diff.
    if (first !== null && first !== stored) await this.update({ turn: first }, { diff: false, turnEvents: false });
    const messageData = {
      speaker: { alias: L("KNAVERY.Initiative.Speaker") },
      flavor: flavor ?? F("KNAVERY.Initiative.Flavor", { round, side: sideName(pcsFirst) }),
      flags: { [FLAG_SCOPE]: { groupInitiative: round } },
    };
    if (roll) await roll.toMessage(messageData);
    else if (how !== "kept") await ChatMessage.create({ ...messageData, content: `<p>${foundry.utils.escapeHTML(messageData.flavor)}</p>` });
    return pcsFirst;
  }

  /** Decide `round`'s order by the world's rule: the 1e d6, or the 2e leaders' check (once a fight). */
  async rollGroupInitiative(round = this.round, { firstTurn = false } = {}) {
    if (initiativeRule() === "2e-leaders") {
      const group = this.groupInitiative;
      // Decided already (a roll, or surprise): a later round keeps the order.
      if (group && round > 1 && group.round >= 1) return this.setSides(group.pcsFirst, round, { firstTurn, how: "kept" });
      const { pc, enemy } = this.pickLeaders();
      const pcCha = chaBonus(pc);
      const target = 11 + chaBonus(enemy);
      const roll = await new Roll(`1d20 + ${pcCha}`).evaluate();
      const pcsFirst = roll.total >= target;
      return this.setSides(pcsFirst, round, {
        firstTurn, how: "leaders", roll,
        flavor: F("KNAVERY.Initiative.LeadersFlavor", {
          round, pc: pc?.name ?? "—", pcCha: signed(pcCha), enemy: enemy?.name ?? "—", target, side: sideName(pcsFirst),
        }),
      });
    }
    const roll = await new Roll("1d6").evaluate();
    const pcsFirst = roll.total >= 4;
    return this.setSides(pcsFirst, round, { firstTurn, how: "d6", roll });
  }

  /**
   * Surprise (Knave 2e p19): the surprising side acts first in round 1, no roll. `pcsSurprise`:
   * the PCs caught them. Posts the +5 reminder in words; it is never added to a roll by itself.
   */
  async setSurprise(pcsSurprise) {
    if (!game.user.isGM) return null;
    const round = Math.max(1, this.round);
    await this.setSides(pcsSurprise, round, {
      how: "surprise",
      flavor: F("KNAVERY.Initiative.SurpriseFlavor", {
        surprised: L(pcsSurprise ? "KNAVERY.Initiative.SideFoes" : "KNAVERY.Initiative.SidePcs"),
        acting: L(pcsSurprise ? "KNAVERY.Initiative.SidePcs" : "KNAVERY.Initiative.SideFoes"),
      }),
    });
    return pcsSurprise;
  }

  /** The turn jumps to the other side's first combatant still to act; past the last side, the next round. */
  async nextSide() {
    if (!game.user.isGM || !this.started) return this;
    const current = this.combatant;
    const side = current ? onPcSide(current) : null;
    const usable = (c) => !(this.settings.skipDefeated && c.isDefeated);
    const after = this.turns.findIndex((c, i) => i > (this.turn ?? -1) && onPcSide(c) !== side && usable(c));
    if (after >= 0) return this.update({ turn: after });
    return this.nextRound();
  }

  /** The tracker's dice (one combatant, Roll All, Roll NPCs): under a side rule, the side roll. */
  async rollInitiative(ids, options = {}) {
    if (!sidesOn()) return super.rollInitiative(ids, options);
    if (!game.user.isGM) {
      ui.notifications.info("KNAVERY.Initiative.GmRolls", { localize: true });
      return this;
    }
    const group = this.groupInitiative;
    if (group?.round !== this.round) {
      await this.rollGroupInitiative(this.round);
      return this;
    }
    // Rolled this round already: whoever has no initiative yet joins their side.
    const list = (typeof ids === "string" ? [ids] : ids).map((id) => this.combatants.get(id)).filter(Boolean);
    const updates = list.map((c) => ({ _id: c.id, initiative: sideValue(c, group.pcsFirst) }));
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
    return this;
  }

  /** Reset Initiative also forgets the side roll and the leaders, so the next roll is a fresh one. */
  async resetAll(options) {
    if (game.user.isGM) {
      if (this.groupInitiative) await this.unsetFlag(FLAG_SCOPE, "groupInitiative");
      await this.#clearActed();
    }
    return super.resetAll(options);
  }

  /** Begin Combat: round 1's roll, unless the GM already rolled, or surprise decided it, before starting. */
  async startCombat() {
    if (sidesOn() && game.user.isGM && this.combatants.size) {
      const group = this.groupInitiative;
      if (group && group.round <= 1) await this.setFlag(FLAG_SCOPE, "groupInitiative", { ...group, round: 1 });
      else await this.rollGroupInitiative(1);
    }
    return super.startCombat();
  }

  /** Next Round: the new round's roll comes first, so its first turn is the right side's; the acted ticks clear. */
  async nextRound() {
    const next = this.round + 1;
    if (sidesOn() && game.user.isGM && this.combatants.size && this.groupInitiative?.round !== next) {
      await this.rollGroupInitiative(next);
    }
    if (game.user.isGM) await this.#clearActed();
    return super.nextRound();
  }

  /** The "has acted" ticks of the tracker's rows (flag `acted`), cleared every round. */
  async #clearActed() {
    const updates = this.combatants.filter((c) => c.getFlag(FLAG_SCOPE, "acted")).map((c) => ({ _id: c.id, [`flags.${FLAG_SCOPE}.-=acted`]: null }));
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
  }

  /** A round a player advanced: the active GM rolls it once it has changed. Going back never rerolls. */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (!("round" in changed) || options.direction === -1 || !(this.round > 0)) return;
    if (!game.user.isActiveGM || !sidesOn() || this.groupInitiative?.round === this.round) return;
    if (!this.combatants.size) return;
    this.rollGroupInitiative(this.round, { firstTurn: true });
  }

  /** A combatant added after the round's roll takes its side's place. */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (collection !== "combatants" || !game.user.isActiveGM || !sidesOn()) return;
    const group = this.groupInitiative;
    if (group?.round !== this.round) return;
    const updates = documents.filter((c) => c.initiative === null).map((c) => ({ _id: c.id, initiative: sideValue(c, group.pcsFirst) }));
    if (updates.length) this.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
  }
}
