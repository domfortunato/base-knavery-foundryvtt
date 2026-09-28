/**
 * TypeDataModels for every Actor and Item type. There is no template.json.
 *
 * Every HTMLField here must also be listed under `htmlFields` in system.json:
 * the server never loads these classes, so a field missing from the manifest
 * is never sanitized. `npm run check:fields` keeps the two in step.
 */
import {
  ABILITIES, ABILITY_MAX, AC_BASE, ARMOR_TYPES, COINS_PER_SLOT, FEATURE_TYPES, HIRELING_SLOTS,
  LEVELS, MAX_ARMOR_POINTS, MAX_LEVEL, NPC_ROLES, SLOT_BASE,
} from "./config.js";

const {
  SchemaField, StringField, HTMLField, BooleanField, NumberField, ArrayField, ObjectField,
} = foundry.data.fields;

/* -------------------------------------------- */
/*  Field factories                              */
/* -------------------------------------------- */

const str = (initial = "") => new StringField({ required: true, blank: true, initial });
const html = () => new HTMLField({ required: true, blank: true, initial: "" });
const bool = (initial = false) => new BooleanField({ required: true, initial });
const int = (initial = 0, { min = 0, max } = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, initial, min, max });
const num = (initial = 0, { min = 0 } = {}) =>
  new NumberField({ required: true, nullable: false, initial, min });
const pool = (initial) => new SchemaField({ value: int(initial), max: int(initial) });

const abilities = () => new SchemaField(Object.fromEntries(ABILITIES.map((k) =>
  [k, new SchemaField({ value: int(0, { min: 0, max: ABILITY_MAX }) })])));

const traits = () => new SchemaField({
  physique: str(), face: str(), skin: str(), hair: str(), clothing: str(),
  virtue: str(), vice: str(), speech: str(), background: str(), misfortune: str(),
});

/** Coins fill slots unless the GM switched that off. Safe before settings exist. */
const coinsTakeSlots = () => {
  try { return game.settings.get("base-knavery", "coins-take-slots") !== false; } catch { return true; }
};

/** The level whose XP threshold `xp` has reached. */
export const levelForXp = (xp) =>
  LEVELS.reduce((lvl, row) => (xp >= row.xp ? row.level : lvl), 1);
/** XP needed for the level after `level`, or null at the top. */
export const nextLevelXp = (level) => LEVELS.find((r) => r.level === level + 1)?.xp ?? null;

/* -------------------------------------------- */
/*  Actors                                       */
/* -------------------------------------------- */

class KnaveryActorData extends foundry.abstract.TypeDataModel {
  /** Slots used by carried items, coins and wounds. Filled by the Actor document. */
  get slotsUsed() { return this.parent?.calcSlotsUsed?.() ?? 0; }
}

export class CharacterData extends KnaveryActorData {
  static defineSchema() {
    return {
      abilities: abilities(),
      hp: pool(1),
      level: int(1, { min: 1, max: MAX_LEVEL }),
      xp: int(0),
      wounds: int(0),
      coins: int(0),
      pronouns: str(),
      age: str(),
      traits: traits(),
      /** Values of career-defined feature fields, keyed `<careerKey>.<featureKey>`. */
      features: new ObjectField({ required: true, initial: {} }),
      /** Spellbooks cast since the last rest. The daily limit is INT. */
      spellsCastToday: int(0),
      acOverride: new NumberField({ required: true, nullable: true, integer: true, initial: null, min: 0 }),
      generationEnabled: bool(false),
      biography: html(),
      notes: html(),
    };
  }

  prepareDerivedData() {
    const a = this.abilities;
    this.ap = this.parent?.calcArmorPoints?.() ?? 0;
    this.acDerived = AC_BASE + this.ap;
    this.ac = this.acOverride ?? this.acDerived;
    this.acOverridden = this.acOverride !== null && this.acOverride !== this.acDerived;
    this.slotsMax = SLOT_BASE + (a.CON?.value ?? 0);
    this.coinSlots = coinsTakeSlots() ? Math.ceil(this.coins / COINS_PER_SLOT) : 0;
    this.levelFromXp = levelForXp(this.xp);
    this.nextXp = nextLevelXp(this.level);
    this.canLevelUp = this.nextXp !== null && this.xp >= this.nextXp;
    this.spellsPerDay = a.INT?.value ?? 0;
    this.dead = this.wounds >= this.slotsMax;
    for (const k of ABILITIES) a[k].defense = 11 + a[k].value;
  }
}

