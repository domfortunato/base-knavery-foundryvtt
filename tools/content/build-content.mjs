#!/usr/bin/env node
/**
 * Generates the YAML sources in src/packs/ for every shipped compendium.
 *
 *   node tools/content/build-content.mjs
 *
 * Content policy (see LICENSE.txt): only GAME MECHANICS ship — prices, damage
 * dice, armor points, slots, monster statistics — under plain generic names.
 * No Knave 2e prose. Every Knave 2e table is a SHELL: the right name and dice
 * with one placeholder row, for the GM to fill by importing. The Knave 1e tables
 * (CC BY 4.0, credited in each) ship filled.
 *
 * IDs are derived from names, so regenerating never churns them.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const yaml = createRequire(import.meta.url)("js-yaml");
// Every document carries the key of its English name, and the items a rule reads carry their kind
// (module/keys.js): a translation may rename them, the system still finds them (2026-11-15).
import { keyOf, kindOfName } from "../../module/keys.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SYS = "systems/base-knavery";
const ICON = (n) => `${SYS}/icons/${n}.svg`;
const GI = (cat, n) => `${SYS}/art/game-icons/${cat}/${n}.svg`;
// Read from the manifest, so a release or a newly verified core build is not
// stamped into the packs with yesterday's numbers.
const MANIFEST = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
/**
 * The core version the documents claim: the OLDEST build the system supports, never the newest. Foundry
 * refuses to migrate a document stamped newer than itself, so packs stamped 14.370 filled every world
 * launch on 14.365-14.369 with migration errors (found by the 0.4.0 install test, 2026-11-15).
 */
const STATS = { coreVersion: MANIFEST.compatibility.minimum, systemId: MANIFEST.id, systemVersion: MANIFEST.version };

const id = (...parts) => {
  const h = crypto.createHash("sha1").update(parts.join("|")).digest();
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(h.subarray(0, 16), (b) => abc[b % abc.length]).join("");
};
const fileName = (name, _id) => `${name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${_id}.yml`;

const out = new Map(); // pack -> [doc]
/**
 * Top-level documents carry the defaults Foundry itself writes on the first
 * world launch (folder, sort, ownership). Without them the launch "migrates"
 * the pack, and the build guard then reads that as an edit made in Foundry.
 */
const add = (pack, doc) => {
  if (!out.has(pack)) out.set(pack, []);
  out.get(pack).push({ folder: null, sort: 0, ownership: { default: 0 }, ...doc });
};

/* -------------------------------------------- */
/*  Gear (mechanics only)                        */
/* -------------------------------------------- */

const itemDoc = (pack, name, type, img, system) => {
  const _id = id(pack, name);
  const kind = type === "item" ? kindOfName(name) : null;
  const flags = { "base-knavery": { key: keyOf(name), ...(kind ? { kind } : {}) } };
  const doc = { _id, _key: `!items!${_id}`, name, type, img, system, effects: [], flags, _stats: STATS };
  add(pack, doc);
  return doc;
};

const gear = { weapons: [], armor: [], gear: [], transport: [], clothing: [] };
const w = (name, img, system) => gear.weapons.push(itemDoc("gear", name, "weapon", img, { slots: 1, quantity: 1, ...system }));
w("One-Handed Weapon", GI("blade", "broadsword"), { damage: "d6", hands: 1, attackType: "melee", cost: 50 });
w("Two-Handed Weapon", GI("blade", "two-handed-sword"), { damage: "d8", hands: 2, slots: 2, attackType: "melee", cost: 100 });
w("Sling", ICON("weapons"), { damage: "d4", hands: 1, attackType: "ranged", range: "60'", cost: 50 });
w("Bow", ICON("weapons"), { damage: "d6", hands: 2, slots: 2, attackType: "ranged", range: "120'", cost: 100 });

const a = (name, armorType, cost) => gear.armor.push(itemDoc("gear", name, "armor", ICON("armor"), { slots: 1, quantity: 1, armorType, points: 1, cost }));
a("Shield", "shield", 100);
a("Helmet", "helmet", 100);
a("Gambeson", "gambeson", 100);
a("Mail Shirt", "mail", 200);
a("Breastplate", "breastplate", 500);
a("Arm Plate", "armPlate", 500);
a("Leg Plate", "legPlate", 500);

const g = (name, cost, extra = {}) => gear.gear.push(itemDoc("gear", name, "item", ICON(extra.icon ?? "generic-item"), {
  slots: 1, quantity: extra.quantity ?? 1, bundle: extra.bundle ?? 1, cost, ...(extra.system ?? {}),
}));
g("Common Item", 5);
g("Uncommon Item", 20);
g("Rare Item", 100);
g("Rations", 5, { quantity: 1 });
g("Rope (50')", 5);
g("Torch", 5);
g("Candles", 5, { quantity: 10, bundle: 10 });
g("Lantern", 20);
g("Oil Flask", 5);
g("Arrows", 5, { quantity: 20, bundle: 20 });
g("Sling Stones", 5, { quantity: 20, bundle: 20 });
g("Crowbar", 5, { icon: "tools" });
g("Pole (10')", 5);
g("Backpack", 5, { icon: "backpack" });
g("Sack", 5, { icon: "sack" });
g("Chalk", 5, { quantity: 10, bundle: 10 });
g("Waterskin", 5);
g("Tinderbox", 5);
g("Bedroll", 5);
g("Tent", 20);
g("Grappling Hook", 20);
g("Manacles", 20);
g("Spyglass", 100);

const t = (name, cost, capacity, extra = {}) => gear.transport.push(itemDoc("gear", name, "transport", ICON(extra.icon ?? "cart"), {
  slots: 0, quantity: 1, cost, capacity, crew: extra.crew ?? 0, speed: "",
}));
t("Poultry", 5, 0, { icon: "raven" });
t("Dog", 20, 0, { icon: "stack" });
t("Pig", 20, 0, { icon: "stack" });
t("Goat", 20, 0, { icon: "stack" });
t("Cow", 100, 0, { icon: "stack" });
t("Falcon", 1000, 0, { icon: "falcon" });
t("Mule", 30, 50, { icon: "donkey" });
t("Riding Horse", 200, 80, { icon: "horse" });
t("War Horse", 10000, 80, { icon: "horse" });
t("Cart", 50, 200, { icon: "handcart" });
t("Carriage", 320, 200, { icon: "wagon" });
t("Wagon", 120, 800, { icon: "wagon" });
t("Rowboat", 50, 320, { icon: "smallcraft" });
t("Fishing Boat", 500, 2000, { icon: "smallcraft", crew: 2 });
t("Sloop", 5000, 8000, { icon: "smallcraft", crew: 10 });
t("Caravel", 25000, 40000, { icon: "smallcraft", crew: 50 });
t("Galleon", 125000, 200000, { icon: "smallcraft", crew: 200 });

const c = (name, cost) => gear.clothing.push(itemDoc("gear", `Clothing (${name})`, "item", ICON("generic-item"), { slots: 1, quantity: 1, cost }));
c("Poor", 60);
c("Humble", 120);
c("Respectable", 240);
c("Wealthy", 600);
c("Minor Noble", 2400);
c("Major Noble", 12000);
c("Royal", 120000);

/* -------------------------------------------- */
/*  Knave 1e gear and prices (CC BY 4.0)         */
/* -------------------------------------------- */

/*
 * Knave 1.0 p3, in copper pennies, credited in every aisle (KNAVE_1E_CREDIT below), LICENSE.txt,
 * the README and the welcome window. The book's weapon lines ("Dagger, Cudgel, Sickle, Staff,
 * etc.") become one item per weapon. Slots, hands, damage and quality are the book's; armor's
 * defense 12-16 is 11 + 1-5 armor points. Most items take one slot (p2), so the rest do here.
 * The shop shows these aisles in a world on the 1e price list (rule `price-list`).
 */
const gear1e = { weapons: [], armor: [], gear: [], food: [], transport: [], clothing: [] };
const PACK_1E = "gear-1e";
const w1 = (name, img, damage, slots, hands, cost, extra = {}) => gear1e.weapons.push(itemDoc(PACK_1E, name, "weapon", img, {
  slots, quantity: 1, damage, hands, attackType: extra.ranged ? "ranged" : "melee", range: extra.range ?? "", cost, qualityMax: 3,
}));
for (const [name, img] of [["Dagger", GI("blade", "plain-dagger")], ["Cudgel", GI("weapons", "wood-club")],
  ["Sickle", GI("weapons", "scythe")], ["Staff", GI("weapons", "crescent-staff")]]) w1(name, img, "d6", 1, 1, 5);
for (const [name, img] of [["Spear", GI("weapons", "barbed-spear")], ["Sword", GI("blade", "broadsword")],
  ["Mace", GI("weapons", "mace-head")], ["Axe", GI("weapons", "war-axe")], ["Flail", GI("weapons", "flail")]]) w1(name, img, "d8", 2, 1, 10);
for (const [name, img] of [["Halberd", ICON("weapons")], ["War Hammer", ICON("weapons")],
  ["Long Sword", GI("blade", "two-handed-sword")], ["Battle Axe", GI("weapons", "battered-axe")]]) w1(name, img, "d10", 3, 2, 20);
w1("Sling", GI("weapons", "sling"), "d4", 1, 1, 5, { ranged: true });
w1("Bow", GI("weapons", "pocket-bow"), "d6", 2, 2, 15, { ranged: true });
w1("Crossbow", GI("weapons", "crossbow"), "d8", 3, 2, 60, { ranged: true });

const a1 = (name, img, armorType, points, slots, qualityMax, cost) => gear1e.armor.push(itemDoc(PACK_1E, name, "armor", img, {
  slots, quantity: 1, armorType, points, qualityMax, cost,
}));
a1("Shield", GI("shields", "shield"), "shield", 1, 1, 1, 40);
a1("Helmet", GI("armor", "visored-helm"), "helmet", 1, 1, 1, 40);
a1("Gambeson", GI("armor", "leather-vest"), "gambeson", 1, 1, 3, 60);
a1("Brigandine", GI("armor", "lamellar"), "other", 2, 2, 4, 500);
a1("Chain", GI("armor", "chain-mail"), "mail", 3, 3, 5, 1200);
a1("Half Plate", GI("armor", "breastplate"), "other", 4, 4, 6, 4000);
a1("Full Plate", GI("armor", "chest-armor"), "other", 5, 5, 7, 8000);

