/**
 * Knave 1e's group initiative (the GM's hack `knave1e-initiative`): at the
 * start of each round one d6 decides which side acts first, 1–3 the enemies,
 * 4–6 the PCs, rerolled every round. Off, the Combat behaves as core's.
 *
 * Every combatant on the side that acts first gets initiative 2, the rest 1,
 * so the tracker orders the sides and core's turn order does the rest. The
 * round's result is kept in the flag `groupInitiative` ({round, pcsFirst}), so
 * a combatant who joins mid-round takes its side's place without a new roll.
 *
 * Who rolls: the Game Master. Their own Begin Combat and Next Round roll before
 * the round changes, so the first turn goes to the right side; until the round
 * changes the turn stays with whoever held it, so core's end-of-turn events go
 * to them and not to whoever the re-sort moved into their place (review #2).
 * A round a player advances (by ending the last turn) is rolled by the active
 * GM's client once it changes, since only a GM may update every combatant; the
 * GM then moves the stored turn to the first combatant (skipping the defeated
 * when core's setting says so).
 */
import { FLAG_SCOPE, SETTINGS_NS } from "./config.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

export const groupInitiativeOn = () => game.settings.get(SETTINGS_NS, "knave1e-initiative") === true;

/** Whether a combatant fights on the PCs' side: a character, a player's token, or a friendly one (hirelings). */
export const onPcSide = (c) => c.actor?.type === "character" || c.hasPlayerOwner
  || c.token?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;

const sideValue = (c, pcsFirst) => (onPcSide(c) === pcsFirst ? 2 : 1);

export class KnaveryCombat extends foundry.documents.Combat {
  /** This combat's last group roll, {round, pcsFirst}, or null. */
  get groupInitiative() { return this.getFlag(FLAG_SCOPE, "groupInitiative") ?? null; }

  /**
   * Roll the d6 for `round`, line up both sides and post the result. GM only.
   * `keepCurrent`: the round has not changed yet, so the turn stays with its holder.
   */
  async rollGroupInitiative(round = this.round, { keepCurrent = false } = {}) {
    const roll = await new Roll("1d6").evaluate();
    const pcsFirst = roll.total >= 4;
    await this.setFlag(FLAG_SCOPE, "groupInitiative", { round, pcsFirst });
    const options = { turnEvents: false };
    if (keepCurrent && this.turn !== null && this.combatant) options.knKeepCurrent = this.combatant.id;
    const updates = this.combatants.map((c) => ({ _id: c.id, initiative: sideValue(c, pcsFirst) }));
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates, options);
    await roll.toMessage({
      speaker: { alias: L("KNAVERY.Initiative.Speaker") },
      flavor: F("KNAVERY.Initiative.Flavor", { round, side: L(pcsFirst ? "KNAVERY.Initiative.PcsFirst" : "KNAVERY.Initiative.EnemiesFirst") }),
      flags: { [FLAG_SCOPE]: { groupInitiative: round } },
    });
    return pcsFirst;
  }

  /** The tracker's dice (one combatant, Roll All, Roll NPCs): under the hack, the group roll. */
  async rollInitiative(ids, options = {}) {
    if (!groupInitiativeOn()) return super.rollInitiative(ids, options);
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

  /** Reset Initiative also forgets the round's group roll, so the next roll is a fresh one. */
  async resetAll(options) {
    if (this.groupInitiative && game.user.isGM) await this.unsetFlag(FLAG_SCOPE, "groupInitiative");
    return super.resetAll(options);
  }

  /** Begin Combat: round 1's roll, unless the GM already rolled before starting. */
  async startCombat() {
    if (groupInitiativeOn() && game.user.isGM && this.combatants.size) {
      if (this.groupInitiative?.round === 0) await this.setFlag(FLAG_SCOPE, "groupInitiative", { ...this.groupInitiative, round: 1 });
      else await this.rollGroupInitiative(1);
    }
    return super.startCombat();
  }

  /** Next Round: the new round's roll comes first, so its first turn is the right side's. */
  async nextRound() {
    const next = this.round + 1;
    if (groupInitiativeOn() && game.user.isGM && this.combatants.size && this.groupInitiative?.round !== next) {
      await this.rollGroupInitiative(next, { keepCurrent: true });
    }
    return super.nextRound();
  }

  /** A round a player advanced: the active GM rolls it once it has changed. Going back never rerolls. */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (!("round" in changed) || options.direction === -1 || !(this.round > 0)) return;
    if (!game.user.isActiveGM || !groupInitiativeOn() || this.groupInitiative?.round === this.round) return;
    if (!this.combatants.size) return;
    this.#rollAfterPlayerRound();
  }

  /** Roll a round a player advanced, then store the turn on the first combatant of the new order. */
  async #rollAfterPlayerRound() {
    await this.rollGroupInitiative(this.round);
    if (this.turn === null || !this.turns.length) return;
    let first = this.settings.skipDefeated ? this.turns.findIndex((c) => !c.isDefeated) : 0;
    if (first < 0) first = 0;
    if (first !== this.turn) await this.update({ turn: first });
  }

  /**
   * The GM's Next Round re-sorts before the round changes: core has just pointed `current`
   * at whoever now sits at the old turn index. Point it back at the combatant who held the
   * turn, so the round update ends their turn, not someone else's.
   */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    const holder = collection === "combatants" && options.knKeepCurrent ? this.combatants.get(options.knKeepCurrent) : null;
    if (holder) this.current = this._getCurrentState(holder);
  }

  /** A combatant added after the round's roll takes its side's place. */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (collection !== "combatants" || !game.user.isActiveGM || !groupInitiativeOn()) return;
    const group = this.groupInitiative;
    if (group?.round !== this.round) return;
    const updates = documents.filter((c) => c.initiative === null).map((c) => ({ _id: c.id, initiative: sideValue(c, group.pcsFirst) }));
    if (updates.length) this.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
  }
}
