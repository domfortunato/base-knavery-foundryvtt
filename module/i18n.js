/**
 * Words that change with the language (localization plan, Phase 1, 2026-11-15): plurals by the
 * user's language, lists joined the language's way, numbers with its separators.
 *
 * Plural keys follow core's convention (Foundry's own SUPPORT.UnavailableDocuments): the key is a
 * section whose forms are the Intl.PluralRules categories, `one`, `two`, `few`, `many`, `other`.
 * English gives `one` and `other`; a language gives the forms it needs, and `other` stands in for
 * any form it leaves out.
 */

/** The plural form of `key` for `count`, formatted with `{n}` = count and `data`. */
export const P = (key, count, data = {}) => {
  const form = game.i18n.pluralRules.select(Math.abs(Number(count) || 0));
  const id = game.i18n.has(`${key}.${form}`) ? `${key}.${form}` : `${key}.other`;
  return game.i18n.format(id, { n: count, ...data });
};

/** A list in the user's language: "a, b and c" (or "a, b or c" with type "disjunction"). */
export const listOf = (items, type = "conjunction") => game.i18n.getListFormatter({ type }).format([...items].map(String));

/** A whole number in the user's language, with its thousands separator. */
export const num = (n) => Math.round(Number(n) || 0).toLocaleString(game.i18n.lang);

/** At init: {{knPlural "KEY" count a=b}} and {{knNum value}} for the templates. */
export const registerI18nHelpers = () => {
  Handlebars.registerHelper("knPlural", (key, count, options) => P(key, count, options?.hash ?? {}));
  Handlebars.registerHelper("knNum", (n) => num(n));
};