const g1 = (list, name, cost, extra = {}) => list.push(itemDoc(PACK_1E, name, "item", extra.img ?? ICON(extra.icon ?? "generic-item"), {
  slots: 1, quantity: extra.quantity ?? 1, bundle: extra.bundle ?? 1, cost,
}));
g1(gear1e.weapons, "Arrows (20)", 5, { img: GI("weapons", "heavy-arrow"), quantity: 20, bundle: 20 });
g1(gear1e.weapons, "Quiver", 10, { icon: "sack" });
for (const [name, cost, extra] of [
  ["Air Bladder", 5], ["Bear Trap", 20], ["Bedroll", 10], ["Bellows", 10], ["Black Grease", 1], ["Block and Tackle", 30],
  ["Book (Blank)", 300], ["Book (Reading)", 600], ["Bottle/Vial", 1], ["Bucket", 5], ["Caltrops (bag)", 10],
  ["Cards with an extra Ace", 5], ["Chain (10 ft)", 10], ["Chalk (10 pieces)", 1, { quantity: 10, bundle: 10 }], ["Chisel", 5, { icon: "tools" }],
  ["Cookpots", 10], ["Crowbar", 10, { img: GI("weapons", "crowbar") }], ["Drill", 10, { icon: "tools" }], ["Face Paint/Makeup", 10],
  ["Fake Jewels", 50], ["Fishing Rod/Tackle", 10], ["Glass Marbles (bag)", 5], ["Glue (bottle)", 1], ["Grappling Hook", 10],
  ["Hammer", 10, { icon: "tools" }], ["Holy Water", 25], ["Horn", 10], ["Hourglass", 300], ["Incense (packet)", 10], ["Iron Tongs", 10, { icon: "tools" }],
  ["Ladder (10 ft)", 10], ["Large Sponge", 5], ["Lens", 100], ["Lockpicks", 100, { icon: "tools" }], ["Manacles", 10], ["Metal File", 5, { icon: "tools" }],
  ["Mirror (small, silver)", 200], ["Musical Instrument", 200], ["Nails (12)", 5], ["Net", 10], ["Oilskin Bag", 5, { icon: "sack" }],
  ["Oilskin Trousers", 10], ["Padlock and Key", 20], ["Perfume", 50], ["Pick", 10, { icon: "tools" }], ["Pole (10 ft)", 5],
  ["Quill and Ink", 1], ["Rope (50 ft)", 10, { img: GI("tools", "rope-coil") }], ["Sack", 1, { icon: "sack" }], ["Saw", 10, { icon: "tools" }],
  ["Set of Loaded Dice", 5], ["Shovel", 10, { icon: "tools" }], ["Small Bell", 20], ["Soap", 1], ["Spike (iron)", 5], ["Spike (wood)", 1],
  ["Spiked Boots", 5], ["Spyglass", 1000], ["Tar (pot)", 10], ["Tent (3 man)", 100], ["Tent (personal)", 50], ["Twine (300 ft)", 5],
  ["Waterskin", 5], ["Whistle", 5],
  // Light (p3)
  ["Candle (4 hours)", 1, { img: GI("fire", "candle-light") }], ["Lantern", 30, { img: GI("fire", "lantern-flame") }],
  ["Lamp Oil (4 hours)", 5], ["Tinderbox", 10], ["Torch (1 hour)", 1, { img: GI("fire", "torch") }],
]) g1(gear1e.gear, name, cost, extra);
// "Rations": the sheet's rations rules find them by name (documents/actor.js isRations).
for (const [name, cost, extra] of [
  ["Rations", 5, { icon: "sack" }], ["Animal Feed (1 day)", 2], ["Bacon, side of", 10], ["Bread, 1 loaf", 1, { img: GI("food", "bread") }],
  ["Cheese, 1 lb", 2, { img: GI("food", "cheese-wedge") }], ["Cider, 4 gallons", 1], ["Cod, whole", 20], ["Eggs, 24", 1], ["Flour, 5 lbs", 1],
  ["Fruit, 1 lb", 1], ["Garlic, bunch", 1], ["Grain, 1 bushel (8 gal.)", 4], ["Herbs, 1 bunch", 1], ["Lard, 5 lbs", 1],
  ["Onions, 1 bushel", 8], ["Salt, 1 bushel", 3], ["Spices, 1 lb", 100], ["Sugar, 1 lb", 12], ["Wine/Ale, bottle", 1],
]) g1(gear1e.food, name, cost, extra);
for (const [name, cost] of [["Clothing (poor)", 10], ["Clothing (standard)", 50], ["Clothing (noble)", 3000], ["Furs", 5000], ["Winter Clothing", 100]]) {
  g1(gear1e.clothing, name, cost);
}
// Animals, transport and ships: no slots. Capacity and crew are the 2e pack's numbers for the same beasts and boats.
const t1 = (name, cost, capacity, extra = {}) => gear1e.transport.push(itemDoc(PACK_1E, name, "transport", ICON(extra.icon ?? "stack"), {
  slots: 0, quantity: 1, cost, capacity, crew: extra.crew ?? 0, speed: "",
}));
t1("Chicken", 1, 0, { icon: "raven" });
t1("Cow", 100, 0);
t1("Dog, hunting", 50, 0);
t1("Dog, small but vicious", 20, 0);
t1("Donkey/Pack Horse", 300, 50, { icon: "donkey" });
t1("Goat", 10, 0);
t1("Hawk", 1000, 0, { icon: "falcon" });
t1("Horse, riding", 1000, 80, { icon: "horse" });
t1("Horse, war", 10000, 80, { icon: "horse" });
t1("Ox", 300, 0);
t1("Pig", 30, 0);
t1("Sheep", 15, 0);
t1("Cart", 50, 200, { icon: "handcart" });
t1("Carriage", 320, 200, { icon: "wagon" });
t1("Wagon", 120, 800, { icon: "wagon" });
t1("Raft", 50, 320, { icon: "smallcraft" });
t1("Fishing Boat", 500, 2000, { icon: "smallcraft", crew: 2 });
t1("Sloop", 5000, 8000, { icon: "smallcraft", crew: 10 });
t1("Caravel", 25000, 40000, { icon: "smallcraft", crew: 50 });
t1("Galleon", 125000, 200000, { icon: "smallcraft", crew: 200 });

/** A 1e aisle: linked items, then plain rows. A `service` row only takes the coins (marketplace.js). */
const aisle1e = (name, docs, rows = []) => tableDoc("marketplace", `Market 1e: ${name}`, `1d${docs.length + rows.length}`, [
  ...docs.map((d, i) => ({
    type: "document", name: d.name, img: d.img, documentUuid: `Compendium.base-knavery.${PACK_1E}.Item.${d._id}`, range: [i + 1, i + 1],
  })),
  ...rows.map(([text, price], i) => ({
    name: text, img: "icons/svg/coins.svg", range: [docs.length + i + 1, docs.length + i + 1],
    flags: { "base-knavery": { price, service: true } },
  })),
], { img: "icons/svg/coins.svg", description: KNAVE_1E_CREDIT, flags: { "base-knavery": { market: "1e", aisle: name } } });

/* -------------------------------------------- */
/*  Careers: one worked example of a custom one  */
/* -------------------------------------------- */

{
  const _id = id("careers", "Example Career");
  add("careers", {
    _id, _key: `!items!${_id}`, name: "Example Career (duplicate me)", type: "career", img: ICON("career"),
    system: {
      description: "<p>A template for a custom career or background. Duplicate it into your world, rename it, and "
        + "edit it: the <b>starting items</b> are granted in Char Gen Mode, each <b>feature</b> becomes "
        + "a field on the character sheet, and any <b>effect</b> applies to whoever holds the career.</p>",
      key: "example",
      source: "Base Knavery",
      attribution: "",
      startingItems: ["Torch", "Rope (50')"],
      features: [
        { key: "patron", label: "Patron", type: "text", initial: "", max: 0, hint: "Who they answer to." },
        { key: "favor", label: "Favor", type: "track", initial: "1", max: 3, hint: "Spend to call on the patron." },
        { key: "sworn", label: "Sworn", type: "checkbox", initial: "false", max: 0, hint: "" },
      ],
    },
    effects: [], flags: { "base-knavery": { key: keyOf("Example Career (duplicate me)") } }, _stats: STATS,
  });
}

/* -------------------------------------------- */
/*  Marketplace aisles                           */
/* -------------------------------------------- */

const tableDoc = (pack, name, formula, results, extra = {}) => {
  const _id = id(pack, name);
  add(pack, {
    _id, _key: `!tables!${_id}`, name, img: extra.img ?? "icons/svg/d20-grey.svg", description: extra.description ?? "",
    formula, replacement: true, displayRoll: true,
    results: results.map((r, i) => {
      const rid = id(pack, name, String(i), r.name ?? "");
      return {
        _id: rid, _key: `!tables.results!${_id}.${rid}`, type: r.type ?? "text", name: r.name ?? "", description: r.description ?? "",
        img: r.img ?? null, documentUuid: r.documentUuid ?? null, weight: r.weight ?? 1, range: r.range, drawn: false,
        flags: r.flags ?? {},
      };
    }),
    flags: { ...(extra.flags ?? {}), "base-knavery": { key: keyOf(name), ...(extra.flags?.["base-knavery"] ?? {}) } },
    _stats: STATS,
  });
};

const aisle = (name, docs) => tableDoc("marketplace", `Market: ${name}`, `1d${docs.length}`, docs.map((d, i) => ({
  type: "document", name: d.name, img: d.img, documentUuid: `Compendium.base-knavery.gear.Item.${d._id}`, range: [i + 1, i + 1],
})), { img: "icons/svg/coins.svg", flags: { "base-knavery": { market: "2e", aisle: name } } });
aisle("Weapons", gear.weapons);
aisle("Armor", gear.armor);
aisle("Gear", gear.gear);
aisle("Animals & Transport", gear.transport);
aisle("Clothing", gear.clothing);

/* -------------------------------------------- */
/*  Table shells                                 */
/* -------------------------------------------- */

const PLACEHOLDER = "Empty. The Game Master fills this table: GM Dashboard → Tables → Import.";
const shell = (name, faces, formula = `1d${faces}`) => tableDoc("tables", name, formula, [{
  name: PLACEHOLDER, range: [formula.startsWith("2d6") ? 2 : 1, faces], weight: 1,
  flags: { "base-knavery": { placeholder: true } },
}], { description: `<p>${PLACEHOLDER}</p>` });
shell("Careers", 100);
shell("Spells", 100);
shell("Names", 100);
shell("Surnames", 100);
// Knave 2e's descriptive tables, filled from the GM's own PDF (rulebook-catalogue.js).
shell("Personalities", 100);
shell("Mannerisms", 100);

/*
 * The character traits of Knave's FIRST edition, which (unlike 2e) is licensed
 * CC BY 4.0: "You are free to share and adapt this material for any purpose,
 * including commercially, as long as you give attribution" (Knave 1.0, p1).
 * Shipped whole, d20 each, credited in every table, LICENSE.txt, the README
 * and the welcome window. ("Misfortunes" in the book; the sheet's trait is
 * Misfortune.)
 */
// Plain text, no link: a launch must leave pack HTML exactly as built.
const KNAVE_1E_CREDIT = "<p>From <i>Knave</i> (first edition) by Ben Milton, licensed under CC BY 4.0 "
  + "(https://creativecommons.org/licenses/by/4.0/).</p>";
const KNAVE_1E_TRAITS = {
  "Physique": ["Athletic", "Brawny", "Corpulent", "Delicate", "Gaunt", "Hulking", "Lanky", "Ripped", "Rugged", "Scrawny", "Short", "Sinewy", "Slender", "Flabby", "Statuesque", "Stout", "Tiny", "Towering", "Willowy", "Wiry"],
  "Face": ["Bloated", "Blunt", "Bony", "Chiseled", "Delicate", "Elongated", "Patrician", "Pinched", "Hawkish", "Broken", "Impish", "Narrow", "Ratlike", "Round", "Sunken", "Sharp", "Soft", "Square", "Wide", "Wolfish"],
  "Skin": ["Battle Scar", "Birthmark", "Burn Scar", "Dark", "Makeup", "Oily", "Pale", "Perfect", "Pierced", "Pockmarked", "Reeking", "Tattooed", "Rosy", "Rough", "Sallow", "Sunburned", "Tanned", "War Paint", "Weathered", "Whip Scar"],
  "Hair": ["Bald", "Braided", "Bristly", "Cropped", "Curly", "Disheveled", "Dreadlocks", "Filthy", "Frizzy", "Greased", "Limp", "Long", "Luxurious", "Mohawk", "Oily", "Ponytail", "Silky", "Topknot", "Wavy", "Wispy"],
  "Clothing": ["Antique", "Bloody", "Ceremonial", "Decorated", "Eccentric", "Elegant", "Fashionable", "Filthy", "Flamboyant", "Stained", "Foreign", "Frayed", "Frumpy", "Livery", "Oversized", "Patched", "Perfumed", "Rancid", "Torn", "Undersized"],
  "Virtue": ["Ambitious", "Cautious", "Courageous", "Courteous", "Curious", "Disciplined", "Focused", "Generous", "Gregarious", "Honest", "Honorable", "Humble", "Idealistic", "Just", "Loyal", "Merciful", "Righteous", "Serene", "Stoic", "Tolerant"],
  "Vice": ["Aggressive", "Arrogant", "Bitter", "Cowardly", "Cruel", "Deceitful", "Flippant", "Gluttonous", "Greedy", "Irascible", "Lazy", "Nervous", "Prejudiced", "Reckless", "Rude", "Suspicious", "Vain", "Vengeful", "Wasteful", "Whiny"],
  "Speech": ["Blunt", "Booming", "Breathy", "Cryptic", "Drawling", "Droning", "Flowery", "Formal", "Gravelly", "Hoarse", "Mumbling", "Precise", "Quaint", "Rambling", "Rapid-fire", "Dialect", "Slow", "Squeaky", "Stuttering", "Whispery"],
  "Background": ["Alchemist", "Beggar", "Butcher", "Burglar", "Charlatan", "Cleric", "Cook", "Cultist", "Gambler", "Herbalist", "Magician", "Mariner", "Mercenary", "Merchant", "Outlaw", "Performer", "Pickpocket", "Smuggler", "Student", "Tracker"],
  "Misfortune": ["Abandoned", "Addicted", "Blackmailed", "Condemned", "Cursed", "Defrauded", "Demoted", "Discredited", "Disowned", "Exiled", "Framed", "Haunted", "Kidnapped", "Mutilated", "Poor", "Pursued", "Rejected", "Replaced", "Robbed", "Suspected"],
};
for (const [name, rows] of Object.entries(KNAVE_1E_TRAITS)) {
  tableDoc("tables", name, "1d20", rows.map((row, i) => ({ name: row, range: [i + 1, i + 1], weight: 1 })), {
    description: KNAVE_1E_CREDIT,
  });
}

