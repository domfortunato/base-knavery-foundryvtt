/**
 * Names for a new knave when the world has no Names table yet (a Knave 1e world, or a 2e world
 * before its book is built): this project's own writing, 0.3.0. Nothing here comes from either
 * book. The table wins whenever it has rows (character-generator.js rollFullName).
 */

const GIVEN = [
  "Abelard", "Agnes", "Aldo", "Alys", "Ambrose", "Anselm", "Bart", "Beatrix", "Benedek", "Bram",
  "Cedric", "Clemence", "Corvin", "Dagny", "Dorian", "Edda", "Elric", "Emmeline", "Fenwick", "Fia",
  "Gaspard", "Gilda", "Gorm", "Greta", "Hamish", "Hester", "Idris", "Ingrid", "Jasper", "Jessamy",
  "Kaspar", "Kenna", "Lazlo", "Linnet", "Lorcan", "Maud", "Merrick", "Mirabel", "Nestor", "Nell",
  "Odo", "Orla", "Osric", "Perrin", "Piety", "Quill", "Rafe", "Rowena", "Sabine", "Silas",
  "Tamsin", "Teodor", "Thessaly", "Ulric", "Una", "Vesna", "Wendel", "Wren", "Yorick", "Zelda",
];

const FAMILY = [
  "Ashby", "Blackmantle", "Brannock", "Bricklow", "Cadwell", "Cinderhew", "Coldwater", "Crane", "Dunmoor", "Eavesden",
  "Fallowmere", "Fenn", "Gallowglass", "Grimsby", "Hallow", "Harrowgate", "Hollins", "Ironmonger", "Kettleby", "Larkspur",
  "Marrow", "Mossgrave", "Nettlebed", "Oakhollow", "Penhallow", "Quarrie", "Ravensworth", "Rooke", "Saltmarsh", "Sedgewick",
  "Shadwell", "Stonebridge", "Tallow", "Thorne", "Underhill", "Vance", "Wakefield", "Whitlock", "Wolde", "Yardley",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** A given name and a family name from the lists above. */
export const builtInName = () => `${pick(GIVEN)} ${pick(FAMILY)}`;
