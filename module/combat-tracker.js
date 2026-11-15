/**
 * The Combat Tracker for a fight by side (0.3.0; initiative.js): under a side rule the rows sit
 * under two headers, Player characters and Enemies, in the round's order, the acting side's
 * header lit; no side numbers show; each row carries a "has acted" tick (Combatant flag
 * `acted`, cleared every round); the GM's footer gains Next side. Under the individual rule the
 * tracker is core's. Core's rows, actions and context are kept; only the list is regrouped.
 */
import { FLAG_SCOPE, SYS_PATH } from "./config.js";
import { onPcSide, sidesOn } from "./initiative.js";

const L = (k) => game.i18n.localize(k);
const CoreTracker = foundry.applications.sidebar.tabs.CombatTracker;

export class KnaveryCombatTracker extends CoreTracker {
  static DEFAULT_OPTIONS = {
    actions: {
      toggleActed: KnaveryCombatTracker.#onToggleActed,
      nextSide: KnaveryCombatTracker.#onNextSide,
    },
  };

  static PARTS = {
    ...CoreTracker.PARTS,
    tracker: { template: `${SYS_PATH}/templates/combat/tracker.html`, scrollable: [""] },
  };

  /** Core's turns, plus the acted tick; under a side rule, grouped under the two side headers. */
  async _prepareTrackerContext(context, options) {
    await super._prepareTrackerContext(context, options);
    const combat = this.viewed;
    if (!combat || !context.turns) return;
    for (const t of context.turns) {
      const c = combat.combatants.get(t.id);
      t.acted = c?.getFlag(FLAG_SCOPE, "acted") === true;
      if (t.acted) t.css = `${t.css ?? ""} acted`.trim();
    }
    context.sides = sidesOn();
    if (!context.sides) { context.rows = context.turns; return; }
    const pcsFirst = combat.groupInitiative?.pcsFirst ?? true;
    const actingPcs = combat.started ? (combat.combatant ? onPcSide(combat.combatant) : pcsFirst) : null;
    const rows = [];
    let last = null;
    for (const t of context.turns) {
      const pcs = onPcSide(combat.combatants.get(t.id));
      if (pcs !== last) {
        rows.push({ header: true, pcs, label: L(pcs ? "KNAVERY.Initiative.SidePcs" : "KNAVERY.Initiative.SideFoes"), acting: actingPcs === pcs });
        last = pcs;
      }
      rows.push(t);
    }
    context.rows = rows;
    context.hideInitiative = true;
  }

  /** Next side sits in the GM's footer beside Next Round while a fight by side is running. */
  async _onRender(context, options) {
    await super._onRender(context, options); // core's is async (it scrolls the active row into view)
    const footer = this.element.querySelector("nav.combat-controls");
    const combat = this.viewed;
    if (!footer || !game.user.isGM || !sidesOn() || !combat?.started || footer.querySelector(".knavery-next-side")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inline-control combat-control icon fa-solid fa-people-arrows knavery-next-side";
    button.dataset.action = "nextSide";
    button.dataset.tooltip = "";
    button.setAttribute("aria-label", L("KNAVERY.Initiative.NextSide"));
    (footer.querySelector('[data-action="nextRound"]') ?? footer.lastElementChild)?.before(button);
  }

  static async #onToggleActed(_event, target) {
    const id = target.closest("[data-combatant-id]")?.dataset.combatantId;
    const combatant = this.viewed?.combatants.get(id);
    if (!combatant?.isOwner) return;
    const acted = combatant.getFlag(FLAG_SCOPE, "acted") === true;
    if (acted) await combatant.unsetFlag(FLAG_SCOPE, "acted");
    else await combatant.setFlag(FLAG_SCOPE, "acted", true);
  }

  static async #onNextSide() {
    await this.viewed?.nextSide();
  }
}