export class NpcData extends KnaveryActorData {
  static defineSchema() {
    return {
      role: new StringField({ required: true, initial: "monster", choices: NPC_ROLES }),
      level: int(1, { min: 0 }),
      hp: pool(4),
      /** Base AC before worn armor. Monsters carry their AC here directly. */
      armorClass: int(AC_BASE),
      morale: int(7, { max: 12 }),
      movement: str("40'"),
      numberAppearing: str(),
      attacksText: str(),
      /** Monsters use LVL on every check; people may carry real abilities. */
      useAbilities: bool(false),
      abilities: abilities(),
      coins: int(0),
      wounds: int(0),
      wage: int(0),
      pronouns: str(),
      traits: traits(),
      generationEnabled: bool(false),
      description: html(),
      notes: html(),
    };
  }

  prepareDerivedData() {
    const worn = this.parent?.calcArmorPoints?.() ?? 0;
    this.ap = Math.max(0, this.armorClass - AC_BASE) + worn;
    this.ac = this.armorClass + worn;
    this.slotsMax = this.role === "monster" ? 0 : HIRELING_SLOTS;
    this.coinSlots = coinsTakeSlots() ? Math.ceil(this.coins / COINS_PER_SLOT) : 0;
    this.dead = this.hp.value <= 0 && this.hp.max > 0;
    for (const k of ABILITIES) {
      this.abilities[k].defense = 11 + this.abilities[k].value;
    }
  }

  /** The bonus this creature adds to a check with `ability`. */
  bonusFor(ability) {
    return this.useAbilities ? (this.abilities[ability]?.value ?? 0) : this.level;
  }
}

/* -------------------------------------------- */
/*  Items                                        */
/* -------------------------------------------- */

const universal = () => ({
  description: html(),
  slots: num(1),
  quantity: int(1),
  cost: num(0),
  equipped: bool(false),
  broken: bool(false),
});

export class ItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...universal(),
      uses: new SchemaField({ value: int(0), max: int(0) }),
      /** A weightless item (a ring, a letter) takes no slot. */
      weightless: bool(false),
      /** Small items that share one slot, e.g. 10 candles or 20 arrows. */
      bundle: int(1, { min: 1 }),
      grimoire: bool(false),
    };
  }
}

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...universal(),
      damage: str("d6"),
      hands: int(1, { min: 1, max: 2 }),
      range: str(),
      /** Melee attacks roll STR, ranged roll WIS. */
      attackType: new StringField({ required: true, initial: "melee", choices: ["melee", "ranged"] }),
      /** Ammunition quantity for bows and slings, tracked on the weapon. */
      ammo: int(0),
    };
  }
}

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...universal(),
      armorType: new StringField({ required: true, initial: "other", choices: ARMOR_TYPES }),
      points: int(1, { max: MAX_ARMOR_POINTS }),
    };
  }
}

export class SpellbookData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...universal(),
      /** A scroll: anyone may cast it, once, and it does not count toward the daily limit. */
      scroll: bool(false),
      /** A chaos spellbook swaps to a new random spell at the next dawn after casting. */
      chaos: bool(false),
      castToday: bool(false),
      /** GLOG hack: bound into a grimoire (the key of the book it lives in). */
      bound: bool(false),
      boundTo: str(),
    };
  }
}

export class CareerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: html(),
      /** A short key used to namespace this career's feature values on the actor. */
      key: str(),
      source: str(),
      attribution: str(),
      /** Items granted at creation: compendium/world UUIDs or plain names. */
      startingItems: new ArrayField(str()),
      /** Extra fields this career adds to the character sheet. */
      features: new ArrayField(new SchemaField({
        key: str(),
        label: str(),
        type: new StringField({ required: true, initial: "text", choices: FEATURE_TYPES }),
        initial: str(),
        max: int(0),
        hint: str(),
      })),
    };
  }
}

export class TransportData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...universal(),
      capacity: int(0),
      crew: int(0),
      speed: str(),
    };
  }
}

export const ACTOR_DATA_MODELS = { character: CharacterData, npc: NpcData };
export const ITEM_DATA_MODELS = {
  item: ItemData,
  weapon: WeaponData,
  armor: ArmorData,
  spellbook: SpellbookData,
  career: CareerData,
  transport: TransportData,
};
