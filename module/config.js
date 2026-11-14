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

/** Item slots = 10 + CON. Coins fill one slot per 500 (2e) or 100 (1e: rule `coins-per-slot`). Hirelings have 10. */
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
/** Knave 1e's advancement (hack `knave1e-xp`): a level for every 1000 XP, to level 10. */
export const LEVELS_1E = LEVELS.map((r) => ({ level: r.level, xp: (r.level - 1) * 1000 }));
/** Abilities raised by one each level-up (three different ones). */
export const LEVEL_UP_ABILITIES = 3;
/** The backstory's guide length in words (user, 2026-11-14): a counter, never a limit. */
export const BACKSTORY_WORDS = 35;

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

/** How max HP grows at each level (setting `level-hp-rule`). `reroll` is Knave 2e as written. */
export const LEVEL_HP_RULES = {
  reroll: "KNAVERY.Settings.HpRuleReroll",
  add1d6: "KNAVERY.Settings.HpRuleAdd",
  rerollBest: "KNAVERY.Settings.HpRuleBest",
  /** Knave 1e: roll a d8 per level; only a result below the old max gives old max + 1. */
  knave1e: "KNAVERY.Settings.HpRule1e",
};
/** First-level HP (setting `first-level-hp`). Under the reroll rules it is also the first die of every reroll. */
export const FIRST_LEVEL_HP = {
  "1d6": "KNAVERY.Settings.FirstHp1d6",
  "1d4+2": "KNAVERY.Settings.FirstHp1d4",
  "1d8": "KNAVERY.Settings.FirstHp1d8",
};
/** Points a new character places in its abilities (more than one in a score is allowed). */
export const CREATION_POINTS = 3;

/** Roll modes offered by the roll prompt. */
export const EDGES = ["disadvantage", "normal", "advantage"];

/** Armor pieces. Each is one slot and one armor point by default. */
export const ARMOR_TYPES = ["shield", "helmet", "gambeson", "mail", "breastplate", "armPlate", "legPlate", "other"];

/** NPC roles (a field on the `npc` type, not separate actor types). */
export const NPC_ROLES = ["monster", "npc", "hireling", "companion"];
/** What kind of special an item is (user, 2026-11-14): any item type may be magic, a relic or a potion. */
export const ITEM_KINDS = ["ordinary", "magic", "relic", "potion"];

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
  /** Knave 1e's 100 level-less spells (CC BY 4.0, shipped): the spell list until 2e's Spells is built, or by choice. */
  spells1e: "Spells (Knave 1e)",
  /** Knave 1e starting gear (the starting-gear hack). */
  gear1e: {
    armor: "Starting Armor (Knave 1e)",
    helmets: "Helmets and Shields (Knave 1e)",
    dungeon: "Dungeoneering Gear (Knave 1e)",
    general1: "General Gear 1 (Knave 1e)",
    general2: "General Gear 2 (Knave 1e)",
  },
  namesA: "Names",
  surnames: "Surnames",
  /** The book's second surname table: a Surnames draw ending in "-" is joined to one of these. */
  surnameEndings: "Surname Endings",
  /** Personality and Mannerism are Knave 2e tables (from the GM's PDF); the rest are Knave 1e's, shipped (CC BY 4.0). */
  traits: {
    personality: "Personalities",
    mannerism: "Mannerisms",
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
    alignment: "Alignment",
  },
  mishaps: "Mishaps",
  reaction: "Reaction",
};

/** Aisles of the marketplace are RollTables named "Market: <Aisle>"; Knave 1e's copper aisles "Market 1e: <Aisle>". */
export const MARKET_PREFIX = "Market: ";
export const MARKET_1E_PREFIX = "Market 1e: ";
/** The Knave 1e price list's pack (rule `price-list`). */
export const GEAR_1E_PACK = "base-knavery.gear-1e";

/**
 * The GM's own rulebook PDF (module/rulebook.js). Nothing of the book ships:
 * the world stores a path, and these are page numbers only, read from the Knave
 * 2e PDF's outline and headings. Pages are PRINTED pages; the PDF index is the
 * printed page plus the world's offset setting (6 in that PDF, whose printed
 * page 1 is its seventh). `pdfPages` is the edition the numbers come from; a
 * file with another page count warns once. The ten trait tables and both
 * mishap tables have no page: they are not in the 2e book.
 */