/* The rest of Knave 1e that sits with 2e without contradicting it (CC BY 4.0, as above). */
const rangeRows = (rows) => rows.map(([lo, hi, name]) => ({ name, range: [lo, hi], weight: hi - lo + 1 }));
const listRows = (names) => names.map((name, i) => ({ name, range: [i + 1, i + 1], weight: 1 }));
/**
 * Each Knave 1e row keeps its English text in `flags.base-knavery.en`: a translation (Babele) rewrites
 * the row, and the starting-gear roll still finds the item the English row names (character-generator.js).
 */
const knave1e = (name, formula, results, intro = "") =>
  tableDoc("tables", name, formula, results.map((r) => ({ ...r, flags: { ...(r.flags ?? {}), "base-knavery": { ...(r.flags?.["base-knavery"] ?? {}), en: r.name } } })),
    { description: (intro ? `<p>${intro}</p>` : "") + KNAVE_1E_CREDIT });

// Reaction, 2d6. Building Reaction from the 2e book makes a world table of the same name, which wins.
knave1e("Reaction", "2d6", rangeRows([[2, 2, "Hostile"], [3, 5, "Unfriendly"], [6, 8, "Unsure"], [9, 11, "Talkative"], [12, 12, "Helpful"]]));

// Alignment, a Knave 1e trait (2e has none; flavour only).
knave1e("Alignment", "1d20", rangeRows([[1, 5, "Law"], [6, 15, "Neutrality"], [16, 20, "Chaos"]]));

// Starting gear (the "Knave 1e starting gear" hack rolls these at creation).
knave1e("Starting Armor (Knave 1e)", "1d20", rangeRows([[1, 3, "No armor"], [4, 14, "Gambeson"], [15, 19, "Brigandine"], [20, 20, "Chain"]]));
knave1e("Helmets and Shields (Knave 1e)", "1d20", rangeRows([[1, 13, "None"], [14, 16, "Helmet"], [17, 19, "Shield"], [20, 20, "Helmet and Shield"]]));
knave1e("Dungeoneering Gear (Knave 1e)", "1d20", listRows(["Rope, 50ft", "Pulleys", "Candles, 5", "Chain, 10ft", "Chalk, 10", "Crowbar",
  "Tinderbox", "Grappling hook", "Hammer", "Waterskin", "Lantern", "Lamp oil", "Padlock", "Manacles", "Mirror", "Pole, 10ft", "Sack",
  "Tent", "Spikes, 5", "Torches, 5"]), "Roll twice on this table, and once on each General Gear table.");
knave1e("General Gear 1 (Knave 1e)", "1d20", listRows(["Air bladder", "Bear trap", "Shovel", "Bellows", "Grease", "Saw", "Bucket",
  "Caltrops", "Chisel", "Drill", "Fishing rod", "Marbles", "Glue", "Pick", "Hourglass", "Net", "Tongs", "Lockpicks", "Metal file", "Nails"]));
knave1e("General Gear 2 (Knave 1e)", "1d20", listRows(["Incense", "Sponge", "Lens", "Perfume", "Horn", "Bottle", "Soap", "Spyglass",
  "Tar pot", "Twine", "Fake jewels", "Blank book", "Card deck", "Dice set", "Cook pots", "Face paint", "Whistle", "Instrument",
  "Quill & Ink", "Small bell"]));

// Knave 1e's shop (p3), in copper: the aisles a world on the 1e price list sees. Lodging & Meals and
// Buildings are services (buying one takes the coins only) and ship hidden (user, 2026-11-14).
aisle1e("Weapons", gear1e.weapons);
aisle1e("Armor", gear1e.armor);
aisle1e("Gear", gear1e.gear);
aisle1e("Food", gear1e.food);
aisle1e("Animals & Transport", gear1e.transport, [
  ["Ship, high quality (per ton)", 720], ["Ship, good quality (per ton)", 480], ["Ship, used quality (per ton)", 240],
  ["Ship, poor quality (per ton)", 120],
]);
aisle1e("Clothing", gear1e.clothing);
aisle1e("Lodging & Meals", [], [["Bed, per night", 1], ["Private room, per night", 2], ["Meal", 2], ["Hot bath", 2], ["Stabling and fodder", 2]]);
aisle1e("Buildings", [], [
  ["Hovel", 120], ["Row House", 1200], ["Craftsman's House", 2400], ["Merchant's House", 7200], ["House with Courtyard", 21600],
  ["Guildhall", 32600], ["Stone Tower", 48000], ["Temple", 75000], ["Stronghold", 100000], ["Cathedral", 500000],
  ["Imperial Palace", 2500000],
]);

// The 100 level-less spells: the spell list until the GM builds 2e's Spells from the book, and whenever the
// "Spell list" setting says Knave 1e. Each result is the spell's name, with its effect as the description.
const KNAVE_1E_SPELLS = [
  ["Adhere", "Object is covered in extremely sticky slime."],
  ["Animate Object", "Object obeys your commands as best it can. It can walk 15ft per round."],
  ["Anthropomorphize", "A touched animal either gains human intelligence or human appearance for L days."],
  ["Arcane Eye", "You can see through a magical floating eyeball that flies around at your command."],
  ["Astral Prison", "An object is frozen in time and space within an invulnerable crystal shell."],
  ["Attract", "L+1 objects are strongly magnetically attracted to each other if they come within 10 feet."],
  ["Auditory Illusion", "You create illusory sounds that seem to come from a direction of your choice."],
  ["Babble", "A creature must loudly and clearly repeat everything you think. It is otherwise mute."],
  ["Beast Form", "You and your possessions transform into a mundane animal."],
  ["Befuddle", "L creatures of your choice are unable to form new short-term memories for the duration of the spell."],
  ["Bend Fate", "Roll L+1 d20s. Whenever you must roll a d20 after casting the spell, you must choose and then discard one of the rolled results until they are all gone."],
  ["Bird Person", "Your arms turn into huge bird wings."],
  ["Body Swap", "You switch bodies with a creature you touch. If one body dies, the other dies as well."],
  ["Catherine", "A woman wearing a blue dress appears until end of spell. She will obey polite, safe requests."],
  ["Charm", "L creatures treat you like a friend."],
  ["Command", "A creature obeys a single, three-word command that does not harm it."],
  ["Comprehend", "You become fluent in all languages."],
  ["Control Plants", "Nearby plants and trees obey you and gain the ability to move at 5 feet per round."],
  ["Control Weather", "You may alter the type of weather at will, but you do not otherwise control it."],
  ["Counterspell", "Make an opposed Intelligence save against the Intelligence of the caster of a nearby spell. You may do this out of turn as a reaction, or against an ongoing magical effect. On a success, you may cancel the spell."],
  ["Deafen", "All nearby creatures are deafened."],
  ["Detect Magic", "You hear nearby magical auras singing. Volume and harmony signify the aura’s power and refinement."],
  ["Disassemble", "Any of your body parts may be detached and reattached at will, without causing pain or damage. You can still control them."],
  ["Disguise", "You may alter the appearance of L characters at will as long as they remain humanoid. Attempts to duplicate other characters will seem uncanny."],
  ["Displace", "An object appears to be up to L×10ft from its actual position."],
  ["Earthquake", "The ground begins shaking violently. Structures may be damaged or collapse."],
  ["Elasticity", "Your body can stretch up to L×10ft."],
  ["Elemental Wall", "A straight wall of ice or fire L×40ft long and 10ft high rises from the ground."],
  ["Filch", "L visible items teleport to your hands."],
  ["Fog Cloud", "Dense fog spreads out from you."],
  ["Frenzy", "L creatures erupt in a frenzy of violence."],
  ["Gate", "A portal to a random plane opens."],
  ["Gravity Shift", "You can change the direction of gravity (for yourself only) up to once per round."],
  ["Greed", "L creatures develop an overwhelming urge to possess a visible item of your choice."],
  ["Haste", "Your movement speed is tripled."],
  ["Hatred", "L creatures develop a deep hatred of another creature or group of creatures and wish to destroy it."],
  ["Hear Whispers", "You can hear faint sounds clearly."],
  ["Hover", "An object hovers, frictionless, 2ft above the ground. It can hold up to L humanoids."],
  ["Hypnotize", "A creature enters a trance and will truthfully answer L yes or no questions you ask it."],
  ["Icy Touch", "A thick ice layer spreads across a touched surface, up to L×10ft in radius."],
  ["Illuminate", "A floating light moves as you command."],
  ["Increase Gravity", "The gravity in an area triples."],
  ["Invisible Tether", "Two objects within 10ft of each other cannot be moved more than 10ft apart."],
  ["Knock", "L nearby mundane or magical locks unlock."],
  ["Leap", "You can jump up to L×10ft in the air."],
  ["Liquid Air", "The air around you becomes swimmable."],
  ["Magic Dampener", "All nearby magical effects have their effectiveness halved."],
  ["Manse", "A sturdy, furnished cottage appears for L×12 hours. You can permit and forbid entry to it at will."],
  ["Marble Madness", "Your pockets are full of marbles, and will refill every round."],
  ["Masquerade", "L characters’ appearances and voices become identical to a touched character."],
  ["Miniaturize", "You and L other touched creatures are reduced to the size of a mouse."],
  ["Mirror Image", "L illusory duplicates of yourself appear under your control."],
  ["Mirrorwalk", "A mirror becomes a gateway to another mirror that you looked into today."],
  ["Multiarm", "You gain L extra arms."],
  ["Night Sphere", "An L×40ft wide sphere of darkness displaying the night sky appears."],
  ["Objectify", "You become any inanimate object between the size of a grand piano and an apple."],
  ["Ooze Form", "You become a living jelly."],
  ["Pacify", "L creatures have an aversion to violence."],
  ["Phantom Coach", "A ghostly coach appears until end of spell. It moves unnaturally fast over any terrain, including water."],
  ["Phobia", "L creatures become terrified of an object of your choice."],
  ["Pit", "A pit 10ft wide and L×5ft deep opens in the ground."],
  ["Primeval Surge", "An object grows to the size of an elephant. If it is an animal, it is enraged."],
  ["Psychometry", "The referee answers L yes or no questions about a touched object."],
  ["Pull", "An object of any size is pulled directly towards you with the strength of L men for one round."],
  ["Push", "An object of any size is pushed directly away from you with the strength of L men for one round."],
  ["Raise Dead", "L skeletons rise from the ground to serve you. They are incredibly stupid and can only obey simple orders."],
  ["Raise Spirit", "The spirit of a dead body manifests and will answer L questions."],
  ["Read Mind", "You can hear the surface thoughts of nearby creatures."],
  ["Repel", "L+1 objects are strongly magnetically repelled from each other if they come within 10 feet."],
  ["Scry", "You can see through the eyes of a creature you touched earlier today."],
  ["Sculpt Elements", "All inanimate material behaves like clay in your hands."],
  ["Shroud", "L creatures are invisible until they move."],
  ["Shuffle", "L creatures instantly switch places. Determine where they end up randomly."],
  ["Sleep", "L creatures fall into a light sleep."],
  ["Smoke Form", "Your body becomes living smoke."],
  ["Snail Knight", "10 minutes after casting, a knight sitting astride a giant snail rides into view. He is able to answer most questions related to quests and chivalry, and may aid you if he finds you worthy."],
  ["Sniff", "You can smell even the faintest traces of scents."],
  ["Sort", "Inanimate items sort themselves according to categories you set. The categories must be visually verifiable."],
  ["Spectacle", "A clearly unreal but impressive illusion of your choice appears, under your control. It may be up to the size of a palace and has full motion and sound."],
  ["Spellseize", "Cast this as a reaction to another spell going off to make a temporary copy of it that you can cast at any time before this spell ends."],
  ["Spider Climb", "You can climb surfaces like a spider."],
  ["Summon Cube", "Once per second, (6 times per round) you may summon or banish a 3-foot-wide cube of earth. New cubes must be affixed to the earth or to other cubes."],
  ["Swarm", "You become a swarm of crows, rats, or piranhas. You only take damage from area effects."],
  ["Telekinesis", "You may mentally move L items."],
  ["Telepathy", "L+1 creatures can hear each other’s thoughts, no matter how far apart they move."],
  ["Teleport", "An object disappears and reappears on the ground in a visible, clear area up to L×40ft away."],
  ["Thaumaturgic Anchor", "Object becomes the target of every spell cast near it."],
  ["Thicket", "A thicket of trees and dense brush up to L×40ft wide suddenly sprouts up."],
  ["Time Jump", "An object disappears as it jumps L×10 minutes into the future. When it returns, it appears in the unoccupied area nearest to where it left."],
  ["Summon Idol", "A carved stone statue the size of a four poster bed rises from the ground."],
  ["Time Rush", "Time in a 40ft bubble starts moving 10 times faster."],
  ["Time Slow", "Time in a 40ft bubble slows to 10%."],
  ["True Sight", "You see through all nearby illusions."],
  ["Upwell", "A spring of seawater appears."],
  ["Vision", "You completely control what a creature sees."],
  ["Visual Illusion", "A silent, immobile, illusion of your choice appears, up to the size of a bedroom."],
  ["Ward", "A silver circle 40ft across appears on the ground. Choose one thing that cannot cross it: Living creatures, dead creatures, projectiles or metal."],
  ["Web", "Your wrists can shoot thick webbing."],
  ["Wizard Mark", "Your finger can shoot a stream of ulfire-colored paint. This paint is only visible to you, and can be seen at any distance, even through solid objects."],
  ["X-Ray Vision", "You gain X-Ray vision."],
];
knave1e("Spells (Knave 1e)", "1d100", KNAVE_1E_SPELLS.map(([name, effect], i) => ({ name, description: effect, range: [i + 1, i + 1], weight: 1 })),
  "“L” is a number equal to the caster’s level, an item is an object able to be lifted with one hand, and an object is anything "
  + "up to human size. Unless otherwise noted, all spells with ongoing effects last up to L×10 minutes, and have a range of up to "
  + "40 feet. If a spell directly affects another creature, the creature may make a save to avoid it. Success reduces or negates "
  + "the spell’s effects.");
