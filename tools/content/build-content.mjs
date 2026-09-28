#!/usr/bin/env node
/**
 * Generates the YAML sources in src/packs/ for every shipped compendium.
 *
 *   node tools/content/build-content.mjs
 *
 * Content policy (see LICENSE.txt): only GAME MECHANICS ship — prices, damage
 * dice, armor points, slots, monster statistics — under plain generic names.
 * No Knave 2e prose, no table text. Every rollable table is a SHELL: the right
 * name and dice with one placeholder row, for the GM to fill by importing.
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
const STATS = { coreVersion: "14.367", systemId: "base-knavery", systemVersion: "0.1.0" };

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
/*  Careers: one worked example of a custom one  */
/* -------------------------------------------- */

{
  const _id = id("careers", "Example Career");
  add("careers", {
    _id, _key: `!items!${_id}`, name: "Example Career (duplicate me)", type: "career", img: ICON("background"),
    system: {
      description: "<p>A template for a custom career or background. Duplicate it into your world, rename it, and "
        + "edit it: the <b>starting items</b> are granted in Character Creation Mode, each <b>feature</b> becomes "
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
for (const n of ["Physique", "Face", "Skin", "Hair", "Clothing", "Virtue", "Vice", "Speech", "Background", "Misfortune"]) shell(n, 20);
shell("Reaction", 12, "2d6");
shell("Mishaps", 20);
shell("GLOG Mishaps", 12);

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
macro("Toggle Player Creation Tools", "icons/svg/dice-target.svg", 'game.knavery.toggle("allow-player-randomization");');
macro("Toggle Change Log", "icons/svg/book.svg", 'game.knavery.toggle("change-log");');
macro("Game Master's Dashboard", "icons/svg/eye.svg", "game.knavery.openDashboard();");
macro("Marketplace Manager", "icons/svg/chest.svg", "game.knavery.openMarketplaceManager();");
macro("Import a Table", "icons/svg/scroll.svg", "game.knavery.openTableImporter();");

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
