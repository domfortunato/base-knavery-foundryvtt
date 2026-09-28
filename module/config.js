/**
 * System constants. Everything here is a game-mechanics NUMBER or an internal
 * key — never rules prose. Knave 2e's mechanics may be reused freely under its
 * Third Party License; its text may not, so no descriptive text lives here.
 */

export const SYSTEM_ID = "base-knavery";
export const FLAG_SCOPE = SYSTEM_ID;
export const SETTINGS_NS = SYSTEM_ID;
export const SYS_PATH = `systems/${SYSTEM_ID}`;

/** The six abilities, in 3d6-roll order (die face 1 = STR … 6 = CHA). */
export const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
export const ABILITY_MAX = 10;

/** Every check's target is 11 + a difficulty (0–10); the default difficulty is 5. */
export const CHECK_BASE = 11;
export const DEFAULT_DIFFICULTY = 5;

/** A melee or ranged attack total that also earns a free maneuver. */
export const MANEUVER_THRESHOLD = 21;

/** AC = 11 + armor points; at most seven pieces of armor count. */
export const AC_BASE = 11;
export const MAX_ARMOR_POINTS = 7;

/** Item slots = 10 + CON. Coins fill one slot per 500. Hirelings have 10. */
export const SLOT_BASE = 10;
export const COINS_PER_SLOT = 500;
export const HIRELING_SLOTS = 10;

/**
 * The level table: XP needed to reach each level. Titles are i18n keys
 * (KNAVERY.LevelTitle.<level>) so a hack can rename them in a translation file.
 */
export const LEVELS = [
  { level: 1, xp: 0 },
  { level: 2, xp: 2000 },
  { level: 3, xp: 4000 },
  { level: 4, xp: 8000 },
  { level: 5, xp: 16000 },
  { level: 6, xp: 32000 },
  { level: 7, xp: 64000 },
  { level: 8, xp: 125000 },
  { level: 9, xp: 250000 },
  { level: 10, xp: 500000 },
];
export const MAX_LEVEL = LEVELS.length;
/** Abilities raised by one each level-up (three different ones). */
export const LEVEL_UP_ABILITIES = 3;

/**
 * Saving throws from other games (OSR modules, DCC adventures) resolve as an
 * ability check. Keys are internal; labels are i18n.
 */
export const SAVE_CATEGORIES = {
  paralysis: "STR",
  blast: "DEX",
  poison: "CON",
  device: "INT",
  spell: "WIS",
};

/** Advantage paradigms, chosen by the GM in the settings. */
export const ADVANTAGE_MODES = {
  raw: "KNAVERY.Settings.AdvantageRaw",
  "2d20": "KNAVERY.Settings.Advantage2d20",
};
export const ADVANTAGE_BONUS = 5;

/** Roll modes offered by the roll prompt. */
export const EDGES = ["disadvantage", "normal", "advantage"];

/** Armor pieces. Each is one slot and one armor point by default. */
export const ARMOR_TYPES = ["shield", "helmet", "gambeson", "mail", "breastplate", "armPlate", "legPlate", "other"];

/** NPC roles (a field on the `npc` type, not separate actor types). */
export const NPC_ROLES = ["monster", "npc", "hireling", "companion"];

/** Career feature field types a custom career can add to the sheet. */
export const FEATURE_TYPES = ["text", "number", "checkbox", "track", "die"];

/** Hazard die faces (d6) for travel and delving, as i18n keys. */
export const HAZARD_DICE = {
  travel: ["encounter", "fatigue", "depletion", "shift", "sign", "free"],
  dungeon: ["encounter", "fatigue", "burn", "shift", "sign", "free"],
};

/**
 * Rollable tables the system looks up BY NAME. They ship as empty shells in the
 * compendia; the GM fills them by importing their own copies, and a WORLD table
 * with the same name always wins over the compendium shell.
 */
export const TABLES = {
  careers: "Careers",
  spells: "Spells",
  namesA: "Names",
  surnames: "Surnames",
  traits: {
    physique: "Physique",
    face: "Face",
    skin: "Skin",
    hair: "Hair",
    clothing: "Clothing",
    virtue: "Virtue",
    vice: "Vice",
    speech: "Speech",
    background: "Background",
    misfortune: "Misfortune",
  },
  mishaps: "Mishaps",
  reaction: "Reaction",
  glogMishaps: "GLOG Mishaps",
};

/** Aisles of the marketplace are RollTables named "Market: <Aisle>". */
export const MARKET_PREFIX = "Market: ";

/** Starting coins at creation. */
export const STARTING_COINS = "3d6 * 10";