shell("Mishaps", 20);

/* -------------------------------------------- */
/*  Bestiary: statistics only                    */
/* -------------------------------------------- */

const MONSTER_ICON = {
  "animated armor": GI("armor", "breastplate"),
  bandit: GI("heads", "bandit"),
  basilisk: GI("creatures", "horned-reptile"),
  "black pudding": GI("creatures", "slime"),
  "blink dog": GI("mammals", "hound"),
  bugbear: GI("creatures", "brute"),
  bulette: GI("creatures", "swallower"),
  doppelganger: GI("masks", "duality-mask"),
  dragon: GI("creatures", "dragon-head-lorc"),
  "gelatinous cube": GI("creatures", "transparent-slime"),
  ghost: GI("creatures", "ghost"),
  ghoul: GI("creatures", "shambling-zombie"),
  giant: GI("creatures", "giant"),
  "giant frog": GI("creatures", "toad-teeth"),
  "giant spider": GI("insects", "long-legged-spider"),
  goblin: GI("creatures", "goblin"),
  gnoll: GI("heads", "wolf-head"),
  harpy: GI("creatures", "harpy"),
  hobgoblin: GI("heads", "goblin-head"),
  kobold: GI("creatures", "lizardman"),
  lich: GI("creatures", "grim-reaper"),
  mimic: GI("creatures", "mimic-chest"),
  ogre: GI("creatures", "ogre"),
  orc: GI("creatures", "orc-head"),
  owlbear: GI("mammals", "bear-head"),
  "purple worm": GI("creatures", "purple-tentacle"),
  "rust monster": GI("insects", "beetle-shell"),
  skeleton: GI("heads", "dead-head"),
  treant: GI("creatures", "evil-tree"),
  troll: GI("creatures", "troll"),
  vampire: GI("creatures", "vampire-dracula"),
  werewolf: GI("creatures", "werewolf"),
};
const monster = (name, ac, hp, lvl, attacks, mov, mrl, na) => {
  const _id = id("monsters", name);
  const items = attacks.map(([n, dmg], i) => {
    const iid = id("monsters", name, n, String(i));
    return {
      _id: iid, _key: `!actors.items!${_id}.${iid}`, name: n, type: "weapon", img: ICON("weapons"),
      system: { damage: dmg, attackType: "melee", slots: 0, quantity: 1, equipped: true, hands: 1, cost: 0 },
      effects: [], flags: {}, _stats: STATS,
    };
  });
  const title = name.replace(/\b\w/g, (ch) => ch.toUpperCase());
  add("monsters", {
    _id, _key: `!actors!${_id}`, name: title, type: "npc", img: MONSTER_ICON[name] ?? ICON("monster"),
    system: {
      role: "monster", level: lvl, hp: { value: hp, max: hp }, armorClass: ac, morale: mrl, movement: mov,
      numberAppearing: na, attacksText: attacks.map(([n, d, count]) => `${count ? `${count} ` : ""}${n.toLowerCase()} (${d})`).join(", "),
      description: "", notes: "",
    },
    prototypeToken: { name: title, actorLink: false, disposition: -1, texture: { src: MONSTER_ICON[name] ?? ICON("monster") }, bar1: { attribute: "hp" } },
    items, effects: [], flags: {}, _stats: STATS,
  });
};
monster("animated armor", 18, 24, 6, [["Weapon", "d8"]], "20'", 12, "d6 (0)");
monster("bandit", 13, 4, 1, [["Weapon", "d6"]], "40'", 8, "d8");
monster("basilisk", 15, 24, 6, [["Bite", "d10"]], "20'", 9, "d6 (d6)");
monster("black pudding", 13, 40, 10, [["Touch", "3d8"]], "20'", 12, "");
monster("blink dog", 14, 16, 4, [["Bite", "d6"]], "40'", 6, "d6 (d6)");
monster("bugbear", 14, 12, 3, [["Weapon", "d6"]], "30'", 9, "2d4");
monster("bulette", 19, 36, 9, [["Bite", "4d12"], ["Claw", "3d6", 2]], "50'", 11, "0 (d2)");
monster("doppelganger", 14, 16, 4, [["Bite", "d12"]], "30'", 10, "");
monster("dragon", 20, 40, 10, [["Claw", "d8", 2], ["Bite", "4d8"]], "30' (80' flying)", 10, "d4");
monster("gelatinous cube", 11, 16, 4, [["Touch", "2d4"]], "10'", 12, "");
monster("ghost", 19, 40, 10, [["Life drain", "d6"]], "30'", 10, "1 (1)");
monster("ghoul", 13, 8, 2, [["Claw", "d3", 2], ["Bite", "d3"]], "30'", 9, "d6 (2d8)");
monster("giant", 15, 32, 8, [["Weapon", "2d8"], ["Boulder", "3d6"]], "40'", 8, "d4 (2d4)");
monster("giant frog", 12, 12, 3, [["Bite", "d4"]], "30'", 6, "d4 (d4)");
monster("giant spider", 13, 12, 3, [["Bite", "d6"]], "20'", 8, "d3");
monster("goblin", 13, 4, 1, [["Weapon", "d6"]], "20'", 7, "2d4");
monster("gnoll", 14, 8, 2, [["Weapon", "2d4"]], "30'", 8, "d6");
monster("harpy", 12, 12, 3, [["Claw", "d4", 2]], "20' (50' flying)", 7, "d6 (2d4)");
monster("hobgoblin", 13, 4, 1, [["Weapon", "d8"]], "30'", 8, "d6");
monster("kobold", 12, 4, 1, [["Weapon", "d4"]], "20'", 6, "4d4");
monster("lich", 19, 44, 11, [["Touch", "d10"]], "20'", 10, "1 (1)");
monster("mimic", 13, 28, 7, [["Pseudopod", "3d4"]], "30'", 9, "1");
monster("ogre", 14, 16, 4, [["Weapon", "d10"]], "30'", 10, "d6");
monster("orc", 13, 4, 1, [["Weapon", "d6"]], "40'", 6, "2d4 (d6×10)");
monster("owlbear", 14, 20, 5, [["Claw", "d8", 2], ["Bite", "d8"]], "40'", 9, "d4 (d4)");
monster("purple worm", 13, 60, 15, [["Bite", "2d8"], ["Sting", "d8"]], "20'", 10, "d2 (d4)");
monster("rust monster", 17, 20, 5, [], "40'", 7, "d4 (d4)");
monster("skeleton", 12, 4, 1, [["Weapon", "d6"]], "20'", 12, "3d4");
monster("treant", 17, 32, 8, [["Fist", "2d6", 2]], "20'", 9, "0 (d8)");
monster("troll", 15, 28, 7, [["Claw", "d6", 2], ["Bite", "d10"]], "40'", 10, "d8 (d8)");
monster("vampire", 17, 32, 8, [["Touch", "d10"]], "40'", 11, "d4 (d6)");
monster("werewolf", 14, 18, 4, [["Bite", "2d4"]], "60'", 8, "d6");
// Hirelings (people for hire): statistics per the hiring rules.
const hireling = (name, ac, attack, dmg, mrl, wage) => {
  const _id = id("monsters", name);
  const iid = id("monsters", name, attack);
  add("monsters", {
    _id, _key: `!actors!${_id}`, name, type: "npc", img: ICON("thought-bubble"),
    system: {
      role: "hireling", level: 1, hp: { value: 3, max: 3 }, armorClass: ac, morale: mrl, movement: "40'",
      numberAppearing: "", attacksText: `${attack.toLowerCase()} (${dmg})`, wage, description: "", notes: "",
    },
    prototypeToken: { name, actorLink: false, disposition: 1, texture: { src: ICON("thought-bubble") }, bar1: { attribute: "hp" } },
    items: [{
      _id: iid, _key: `!actors.items!${_id}.${iid}`, name: attack, type: "weapon", img: ICON("weapons"),
      system: { damage: dmg, attackType: "melee", slots: 0, quantity: 1, equipped: true, hands: 1, cost: 0 },
      effects: [], flags: {}, _stats: STATS,
    }],
    effects: [], flags: {}, _stats: STATS,
  });
};
hireling("Hireling", 11, "Punch", "d2", 4, 300);
hireling("Mercenary", 15, "Weapon", "d6", 8, 600);
hireling("Expert", 11, "Punch", "d2", 7, 600);

/* -------------------------------------------- */
/*  Macros                                       */
/* -------------------------------------------- */

const macro = (name, icon, command) => {
  const _id = id("macros", name);
  add("macros", {
    _id, _key: `!macros!${_id}`, name, type: "script", img: icon, scope: "global", command,
    author: null, ownership: { default: 0 }, flags: {}, _stats: STATS,
  });
};
macro("Toggle Player Marketplace", "icons/svg/coins.svg", 'game.knavery.toggle("allow-player-marketplace");');
macro("Toggle Player Character Creation", "icons/svg/mystery-man.svg", 'game.knavery.toggle("allow-player-generate");');
macro("Toggle Player Char Gen Mode", "icons/svg/dice-target.svg", 'game.knavery.toggle("allow-player-randomization");');
macro("Toggle Player Level & XP", "icons/svg/upgrade.svg", 'game.knavery.toggle("allow-player-level-xp");');
macro("Toggle Change Log", "icons/svg/book.svg", 'game.knavery.toggle("change-log");');
macro("Game Master's Dashboard", "icons/svg/eye.svg", "game.knavery.openDashboard();");
macro("Marketplace Manager", "icons/svg/chest.svg", "game.knavery.openMarketplaceManager();");
macro("Import a Table", "icons/svg/book.svg", "game.knavery.openTableImporter();");

/* -------------------------------------------- */
/*  The guide (this project's own writing)       */
/* -------------------------------------------- */

/**
 * Each h2 gets an id, "<page>-<heading>" (the page's PAGE key, the heading's key): Foundry's
 * table of contents takes a heading's id as its anchor, so a translated heading keeps the anchor
 * the dashboard's Guide button aims at (gm-dashboard.js).
 */
