/**
 * Cleaning enriched HTML before it goes into a sheet (ported from Air Bladder's
 * `cleanDescription`, batch 2026-08-10).
 *
 * Core's `cleanHTML` allow-list suits core's sinks (a chat bubble, a tooltip).
 * Ours sit inside a sheet that is a <form> submitting on change, where two
 * attributes core keeps are live controls:
 *
 *   data-action  ApplicationV2 dispatches clicks from one listener on the whole
 *                window via closest("[data-action]"), so an injected
 *                <a data-action="itemDelete"> runs the action with the viewer's
 *                rights.
 *   name         FormDataExtended reads every named control in the form, so an
 *                injected <input name="system.acOverride"> is submitted into the
 *                viewer's own actor on their next change.
 *
 * The work happens on a parsed tree, never on the string: string surgery between
 * a serialize and a re-parse can turn inert text into live markup.
 */

/**
 * @param {string} [html]  enriched HTML
 * @returns {string} HTML safe to insert into a sheet
 */
export const cleanDescription = (html) => {
  if (!html) return "";
  // A <template>, so parsing is inert and fetches nothing.
  const tpl = document.createElement("template");
  tpl.innerHTML = foundry.utils.cleanHTML(String(html));
  for (const el of tpl.content.querySelectorAll("[data-action], [name]")) {
    el.removeAttribute("data-action");
    el.removeAttribute("name");
  }
  return tpl.innerHTML;
};

/**
 * Enrich, then clean, for a sheet sink.
 * @param {string} html
 * @param {object} options  TextEditor.enrichHTML options
 */
export const enrichForSheet = async (html, options = {}) => cleanDescription(
  await foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? "", options),
);
