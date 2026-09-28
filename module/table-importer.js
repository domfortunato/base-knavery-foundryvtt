/**
 * The Table Importer: paste rows, get a WORLD RollTable with the same name as
 * the shell it replaces. Because lookups prefer the world table, importing is
 * how a GM fills (or overrides) every table the system rolls on.
 *
 * Accepted line forms (one row per line):
 *   01-05 Some text        numbered ranges, "00" read as 100
 *   7. Some text           single numbers, with ".", ")" or ":" after
 *   | 3 | Some text |      a pasted Markdown table row
 *   3<TAB>Some text        a pasted spreadsheet row
 *   Some text              no numbers: rows are numbered in order
 *   @UUID[Item.abc]{Name}  a linked document (e.g. a career or spellbook)
 * For Careers, "Name: item, item, item" gives a career its starting items.
 */
import { FLAG_SCOPE, MARKET_PREFIX, TABLES } from "./config.js";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

const knownNames = () => [
  TABLES.careers, TABLES.spells, TABLES.namesA, TABLES.surnames, ...Object.values(TABLES.traits),
  TABLES.reaction, TABLES.mishaps, TABLES.glogMishaps,
  `${MARKET_PREFIX}Weapons`, `${MARKET_PREFIX}Armor`, `${MARKET_PREFIX}Gear`,
];

/** Parse pasted text into [{range:[a,b], text, uuid?}]. */
export const parseRows = (raw) => {
  const lines = String(raw ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^\|\s*/, "").replace(/\s*\|$/, "").replace(/\s*\|\s*/, "\t"));
  const num = (s) => (s === "00" ? 100 : Number(s));
  const rows = [];
  let next = 1;
  for (const line of lines) {
    const m = line.match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?:[.):]|\t|\s)\s*(.+)$/);
    let range;
    let text;
    if (m) {
      const a = num(m[1]);
      const b = m[2] ? num(m[2]) : a;
      range = [Math.min(a, b), Math.max(a, b)];
      text = m[3].trim();
    } else {
      range = [next, next];
      text = line;
    }
    next = range[1] + 1;
    const link = text.match(/^@UUID\[([^\]]+)\](?:\{([^}]*)\})?$/);
    rows.push(link ? { range, text: link[2] || "", uuid: link[1] } : { range, text });
  }
  return rows;
};

/** Create or update the world table `name` from rows. */
export const importRows = async (name, rows, { mode = "replace", formula = "" } = {}) => {
  let table = game.tables.find((t) => t.name === name);
  if (!table) table = await RollTable.create({ name, replacement: true, formula: "1d1" });
  if (mode === "replace" && table.results.size) {
    await table.deleteEmbeddedDocuments("TableResult", table.results.map((r) => r.id));
  }
  const offset = mode === "append" ? Math.max(0, ...table.results.map((r) => r.range[1])) : 0;
  const results = [];
  for (const r of rows) {
    const range = [r.range[0] + offset, r.range[1] + offset];
    if (r.uuid) {
      const doc = await fromUuid(r.uuid).catch(() => null);
      results.push({
        type: CONST.TABLE_RESULT_TYPES.DOCUMENT, documentUuid: r.uuid, name: r.text || doc?.name || r.uuid,
        img: doc?.img, range, weight: range[1] - range[0] + 1,
      });
    } else {
      results.push({ type: CONST.TABLE_RESULT_TYPES.TEXT, name: r.text, description: "", range, weight: range[1] - range[0] + 1 });
    }
  }
  if (results.length) await table.createEmbeddedDocuments("TableResult", results);
  const top = Math.max(1, ...table.results.map((r) => r.range[1]));
  await table.update({ formula: formula || `1d${top}`, [`flags.${FLAG_SCOPE}.imported`]: true });
  return table;
};

/** Open the importer, optionally aimed at a named table. */
export const openTableImporter = async (name = "") => {
  if (!game.user.isGM) return;
  const options = [...new Set([...knownNames(), ...game.tables.map((t) => t.name)])]
    .map((n) => `<option value="${esc(n)}"></option>`).join("");
  const content = `<div class="knavery-importer">
    <p>${L("KNAVERY.Import.Intro")}</p>
    <div class="form-group"><label>${L("KNAVERY.Import.TableName")}</label>
      <input type="text" name="table" list="kn-import-names" value="${esc(name)}" required /><datalist id="kn-import-names">${options}</datalist></div>
    <div class="form-group"><label>${L("KNAVERY.Import.Formula")}</label>
      <input type="text" name="formula" placeholder="${L("KNAVERY.Import.FormulaHint")}" /></div>
    <div class="form-group"><label>${L("KNAVERY.Import.Mode")}</label>
      <select name="mode"><option value="replace">${L("KNAVERY.Import.Replace")}</option><option value="append">${L("KNAVERY.Import.Append")}</option></select></div>
    <textarea name="rows" rows="14" placeholder="${esc(L("KNAVERY.Import.RowsHint"))}"></textarea>
    <p class="hint">${L("KNAVERY.Import.Formats")}</p>
  </div>`;
  const data = await foundry.applications.api.DialogV2.wait({
    window: { title: L("KNAVERY.Import.Title"), icon: "fas fa-file-import" },
    classes: ["knavery", "knavery-importer-dialog"],
    position: { width: 560 },
    content,
    buttons: [{
      action: "import", label: "KNAVERY.Import.Go", icon: "fas fa-file-import", default: true,
      callback: (_e, b) => {
        const f = b.form.elements;
        return { name: f.table.value.trim(), formula: f.formula.value.trim(), mode: f.mode.value, rows: f.rows.value };
      },
    }],
    rejectClose: false,
  });
  if (!data?.name) return;
  const rows = parseRows(data.rows);
  if (!rows.length) return ui.notifications.warn("KNAVERY.Import.NoRows", { localize: true });
  const table = await importRows(data.name, rows, data);
  ui.notifications.info(F("KNAVERY.Import.Done", { n: rows.length, name: table.name }));
  foundry.applications.instances.get("knavery-gm-dashboard")?.render();
  return table;
};
