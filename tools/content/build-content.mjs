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
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SYS = "systems/base-knavery";
const ICON = (n) => `${SYS}/icons/${n}.svg`;
const GI = (cat, n) => `${SYS}/art/game-icons/${cat}/${n}.svg`;
// Read from the manifest, so a release or a newly verified core build is not
// stamped into the packs with yesterday's numbers.
const MANIFEST = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
const STATS = { coreVersion: MANIFEST.compatibility.verified, systemId: MANIFEST.id, systemVersion: MANIFEST.version };

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
  const doc = { _id, _key: `!items!${_id}`, name, type, img, system, effects: [], flags: {}, _stats: STATS };
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
], { img: "icons/svg/coins.svg", description: KNAVE_1E_CREDIT });

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
    effects: [], flags: {}, _stats: STATS,
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
    flags: extra.flags ?? {},
    _stats: STATS,
  });
};

const aisle = (name, docs) => tableDoc("marketplace", `Market: ${name}`, `1d${docs.length}`, docs.map((d, i) => ({
  type: "document", name: d.name, img: d.img, documentUuid: `Compendium.base-knavery.gear.Item.${d._id}`, range: [i + 1, i + 1],
})), { img: "icons/svg/coins.svg" });
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
const knave1e = (name, formula, results, intro = "") =>
  tableDoc("tables", name, formula, results, { description: (intro ? `<p>${intro}</p>` : "") + KNAVE_1E_CREDIT });

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

