/**
 * Generating new spells (Knave 2e p27; user rulings 2026-11-14). A d12 on the Spell Formulae
 * table gives a pattern such as "[Wizard name]'s [Quality] [Element] [Form]"; each bracketed
 * word is rolled on its own table (Wizard Names, Qualities, Effects, Elements, Forms). The GM
 * asks from the dashboard's Requests tab; the player's window rolls the spell, lets them roll
 * any ONE word again and adjust the wording, then adds it to their inventory as a spellbook,
 * its effect left for the GM and player to agree.
 *
 * The tables are Knave 2e text: they never ship. They come from the GM's own book (the table
 * builder) or the table importer, as world tables of these names.
 */
import { FLAG_SCOPE, SYS_PATH } from "./config.js";
import { drawFrom, findTable, realResults } from "./compendium.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const FORMULA_TABLE = "Spell Formulae";
/** The book's bracketed words and the tables they roll on. */
export const SLOT_TABLES = { "wizard name": "Wizard Names", quality: "Qualities", effect: "Effects", element: "Elements", form: "Forms" };

/** A bracketed word's table: the book's five, else the word made plural ("Colour" → "Colours"). */
export const slotTable = (word) => {
  const w = String(word ?? "").trim();
  const known = SLOT_TABLES[w.toLowerCase()];
  if (known) return known;
  const title = w.replace(/\b\w/g, (c) => c.toUpperCase());
  if (/[^aeiou]y$/i.test(title)) return `${title.slice(0, -1)}ies`;
  return /(s|x|ch|sh)$/i.test(title) ? `${title}es` : `${title}s`;
};

/**
 * A formula split into its pieces: plain text, and slots to roll. Pure, for the probe.
 * @returns {{text?: string, slot?: string, table?: string}[]}
 */
export const parseFormula = (formula) => {
  const parts = [];
  const re = /\[([^\]]+)\]/g;
  let at = 0;
  let m;
  const src = String(formula ?? "").replace(/\s+/g, " ").trim();
  while ((m = re.exec(src))) {
    if (m.index > at) parts.push({ text: src.slice(at, m.index) });
    parts.push({ slot: m[1].trim(), table: slotTable(m[1]) });
    at = m.index + m[0].length;
  }
  if (at < src.length) parts.push({ text: src.slice(at) });
  return parts;
};

/** The spell's name from its pieces, each slot replaced by its rolled word. */
export const spellName = (parts) => parts.map((p) => (p.slot ? (p.word ?? `[${p.slot}]`) : p.text)).join("").replace(/\s+/g, " ").trim();

/** The tables a formula needs that this world lacks or has empty (the formula table first). */
export const missingTables = async (names) => {
  const out = [];
  for (const name of names) {
    const t = await findTable(name);
    if (!t || !realResults(t).length) out.push(name);
  }
  return out;
};

/** Roll a new spell: the formula, then each of its words. Null (and the missing tables) when it can't. */
export const rollSpell = async () => {
  const lacking = await missingTables([FORMULA_TABLE]);
  if (lacking.length) return { missing: lacking };
  const drawn = await drawFrom(FORMULA_TABLE, { warn: false });
  const parts = parseFormula(drawn?.text);
  const tables = [...new Set(parts.filter((p) => p.slot).map((p) => p.table))];
  const missing = await missingTables(tables);
  if (missing.length || !tables.length) return { missing: missing.length ? missing : [FORMULA_TABLE], formula: drawn?.text };
  for (const p of parts) if (p.slot) p.word = (await drawFrom(p.table, { warn: false }))?.text ?? "";
  return { formula: drawn.text, parts, name: spellName(parts) };
};

/* -------------------------------------------- */
/*  The player's window                          */
/* -------------------------------------------- */