const anchorHeadings = (pageKey, html) => {
  const seen = new Set();
  return html.replace(/<h2>(.*?)<\/h2>/g, (_m, inner) => {
    let slug = `${pageKey}-${keyOf(inner.replace(/<[^>]+>/g, ""))}`;
    for (let n = 2; seen.has(slug); n++) slug = `${slug.replace(/-\d+$/, "")}-${n}`;
    seen.add(slug);
    return `<h2 id="${slug}">${inner}</h2>`;
  });
};
const journal = (name, pages) => {
  const _id = id("guide", name);
  const pageKeyOf = Object.fromEntries(Object.entries(PAGE).map(([k, v]) => [v, k]));
  add("guide", {
    _id, _key: `!journal!${_id}`, name, categories: [],
    pages: pages.map(([title, raw], i) => {
      const pid = id("guide", name, title);
      const html = anchorHeadings(pageKeyOf[title] ?? keyOf(title), raw);
      // Trimmed as Foundry's StringField stores it: the template literals open with a
      // newline, and a leading newline the first world launch drops makes the pack
      // build guard report drift on every server (met on the probe fleet, 2026-11-13).
      return {
        _id: pid, _key: `!journal.pages!${_id}.${pid}`, name: title, type: "text", sort: (i + 1) * 100000,
        title: { show: true, level: 1 }, text: { format: 1, content: html.trim() }, flags: { "base-knavery": { key: keyOf(title) } }, ownership: { default: -1 },
      };
    }),
    flags: { "base-knavery": { key: keyOf(name) } }, _stats: STATS,
  });
};
/*
 * Ten pages, each titled with its reader (user decisions D6 and D7, 2026-11-14): the GM's start
 * page, the two player pages, then the GM's depth, one page per window. The titles are what the
 * in-game Guide buttons open (module/welcome.js openGuide), so a rename there is a rename here.
 */
const GUIDE_NAME = "Base Knavery Guide";
/** A content link to another Guide page by its title: the ids come from the names, so it never breaks. */
const gref = (title, text = title) =>
  `@UUID[Compendium.${MANIFEST.id}.guide.JournalEntry.${id("guide", GUIDE_NAME)}.JournalEntryPage.${id("guide", GUIDE_NAME, title)}]{${text}}`;