export const RULEBOOK = {
  pdfPages: 88,
  pageOffset: 6,
  pages: {
    [TABLES.careers]: 5,
    [TABLES.spells]: 22,
    [TABLES.namesA]: 54,
    [TABLES.surnames]: 55,
    ["Personalities"]: 56,
    ["Mannerisms"]: 59,
    [TABLES.reaction]: 19,
    [`${MARKET_PREFIX}Gear`]: 38,
    [`${MARKET_PREFIX}Weapons`]: 38,
    [`${MARKET_PREFIX}Armor`]: 38,
    [`${MARKET_PREFIX}Animals & Transport`]: 38,
    [`${MARKET_PREFIX}Clothing`]: 40,
  },
};

/** Starting coins at creation (Knave 2e; a Knave 1e kit has none). */
export const STARTING_COINS = "3d6 * 10";

/**
 * Each edition's value for every rule (rules.js; user rulings 2026-11-14). A new world plays
 * Knave 1e: these are also the registered defaults. A world matching neither is "custom".
 */
export const RULES_PRESETS = {
  "1e": {
    "creation-abilities": "lowest", "starting-kit": "knave1e", "show-alignment": true, "show-background": true,
    "first-level-hp": "1d8", "level-hp-rule": "knave1e", "death-rule": "knave1e", "healing-rule": "knave1e",
    "spell-rule": "book-per-day", "spell-list": "1e", "knave1e-xp": true, "knave1e-initiative": true,
    "attack-rule": "knave1e", "price-list": "knave1e", "coins-per-slot": "100",
  },
  "2e": {
    "creation-abilities": "points", "starting-kit": "careers", "show-alignment": false, "show-background": false,
    "first-level-hp": "1d6", "level-hp-rule": "reroll", "death-rule": "wounds", "healing-rule": "knave2e",
    "spell-rule": "int-per-day", "spell-list": "auto", "knave1e-xp": false, "knave1e-initiative": false,
    "attack-rule": "knave2e", "price-list": "knave2e", "coins-per-slot": "500",
  },
};
/** The rules of 0.2.0's first build; a world stamped then learns the later ones from its own edition (rules.js). */
export const CORE_RULE_KEYS = [
  "creation-abilities", "starting-kit", "show-alignment", "show-background", "first-level-hp", "level-hp-rule",
  "death-rule", "healing-rule", "spell-rule", "spell-list", "knave1e-xp", "knave1e-initiative",
];

/**
 * Knave 1e quality (p3, p4): a weapon has 3; a shield or helmet 1; body armor its defense less 9
 * (gambeson 3 ... full plate 7), which is its armor points + 2. An item's own `qualityMax` wins.
 */
export const QUALITY_WEAPON = 3;
export const QUALITY_ARMOR_EXTRA = 2;
export const defaultQualityMax = (type, system = {}) => {
  if (type === "weapon") return QUALITY_WEAPON;
  if (["shield", "helmet"].includes(system.armorType)) return 1;
  return Math.max(1, (Number(system.points) || 1) + QUALITY_ARMOR_EXTRA);
};
/** Each point of quality costs 10% of the item's cost to repair (p4). */
export const REPAIR_PER_POINT = 0.1;

/**
 * Knave 1e henchmen (p3): wages per day, in copper. Their stats are 2e's lines (npc-generator.js HIRELINGS):
 * the book gives none.
 */
export const HENCHMEN_1E = {
  laborer: { wage: 1, line: "hireling" }, scribe: { wage: 2, line: "expertCommon" }, archer: { wage: 3, line: "mercenary" },
  mason: { wage: 4, line: "expertCommon" }, manAtArms: { wage: 6, line: "mercenary" }, smith: { wage: 8, line: "expertCommon" },
  manAtArmsMounted: { wage: 12, line: "mercenary" }, masterBuilder: { wage: 15, line: "expertCommon" },
  barberSurgeon: { wage: 25, line: "expertCommon" }, knight: { wage: 25, line: "mercenary" },
};

/** A Knave 1e score is the lowest of 3d6 (p1): 1 to 6 at level 1. */
export const LOWEST_DIE_MAX = 6;
