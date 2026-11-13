/**
 * Where the tables are in the Knave 2e rulebook PDF: names, printed pages, the
 * half of the page each stands in, and their dice. Structure only, read from
 * the book's layout; none of the book's text. module/rulebook-tables.js reads
 * the entries out of the GM's own copy with these; module/rulebook-import.js
 * writes them into the GM's world.
 *
 * Pages are PRINTED pages; the PDF index adds the world's page offset (6 in
 * the 88-page PDF these were read from). `region` is "left", "right" or
 * "full"; `below` names the heading a table starts under when its half of the
 * page holds prose first. `kind` shapes the rows: "career" ("Name: items", the
 * name capitalised), "spell" (name, with the effect as the result's
 * description), else plain text.
 *
 * `system: true` marks the tables the system itself rolls on (config.js
 * TABLES). Names joins the male and female names as 1–200; Surname Endings is
 * the book's second surname table, joined to a Surnames draw that ends in "-".
 */
const d100 = (name, page, region) => ({ name, pages: [page], region, first: 1, last: 100, formula: "1d100" });

export const RULEBOOK_TABLES = [
  { name: "Careers", pages: [5], region: "full", first: 1, last: 100, formula: "1d100", kind: "career", system: true },
  { name: "Spells", pages: [22, 23, 24, 25], region: "full", first: 1, last: 100, formula: "1d100", kind: "spell", system: true },
  { name: "Travel Hazard Die", pages: [8], region: "right", below: "d6", first: 1, last: 6, formula: "1d6" },
  { name: "Weather", pages: [9], region: "left", below: "2d6", first: 2, last: 12, formula: "2d6" },
  d100("Travel Shifts", 9, "right"),
  d100("Signs", 10, "left"), d100("Locations", 10, "right"),
  d100("Structures", 11, "left"), d100("Place Traits", 11, "right"),
  { name: "Dungeon Hazard Die", pages: [13], region: "left", below: "d6", first: 1, last: 6, formula: "1d6" },
  d100("Delve Shifts", 14, "left"), d100("Rooms", 14, "right"),
  d100("Room Details", 15, "left"), d100("Room Themes", 15, "right"),
  d100("Dungeons", 16, "left"), d100("Trap Effects", 16, "right"),
  d100("Hazards", 17, "left"), d100("Mechanisms", 17, "right"),
  { name: "Reaction", pages: [19], region: "left", below: "npc reaction", first: 2, last: 12, formula: "2d6", system: true },
  d100("Activities", 19, "right"),
  { name: "Spell Formulae", pages: [27], region: "left", below: "spell formulae", first: 1, last: 12, formula: "1d12" },
  d100("Wizard Names", 27, "right"),
  d100("Qualities", 28, "left"), d100("Effects", 28, "right"),
  d100("Elements", 29, "left"), d100("Forms", 29, "right"),
  d100("Mutations", 30, "left"), d100("Delusions", 30, "right"),
  d100("Disasters", 31, "left"), d100("Magic Schools", 31, "right"),
  d100("Domains", 33, "left"), d100("Symbols", 33, "right"),
  d100("Potions", 35, "right"),
  d100("Textures", 36, "left"), d100("Tastes", 36, "right"),
  d100("Colors", 37, "left"), d100("Ingredients", 37, "right"),
  d100("Tools", 39, "left"), d100("Miscellaneous Items", 39, "right"),
  // The book's "clothing" is items; "Clothing" is already the character trait table.
  d100("Books", 40, "left"), d100("Clothing Items", 40, "right"),
  d100("Fabrics", 41, "left"), d100("Decorations", 41, "right"),
  d100("Treasures", 42, "left"), d100("Materials", 42, "right"),
  d100("Weapons", 43, "left"), d100("Item Traits", 43, "right"),
  d100("City Themes", 46, "left"), d100("City Events", 46, "right"),
  d100("Street Details", 47, "left"), d100("Buildings", 47, "right"),
  d100("Inn Name 1", 48, "left"), d100("Inn Name 2", 48, "right"),
  d100("Food Traits", 49, "left"), d100("Food", 49, "right"),
  d100("Factions", 50, "left"), d100("Faction Traits", 50, "right"),
  d100("Missions", 51, "left"), d100("Rewards", 51, "right"),
  { name: "Carousing Mishaps", pages: [52], region: "left", below: "carousing mishaps", first: 1, last: 20, formula: "1d20" },
  d100("Archetypes", 53, "right"),
  d100("Male Names", 54, "left"), d100("Female Names", 54, "right"),
  { ...d100("Surnames", 55, "left"), system: true },
  d100("Surname Endings", 55, "right"),
  d100("Personalities", 56, "left"), d100("NPC Details", 56, "right"),
  d100("Professions", 57, "left"), d100("Goals", 57, "right"),
  d100("Assets", 58, "left"), d100("Liabilities", 58, "right"),
  d100("Relationships", 59, "left"), d100("Mannerisms", 59, "right"),
  d100("Monsters", 61, "right"),
  d100("Animals", 64, "left"), d100("Organs", 64, "right"),
  d100("Monster Traits", 65, "left"), d100("Powers", 65, "right"),
  d100("Scents", 66, "left"), d100("Sounds", 66, "right"),
  d100("Tactics", 67, "left"), d100("Weaknesses", 67, "right"),
];

/** Tables built from others once those are read: Names = Male Names 1–100 + Female Names 101–200. */
export const COMBINED_TABLES = [
  { name: "Names", from: ["Male Names", "Female Names"], formula: "1d200", system: true, pages: [54] },
];

/** The printed page a catalogued table starts on, or null. */
export const cataloguePage = (name) => (RULEBOOK_TABLES.find((t) => t.name === name)
  ?? COMBINED_TABLES.find((t) => t.name === name))?.pages[0] ?? null;
