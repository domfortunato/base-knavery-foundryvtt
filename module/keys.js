/**
 * Identity by key, not by English name (localization plan, Phase 0, 2026-11-15).
 *
 * The system looks tables, items and Guide pages up by name, and its names are
 * English. A translation (a language file, or Babele renaming compendium
 * entries) must not break those lookups, so every shipped document carries
 * `flags.base-knavery.key`, the slug of its English name, and lookups try the
 * key first, then the name. Callers keep passing the English name: it is the
 * identifier, and `keyOf` turns it into the key.
 *
 * Items whose NAME drives a rule (rations are eaten, torches burn, lights are
 * lit, arrows come with a bow) also carry `flags.base-knavery.kind`. `isKind`
 * reads that flag, then Babele's original name, then a word list a language
 * file may give (`KNAVERY.ItemWords.<kind>`, words separated by "|"), then the
 * English pattern, so items made before 0.4.0 keep working.
 */
import { FLAG_SCOPE } from "./config.js";

/** The key of an English name: lower case, accents dropped, runs of anything else one "-". */
export const keyOf = (name) => String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");

/** The key a document or a compendium index entry carries, or null. */
export const docKey = (doc) => doc?.flags?.[FLAG_SCOPE]?.key ?? null;

/** A language file's name for a table, when it gives one (`KNAVERY.TableName.<key>`), else null. */
const localizedTableName = (name) => {
  const k = `KNAVERY.TableName.${keyOf(name)}`;
  return game.i18n?.has?.(k, false) ? game.i18n.localize(k) : null;
};

/** The name to show for a table the system knows by its English name. */
export const tableLabel = (name) => localizedTableName(name) ?? String(name ?? "");

/**
 * The document in `docs` (documents or index entries) that stands for the English `name`:
 * the one carrying its key, else the one with that name, else the one with the language
 * file's name for it.
 */
export const findByKey = (docs, name, filter = () => true) => {
  if (!name) return null;
  const key = keyOf(name);
  const list = [...docs].filter(filter);
  const local = localizedTableName(name);
  return list.find((d) => docKey(d) === key)
    ?? list.find((d) => d.name === name)
    ?? (local ? list.find((d) => d.name === local) : null)
    ?? null;
};

/** The world table that stands for an English table name, or null (synchronous). */
export const worldTable = (name) => findByKey(game.tables ?? [], name);

/* -------------------------------------------- */
/*  Item kinds                                   */
/* -------------------------------------------- */

/** The English patterns, the fallback for items without a kind flag. */
export const KIND_PATTERNS = {
  rations: /\brations?\b/i,
  torch: /\btorch(es)?\b/i,
  candle: /\bcandles?\b/i,
  lantern: /\blanterns?\b/i,
  arrows: /\barrows?\b/i,
};

/** The kind an English item name implies, or null (the content generator stamps it). */
export const kindOfName = (name) => Object.keys(KIND_PATTERNS).find((k) => KIND_PATTERNS[k].test(String(name ?? ""))) ?? null;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The language file's words for a kind, as whole-word patterns. */
const kindWords = (kind) => {
  const k = `KNAVERY.ItemWords.${kind}`;
  if (!game.i18n?.has?.(k, false)) return [];
  return game.i18n.localize(k).split("|").map((w) => w.trim()).filter(Boolean)
    .map((w) => new RegExp(`(^|[^\\p{L}])${escapeRe(w)}($|[^\\p{L}])`, "iu"));
};

/** Whether an item (type "item") is of a kind: its flag, else its names against the patterns. */
export const isKind = (item, kind) => {
  if (item?.type !== "item") return false;
  const flag = item.flags?.[FLAG_SCOPE]?.kind;
  if (flag) return flag === kind;
  const names = [item.name, item.flags?.babele?.originalName].filter(Boolean).map(String);
  const patterns = [KIND_PATTERNS[kind], ...kindWords(kind)].filter(Boolean);
  return names.some((n) => patterns.some((re) => re.test(n)));
};

/* -------------------------------------------- */
/*  Setup                                        */
/* -------------------------------------------- */

/**
 * At init: compendium indexes carry the keys, so a lookup never loads a document to read one.
 * Foundry starts each pack with core's index fields only; `loadKeyIndexes` (at ready) fetches the rest.
 */
export const registerKeyIndexFields = () => {
  const add = (doc, ...fields) => {
    const list = CONFIG[doc].compendiumIndexFields ??= [];
    for (const f of fields) if (!list.includes(f)) list.push(f);
  };
  add("RollTable", `flags.${FLAG_SCOPE}.key`, `flags.${FLAG_SCOPE}.market`, `flags.${FLAG_SCOPE}.aisle`);
  add("Item", `flags.${FLAG_SCOPE}.key`, `flags.${FLAG_SCOPE}.kind`);
  add("JournalEntry", `flags.${FLAG_SCOPE}.key`);
};

/** At ready, on every client: the indexes of the table, item and journal packs, with the key fields. */
export const loadKeyIndexes = () => Promise.all(game.packs
  .filter((p) => ["RollTable", "Item", "JournalEntry"].includes(p.documentName))
  .map((p) => p.getIndex().catch((err) => console.warn(`Base Knavery | index of ${p.collection}`, err))));

/**
 * At the active GM's login: every world table without a key takes the key of its own name,
 * so a later rename (a translation of "Careers") keeps it found. Naming lookups work without
 * it; the stamp only makes the name free to change.
 */
export const stampTableKeys = async () => {
  if (!game.user.isActiveGM) return;
  const updates = game.tables.filter((t) => !docKey(t) && keyOf(t.name))
    .map((t) => ({ _id: t.id, [`flags.${FLAG_SCOPE}.key`]: keyOf(t.name) }));
  if (updates.length) await RollTable.implementation.updateDocuments(updates);
};
