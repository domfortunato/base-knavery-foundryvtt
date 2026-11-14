/**
 * Build roll tables from the GM's own rulebook PDF, into their world.
 *
 * The PDF is read in the GM's browser with the pdf.js build Foundry serves
 * (scripts/pdfjs/build), each catalogued table (module/rulebook-catalogue.js)
 * is parsed (module/rulebook-tables.js), and a review window shows every table
 * with its rows, editable, before anything is written. The tables go into the
 * world's RollTables, in one folder, under the names the system looks up, so
 * a world "Careers" takes over from the shipped shell at once
 * (compendium.js: the world wins).
 *
 * Two promises to the GM:
 *   - A rebuild never overwrites their work. Each table built here carries
 *     flags.base-knavery.rulebook.hash, a digest of its rows as written. A
 *     rebuild replaces a world table only when that flag is there and the rows
 *     still match it; a table imported or made by hand, or edited since it was
 *     built, is kept and reported.
 *   - Nothing is written until they press Build in the review.
 */
import { FLAG_SCOPE, SETTINGS_NS, SYS_PATH } from "./config.js";
import { COMBINED_TABLES, RULEBOOK_TABLES } from "./rulebook-catalogue.js";
import { capitalise, pageItems, parseTable, splitNamed } from "./rulebook-tables.js";
import { rulebookPath, hasRulebook } from "./rulebook.js";
import { parseRows } from "./table-importer.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

const REVIEW_ID = "knavery-rulebook-tables";

/* -------------------------------------------- */
/*  Reading                                      */
/* -------------------------------------------- */

let pdfjs = null;
/** Foundry's own pdf.js build, loaded once. */
const loadPdfjs = async () => {
  if (pdfjs) return pdfjs;
  pdfjs = await import(foundry.utils.getRoute("scripts/pdfjs/build/pdf.mjs"));
  pdfjs.GlobalWorkerOptions.workerSrc = foundry.utils.getRoute("scripts/pdfjs/build/pdf.worker.mjs");
  return pdfjs;
};

/** Shape a parsed row for its table's kind: careers "Name: items", spells name + effect. */
const shapeRow = (kind, row) => {
  if (kind === "career") {
    const { name, rest } = splitNamed(row.text);
    return { range: row.range, text: rest ? `${name}: ${rest}` : name };
  }
  return { range: row.range, text: capitalise(row.text) };
};

/**
 * Read the catalogued tables out of a PDF. `specs` and `offset` default to the
 * catalogue and the world's page offset; a probe passes its own.
 * @returns {Promise<{tables: object[], pages: number}>}
 */
export const readRulebookTables = async ({ path = rulebookPath(), specs = RULEBOOK_TABLES, offset, combined = COMBINED_TABLES } = {}) => {
  const lib = await loadPdfjs();
  const url = URL.parse(path) ? path : foundry.utils.getRoute(path);
  const doc = await lib.getDocument({ url }).promise;
  const off = offset ?? (Number(game.settings.get(SETTINGS_NS, "rulebook-page-offset")) || 0);
  const cache = {};
  const page = async (index) => {
    if (!cache[index]) {
      const p = await doc.getPage(index);
      const vp = p.getViewport({ scale: 1 });
      cache[index] = { items: pageItems(await p.getTextContent(), vp.height), width: vp.width };
    }
    return cache[index];
  };
  const tables = [];
  for (const spec of specs) {
    const pdfPages = spec.pages.map((p) => p + off).filter((i) => i >= 1 && i <= doc.numPages);
    const pages = {};
    for (const i of pdfPages) pages[i] = await page(i);
    const { rows, missing, duplicates } = parseTable({ ...spec, pdfPages }, pages);
    tables.push({ ...spec, rows: rows.map((r) => shapeRow(spec.kind, r)), missing, duplicates });
  }
  for (const c of combined) {
    const parts = c.from.map((n) => tables.find((t) => t.name === n));
    if (parts.some((p) => !p)) continue;
    let base = 0;
    const rows = [];
    for (const part of parts) {
      for (const r of part.rows) rows.push({ range: [r.range[0] + base, r.range[1] + base], text: r.text });
      base += part.last - part.first + 1;
    }
    const last = base;
    tables.push({ ...c, first: 1, last, rows, missing: parts.flatMap((p) => p.missing), duplicates: [], combined: true });
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { tables, pages };
};

/* -------------------------------------------- */
/*  Writing                                      */
/* -------------------------------------------- */

/**
 * A digest of a table, to tell whether the GM has edited it since it was built.
 * It covers every row field a GM can change (a row linked to an Item, a new
 * image, a weight) and the table's formula and replacement, so any such edit
 * marks the table as the GM's own and a rebuild keeps it.
 */
const hashText = (key) => {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const digest = (table) => {
  const rows = [...table.results].map((r) => [
    `${r.range[0]}-${r.range[1]}`, r.type, r.name ?? "", r.description ?? "", r.documentUuid ?? "", r.img ?? "", r.weight ?? "",
  ].join("|")).sort();
  return hashText([`formula:${table.formula ?? ""}`, `replacement:${table.replacement}`, ...rows].join("\n"));
};

/* -------------------------------------------- */
/*  Spell items                                  */
/* -------------------------------------------- */

/** The world compendium the book's spells go in (user, 2026-11-14). */
export const SPELL_PACK = "rulebook-spells";

/** A digest of a spell item's content, to tell whether the GM has edited it. */
const itemHash = (i) => hashText([i.name, i.img ?? "", i.system?.description ?? "", !!i.system?.scroll, i.system?.slots ?? 1].join("|"));

const spellFlag = (d) => d.flags?.[FLAG_SCOPE]?.rulebookSpell ?? null;

/** The world compendium, made on the first build. */
const spellPack = async () => {
  let pack = game.packs.get(`world.${SPELL_PACK}`);
  if (!pack) {
    pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
      type: "Item", name: SPELL_PACK, label: L("KNAVERY.RulebookSpells.Pack"),
    });
  }
  if (pack.locked) await pack.configure({ locked: false });
  return pack;
};

