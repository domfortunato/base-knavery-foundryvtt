/**
 * The world's rules (user rulings 2026-11-14): Knave 1e as written out of the box, Knave 2e
 * with the GM's book, or any mix. Each rule is its own world setting; RULES_PRESETS
 * (config.js) gives each edition's value for every one, and the world "plays" an edition
 * when every rule matches it, otherwise "custom".
 *
 * A world made before 0.2.0 keeps Knave 2e: at the first GM login after the update, every
 * rule it never stored is written with its 2e value (`stampRules`). A brand-new world
 * stores nothing and plays the 1e defaults.
 */
import { RULES_PRESETS, SETTINGS_NS } from "./config.js";

const RULE_KEYS = Object.keys(RULES_PRESETS["1e"]);
/** Settings a fresh world writes by itself, which do not make it an old world. */
const AUTOMATIC_KEYS = new Set(["rules-stamp", "welcome-shown-version"]);

/** A rule's value; before settings exist, the 1e default. */
export const rule = (key) => {
  try { return game.settings.get(SETTINGS_NS, key); } catch { return RULES_PRESETS["1e"][key]; }
};
export const deathRule = () => rule("death-rule");
export const healingRule = () => rule("healing-rule");
export const spellRule = () => rule("spell-rule");
export const creationAbilities = () => rule("creation-abilities");
export const startingKit = () => rule("starting-kit");
/** Whether characters take wounds (Knave 2e) or fall at 0 HP and die below it (Knave 1e). */
export const usesWounds = () => deathRule() !== "knave1e";
/** Whether a new character has careers (Knave 2e) or 1e's background and rolled gear. */
export const usesCareers = () => startingKit() !== "knave1e";

/** Which edition a set of rule values matches: "1e", "2e" or "custom". */
export const rulesFor = (values) => {
  for (const edition of ["1e", "2e"]) {
    if (RULE_KEYS.every((k) => values[k] === RULES_PRESETS[edition][k])) return edition;
  }
  return "custom";
};
/** The edition this world plays now. */
export const currentRules = () => rulesFor(Object.fromEntries(RULE_KEYS.map((k) => [k, rule(k)])));

/** Write an edition's value for every rule (the GM's own switches are overwritten). */
export const applyRules = async (edition) => {
  const preset = RULES_PRESETS[edition];
  if (!preset) return;
  for (const [k, v] of Object.entries(preset)) {
    if (game.settings.get(SETTINGS_NS, k) !== v) await game.settings.set(SETTINGS_NS, k, v);
  }
};

/** Whether the world existed before this release: it stored a setting, or holds documents. */
export const isExistingWorld = ({ storedKeys = [], documents = 0 } = {}) =>
  documents > 0 || storedKeys.some((k) => !AUTOMATIC_KEYS.has(k));

/** The world settings of this system that are stored (not defaults), by key. */
const storedKeys = () => {
  const world = game.settings.storage.get("world");
  const prefix = `${SETTINGS_NS}.`;
  return world.filter((s) => s.key?.startsWith(prefix)).map((s) => s.key.slice(prefix.length));
};

/**
 * Once per world, from `ready` on the active GM: an old world keeps Knave 2e, a new one
 * Knave 1e. Returns the stamp written, or null when it was already stamped or this is not
 * the client to do it.
 */
export const stampRules = async () => {
  if (!game.user.isGM || !game.users.activeGM?.isSelf) return null;
  if (game.settings.get(SETTINGS_NS, "rules-stamp")) return null;
  const stored = storedKeys();
  const documents = game.actors.size + game.items.size + game.journal.size;
  if (!isExistingWorld({ storedKeys: stored, documents })) {
    await game.settings.set(SETTINGS_NS, "rules-stamp", "1e");
    return "1e";
  }
  for (const [k, v] of Object.entries(RULES_PRESETS["2e"])) {
    if (!stored.includes(k)) await game.settings.set(SETTINGS_NS, k, v);
  }
  // The old starting-gear hack added Knave 1e gear to the careers.
  if (stored.includes("knave1e-starting-gear") && !stored.includes("starting-kit")
    && game.settings.get(SETTINGS_NS, "knave1e-starting-gear") === true) {
    await game.settings.set(SETTINGS_NS, "starting-kit", "careers-1e-gear");
  }
  await game.settings.set(SETTINGS_NS, "rules-stamp", "2e");
  return "2e";
};

/**
 * After the GM builds tables from their Knave 2e book: offer to switch the rules. Nothing
 * changes on a character either way. Resolves true when the world now plays 2e.
 */
export const offerRulesSwitch = async () => {
  if (!game.user.isGM || currentRules() === "2e") return currentRules() === "2e";
  const L = (k) => game.i18n.localize(k);
  const esc = foundry.utils.escapeHTML;
  const lines = ["Careers", "Wounds", "Healing", "Spells", "Advancement"]
    .map((k) => `<li>${esc(L(`KNAVERY.RulesSwitch.${k}`))}</li>`).join("");
  const yes = await foundry.applications.api.DialogV2.confirm({
    classes: ["knavery", "knavery-rules-switch"],
    window: { title: L("KNAVERY.RulesSwitch.Title"), icon: "fa-solid fa-scale-balanced" },
    content: `<p>${esc(L("KNAVERY.RulesSwitch.Body"))}</p><ul>${lines}</ul><p>${esc(L("KNAVERY.RulesSwitch.Characters"))}</p>`,
    yes: { label: "KNAVERY.RulesSwitch.Yes", icon: "fa-solid fa-check" },
    no: { label: "KNAVERY.RulesSwitch.No", icon: "fa-solid fa-xmark" },
    rejectClose: false,
  });
  if (yes) {
    await applyRules("2e");
    ui.notifications.info("KNAVERY.RulesSwitch.Done", { localize: true });
  }
  return currentRules() === "2e";
};