const journal = (name, pages) => {
  const _id = id("guide", name);
  add("guide", {
    _id, _key: `!journal!${_id}`, name, categories: [],
    pages: pages.map(([title, html], i) => {
      const pid = id("guide", name, title);
      // Trimmed as Foundry's StringField stores it: the template literals open with a
      // newline, and a leading newline the first world launch drops makes the pack
      // build guard report drift on every server (met on the probe fleet, 2026-11-13).
      return {
        _id: pid, _key: `!journal.pages!${_id}.${pid}`, name: title, type: "text", sort: (i + 1) * 100000,
        title: { show: true, level: 1 }, text: { format: 1, content: html.trim() }, flags: {}, ownership: { default: -1 },
      };
    }),
    flags: {}, _stats: STATS,
  });
};
journal("Base Knavery Guide", [
  ["Getting Started (GM)", `
<p>A new world plays Knave first edition as written: its rules, traits, reaction, alignment, starting gear and 100 level-less spells (CC BY 4.0) come with the system. To play Knave 2e, bring your own copy of the book: its tables ship as empty shells you fill from it.</p>
<ol>
<li><b>Choose the rules.</b> In <i>Configure Settings → Base Knavery → Configure Rules</i>, the <b>Rules</b> choice sets every rule to Knave 1e or Knave 2e; change any one afterwards to mix them (see <i>Rules: Knave 1e or 2e</i>).</li>
<li><b>Playing 2e? Fill the tables.</b> Open the <b>Game Master's Dashboard</b>, either from the clipboard button in the token controls or from the Actors sidebar. On <b>Tables</b>, build them from your PDF, or click <i>Import</i> beside Careers, Spells, Names and the traits and paste your rows.</li>
<li><b>Set the table's options.</b> In <i>Configure Settings → Base Knavery</i>:
<ul>
<li>choose how advantage works (Knave 2e's ±5, or 2d20 keep-high/low);</li>
<li>set the lowest and highest starting levels.</li>
</ul></li>
<li><b>Let players in.</b> Players click <b>Create Character</b> in the Actors sidebar for a random knave; a blank sheet is the GM's to make. Players who may not create actors have the GM's client create one for them.</li>
<li><b>Stock the market.</b> In the <b>Marketplace Manager</b>, <i>Customize</i> an aisle to change its prices, drop items in, or add new aisles.</li>
</ol>
<p>The <b>GM Macros</b> compendium turns the player marketplace, character creation, Char Gen Mode, players' level and XP, and the change log on and off. Drag the macros to your hotbar.</p>`],
  ["Rules: Knave 1e or 2e", `
<p>Each rule is its own setting under <b>Configure Rules</b>. The <b>Rules</b> choice at the top sets them all to one edition and shows <i>Custom</i> once they are mixed. The welcome window says which rules the world plays.</p>
<ul>
<li><b>Ability scores.</b> Knave 1e: each is the lowest of 3d6, rolled in order, and the player may swap two. Knave 2e: 3 points, by 3d6 or placed.</li>
<li><b>Starting kit.</b> Knave 1e: rolled armor and gear, two rations and a weapon of the player's choice; no coins, no spellbook. Knave 2e: two careers, their items and coins.</li>
<li><b>Death.</b> Knave 1e: unconscious at 0 HP, dead below 0, no wounds. Knave 2e: damage past 0 HP fills slots with wounds.</li>
<li><b>Healing.</b> Knave 1e: a night's rest after a meal heals d8 + CON; a safe haven restores all HP. Knave 2e: full HP after two watches of sleep and a meal; a safe haven heals one wound.</li>
<li><b>Spells.</b> Knave 1e: any number of spellbooks a day, each once, cast at the caster's level. Knave 2e: as many as INT.</li>
<li><b>Advancement and initiative.</b> Knave 1e: a level every 1,000 XP, a d8 per level for HP, and one d6 a round for the sides. Knave 2e: its own XP table, HP rerolls and individual initiative.</li>
<li><b>Attacks.</b> Knave 1e: weapons have 3 quality, armor 1 to 7. A natural 20 adds one damage die, and the card's <i>Wear armor</i> button lets the target's owner pick the piece that loses a point; a natural 1 costs the weapon a point. At 0 the item is destroyed (marked Broken); the item sheet's <i>Repair</i> costs 10% of its price a point. Knave 2e: a natural 1 breaks the weapon, a power attack doubles the damage dice and breaks it, and 21+ earns a free maneuver.</li>
<li><b>Prices and wages.</b> Knave 1e: the copper price list (the <i>Gear &amp; Prices (Knave 1e)</i> compendium and its shop aisles), henchmen paid by the day. Knave 2e: its prices and monthly wages.</li>
<li><b>Coins per slot.</b> Knave 1e: 100. Knave 2e: 500.</li>
<li><b>XP for treasure.</b> Knave 1e: off, XP comes from deeds; its designer's note allows XP for gold, 1 XP per 100 copper, and choosing that still plays Knave 1e. Knave 2e: 1 XP per coin of treasure brought back.</li>
</ul>
<p>When you build tables from your Knave 2e book, the system asks whether to switch the world to Knave 2e rules. Switching never changes a character you already have. A world made before version 0.2.0 kept the Knave 2e rules it played.</p>
<p>Knave 1e's rules are from <i>Knave</i> (first edition) by Ben Milton, CC BY 4.0, adapted here as automation and settings.</p>`],
  ["Filling the Tables", `
<p>A world table always wins over the shipped shell with the same name. The importer creates or replaces that world table from pasted rows, one per line:</p>
<ul>
<li><code>01-05 Some text</code>: a range (<code>00</code> reads as 100).</li>
<li><code>7. Some text</code> or <code>7 Some text</code>: a single number.</li>
<li>Plain lines are numbered in order.</li>
<li><code>@UUID[Item.abc]{Name}</code> links a document, such as a career item or a spellbook.</li>
</ul>
<p><b>Careers</b> rows written <code>Name: item, item, item</code> become careers with those starting items. Item names that match gear in the compendia arrive with their real statistics.</p>
<p><b>Spells</b> rows become spellbooks. Put the spell's text in the book's description.</p>`],
  ["Your Rulebook", `
<p>Base Knavery can open <b>your own copy</b> of the Knave 2e PDF inside Foundry, so you can read a table while you fill it. Nothing of the book comes with the system: it stores only where your file is.</p>
<ol>
<li>Click <b>Choose from this computer</b>: in the welcome window, on the dashboard's <b>Tables</b> tab, or in <i>Settings → Configure Rulebook</i>.</li>
<li>Pick your PDF in your computer's file dialog. It is uploaded to the server's <code>knavery-rulebook</code> folder and opens. (A PDF already on the server can be chosen with the folder button in Configure Rulebook instead.)</li>
<li>Press <b>B</b>, or use <b>Rulebook</b> in the Settings sidebar, to open or close it.</li>
</ol>
<p>On the dashboard's <b>Tables</b> tab, a book icon beside a table opens the rulebook at its page. The table importer offers the page too.</p>
<p>Tick <b>Players may read it</b> to let players open it. Then <b>Show this page to players</b>, in the reader's menu or on the dashboard, opens the same page for everyone connected.</p>
<p>Page numbers are the book's printed pages. If your PDF numbers its pages differently, change <b>Page offset</b>: PDF page minus printed page.</p>
<h2>Tables from the book</h2>
<p><b>Build tables from the book</b> (on the dashboard's <b>Tables</b> tab, in Configure Rulebook, and right after you choose your PDF) reads every table in your copy: careers, spells, names, surnames, reaction and some seventy more. A review lists them with their rows: open one to correct a line, untick any you do not want, then build.</p>
<p>They become world roll tables in a <i>From your rulebook</i> folder. The system rolls on Careers, Spells, Names, Surnames and Reaction at once, since a world table wins over the empty shell.</p>
<p>Building again replaces only the tables it built that you have not changed. A table you made, imported or edited yourself is kept and listed; delete or rename it to rebuild it from the book.</p>`],
  ["Custom Careers", `
<p>A career is an Item that can carry mechanics as well as a name:</p>
<ul>
<li><b>Starting items</b> are granted when the career is added in Char Gen Mode.</li>
<li><b>Features</b> are extra fields on the character sheet: text, number, checkbox, track (pips up to a maximum) or die (a rollable formula).</li>
<li><b>Effects</b> are Active Effects that apply to whoever holds the career, e.g. <code>system.hp.max</code> +2.</li>
</ul>
<p>Duplicate <i>Example Career</i> from the Careers compendium to start. Drop a career on a sheet to add it, or put linked careers in your Careers table so they can be rolled.</p>`],
  ["Rolls and Damage", `
<ul>
<li><b>Checks</b>: d20 + ability against 11 + difficulty (5 by default, so 16).</li>
<li><b>Saves</b> from other games use the matching ability: paralysis STR, breath and blast DEX, poison and death CON, magic device INT, spells WIS.</li>
<li><b>Attacks</b>: d20 + STR (melee) or WIS (ranged) against the target's AC.
<ul>
<li>Knave 2e: a total of 21 or more also earns a free maneuver; a natural 1 breaks the weapon; a power attack doubles the damage dice and breaks the weapon.</li>
<li>Knave 1e: a natural 20 adds a damage die and wears the target's armor; a natural 1 wears the weapon (see <i>Rules: Knave 1e or 2e</i>).</li>
</ul></li>
<li><b>Damage</b> comes off HP first. Each point past 0 fills an item slot with a wound, from the bottom of the inventory up: empty slots first, then coins, then the lowest item, which becomes <i>Unusable</i> until the wound heals (whether it was dropped or broken is the table's call). When every slot is wounded, the character dies. <b>Direct</b> damage skips HP. Monsters take direct damage tripled and die at 0 HP. Under Knave 1e's death rule there are no wounds and no direct damage: a character is unconscious at 0 HP and dead below 0.</li>
<li>The <b>Die of Fate</b> is a d6 for when fate, not skill, decides.</li>
<li><b>Repair</b>: a hammer on the Inventory row, or beside <i>Broken</i> on the item sheet. Under Knave 1e attacks a worn weapon or armor costs 10% of its price a point; otherwise a broken item is mended for nothing (Knave 2e has no repair rule).</li>
</ul>`],
  ["Treasure and the Party", `
<p>The dashboard's <b>Party</b> tab shows every player character at a glance: HP (and whether they are unconscious or dead), wounds, slots used, coins, their lights and which are lit, and the spellbooks still ready today. Click a name to open the sheet.</p>
<p>Tick <b>Treasure</b> on an item's sheet for loot found in a dungeon. When the party is back in civilization, open the dashboard's <b>XP</b> tab and choose <i>Treasure brought back</i>: tick who helped, and their treasure is listed and added up with any coins you type in. The XP is split evenly; a companion of one of them takes a half share, noted on the card. Each treasure item counts once.</p>
<p>The coin icon on an Inventory row sells the item: half its price, or its full value for treasure. Selling follows the player marketplace switch.</p>`],
  ["Levels", `
<p>XP is earned the Knave way; the GM awards it from the dashboard's <b>XP</b> tab (treasure too, see <i>Treasure and the Party</i>). Once a character's XP reaches the next threshold and <b>Char Gen Mode</b> is on, an up arrow appears in the sheet's title bar (and <b>Level Up</b> on the Growth page). Levelling up:</p>
<ul>
<li>raises three different abilities by one (you choose them, or the dice do);</li>
<li>grows max HP by the GM's rule (Settings → Character Creation). As written: reroll one d6 per level; if the roll isn't higher, max HP goes up by one.</li>
</ul>
<p>Players may type abilities only in Char Gen Mode, and level and XP only when the GM also allows it. The GM sets the lowest and highest levels a new character may start at.</p>`],
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