/** A folder inside the compendium, found by its flag. */
const packFolder = async (pack, key) => pack.folders.find((f) => f.getFlag(FLAG_SCOPE, "rulebookSpells") === key)
  ?? foundry.documents.Folder.implementation.create({ name: L(`KNAVERY.RulebookSpells.${key}`), type: "Item", flags: { [FLAG_SCOPE]: { rulebookSpells: key } } }, { pack: pack.collection });

/**
 * A spellbook and a spell scroll for every row of the Spells table, in the
 * world compendium "Spells (from your rulebook)", each carrying the row's
 * effect. Then every row links to its spellbook, so random creation hands out
 * the item. The tables' promise holds: a rebuild updates an item only while it
 * is as built, keeps one the GM edited, and never touches an item it did not make.
 * @param {RollTable} table
 * @returns {Promise<{books:number, scrolls:number, kept:number}>}
 */
export const writeSpellItems = async (table) => {
  const pack = await spellPack();
  const folders = { book: await packFolder(pack, "Spellbooks"), scroll: await packFolder(pack, "Scrolls") };
  const have = await pack.getDocuments();
  const find = (kind, spell) => have.find((d) => spellFlag(d)?.kind === kind && spellFlag(d)?.spell === spell);
  const report = { books: 0, scrolls: 0, kept: 0 };
  const creates = [];
  const updates = [];
  for (const r of table.results) {
    const spell = r.name;
    if (!spell) continue;
    for (const kind of ["book", "scroll"]) {
      const data = {
        name: kind === "book" ? spell : F("KNAVERY.RulebookSpells.ScrollName", { name: spell }),
        type: "spellbook",
        img: `${SYS_PATH}/icons/${kind === "book" ? "spellbook" : "spellscroll"}.svg`,
        folder: folders[kind]?.id ?? null,
        system: { slots: 1, description: r.description ?? "", scroll: kind === "scroll" },
      };
      data.flags = { [FLAG_SCOPE]: { rulebookSpell: { kind, spell, hash: itemHash(data) } } };
      const old = find(kind, spell);
      if (old && spellFlag(old).hash !== itemHash(old)) { report.kept++; continue; }
      if (old) updates.push({ _id: old.id, ...data });
      else creates.push(data);
      report[kind === "book" ? "books" : "scrolls"]++;
    }
  }
  if (creates.length) await Item.implementation.createDocuments(creates, { pack: pack.collection });
  if (updates.length) await Item.implementation.updateDocuments(updates, { pack: pack.collection });
  const all = await pack.getDocuments();
  const links = [];
  for (const r of table.results) {
    const book = all.find((d) => spellFlag(d)?.kind === "book" && spellFlag(d)?.spell === r.name);
    if (book && r.documentUuid !== book.uuid) links.push({ _id: r.id, type: CONST.TABLE_RESULT_TYPES.DOCUMENT, documentUuid: book.uuid });
  }
  if (links.length) await table.updateEmbeddedDocuments("TableResult", links);
  return report;
};