export class SpellGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["knavery", "knavery-spell-gen"],
    window: { title: "KNAVERY.SpellGen.Title", icon: "fas fa-wand-sparkles", resizable: true },
    position: { width: 460, height: "auto" },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      reroll: SpellGenerator.#onReroll,
      addBook: SpellGenerator.#onAddBook,
    },
  };

  static PARTS = { body: { template: `${SYS_PATH}/templates/apps/spell-generator.html` } };

  /**
   * @param {object} o
   * @param {Actor} o.actor        who gets the spellbook
   * @param {string} [o.requestId] the GM's request it answers
   * @param {string} [o.reason]    the GM's words with it
   */
  constructor({ actor, requestId = "", reason = "", ...options } = {}) {
    super({ id: `knavery-spell-gen-${actor?.id ?? foundry.utils.randomID()}`, ...options });
    this.actor = actor;
    this.requestId = requestId;
    this.reason = reason;
    this.spell = null;
    this.rerolled = false;
    this.edited = "";
  }

  get title() { return F("KNAVERY.SpellGen.TitleFor", { name: this.actor?.name ?? "" }); }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.spell ??= await rollSpell();
    const s = this.spell;
    return Object.assign(context, {
      reason: this.reason,
      missing: s.missing?.length ? F("KNAVERY.SpellGen.Missing", { names: s.missing.join(", ") }) : "",
      formula: s.formula ?? "",
      words: (s.parts ?? []).map((p, i) => (p.slot ? { index: i, slot: p.slot, word: p.word, rerolled: p.rerolled } : null)).filter(Boolean),
      rerolled: this.rerolled,
      name: this.edited || s.name || "",
      canAdd: !s.missing?.length && !!this.actor?.isOwner,
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector('input[name="spellName"]')?.addEventListener("input", (e) => { this.edited = e.target.value; });
  }

  /** Roll one word again: only one, once (user ruling 2026-11-14). */
  static async #onReroll(_e, target) {
    if (this.rerolled || !this.spell?.parts) return;
    const p = this.spell.parts[Number(target.dataset.index)];
    if (!p?.slot) return;
    p.word = (await drawFrom(p.table, { warn: false }))?.text ?? p.word;
    p.rerolled = true;
    this.rerolled = true;
    this.spell.name = spellName(this.spell.parts);
    this.edited = "";
    this.render();
  }

  /** Put the spell in the character's inventory as a spellbook and say so in chat. */
  static async #onAddBook() {
    const name = String(this.element.querySelector('input[name="spellName"]')?.value ?? "").trim().slice(0, 120);
    if (!name || !this.actor?.isOwner) return;
    await this.actor.createEmbeddedDocuments("Item", [{
      name, type: "spellbook", img: `${SYS_PATH}/icons/spellbook.svg`,
      flags: { [FLAG_SCOPE]: { generated: { formula: this.spell?.formula ?? "" } } },
    }]);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="knavery-roll-card kind-spell-gen"><header class="card-title"><h3><i class="fas fa-wand-sparkles"></i> ${esc(L("KNAVERY.SpellGen.CardTitle"))}</h3></header>`
        + `<p class="kn-spell-gen-name"><strong>${esc(name)}</strong></p>`
        + `<p class="card-note">${esc(F("KNAVERY.SpellGen.CardBody", { name: this.actor.name }))}</p>`
        + (this.reason ? `<p class="roll-reason"><i class="fas fa-bullhorn"></i> ${esc(this.reason)}</p>` : "") + "</div>",
      flags: { [FLAG_SCOPE]: { spellGen: { requestId: this.requestId, name } } },
    });
    await this.close();
  }
}

/** Open the generator for a character (the player's answer to the GM's request, or the GM standing in). */
export const openSpellGenerator = (actor, { requestId = "", reason = "" } = {}) => {
  if (!actor?.isOwner) return null;
  const id = `knavery-spell-gen-${actor.id}`;
  const open = foundry.applications.instances.get(id);
  if (open) { open.requestId ||= requestId; open.reason ||= reason; return open.render({ force: true }); }
  return new SpellGenerator({ actor, requestId, reason }).render({ force: true });
};