const PAGE = {
  start: "Start Here (GM)",
  knave: "Your Knave (players)",
  rolling: "Rolling and Fighting (players)",
  rules: "Rules: Knave, Knave 2e or a Mix (GM)",
  settings: "Settings (GM)",
  dashboard: "The Game Master's Dashboard (GM)",
  rulebook: "Your Rulebook and the Tables (GM)",
  characters: "Characters, NPCs and Monsters (GM)",
  combat: "Combat, Damage and Morale (GM)",
  items: "Items, Careers and the Marketplace (GM)",
};
journal(GUIDE_NAME, [
  [PAGE.start, `
<p>A new world plays Knave, the first edition, as written: its rules, traits, reaction, alignment, starting gear and 100 spells are built in. Knave 2e needs your own copy of the book: upload the PDF, build its tables, and the system offers to switch the rules. Any rule can be mixed. The welcome window (Settings sidebar, <b>Welcome &amp; credits</b>) says which rules this world plays.</p>
<h2>Five steps</h2>
<ol>
<li><b>Choose the rules.</b> <i>Configure Settings → Base Knavery → Configure Rules</i>: the <b>Rules</b> choice at the top sets every rule to Knave 1e or Knave 2e; change any row afterwards to mix them. See ${gref(PAGE.rules, "Rules")}.</li>
<li><b>Playing 2e? Upload the book and build its tables.</b> Click <b>Choose from this computer</b> in the welcome window, on the dashboard's <b>Tables</b> page or in <i>Configure Rulebook</i>. The review of the book's tables opens by itself: press <b>Build the ticked tables</b>, then answer <b>Switch to 2e</b>. See ${gref(PAGE.rulebook, "Your Rulebook and the Tables")}.</li>
<li><b>Set the game's options</b> in the other four windows under <i>Configure Settings → Base Knavery</i>: General, Creation, Inventory and Rulebook. See ${gref(PAGE.settings, "Settings")}.</li>
<li><b>Let players in.</b> Players click <b>Create Character</b> in the Actors sidebar for a random knave at a level you allow; a player who may not create actors has your client make it, so be logged in. A <b>Blank Sheet</b> is yours to make. See ${gref(PAGE.characters, "Characters, NPCs and Monsters")}.</li>
<li><b>Open the dashboard.</b> The big button at the top of the left toolbar opens the <b>Game Master's Dashboard</b>: Requests, Combat, Time, Party, Random, XP, Marketplace, Toggles and Tables, each a page on its rail. See ${gref(PAGE.dashboard, "The Game Master's Dashboard")}.</li>
</ol>
<h2>Where everything is</h2>
<ul>
<li><b>The left toolbar:</b> the dashboard's big button, yours only.</li>
<li><b>The Actors sidebar:</b> <b>Create Character</b> (players too, while the switch is on), <b>Create NPC</b>, the dashboard.</li>
<li><b>The Settings sidebar</b>, under Base Knavery: <b>Welcome &amp; credits</b>, <b>Rulebook</b>, <b>Game Master's Dashboard</b> and <b>Open the guide</b> (the players' way to this Guide). The <b>B</b> key opens and closes the rulebook too.</li>
<li><b>The Compendium tab</b>, folder Base Knavery: this Guide, Gear &amp; Prices for each edition, Careers, Marketplace, Tables, the Bestiary and the GM Macros.</li>
</ul>
<h2>What players see</h2>
<p>Create Character while you allow it, their own sheet with its Attack window, Rest and the marketplace, your roll requests, other players' item offers, your rulebook while <b>Players may read it</b> is on, and two pages of this Guide: ${gref(PAGE.knave, "Your Knave")} and ${gref(PAGE.rolling, "Rolling and Fighting")}. Never the welcome window unasked, the dashboard, Create NPC or the Bestiary. Four switches on the dashboard's <b>Toggles</b> page set what else they may do: the marketplace, character creation, Char Gen Mode, and changing level and XP.</p>
<h2>Shortcuts</h2>
<p>The <b>GM Macros</b> compendium holds eight macros to drag to the hotbar: the four player switches and the change log, the dashboard, the Marketplace Manager and Import a Table. Anyone can drag a weapon or a spellbook from a sheet to the hotbar to attack or cast with it.</p>

<p>The Marketplace Manager macro opens the dashboard's <b>Marketplace</b> page; the manager has no window of its own any more.</p>
`],
  [PAGE.knave, `
<p>Your sheet has four pages on a thumb rail at the window's edge, <b>Knave</b>, <b>Inventory</b>, <b>Growth</b> and <b>Description</b>, with an <b>Attack</b> button under them. Pop Out and Print are the icons in the title bar. Drag a weapon or a spellbook to Foundry's hotbar to attack or cast from there.</p>
<h2>Create Character</h2>
<p>In the Actors sidebar, click <b>Create Character</b>. Type a name or leave it blank for a random one, choose a level from the range the Game Master allows, and press <b>Randomly Generated</b>. Under Knave 2e you may first tick <b>Place the 3 ability points myself</b>; otherwise 3d6 place them. Under Knave 1e a window shows your six scores, each the lowest of 3d6, and lets you <b>Swap</b> two; then <b>Choose your weapon</b>. A whispered card lists every roll. If you may not create actors, the GM's client makes the character for you, so the GM must be online.</p>
<h2>The Knave page</h2>
<ul>
<li><b>Portrait:</b> click it to choose one from the galleries. <b>Name</b> and <b>Pronouns</b> beside it; <b>Alignment</b> and <b>Background</b> when the GM shows them; under Knave 2e your two <b>Careers</b>.</li>
<li><b>Abilities:</b> click the d20 by an ability to roll a check. The big number is the bonus, the small one its defense, 11 + bonus; the line under each says what it is for.</li>
<li><b>Level, XP and Coins</b> under the abilities, with the XP bar.</li>
<li><b>AC</b> in the shield: 11 + the armor points of your equipped armor. Type a number to override it; the arrow goes back to the armor.</li>
<li><b>HP</b> and, under Knave 2e, <b>Wounds</b> as bars with − and +. <b>Slots</b> under them: 10 + CON; coins and wounds take slots too.</li>
<li><b>Attack</b>, <b>Rest</b> and <b>Die of Fate</b>: see ${gref(PAGE.rolling, "Rolling and Fighting")}.</li>
</ul>
<h2>Inventory</h2>
<p>One row per item: its slot number, a badge for weapons, armor, spellbooks, scrolls, magic items, relics and potions, the name (bold means equipped; click it for the description) and its tags. The icons on the right: − and + for a stack, a d20 to attack with an equipped weapon, a hand to cast, a flame to <b>light</b> a torch, candle or lantern, a fist to equip, a hammer to repair, coins to <b>sell</b> (half the price; treasure in full), an open hand to <b>give</b> the item away, then edit and delete. Drag rows to reorder them. Coin and wound slots sit at the bottom: wounds fill slots from the bottom up, and an item in a wounded slot is <b>Unusable</b> until the wound heals. <b>Add item</b> makes a blank one. <b>Marketplace</b> opens the shop while the GM allows it: <b>Buy</b> takes the coins; <b>Take</b> is free in Char Gen Mode.</p>
<p><b>Giving:</b> choose who gets it and a card appears in chat; its owner presses <b>Accept</b> or <b>Decline</b>. No GM is needed. Dropping an item on another player's sheet offers it the same way.</p>
<h2>Spellbooks and scrolls</h2>
<p>Cast from the row. Knave 2e: as many spellbooks a day as your INT, each once; the Inventory's strip counts <b>Spells left today</b>. Knave 1e: each book once a day, no total. A scroll is cast once by anyone, does not count, and crumbles. The card gives the spell's level: your INT (2e) or your level, L (1e).</p>
<h2>Growth</h2>
<p>The XP bar, what the next level brings, the ladder of levels and titles, your careers (2e), and notes the GM writes for you. When your XP reaches the next level and Char Gen Mode is on, an up arrow in the title bar and a <b>Level Up</b> button open the level-up window: tick three different abilities or press <b>Random</b>; max HP follows the GM's rule.</p>
<h2>Description</h2>
<p>Your traits: Knave 2e's (Personality, Mannerism) when the GM's book is in, and Knave's (Physique to Misfortune). A <b>Backstory</b> with a counter that guides you to 35 words, never a limit. <b>Notes</b>.</p>
<h2>Char Gen Mode</h2>
<p>The toggle in the title bar, while the GM allows it. On, dice and pick-lists appear by the portrait, name, traits, careers, max HP and coins; <b>Roll Character</b> rerolls everything; the abilities can be typed, within the level's points (3 at level 1 and 3 more a level, no score above level + 2; Knave 1e's rolled scores are capped at 6 + one a level); level and XP too, if the GM allows; the marketplace offers <b>Take</b>. Careers change only at level 1, two at most.</p>

<p><b>Print</b> makes a one-page sheet, for A4 or Letter paper.</p>
`],
  [PAGE.rolling, `
<p>Every check, save and attack opens the same small window first: <b>Roll with Disadvantage</b>, <b>Straight Roll</b> or <b>Roll with Advantage</b>. Hover a button to see what it does in this world: +5 or −5 to the roll (Knave 2e), or two d20s keeping the higher or lower (Knave 1e).</p>
<h2>Checks</h2>
<p>Click the d20 by an ability. The target is 11 + <b>Difficulty</b>; 5 is the usual difficulty, so 16. The card says <b>Success</b> or <b>Failure</b>. A save is the matching ability's check; the Game Master asks for it.</p>
<h2>The Game Master's requests</h2>
<p>When the GM asks for a roll, your window opens by itself with the reason, the difficulty filled in and, if the GM set the edge, one button only ("The GM set this roll"). A request to <b>Generate a spell</b> opens a window instead: a rolled formula and its words; roll one word again if you like, adjust the name, then <b>Add as a spellbook</b>. Its effect is yours and the GM's to agree.</p>
<h2>The Attack window</h2>
<p>Press <b>Attack</b> on the Knave page or the rail. Choose a <b>Weapon</b>: your equipped weapons, or <b>Improvised</b> (a fist or a rock: d4 with STR, no slot, nothing to break). Choose a <b>Target</b>: the tokens you can see, nearest first; your own targets when you have several; or no target. <b>Hide other player characters</b> keeps your friends out of the list. <b>Roll damage at the same time</b> puts the damage on the same card. Melee rolls d20 + STR, ranged d20 + WIS.</p>
<h2>Reading the card</h2>
<ul>
<li>Each target reads <b>Hit</b> or <b>Miss</b>, and the chosen token becomes your target on the map.</li>
<li>Knave 2e: 21 or more also earns a free maneuver. A natural 1 breaks the weapon when the GM's switch says so. Tick <b>Power attack</b> in the Attack window before the roll (a melee weapon, Knave 2e): the damage dice are doubled and the weapon breaks.</li>
<li>Knave 1e: a natural 20 rolls one more damage die and puts a <b>Wear armor</b> button on the card for the target's owner, who picks the piece that loses a point of quality. A natural 1 costs your weapon a point; at 0 it is Broken. A hit must beat the armor defense, not equal it.</li>
<li><b>Damage</b> under the roll, with <b>Apply</b> (and <b>Direct</b> under Knave 2e) for you and the GM: it goes to the targets hit, else to your targeted or selected tokens. <b>Roll damage</b> appears when you did not roll it at once.</li>
</ul>
<h2>Damage, wounds and death</h2>
<p>Damage comes off HP first. Under Knave 2e, each point past 0 fills a slot with a wound, from the bottom of the Inventory up: empty slots, then coin slots, then the lowest item, which is <b>Unusable</b> until the wound heals (whether it was dropped or broken is the table's call). Every slot wounded is death. Direct damage skips HP. Under Knave 1e there are no wounds: at 0 HP you are unconscious, at −1 dead.</p>
<h2>Rest</h2>
<p>Press <b>Rest</b> and tick what is true: <b>Slept two watches</b>, <b>Ate a meal the night before</b>, <b>In a safe haven</b>. Knave 2e: sleep and a meal bring HP back to full, and a safe haven heals one wound too. Knave 1e: a night's rest after a meal heals d8 + CON; a safe haven, all HP. Spellbooks are ready again either way, and a card says what happened. The meal eats one ration from your Inventory.</p>
<h2>Casting</h2>
<p>The hand on a spellbook's row. Knave 2e: as many books a day as your INT, each once, cast at your INT. Knave 1e: each book once a day, no total; L is your level. A scroll is cast by anyone, once, and crumbles. Under Knave 2e choose the spell's level, 1 up to your INT, and every cast card carries the <b>Save</b> line.</p>
<h2>Die of Fate</h2>
<p>A d6 for when fate, not skill, decides. Anyone can roll it from any sheet.</p>`],
  [PAGE.rules, `
<p><i>Configure Settings → Base Knavery → Configure Rules</i>. Each rule is its own setting, under the headings below. The <b>Rules</b> choice at the top sets them all to Knave 1e or Knave 2e, and reads <i>Custom (a mix)</i> once they differ. Change any row to mix the editions; nothing on an existing character changes. "Knave 1e" here is the first edition, whose title is simply Knave.</p>
<h2>Creation</h2>
<ul>
<li><b>Abilities at creation.</b> Knave 1e: each is the lowest of 3d6, rolled in order, and the player may swap two. Knave 2e: 3 points, rolled by 3d6 or placed.</li>
<li><b>Starting kit.</b> Knave 1e: rolled armor and gear, two rations and a weapon of the player's choice; no coins, no spellbook. Knave 2e: two careers and their items, 3d6 × 10 coins, rations, rope and torches, and a random spellbook per point of INT. <i>Knave 2e careers + Knave 1e gear</i> adds the 1e gear tables to the careers. A 2e kit with a missile weapon also gets a quiver of 20 arrows.</li>
<li><b>Alignment</b> and <b>Background</b> (Knave 1e traits). On, each shows on the Knave page under the pronouns and is rolled for new characters; off, hidden and never rolled.</li>
</ul>
<h2>Hit points</h2>
<ul>
<li><b>First-level HP.</b> Knave 1e: 1d8. Knave 2e: 1d6. Or 1d4 + 2, a house rule. Under a reroll rule it is also the first die of every reroll.</li>
<li><b>HP at each level.</b> Knave 1e: roll one d8 per level; below the old maximum, the maximum goes up by one instead. Knave 2e: reroll one d6 per level; not above the old maximum, up by one. Or add 1d6; or reroll and keep the higher.</li>
</ul>
<h2>Death and healing</h2>
<ul>
<li><b>Death.</b> Knave 1e: unconscious at 0 HP, dead at −1, no wounds. Knave 2e: damage past 0 HP fills slots with wounds; every slot wounded is death.</li>
<li><b>Hard-mode wounds</b> (a hack, off in both editions): an item in a wounded slot breaks instead of being Unusable until the wound heals.</li>
<li><b>Healing.</b> Knave 1e: a night's rest after a meal heals d8 + CON; a safe haven restores all HP. Knave 2e: full HP after two watches of sleep and a meal; a safe haven heals one wound.</li>
</ul>
<h2>Spells</h2>
<ul>
<li><b>Spells per day.</b> Knave 1e: any number of spellbooks a day, each once, cast at the caster's level (L). Knave 2e: as many as INT, each once.</li>
<li><b>Spell list.</b> Knave 1e's 100 level-less spells ship with the system. <i>Your Spells table, else Knave 1e</i> draws random spellbooks from your own Spells table once it has rows; <i>Knave 1e's 100 spells, always</i> keeps to the first edition.</li>
</ul>
<h2>Combat</h2>
<ul>
<li><b>Attacks.</b> Knave 1e: weapons have 3 quality, armor 1 to 7. A natural 20 adds one damage die, and the card's <i>Wear armor</i> button lets the target's owner pick the piece that loses a point; a natural 1 costs the weapon a point. At 0 the item is destroyed (marked Broken); Repair costs 10% of its price a point. No power attack, no free maneuver. Knave 2e: a power attack doubles the damage dice and breaks the weapon, and 21 or more earns a free maneuver. Under Knave 1e a hit must beat the armor defense; under Knave 2e it equals or exceeds AC.</li>
<li><b>A natural 1 breaks the weapon.</b> Knave 2e attacks only; under Knave 1e a 1 costs quality. Off, a 1 is just a miss.</li>
<li><b>Initiative</b>, a choice. Knave 1e: you roll one d6 at the start of each round, 1–3 the enemies act first, 4–6 the player characters (characters, players' tokens and friendly tokens). Knave 2e: one CHA check between the sides' leaders decides who acts first, and the order holds for the fight. Individual: Foundry's own tracker rolls d20 + CHA per token.</li>

<li><b>Advantage and disadvantage.</b> Knave 1e: two d20s, keep the higher or lower. Knave 2e: +5 or −5.</li>


</ul>
<h2>Money</h2>
<ul>
<li><b>Prices and wages.</b> Knave 1e: the copper price list (the <i>Gear &amp; Prices (Knave 1e)</i> compendium and its "Market 1e" aisles) and henchmen paid by the day; Lodging &amp; Meals and Buildings are service aisles, hidden until you show them, whose rows only take the coins. Knave 2e: its prices and monthly wages.</li>
<li><b>Coins per slot.</b> Knave 1e: 100. Knave 2e: 500. Only while <i>Coins take slots</i> (Configure Inventory) is on.</li>
</ul>
<h2>Advancement</h2>
<ul>
<li><b>Knave 1e XP: a level every 1,000.</b> Off, Knave 2e's XP table: 2,000, 4,000, 8,000 and doubling.</li>
<li><b>XP for treasure.</b> Knave 1e: off, XP comes from deeds; its designer's note allows XP for gold, 1 XP per 100 copper, and choosing that still plays Knave 1e. Knave 2e: 1 XP per coin of treasure brought back. Awarded on the dashboard's XP page.</li>
</ul>
<h2>Old worlds and the switch</h2>
<p>A world made before version 0.2.0 kept the Knave 2e rules it played: at the first Game Master login, every rule it never set was written with its 2e value, and a rule added later takes the edition the others play. When you build tables from your Knave 2e book, the system asks whether to switch the world to Knave 2e rules. Switching never changes a character you already have.</p>
<p><i>Knave 1e's rules are from Knave (first edition) by Ben Milton, CC BY 4.0, adapted here as automation and settings.</i></p>`],
  [PAGE.settings, `
<p><i>Configure Settings → Base Knavery</i> has six buttons: <b>Configure General</b>, <b>Configure Creation</b>, <b>Configure Inventory</b>, <b>Configure Rules</b> (${gref(PAGE.rules, "its own page")}), <b>Configure Rulebook</b> and <b>Configure Printing</b>. Each window scrolls its rows under a <b>Save</b> that stays in reach; <b>Reset Defaults</b> puts every row back. The settings are the world's: players share them.</p>
<h2>Configure General</h2>
<ul>
<li><b>Roll damage with every attack:</b> pre-ticks <i>Roll damage at the same time</i> in the Attack window.</li>
<li><b>Show traits:</b> the traits block on the Description page.</li>
<li><b>Change log:</b> whispers you, and whoever else may observe the sheet, a card when someone edits it by hand: name, HP, coins, XP, level, wounds, AC, pronouns and abilities, items added, removed, counted or equipped. The system's own actions stay silent; Rest, Level Up and Heal Wound name themselves.</li>
<li><b>Welcome window on start:</b> opens for the Game Master at every login and refresh. Players never see it unasked.</li>
</ul>

<p><i>Advantage and disadvantage</i> lives in Configure Rules, under Combat, with an edition value.</p>

<h2>Configure Creation</h2>
<ul>
<li><b>Players may create characters:</b> shows Create Character to players. Off, only you make them.</li>
<li><b>Players may use Char Gen Mode:</b> the title-bar toggle on their sheets, with its dice and pick-lists, editable abilities, Roll Character and Level Up.</li>
<li><b>Players may change level &amp; XP:</b> in Char Gen Mode. Off, only you may; Level Up still works.</li>
<li><b>Lowest</b> and <b>Highest starting level:</b> the levels Create Character offers.</li>
<li><b>Your portrait folder:</b> a folder in your user data (<code>knavery-portraits</code> unless you change it). Its images come first in the portrait picker and in random portraits; <b>Rescan folder</b> on the picker's Yours tab after adding files, and players see the list you scanned.</li>
</ul>
<h2>Configure Inventory</h2>
<ul>
<li><b>Players may use the marketplace:</b> the Marketplace button on character sheets, and selling.</li>
<li><b>Coins take slots:</b> as many to a slot as <i>Coins per slot</i> (Rules) says.</li>
<li><b>Hacks:</b> <b>Rations per slot</b> (1 to 10) and <b>Torches per slot</b> (1 to 5). Both books put a day's rations and one torch in a slot. Set a number and every item named Rations or Torch shares a slot that many at a time, with − and + on its row. Knave 1e's gear table hands out torches in fives: set Torches per slot to 5 to keep them in one slot. Candles and arrows keep their own bundles, 10 and 20 to a slot.</li>
</ul>
<h2>Configure Rulebook</h2>
<ul>
<li><b>Your rulebook PDF:</b> <b>Choose from this computer</b> uploads your copy to the server's <code>knavery-rulebook</code> folder; the folder button picks a PDF already on the server. Only the path is stored; anyone logged in who knows the address can fetch the file.</li>
<li><b>Players may read it:</b> players get the reader and you can show them a page. Off hides the reader; the file stays reachable.</li>
<li><b>Page offset:</b> PDF page minus printed page. In the Knave 2e PDF, printed page 1 is PDF page 7, so 6.</li>
<li><b>Build tables from the book</b> is here too. See ${gref(PAGE.rulebook, "Your Rulebook and the Tables")}.</li>
</ul>
<h2>Configure Printing</h2>
<ul>
<li><b>Paper:</b> Auto, A4 or Letter.</li>
<li><b>Text size</b> of the printed sheet.</li>
<li>Whether <b>career features</b>, the <b>backstory</b> and the <b>notes lines</b> print.</li>
</ul>
<p>The sheet is one page at every setting.</p>`],
  [PAGE.dashboard, `
<p>Open it from the big button at the top of the left toolbar, the Actors sidebar, the Settings sidebar or the <i>Game Master's Dashboard</i> macro. Its pages sit on a thumb rail off the window's edge, the title bar names the open page, and the rail's last button opens this Guide.</p>
<h2>Requests</h2>
<p>Ask the players for a roll. Tick <b>Who</b> (<b>All</b> ticks everyone), choose the <b>Roll</b> (an ability check, a save or <b>Generate a spell</b>), the <b>Edge</b> (the player chooses, or Disadvantage, Normal or Advantage), the <b>Difficulty</b> (the target shows beside it, 11 + difficulty, with a short guide under it) and <b>Why</b>, the words the players see. <b>Ask for the roll</b> posts a card and opens each player's roll window with the difficulty filled in. <b>Results</b> lists every character's state: waiting, offline, or the total with a tick or a cross. The d20 beside a waiting or offline name rolls it for them from your client.</p>
<p><b>Generate a spell</b> (Knave 2e p27): choose the characters, add a reason if you like, and send. Each player's window shows the rolled spell; they may roll one word again and adjust the wording, then <b>Add as a spellbook</b>. Its effect is left for the player and the GM to agree. A player who is away can have you generate it from the request's result line. The six tables (Spell Formulae, Wizard Names, Qualities, Effects, Elements, Forms) are Knave 2e text, so they do not ship: build them from your PDF, or import them by name.</p>
<h2>Combat</h2>
<p>The damage box: a dice formula under <b>Damage</b>, a <b>Source</b> the card names, <b>Direct</b> (skips HP; a creature takes it tripled), and <b>Apply to</b> the selected tokens, the targeted tokens or the characters you tick. <b>Roll and apply</b> rolls once and applies the total to each.</p>

<p>Above it, the fight: the round and the acting side, <b>Roll initiative</b> by the edition's rule, <b>Next side</b>, <b>Surprise</b> with its result buttons, the leaders' two choices (<b>Party's leader</b>, <b>Enemies' leader</b>, or <i>Pick for me</i>), <b>Mark defeated</b> and <b>Morale</b> for the selected tokens, and <b>Rally</b> (Knave 2e). See ${gref(PAGE.combat, "Combat, Damage and Morale")}.</p>

<p>Hazard presets (Knave 2e p21: falling, fire, on fire, freezing, lightning) fill the formula and Direct for you.</p>
<h2>Time</h2>
<p>Choose <b>Dungeon: 10-minute turns</b> or <b>Travel: 4-hour watches</b>. <b>End the turn</b> (or <b>End the watch</b>) moves the world clock on and rolls the hazard die; the line above counts the turn, or the day, its watch of six and the watches travelled today. <b>Roll the hazard die only</b> leaves the clock alone; <b>Start again</b> resets the count. Tick <b>The party is resting</b> and fatigue is ignored; untick <b>Travelling this watch</b> for a watch in camp. More than three watches of travel in a day adds the forced-march note to the card: 1 direct damage unless a CON check is passed.</p>
<p>The hazard card is whispered to you with the face and what it means. Three faces carry a button, and nothing on a sheet changes until you click it. <b>Deal the fatigue</b> lists the party (every character a player owns) so you can untick whoever rests, then deals 1 damage to the others. <b>Burn out the lit torches</b> uses up one torch from each lit stack and puts it out. <b>Roll for spoiled rations</b> rolls a d6 per ration and each 1 spoils. A second press asks first. Encounters, shifts and signs are yours to play out; the Dice page helps.</p>
<p><b>Forage</b> (Knave 2e p8) spends a watch on a WIS check for d6 rations; the watch then ends and the hazard die rolls.</p>
<p><b>Wages</b> lists every hireling with a wage, who employs them and when it is due: a month is 30 days of the world clock, and a Knave 1e henchman is owed by the day. <b>Pay</b> takes the coins from the employer named on the hireling's sheet and moves the due date on, settling every day owed.</p>
<h2>Party</h2>
<p>Every player character at a glance: HP (and whether they are unconscious or dead), wounds, slots used, coins, their lights and which are lit, and the spellbooks still ready today. Click a name to open the sheet.</p>
<h2>Dice</h2>
<p>Rolls for you, whispered. <b>Hazard dice</b>: the dungeon and travel dice alone, without moving the clock. <b>Encounters</b>: <b>Reaction (2d6)</b> on your Reaction table (Knave 1e's ships; one built from the 2e book wins), <b>Activity</b>, <b>Surprise</b> (sets up the closest PC's WIS check on Requests: tick that PC, type the closest creature's WIS as the difficulty and send; a win by 5 or more surprises), the encounter <b>Distance</b> in a dungeon or the wilderness, and <b>Morale: selected</b> for the NPC tokens you have selected. <b>Events</b>: weather, travel and delve shifts, signs, city events and disasters. <b>On the fly</b>: a <b>Monster</b>, and a quick <b>NPC</b> (a name, personality, profession and detail in one card). <b>Downtime</b>: a carousing mishap. A table's button stays off until the table exists: build it from your Knave 2e book or import it by name.</p>

<p><b>Carousing</b> (Knave 2e p52) is a window: the cost by settlement size, XP equal to the coins spent, the morning's CON check and the mishap on a failure.</p>

<h2>XP</h2>
<p>Choose <b>How</b>: the same amount to each, a different amount to each (a box per character), a total split evenly, or, when the Rules give XP for treasure, <b>Treasure brought back</b>. Tick the characters and press <b>Award XP</b>; a card lists the awards. Treasure mode lists the treasure the ticked characters carry, each item once, adds the coins you type and splits the XP evenly; a companion of one of them takes a half share, noted on the card. See ${gref(PAGE.items, "Items, Careers and the Marketplace")}.</p>

<h2>Marketplace</h2>
<p>Your side of the shop: the aisles, <b>Customize</b>, prices, stock and hiding, as ${gref(PAGE.items, "Items, Careers and the Marketplace")} describes.</p>

<h2>Toggles</h2>
<p>Live switches, the same the macros flip: the player marketplace, player character creation, player Char Gen Mode, players changing level &amp; XP, and the change log.</p>

<p>Also here: <b>Players may read the rulebook</b>.</p>

<p>One switch per portrait gallery (Yours, Portraits by Aspeheim, Lydia Comer, Tlomdev, Icons): a gallery that is off leaves the portrait picker and the random portraits. <b>Random portraits from</b>: any gallery that is on, or one named gallery, with the Yours folder's path and a Rescan beside it. Random monster portraits come from Lydia Comer's monsters, Tlomdev's creatures and your folder, whichever are on.</p>
<h2>Tables</h2>
<p>Every table the system rolls on and every world table: its name, <i>shell</i> or <i>world</i>, its row count, a book icon that opens your rulebook at its page, a d20 that rolls it and an import icon that opens the importer at its name. <b>Import a table</b> at the top opens the importer blank. The <b>Rulebook</b> row: a page number with <b>Open</b> and <b>Show this page to players</b>, and <b>Build tables from the book</b>; without a PDF, <b>Choose from this computer</b>. See ${gref(PAGE.rulebook, "Your Rulebook and the Tables")}.</p>`],
  [PAGE.rulebook, `
<p>Base Knavery opens <b>your own copy</b> of the Knave 2e PDF inside Foundry and builds its tables from it. The system stores only where the file is.</p>
<h2>Reading the book</h2>
<ol>
<li>Click <b>Choose from this computer</b>: in the welcome window, on the dashboard's <b>Tables</b> page, or in <i>Configure Rulebook</i>.</li>
<li>Pick your PDF in your computer's file dialog. It is uploaded to the server's <code>knavery-rulebook</code> folder and opens, and the review of its tables follows. (The folder button in Configure Rulebook picks a PDF already on the server.)</li>
<li>Press <b>B</b>, or use <b>Rulebook</b> in the Settings sidebar, to open or close it. The reader is Foundry's own PDF viewer; <b>Open in a new tab</b> is on its title bar.</li>
</ol>
<p>On the dashboard's <b>Tables</b> page, a book icon beside a table opens the rulebook at its page; the table importer offers the page too. Tick <b>Players may read it</b> (Configure Rulebook) to let players open the reader. Then <b>Show to players</b>, on the reader's title bar or the Tables page, opens the same page for everyone connected.</p>
<p>Page numbers are the book's printed pages. If your PDF numbers its pages differently, change <b>Page offset</b>: PDF page minus printed page. A PDF with another page count than the 88-page edition warns you once.</p>
<h2>Tables from the book</h2>
<p><b>Build tables from the book</b> (on the dashboard's <b>Tables</b> page, in Configure Rulebook, and right after you choose your PDF) reads every table in your copy: careers, spells, names, surnames, reaction and some seventy more, from weather to weaknesses. A review lists them with their rows, the ones the system itself rolls on first: open one to correct a line (one row per line, as the importer reads them), untick any you do not want, then <b>Build the ticked tables</b>.</p>
<p>They become world roll tables in a <i>From your rulebook</i> folder. The system rolls on Careers, Spells, Names, Surnames and Reaction at once, since a world table wins over the shipped one by name. The Spells table also makes a spellbook and a spell scroll for each spell, with its effect, in a world compendium <i>Spells (from your rulebook)</i>, and links its rows to the books, so a random character gets the real item.</p>
<p>Building again replaces only the tables it built that you have not changed. A table you made, imported or edited yourself is kept and listed; delete or rename it to rebuild it from the book. The spell items follow the same rule. When the build is done, the system asks whether to switch the world to Knave 2e rules.</p>
<h2>The table importer</h2>
<p><b>Import a table</b>: on the Tables page, from the import icon on a row, or the macro. Name the table, choose <b>Replace the rows</b> or <b>Add to the end</b>, leave <b>Dice</b> blank to have it worked out from the rows, and paste one row per line:</p>
<ul>
<li><code>01-05 Some text</code>: a range (<code>00</code> reads as 100).</li>
<li><code>7. Some text</code>, <code>7) Some text</code> or <code>7 Some text</code>: a single number.</li>
<li><code>| 3 | Some text |</code>: a pasted Markdown table row; a row copied from a spreadsheet (number, tab, text) works too.</li>
<li>Plain lines are numbered in order.</li>
<li><code>@UUID[Item.abc]{Name}</code> links a document, such as a career item or a spellbook.</li>
</ul>
<p><b>Careers</b> rows written <code>Name: item, item, item</code> become careers with those starting items; item names that match gear in the compendia arrive with their real statistics. A plain <b>Spells</b> row becomes a spellbook when a character is rolled; the book build makes the real spellbooks and scrolls. While the name field names a table the book has, the importer says which page it is on and opens the reader there.</p>
<h2>What ships, and what is yours</h2>
<p>A world table always wins over the shipped table of the same name. From Knave's first edition, filled: Reaction, Alignment, the ten traits (Physique, Face, Skin, Hair, Clothing, Virtue, Vice, Speech, Background, Misfortune), the five starting-gear tables and <i>Spells (Knave 1e)</i>, the 100 level-less spells. Empty shells, for Knave 2e: Careers, Spells, Names, Surnames, Personalities, Mannerisms and Mishaps; Surname Endings is read when a world has it. The first-edition tables are from <i>Knave</i> by Ben Milton, CC BY 4.0, credited in each.</p>`],
  [PAGE.characters, `
<p><b>Create Character</b> and <b>Create NPC</b> are in the Actors sidebar. Players see Create Character while <i>Players may create characters</i> is on; Create NPC is yours.</p>
<h2>Player characters</h2>
<p>A player's Create Character makes a random knave at a level between your lowest and highest starting levels. A player who may not create actors sends the request to your client, which creates the actor, gives them ownership and opens it for them; you must be logged in, and the request is answered once, made or refused. The <b>Blank Sheet</b> tile is yours: an empty sheet with its traits rolled, to build by hand in Char Gen Mode. <b>Roll Character</b> on a sheet in Char Gen Mode rerolls it from scratch.</p>
<p>Char Gen Mode from your side: your toggle works on any sheet whatever the players' switch says. With it on, the abilities hold to the level's points for you too (3 at level 1 and 3 more a level, no score above level + 2; under Knave 1e's rolled scores only the cap); with it off you type any score. Careers change at level 1 for players and at any level for you, two at most, and the marketplace's <b>Take</b> gives gear for free. You may add a third career (Knave 2e's career training); the limit holds for players.</p>
<h2>Create NPC</h2>
<p>Four tiles. <b>Monster</b>: one from the bestiary (or <i>Random</i>), with its HP rolled, a d8 per level or level × 4, and a whispered card with the roll. <b>Person</b>: someone met on the road, with a random name, traits and portrait, on the hireling's line (AC 11, HP 3, level 1). <b>Hireling</b>: a hireling (300c a month), mercenary (600c) or expert (600, 1,200 or 2,400c) with the book's AC, morale and attack; on Knave 1e's price list, the ten henchmen at their daily wages in copper, laborer to knight. Name it or leave the name blank.</p>
<p><b>Companion</b> (Knave 2e p53, p59) makes an NPC with the Companion role and the knave it follows: no morale tests, and a half share when treasure XP is awarded on the XP page.</p>
<p><b>Create Item</b>, in the Items directory's header and on the dashboard's Marketplace page: pick the kind (weapon, armor, gear or tool, potion, relic, spellbook, chaos spellbook) and the fields are pre-filled for it (the damage die by hands and reach, slots, a price band, 1e quality, the badge). A Roll beside the name and the effect draws on your built tables (Potions, Textures, Tastes, Colors, Ingredients, Tools, Miscellaneous Items, Books, Clothing Items, Treasures, Materials, Weapons, Item Traits, Domains, Symbols, the spell formulae); a table you have not built yet says so in the Roll's tooltip. Then <b>Create</b> into the Items directory, an actor's inventory or a marketplace aisle.</p>
<h2>The NPC sheet</h2>
<p>A Creature page, Inventory and Description. The head: portrait, name and pronouns, <b>Role</b> (Monster, NPC, Hireling, Companion), <b>MOV</b>, <b>NA</b> (number appearing, dungeon and wilderness), <b>ATK</b> as text, <b>LVL</b> and <b>MRL</b>. A hireling's head adds <b>Wage</b>, a month or a day, and <b>Employer</b>, the player character who pays. A creature adds its level to every check and attack; <b>Check</b> rolls one; tick <b>Ability scores</b> to give it real abilities instead. <b>AC</b> is typed, and worn armor adds to it. The <b>Attacks</b> list rolls each equipped weapon's d20 and its damage. Monsters have no item slots; hirelings and companions have 10. Monsters die at 0 HP and take direct damage tripled.</p>

<h2>The Bestiary</h2>
<p>The <b>Bestiary</b> compendium holds statistics only, under generic names: AC, HP, level, attacks, movement, morale and number appearing, and the three hirelings. Drag one to the scene, or let Create NPC roll its HP.</p>
<h2>Portraits</h2>
<p>Click a portrait to open the picker. Its tabs are the galleries: <b>Yours</b> (your portrait folder; <b>Rescan folder</b> after adding files, and players see the list you scanned), <b>Portraits</b> by Jon Aspeheim, <b>Lydia Comer</b> (people, or monsters for a monster), <b>Tlomdev</b> and <b>Icons</b> from game-icons.net, the last two in folders. Below: paste an image path or URL, or <b>Browse files</b>. Each gallery credits its artist with a link, and a shipped portrait brings its matching token. In Char Gen Mode a die rolls a random portrait from the source the Toggles page names: any gallery that is on, or one gallery (your folder among them).</p>

<p>The Toggles page decides which galleries show, and where random portraits come from.</p>
`],
  [PAGE.combat, `
<p>Fights run from the sheets' Attack windows and the chat cards, the dashboard's <b>Combat</b> page and the Combat Tracker. The player's side is ${gref(PAGE.rolling, "Rolling and Fighting")}; this page is what you do with the cards.</p>
<h2>Damage cards</h2>
<p>Whoever rolled the damage applies it: the card's author and the Game Master get <b>Apply</b> and, under Knave 2e, <b>Direct</b>. Apply goes to the targets the attack hit, else to the user's targeted or selected tokens. Targets the roller owns change in their own browser; the rest are relayed to the active GM, who accepts the request only from the card's author, for the card's total, at tokens they can see. An applied card says so and asks before applying again. A hidden token's damage card goes to the GMs only. Direct damage skips HP and wounds a character at once; a creature takes it tripled.</p>
<h2>Wounds, Unusable and hard mode</h2>
<p>Under Knave 2e, damage past 0 HP fills slots with wounds from the bottom of the Inventory up: empty slots, then coin slots, then the lowest item, marked <b>Unusable</b> until the wound heals; whether it was dropped or broken is the table's call. Every slot wounded is death. A safe-haven rest heals one wound, and the Wounds bar's − heals one by hand. <i>Hard-mode wounds</i> (Configure Rules) breaks the item in a wounded slot instead. Under Knave 1e there are no wounds: 0 HP is unconscious, −1 dead, and the Direct button is gone.</p>
<h2>Quality and breakage</h2>
<p>Knave 1e attacks: a weapon has 3 quality, a shield or helmet 1, body armor its armor points + 2 (the item sheet can set another maximum). A natural 20 rolls one more damage die and puts <b>Wear armor</b> on the card for each target hit: the target's owner (you, for a monster) picks the worn piece that loses a point, once per card. A natural 1 costs the weapon a point. At 0 the item is destroyed and marked Broken but kept; <b>Repair</b>, the hammer on the row or on the item sheet, restores every point at 10% of the price a point, from the owner's coins. A worn item shows "Quality 2/3" on its row. Knave 2e attacks: a natural 1 breaks the weapon while <i>A natural 1 breaks the weapon</i> is on, and a power attack breaks it always; Repair mends a Broken item for nothing, since the book has no repair rule. Broken armor gives no AC.</p>
<p>Under Knave 1e a hit must be above the armor defense, not equal to it, and the attack tooltip says so. A Knave 2e power attack is the <b>Power attack</b> tick in the Attack window (a melee weapon): the damage dice are doubled and the weapon breaks. A ranged weapon shows the melee reminder. The dashboard's Direct box is hidden when the world plays without wounds (Knave 1e death).</p>
<h2>Initiative</h2>
<p>The <i>Initiative</i> rule (Configure Rules, Combat) is a choice. Knave 1e: Begin Combat rolls one d6, 1–3 the enemies act first, 4–6 the player characters (characters, players' tokens and friendly tokens); the round's result is posted, and every new round rolls again from your client, even when a player ends the last turn. Knave 2e: one CHA check between the sides' leaders decides who acts first, and a side's creatures act in any order; Begin Combat picks the leaders (the highest CHA among the PCs, the highest level among the hostiles), both yours to change on the Combat page (<b>Party's leader</b>, <b>Enemies' leader</b>). Individual: Foundry's roll per token. Under either side rule the tracker lists Player characters and Enemies as two groups, the acting side highlighted, a tick per combatant once it has acted, and a GM button <b>Next side</b>; no initiative numbers. A combatant at 0 HP (Knave 1e: Unconscious) is marked defeated once and cleared on healing; your own skull always wins.</p>
<p><b>Surprise</b> (Knave 2e p19): within 80', the closest PC's WIS check against the closest creature's WIS; a win by 5 or more surprises. The Dice page's Surprise sets up the request; the result card's buttons <i>They are surprised</i> and <i>We are surprised</i> set round 1 and post the +5 reminder, never added silently.</p>

<h2>Morale</h2>
<p>Morale is 2d6 at or under the creature's MRL. Roll it from the creature's sheet (the die by MRL), from <b>Morale: selected</b> on the Dice page for the NPC tokens you have selected, or from the breaking-point cards: in a running combat the active GM's client watches each side for its first casualty, half the side fallen, and an NPC left alone at half HP or less, each once a battle, and whispers you a card naming who tests, with a <b>Roll morale</b> button. A failed test puts <b>Leader rallies them (CHA check)</b> on its card: pick the leader, roll CHA, and a pass rerolls the morale; each side may try once a battle. Companions never test morale. A leader killed or a feared foe are your call.</p>
<p>Under Knave 1e attacks the breaking points are the first edition's: half the group fallen, the leader defeated, one left at half HP; there is no first-casualty card and no rally.</p>
<h2>Hazards in a fight</h2>
<p>The hazard die's fatigue, burn and depletion are applied from the Time page's cards, never by themselves, and a watch of travel past the third adds the forced-march note. See ${gref(PAGE.dashboard, "The Game Master's Dashboard")}.</p>`],
  [PAGE.items, `
<p>Items come in six types: item, weapon, armor, spellbook, career and transport. Make one with <b>Add item</b> on a sheet or in the Items sidebar, or duplicate one from <b>Gear &amp; Prices</b> (Knave 2e) or <b>Gear &amp; Prices (Knave 1e)</b>. Or use <b>Create Item</b> (the Items directory's header, or the dashboard's Marketplace page), which rolls one from your tables.</p>
<h2>The item sheet</h2>
<ul>
<li><b>Every inventory item:</b> <b>Slots</b> (0 for none), <b>Quantity</b>, <b>Price</b>, <b>Broken</b> (with <b>Repair</b> beside it), <b>Treasure</b> (loot: it counts once for treasure XP and sells at full value; <i>XP awarded</i> once counted), <b>Kind</b> (Ordinary, Magic, Relic or Potion: the badge on the Inventory row; magic weapons and armor keep their icon, glowing), <b>Effects</b> and a <b>Description</b>.</li>
<li><b>Item:</b> <b>Per slot</b>, how many share one slot (20 arrows, 10 candles); <b>Weightless</b>, no slot at all (a ring, a letter); <b>Uses</b>, a counter. An item named Rations or Torch follows the Inventory Hacks instead of Per slot; a torch, candle or lantern gets the flame.</li>
<li><b>Weapon:</b> <b>Damage</b> (d6, 2d6+1, or words for no roll), <b>Attack</b> melee (STR) or ranged (WIS), <b>Hands</b> (two-handed shows as a tag), <b>Range</b>, <b>Equipped</b>.</li>
<li><b>Armor:</b> <b>Piece</b> (shield, helmet, gambeson, mail, breastplate, arm plate, leg plate, other), <b>Armor points</b> (AC is 11 + the points of equipped, unbroken armor, at most 7), <b>Equipped</b>.</li>
<li><b>Quality</b> (weapons and armor, under Knave 1e attacks): what is left and the maximum, blank for the usual (a weapon 3, a shield or helmet 1, body armor its points + 2), and <b>Repair</b> with its cost.</li>
<li><b>Spellbook:</b> <b>Scroll</b> (cast once by anyone, used up, outside the daily total), <b>Chaos</b> (the card notes it becomes another spell at dawn; the swap is yours to make), <b>Cast today</b>.</li>
<li><b>Transport:</b> <b>Capacity</b> in slots, <b>Crew</b>, <b>Speed</b>; it takes no slots itself.</li>
</ul>
<h2>Careers</h2>
<p>A career is an Item that can carry mechanics as well as a name:</p>
<ul>
<li><b>Starting items</b> are granted when the career is added in Char Gen Mode (type a name and press Enter, or drop an item on the list); changing or removing the career takes them back.</li>
<li><b>Features</b> are extra fields on the character sheet's Growth page: text, number, checkbox, track (pips up to a maximum) or die (a rollable formula). The <b>Key</b> names where the values are stored.</li>
<li><b>Effects</b> are Active Effects that apply to whoever holds the career, e.g. <code>system.hp.max</code> +2; the sheet outlines a value an effect changes.</li>
</ul>
<p>Duplicate <i>Example Career</i> from the Careers compendium to start. Drop a career on a sheet to add it (Char Gen Mode, level 1 for players, two at most), or put linked careers in your Careers table so they can be rolled; a plain row <code>Name: item, item</code> works too.</p>
<h2>Treasure and selling</h2>
<p>Tick <b>Treasure</b> on an item's sheet for loot found in a dungeon. When the party is back in civilization, open the dashboard's <b>XP</b> page and choose <i>Treasure brought back</i>: tick who helped, and their treasure is listed and added up with any coins you type in. The XP is split evenly (Knave 2e: 1 XP a coin; Knave 1e's XP for gold: 1 per 100 copper); a companion of one of them takes a half share, noted on the card. Each treasure item counts once.</p>
<p>The coin icon on an Inventory row sells the item, or some of a stack: half its price, or its full value for treasure, into the character's coins, with a whispered note. Selling follows the player marketplace switch.</p>
<h2>The marketplace</h2>
<p>Players shop from the <b>Marketplace</b> button on the Inventory while <i>Players may use the marketplace</i> is on: the aisles, a filter, each row's slots and price, <b>Buy</b> (the coins go first) and <b>Take</b> for free (you, or Char Gen Mode).</p>
<p>An aisle is a roll table named <code>Market: Weapons</code>, or <code>Market 1e: Weapons</code> on Knave 1e's price list, which shows its own aisles in copper (Weapons, Armor, Gear, Food, Animals &amp; Transport, Clothing; Lodging &amp; Meals and Buildings ship hidden, and their rows take the coins only). Shipped aisles are read-only. Your side is the dashboard's <b>Marketplace</b> page. Pick an aisle and <b>Customize</b> it: a world copy replaces the shipped one and can be edited. Then type an <b>Override</b> price on any row, drop items from the sidebar or a compendium onto the aisle to stock them, <b>Add a row by name</b> for a text row with a price (bought, it becomes a plain one-slot item), remove rows, rename or delete the aisle (a deleted shipped aisle comes back), and hide it from players with the eye, or show it again. <b>New aisle</b> makes an empty one.</p>`],
]);

/* -------------------------------------------- */
/*  Write                                        */
/* -------------------------------------------- */

for (const [pack, docs] of out) {
  const dir = path.join(root, "src", "packs", pack);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const doc of docs) {
    fs.writeFileSync(path.join(dir, fileName(doc.name, doc._id)), yaml.dump(doc, { lineWidth: -1, noRefs: true }));
  }
  console.log(`  ${pack.padEnd(12)} ${docs.length} docs`);
}