/**
 * What a build would do to the world table of this name:
 *   new      no world table
 *   replace  built from the book and unchanged since
 *   keep     made or imported by hand, or edited since it was built
 */
export const tableStatus = (name) => {
  const table = game.tables.find((t) => t.name === name);
  if (!table) return "new";
  const flag = table.getFlag(FLAG_SCOPE, "rulebook");
  if (!flag?.hash) return "keep";
  return flag.hash === digest(table) ? "replace" : "keep";
};

/** Rows → TableResult data. Spells become a name with the effect as its description. */
const resultData = (kind, rows) => rows.map((r) => {
  let name = r.text;
  let description = "";
  if (kind === "spell") {
    const s = splitNamed(r.text);
    name = s.name;
    description = s.rest ? `<p>${foundry.utils.escapeHTML(s.rest)}</p>` : "";
  }
  return {
    type: CONST.TABLE_RESULT_TYPES.TEXT, name, description,
    range: [r.range[0], r.range[1]], weight: r.range[1] - r.range[0] + 1,
  };
});

/** The world folder the book's tables go in. */
const tableFolder = async () => {
  const existing = game.folders.find((f) => f.type === "RollTable" && f.getFlag(FLAG_SCOPE, "rulebookFolder"));
  if (existing) return existing;
  return CONFIG.Folder.documentClass.create({ name: L("KNAVERY.RulebookTables.Folder"), type: "RollTable", flags: { [FLAG_SCOPE]: { rulebookFolder: true } } });
};

/**
 * Write tables into the world, honouring tableStatus: new ones created,
 * unchanged book tables replaced, everything else kept.
 * @param {{name:string, kind?:string, formula:string, pages:number[], rows:{range:number[], text:string}[]}[]} tables
 * @returns {Promise<{created:string[], replaced:string[], kept:string[]}>}
 */
export const writeRulebookTables = async (tables) => {
  const report = { created: [], replaced: [], kept: [] };
  const folder = await tableFolder();
  for (const t of tables) {
    if (!t.rows.length) continue;
    const status = tableStatus(t.name);
    if (status === "keep") {
      report.kept.push(t.name);
      continue;
    }
    const results = resultData(t.kind, t.rows);
    const flags = { [FLAG_SCOPE]: { rulebook: { page: t.pages?.[0] ?? null, built: game.system.version } } };
    let table = game.tables.find((x) => x.name === t.name);
    if (table) {
      await table.deleteEmbeddedDocuments("TableResult", table.results.map((r) => r.id));
      await table.createEmbeddedDocuments("TableResult", results);
      await table.update({ formula: t.formula, folder: table.folder?.id ?? folder.id, flags });
      report.replaced.push(t.name);
    } else {
      table = await RollTable.create({
        name: t.name, formula: t.formula, replacement: true, folder: folder.id, img: `${SYS_PATH}/icons/spellscroll.svg`, results, flags,
      });
      report.created.push(t.name);
    }
    // The Spells table also makes its spellbooks and scrolls, and links to them.
    if (t.kind === "spell") report.spells = await writeSpellItems(table);
    // The digest of the rows as Foundry stored them, so a later edit shows.
    await table.setFlag(FLAG_SCOPE, "rulebook.hash", digest(table));
  }
  return report;
};

/* -------------------------------------------- */
/*  The review window                            */
/* -------------------------------------------- */

const rowsToText = (rows) => rows.map((r) => (r.range[0] === r.range[1] ? `${r.range[0]} ${r.text}` : `${r.range[0]}-${r.range[1]} ${r.text}`)).join("\n");

