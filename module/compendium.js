/**
 * Finding and drawing the tables the system looks up by name.
 *
 * THE WORLD WINS. A world RollTable with the same name as a compendium table
 * is always used first, so a GM overrides any shipped table — careers, names,
 * the marketplace aisles — by importing their own copy.
 *
 * Shipped tables are SHELLS: correct names and dice, placeholder rows flagged
 * `base-knavery.placeholder`. Knave 2e's table text is not ours to ship. A
 * draw that lands only on placeholders reports "empty" instead of pretending.
 */
import { FLAG_SCOPE } from "./config.js";

const L = (k) => game.i18n.localize(k);

/** Every RollTable compendium, system packs first. */
const tablePacks = () => game.packs.filter((p) => p.documentName === "RollTable")
  .sort((a, b) => Number(b.metadata.packageType === "system") - Number(a.metadata.packageType === "system"));

/** Resolve a table by name: world first, then compendia. */
export const findTable = async (name) => {
  if (!name) return null;
  const world = game.tables.find((t) => t.name === name);
  if (world) return world;
  for (const pack of tablePacks()) {
    const entry = pack.index.find((e) => e.name === name);
    if (entry) return pack.getDocument(entry._id);
  }
  return null;
};

/** All tables whose name starts with `prefix`, world copies shadowing compendium ones. */
export const findTablesByPrefix = async (prefix) => {
  const out = new Map();
  for (const pack of tablePacks().reverse()) {
    for (const e of pack.index) {
      if (e.name?.startsWith(prefix)) out.set(e.name, () => pack.getDocument(e._id));
    }
  }
  for (const t of game.tables) if (t.name.startsWith(prefix)) out.set(t.name, () => t);
  const docs = [];
  for (const [, get] of out) docs.push(await get());
  return docs.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
};

export const isPlaceholder = (result) => result?.getFlag?.(FLAG_SCOPE, "placeholder") === true
  || result?.flags?.[FLAG_SCOPE]?.placeholder === true;

/** The display text of a result (v14: `name` for documents, `description` for text). */
export const resultText = (result) => {
  if (!result) return "";
  const raw = result.name || result.description || result.text || "";
  return foundry.utils.cleanHTML?.(raw) ?? raw;
};

/** Plain text, tags stripped. */
export const plainText = (html) => {
  const div = document.createElement("div");
  div.innerHTML = String(html ?? "");
  return div.textContent.trim();
};

/** The real (non-placeholder) results of a table. */
export const realResults = (table) => (table?.results?.contents ?? []).filter((r) => !isPlaceholder(r));

/**
 * Draw a result without posting to chat. Returns {result, text, table} or null,
 * warning when the table is missing or still a shell.
 */
export const drawFrom = async (name, { warn = true } = {}) => {
  const table = await findTable(name);
  if (!table) {
    if (warn) ui.notifications.warn(game.i18n.format("KNAVERY.Notify.TableMissing", { name }));
    return null;
  }
  const real = realResults(table);
  if (!real.length) {
    if (warn) ui.notifications.warn(game.i18n.format("KNAVERY.Notify.TableEmpty", { name }));
    return null;
  }
  // Our own draw rather than RollTable#draw: a compendium shell is locked, and
  // a draw without replacement would try to mark the result as drawn in it.
  const roll = await new Roll(table.formula || `1d${real.length}`).evaluate();
  const hits = table.getResultsForRoll(roll.total).filter((r) => !isPlaceholder(r));
  const result = hits[0] ?? real[Math.floor(Math.random() * real.length)];
  return { result, text: plainText(resultText(result)), table, roll };
};

/**
 * The pick-list: show every real row of a table and return the chosen one.
 * The `fa-list-ul` button on every generated field opens this.
 */
export const pickFrom = async (name, { title } = {}) => {
  const table = await findTable(name);
  if (!table) {
    ui.notifications.warn(game.i18n.format("KNAVERY.Notify.TableMissing", { name }));
    return null;
  }
  const rows = realResults(table).map((r) => ({ id: r.id, text: plainText(resultText(r)), range: r.range }));
  if (!rows.length) {
    ui.notifications.warn(game.i18n.format("KNAVERY.Notify.TableEmpty", { name }));
    return null;
  }
  const chosen = await pickFromList(rows.map((r) => ({
    value: r.id,
    label: r.text,
    prefix: r.range?.[0] === r.range?.[1] ? `${r.range?.[0]}` : `${r.range?.[0]}–${r.range?.[1]}`,
  })), { title: title ?? name });
  if (!chosen) return null;
  const result = table.results.get(chosen);
  return { result, text: plainText(resultText(result)), table };
};

/**
 * A filterable single-choice list in a DialogV2.
 * @param {{value:string,label:string,prefix?:string,img?:string}[]} options
 */
export const pickFromList = async (options, { title = "", icon = "fas fa-list-ul" } = {}) => {
  const esc = foundry.utils.escapeHTML;
  const rows = options.map((o) => `<label class="kn-pick-row" data-filter="${esc(o.label.toLowerCase())}">`
    + `<input type="radio" name="pick" value="${esc(o.value)}" />`
    + (o.img ? `<img src="${esc(o.img)}" alt="" />` : "")
    + (o.prefix ? `<span class="kn-pick-prefix">${esc(o.prefix)}</span>` : "")
    + `<span class="kn-pick-label">${esc(o.label)}</span></label>`).join("");
  const content = `<div class="kn-picker"><input type="search" class="kn-pick-filter" placeholder="${esc(L("KNAVERY.Filter"))}" />`
    + `<div class="kn-pick-list">${rows}</div></div>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title, icon },
    classes: ["knavery", "knavery-picker"],
    position: { width: 460, height: 560 },
    content,
    render: (_event, dialog) => {
      const root = dialog.element;
      const filter = root.querySelector(".kn-pick-filter");
      filter?.addEventListener("input", () => {
        const q = filter.value.trim().toLowerCase();
        for (const row of root.querySelectorAll(".kn-pick-row")) row.hidden = q && !row.dataset.filter.includes(q);
      });
      root.querySelector(".kn-pick-list")?.addEventListener("dblclick", (e) => {
        if (e.target.closest(".kn-pick-row")) root.querySelector('button[data-action="ok"]')?.click();
      });
      filter?.focus();
    },
    buttons: [{
      action: "ok",
      label: "KNAVERY.Choose",
      icon: "fas fa-check",
      default: true,
      callback: (_e, button) => button.form.elements.pick?.value || null,
    }],
    rejectClose: false,
  });
};
