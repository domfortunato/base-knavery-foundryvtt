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
import { COINS_PER_SLOT, CORE_RULE_KEYS, RULES_ALSO, RULES_PRESETS, SETTINGS_NS } from "./config.js";

const RULE_KEYS = Object.keys(RULES_PRESETS["1e"]);
/** Settings a fresh world writes by itself, which do not make it an old world. */
const AUTOMATIC_KEYS = new Set(["rules-stamp", "rules-keys", "welcome-shown-version"]);

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
/** Knave 1e attacks (p4): quality and wear, a natural 20's extra die; no power attack or 21+ maneuver. */
export const usesQuality = () => rule("attack-rule") === "knave1e";
/** Knave 1e's copper price list, henchmen and daily wages (p3), or Knave 2e's. */
export const usesPrices1e = () => rule("price-list") === "knave1e";
/** Coins to an item slot: 100 (1e, p2) or 500 (2e). */
export const coinsPerSlot = () => Number(rule("coins-per-slot")) || COINS_PER_SLOT;

/** Whether a rule's value plays an edition: its preset value, or another it allows (RULES_ALSO). */
const plays = (edition, key, value) => value === RULES_PRESETS[edition][key] || (RULES_ALSO[edition]?.[key] ?? []).includes(value);

/** Which edition a set of rule values matches: "1e", "2e" or "custom". */
export const rulesFor = (values) => {
  for (const edition of ["1e", "2e"]) {
    if (RULE_KEYS.every((k) => plays(edition, k, values[k]))) return edition;
  }
  return "custom";
};
/** The edition this world plays now. */
export const currentRules = () => rulesFor(Object.fromEntries(RULE_KEYS.map((k) => [k, rule(k)])));

/**
 * An ability's tagline: the Knave 1e set in a world playing 1e, else the 2e set (a Custom world
 * too; user ruling 2026-11-14). 1e (p2): CON heals and resists poison, INT resists magic, WIS
 * spots illusions, CHA employs henchmen; no wounds, spells a day or CHA initiative.
 */
export const abilityHint = (key) => game.i18n.localize(`KNAVERY.${currentRules() === "1e" ? "AbilityHint1e" : "AbilityHint"}.${key}`);

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
 * Which edition the world's known rules point to, for a rule added since: the edition they
 * all match, else the stamp's (a custom world was 2e before 0.2.0, or 1e if made since).
 */
export const editionForNewRules = (values, known, stamp) => {
  for (const edition of ["1e", "2e"]) {
    if (known.length && known.every((k) => plays(edition, k, values[k]))) return edition;
  }
  return stamp === "2e" ? "2e" : "1e";
};

/**
 * A stamped world meets a rule added after its stamp: it gets that rule's value in the
 * edition its other rules play, so a 2e world stays 2e. Returns the keys written.
 */
const topUpRules = async (stamp) => {
  const stored = game.settings.get(SETTINGS_NS, "rules-keys");
  const known = (Array.isArray(stored) && stored.length ? stored : CORE_RULE_KEYS).filter((k) => RULE_KEYS.includes(k));
  const added = RULE_KEYS.filter((k) => !known.includes(k));
  if (!added.length) return [];
  const edition = editionForNewRules(Object.fromEntries(known.map((k) => [k, rule(k)])), known, stamp);
  for (const k of added) {
    if (game.settings.get(SETTINGS_NS, k) !== RULES_PRESETS[edition][k]) await game.settings.set(SETTINGS_NS, k, RULES_PRESETS[edition][k]);
  }
  await game.settings.set(SETTINGS_NS, "rules-keys", RULE_KEYS);
  return added;
};

/**
 * Once per world, from `ready` on the active GM: an old world keeps Knave 2e, a new one
 * Knave 1e. Returns the stamp written, or null when it was already stamped or this is not
 * the client to do it. A stamped world still learns rules added since (`topUpRules`).
 */
export const stampRules = async () => {
  if (!game.user.isGM || !game.users.activeGM?.isSelf) return null;
  const stamped = game.settings.get(SETTINGS_NS, "rules-stamp");
  if (stamped) { await topUpRules(stamped); return null; }
  const stored = storedKeys();
  const documents = game.actors.size + game.items.size + game.journal.size;
  if (!isExistingWorld({ storedKeys: stored, documents })) {
    await game.settings.set(SETTINGS_NS, "rules-stamp", "1e");
    await game.settings.set(SETTINGS_NS, "rules-keys", RULE_KEYS);
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
  await game.settings.set(SETTINGS_NS, "rules-keys", RULE_KEYS);
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
  const lines = ["Careers", "Wounds", "Healing", "Spells", "Attacks", "Gear", "Advancement"]
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