export class RulebookTablesReview extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: REVIEW_ID,
    tag: "form",
    classes: ["knavery", "knavery-rulebook-tables"],
    window: { title: "KNAVERY.RulebookTables.Title", icon: "fa-solid fa-table-list", resizable: true },
    position: { width: 720, height: 760 },
    form: { handler: RulebookTablesReview.#onSubmit, closeOnSubmit: false },
    actions: {
      selectAll: RulebookTablesReview.#onSelectAll,
      selectNone: RulebookTablesReview.#onSelectNone,
    },
  };

  static PARTS = {
    body: { template: `${SYS_PATH}/templates/apps/rulebook-tables.html`, scrollable: [".rt-list"] },
  };

  /** The tables as read, by name. */
  #tables;
  #pages;

  constructor({ tables, pages, ...options } = {}) {
    super(options);
    this.#tables = tables;
    this.#pages = pages;
  }

  async _prepareContext() {
    const rows = this.#tables.map((t, index) => {
      const status = tableStatus(t.name);
      const expected = t.last - t.first + 1;
      return {
        index,
        name: t.name,
        page: t.pages?.[0] ?? null,
        system: !!t.system,
        count: t.rows.length,
        expected,
        complete: t.rows.length === expected && !t.duplicates.length,
        missing: t.missing.join(", "),
        status,
        statusLabel: L(`KNAVERY.RulebookTables.Status.${status}`),
        checked: status !== "keep" && t.rows.length > 0,
        disabled: status === "keep" || !t.rows.length,
        text: rowsToText(t.rows),
        lines: Math.min(12, Math.max(4, t.rows.length)),
      };
    });
    rows.sort((a, b) => Number(b.system) - Number(a.system));
    return {
      tables: rows,
      summary: F("KNAVERY.RulebookTables.Summary", { n: rows.length, complete: rows.filter((r) => r.complete).length }),
      otherEdition: this.#pages !== 88 ? F("KNAVERY.Rulebook.OtherEdition", { pages: this.#pages, expected: 88 }) : "",
    };
  }

  static #onSelectAll() {
    for (const box of this.element.querySelectorAll('input[name^="build-"]:not(:disabled)')) box.checked = true;
  }

  static #onSelectNone() {
    for (const box of this.element.querySelectorAll('input[name^="build-"]')) box.checked = false;
  }

  static async #onSubmit(_event, form) {
    const chosen = [];
    for (const [index, t] of this.#tables.entries()) {
      const box = form.querySelector(`input[name="build-${index}"]`);
      if (!box?.checked) continue;
      const area = form.querySelector(`textarea[data-index="${index}"]`);
      const rows = parseRows(area?.value ?? rowsToText(t.rows)).map((r) => ({ range: r.range, text: r.text }));
      chosen.push({ ...t, rows });
    }
    if (!chosen.length) return ui.notifications.warn("KNAVERY.RulebookTables.NoneChosen", { localize: true });
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    let report;
    try {
      report = await writeRulebookTables(chosen);
    } catch (err) {
      console.error("Base Knavery | building the rulebook's tables failed", err);
      ui.notifications.error("KNAVERY.RulebookTables.BuildFailed", { localize: true });
      foundry.applications.instances.get("knavery-gm-dashboard")?.render();
      return null;
    } finally {
      if (button) button.disabled = false;
    }
    ui.notifications.info(F("KNAVERY.RulebookTables.Done", {
      created: report.created.length, replaced: report.replaced.length, kept: report.kept.length,
    }));
    if (report.spells) ui.notifications.info(F("KNAVERY.RulebookSpells.Done", report.spells));
    if (report.kept.length) {
      ui.notifications.warn(F("KNAVERY.RulebookTables.KeptList", { names: report.kept.join(", ") }));
    }
    foundry.applications.instances.get("knavery-gm-dashboard")?.render();
    await this.close();
    return report;
  }
}

/**
 * GM: read the rulebook and open the review. Resolves to the review window,
 * or null when there is no book or reading failed.
 */
export const openRulebookTablesReview = async (options = {}) => {
  if (!game.user.isGM) return null;
  if (!options.path && !hasRulebook()) {
    ui.notifications.warn("KNAVERY.Rulebook.NotSet", { localize: true });
    return null;
  }
  const note = ui.notifications.info("KNAVERY.RulebookTables.Reading", { localize: true, permanent: true });
  try {
    const { tables, pages } = await readRulebookTables(options);
    const open = foundry.applications.instances.get(REVIEW_ID);
    if (open) await open.close({ animate: false });
    const review = new RulebookTablesReview({ tables, pages });
    await review.render({ force: true });
    return review;
  } catch (err) {
    console.error("Base Knavery | reading the rulebook's tables failed", err);
    ui.notifications.error("KNAVERY.RulebookTables.ReadFailed", { localize: true });
    return null;
  } finally {
    if (note) ui.notifications.remove(note);
  }
};
