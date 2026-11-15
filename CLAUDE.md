# Base Knavery — working notes

A Foundry VTT **v14** game system (id `base-knavery`) for Knave, first and second
editions: Knave 1e plays out of the box, Knave 2e with the GM's own book (user
rulings 2026-11-14). ApplicationV2 and TypeDataModel only. Keep the code free of deprecated APIs so
it moves to v16 unchanged. Sibling of Air Bladder
(`c:\Users\domin\code\air-bladder`), whose sheet layout, CSS, item offers, art
picker, change log and marketplace it ports.

## Content policy (non-negotiable)
- **No Knave 2e text.** Its licence allows mechanics and numbers, not
  verbatim text or art.
- **No Dungeon Crawl Classics text, ever.**
- Knave **first** edition is CC BY 4.0 (Knave 1.0, p1). Its traits, alignment,
  reaction, starting gear and 100 level-less spells ship filled in the tables
  pack (generator `KNAVE_1E_*`); a 2e table the GM builds wins by name, and
  `spell-list` can force the 1e spells (`compendium.js` `spellTableName`),
  credited in each table, LICENSE.txt, README.md and the welcome window (user
  ruling 2026-11-14). Its RULES ship too, as automation and the Knave 1e choices
  under Configure Rules (0.2.0), with the same credit and its list of changes.
  Anything else from 1e needs the same credit.
- Shipped tables are **shells**: the right name and dice, plus one placeholder
  row flagged `base-knavery.placeholder`. GMs fill them with the table importer.
  Lookups prefer a world table of the same name (`module/compendium.js`).
- The bestiary is statistics only, under generic or SRD names. "Brain flayer"
  and "eye tyrant" are left out on purpose.
- Level titles, hints and the guide are this project's own writing. Exception
  (user ruling 2026-11-13): the ability taglines (`KNAVERY.AbilityHint`) follow
  the wording of the edm00se/knave2e sheet, as lists of mechanics, not book text. A world
  playing Knave 1e shows the 1e set (`KNAVERY.AbilityHint1e`, `rules.js` `abilityHint`): CON
  poison, sickness, slots, healing; INT no spells a day; WIS spotting illusions; CHA henchmen, no
  initiative. 2e and Custom keep the 2e set (user ruling 2026-11-14).
- `questing-beast/*.pdf` is reference only and gitignored. Only the "Made for
  Knave" logos ship (in `logo/`). Never use the Knave 2e or Questing Beast
  logos.
- The disclaimer string lives in `lang/en.json` `KNAVERY.Disclaimer` and in
  LICENSE.txt and README.md. The welcome window shows it verbatim, with the
  logo credit. The sheet footer carries only `KNAVERY.DisclaimerShort`, in the
  user's words: "Base Knavery is an unofficial fan-made Foundry system for Knave
  (first and second editions) and is not affiliated with Questing Beast LLC."
  (rulings 2026-11-13 and 2026-11-14). The welcome window links the Knave 1e PDF
  on itch as well as the 2e book, though the 1e rules ship (user, 2026-11-14).
- The rulebook reader shows the GM's own PDF. The system stores only its path
  (setting `rulebook-pdf`) and page numbers (`config.js` `RULEBOOK`, read from
  the PDF's outline and headings).
- The GM may build roll tables from their own copy (user ruling 2026-11-13:
  "not a licensing issue and the system should do it"). That reading runs only
  in the GM's browser and writes only into their world. The repository,
  packs and releases still carry none of the book's text: the catalogue
  (`module/rulebook-catalogue.js`) holds table names, pages and layout only,
  and output of `tools/dev/rulebook-tables-check.mjs --show` is never committed.

## Wording: Game Master and GM (user ruling 2026-11-15)
- "Game Master" in titles and labels, and at the first mention in a standalone message (a notification,
  a chat card, a warning) or on a Guide page; "GM" after that, and in hints, tooltips and placeholders.
- Names keep their own form: the Guide's page titles end in "(GM)" (their ids are frozen), and the
  compendium is "GM Macros".

## Translations (user rulings 2026-11-15)
- The goal: the interface and the Knave 1e rules the system ships can be fully localized. Knave 2e is
  English only; if it is ever translated, we work with its translators on the 2e side (`TRANSLATING.md`).
- Interface: we ship volunteers' language files, and fans may publish translation modules.
- Content: through Babele. `babele-template/` (`npm run build:babele`, checked by `npm run check`) holds every
  translatable entry keyed by English name; never rename a document in the generator (the ids freeze it).
  Knave 1e rows keep their English text in `flags.base-knavery.en` (the 1e gear roll reads it).
- Published translations of Knave 1e (the user's French, German and Russian PDFs) are LEFT OUT: their
  translators hold their rights. We ship volunteers' own translations of what the system ships, crediting
  Ben Milton. Until then a GM pastes translated tables with the importer's **Use as**.
- Human translations only; an AI draft needs a line in the welcome's AI disclosure.

## Layout
- `module/knavery.js`: entry point; hooks, the `game.knavery` API.
- `module/config.js`: every mechanics number (levels, AC, slots…), and
  `RULES_PRESETS`, each edition's value for every rule setting.
- `module/rules.js`: which edition the world plays (`currentRules`: 1e, 2e or
  custom, computed from the rule settings), `applyRules`, the stamp
  (`stampRules`: at the first GM login on 0.2.0+, an existing world gets the 2e
  value of every rule it never stored; a new world plays the 1e defaults), and
  `offerRulesSwitch` (asked after a table build from the 2e book).
- `module/keys.js` (0.4.0, localization Phase 0): identity by key, not English name. Every shipped
  document carries `flags.base-knavery.key` (the slug of its English name, `keyOf`); `findTable`,
  `findItemByName`, the aisles (`market`/`aisle` flags) and the Guide (page keys, heading ids
  `<page>-<heading>`) look the key up first, then the name. Callers still pass the English name.
  Items a rule reads carry `kind` (rations, torch, candle, lantern, arrows; `isKind`). A world
  table gets its own name's key at the GM's login (`stampTableKeys`); the importer's **Use as** sets
  another table's key. Compendium `_id`s are frozen: `npm run check:ids` (`tools/content/ids.lock.json`,
  `-- --update` to freeze new ones). Plan: `memory localization-plan-2026-11-15`.
- `module/data-models.js`: TypeDataModels. HTML fields must also be listed
  in `system.json` `htmlFields`; `npm run check:fields` enforces this.
- `module/documents/`: the Actor (slots, wound layout, damage, rest,
  change-log plumbing, `addItems` stacking) and the Item.
- `module/sheets/`: one actor sheet for character and npc, and one item sheet.
  `tab-rail.js` hangs the pages' thumb-tab rail off the window's edge (DB
  Mythic's mechanism; the rail is a render PART, `templates/parts/tab-rail.html`).
  The Knave page carries the head; Inventory, Growth and Description follow.
  A character's sheet is narrow (440px: abilities | vitals; user
  ruling 2026-11-14); its Attack button opens one window to choose an equipped
  weapon and the edge (`rolls.js` `openAttack`). NPC sheets keep 640px and their
  attacks column.
  Every attack window lists the tokens the user can see as its Target (`visibleTargets`;
  other PCs hidden by default for a character), and the choice becomes the user's target.
- Feature modules:
  - `rolls.js`: the edge prompt, checks, attacks, spells, dice
  - `damage.js`: chat-card buttons and the GM relay
  - `item-offer.js`, `marketplace.js`, `character-generator.js`, `level-up.js`
  - `initiative.js`: `KnaveryCombat`; the rule `initiative-rule` (0.3.0): `1e-d6` one d6 a round
    orders the sides (the GM rolls; a round a player advances is rolled by the active GM's client),
    `2e-leaders` one CHA check between the sides' leaders (`pickLeaders`, flag `leaders`) once a
    fight, `individual` core's. `setSides`, `setSurprise`, `nextSide`, acted ticks (Combatant flag
    `acted`). `combat-tracker.js`: `KnaveryCombatTracker` (`CONFIG.ui.combat`) groups the rows under
    side headers with a Next side button
  - `edit-gates.js`: who may change abilities, level, XP and the GM's notes
    (Char Gen Mode and the GM's level & XP switch); the sheet disables, and
    `KnaveryActor._preUpdate` drops the rest (client-side only)
  - `gm-dashboard.js` (its pages on the same thumb-tab rail, frame class `knavery-railed`;
    opened from the GM's big button atop the left toolbar, `#knavery-dashboard-hud`; pages: Requests, Damage,
    Time, Party, Dice (Random before 2026-11-15), XP, Marketplace (the aisles; `marketplace.js` `MARKET_ACTIONS`), Toggles (the players'
    switches, the portrait galleries and the random-portrait source; `art.js` `GALLERIES`), Tables),
    `table-importer.js`, `art.js`, `change-log.js`,
    `print.js` (0.3.0: one fixed 186 × 261 mm page for both editions, built from the rules and
    the slot layout; the Printing settings in their own Configure Printing window (2026-11-15); probe `e2e-print.mjs` prints four
    knaves to PDF and asserts one page each)
  - `rulebook.js`: the GM's PDF in Foundry's bundled pdf.js viewer (an iframe
    of `scripts/pdfjs/web/viewer.html`, after Mythic-pwd), the B key, showing
    a page to players; page map in `config.js` `RULEBOOK`
  - `npc-generator.js`: Create NPC (GM): a bestiary monster with HP rolled (p67), a
    person, or a hireling/mercenary/expert (p59 lines and wages)
  - `hazard.js`: the dashboard's Time tab (dungeon turns, travel watches, the world
    clock, the hazard die) and the hazard cards' apply buttons: fatigue, burn,
    depletion, applied only when the GM clicks (user ruling 2026-11-14); the party
    is every player-owned character; light items carry `system.lit`
  - `hirelings.js`: morale prompts at breaking points in a running combat (the active
    GM; once a battle each, flagged on the Combat), the leader's CHA rally once per side
    a battle, companions exempt (p59); hirelings' wages: `system.employer` pays, due
    every 30 days of world time (`system.wageDue`), Pay on the Time tab (user rulings
    2026-11-14)
  - `welcome.js`: the welcome window, at every GM login unless setting
    `welcome-on-start` is off (user ruling 2026-11-14). It is also the README and
    the Foundry package listing (user, 2026-11-14): `npm run build:readme`
    (`tools/content/build-readme.mjs`) writes README.md's `welcome` and
    `licensing` blocks and `docs/foundry-listing.html` from `lang/en.json` and
    `welcome-data.js` (the books, links, art credits and book ends). Edit those,
    never the generated text; `npm run check` catches drift. No GitHub Pages:
    the listing's images load from the mirror's `master` (raw.githubusercontent).
  - `rulebook-import.js`: build world roll tables from the GM's PDF, with a
    review first; a rebuild replaces only tables it built that are unchanged
    (`flags.base-knavery.rulebook.hash`), never the GM's own. The Spells table also
    makes a spellbook and a scroll per spell in the world compendium
    `world.rulebook-spells` and links its rows to the books (`writeSpellItems`; same
    keep-what-the-GM-edited rule; still only the GM's browser and world)
  - `rulebook-tables.js` (pure: reads numbered tables from pdf.js text by
    position) and `rulebook-catalogue.js` (where each table is). Check the
    catalogue against a local PDF with
    `node tools/dev/rulebook-tables-check.mjs "<pdf>" --pdfjs <foundry>/node_modules/@foundryvtt/pdfjs/build`
  - `socket.js`: one channel, handlers by action
- `css/knavery.css`: Air Bladder's stylesheet renamed (`cairn`→`knavery`,
  `--ab-`→`--kn-`), plus a Base Knavery section at the end. Colours only
  through `--kn-*` tokens.
- `src/packs/`: generated by `npm run build:content`
  (`tools/content/build-content.mjs`). **Edit the generator, not the YAML.**
  `packs/` is gitignored and built by `npm run build:packs`.

## Dev loop (CT 127)
- Box: `foundry-v14-knavery-127`, <private-ip>.
  - Dev app on :30000 runs `dev` (world `knavery-dev`, users Gamemaster, Alice
    and Bob, no passwords).
  - Test app on :30001 runs `master`.
  - Runbook: `c:\Users\domin\code\foundry\runbooks\foundry-ct127-knavery.md`.
- Push `dev`, then either:
  - `sh tools/dev/pull-127.sh` for JS, template, CSS or lang changes (reload
    the browser), or
  - from `c:\Users\domin\code\foundry`, `scripts/deploy-system.sh 127
    base-knavery --yes` when `system.json` or the packs change.
- Probes (`tools/dev/e2e-*.mjs`, the `dev:*` scripts) run on the **probe
  fleet, never from the workstation** (user ruling 2026-11-13): VM 200's GPU
  drives the browsers against the eleven probe boxes, conducted from CT 120, as
  project `base-knavery` of foundry-ops `fleet/projects.tsv` (rows for Foundry
  14.370, 14.369 and 14.368; world `knavery-dev` staged from CT 127). Keep all
  three green before merging to master. **Day to day run only
  `--project base-knavery`** (the newest build); the `base-knavery-14369` and
  `-14368` rows run before a release, not on every change (user ruling
  2026-11-13).
  ```
  ssh fleet@<private-ip> foundry/scripts/fleet-runner.sh start --project base-knavery --ref <sha> [--probes smoke,players,screens]
  ssh fleet@<private-ip> foundry/scripts/fleet-runner.sh last
  ```
  `--refresh` after a release retakes every box's `pristine`. The report quotes
  each failing check, and a failing probe's screenshots come back with it. The
  probes read `MB_SHOTS` and `MB_TIME_SCALE` from the fleet (`tools/dev/lib.mjs`).
- `npm run check` (manifest, fields, i18n) and `npm run lint` run locally.

## Git and releases
- Remotes: `origin` is `gitea@<private-gitea>:fortunato/base-knavery-foundryvtt.git`
  (private). Gitea push-mirrors to the public
  `github.com/domfortunato/base-knavery-foundryvtt`.
- Branches: work on `dev`; `master` is the released state.
- To release:
  1. Write a `## X.Y.Z` section in CHANGELOG.md.
  2. On `master`, run `npm run release X.Y.Z`.
  3. The tag mirrors to GitHub, and Actions attaches `system.json` and
     `system.zip`.
  4. Merge `master` back into `dev`.
  5. Retake the Foundry listing's welcome picture so its version line shows the new release (user
     ruling 2026-11-15, from 0.4.3 on): on the fleet, `--probes listing --ref <the release commit>`; show
     the user `welcome.png` before pushing; once approved, replace `docs/listing/welcome.png` under the
     SAME name (the submitted listing links that address) on `dev`, fast-forward `master` and push both.
     Only that picture; the character sheet and Attack window stay unless asked.
- **Never tag or release on GitHub directly.**

## House rulings on the rules (the user's, recorded so they are not "fixed")
- Editions (2026-11-14): a new world plays Knave 1e as written; an existing world keeps
  2e (the stamp); building tables from the 2e book asks before switching; a switch never
  changes an existing character. Rule settings: `creation-abilities`, `starting-kit`,
  `death-rule`, `healing-rule`, `spell-rule`, plus `first-level-hp`, `level-hp-rule`,
  `knave1e-xp`, `initiative-rule` (0.3.0: `1e-d6` / `2e-leaders` / `individual`; the 0.2.0 switch
  `knave1e-initiative` is gone, no migration: user ruling 2026-11-14), `advantage-mode` (0.3.0: in the presets, 1e
  2d20, 2e ±5), `show-alignment`, `show-background`, `spell-list`.
  Bundle 2 (user rulings 2026-11-14): `attack-rule` (1e quality and crits, `quality.js`;
  2e breakage, power attacks, 21+ maneuver), `price-list` (1e: pack `gear-1e`, aisles
  "Market 1e: ", henchmen paid by the day), `coins-per-slot` ("100"/"500"). A stamped
  world learns a rule added later from its other rules' edition (`rules-keys`, `topUpRules`).
- Knave 1e wear: a natural 20's armor wear is picked by the target's owner from the card's
  Wear armor button (the dialog records the card on the actor, flag `wornBy`); 0 quality
  = Broken, kept, repairable at 10% of the price a point; daily wages: Pay settles every
  day owed. Lodging & Meals and Buildings are service rows, hidden by default.
- Features C-E (user rulings 2026-11-14): the party view is the dashboard's Party tab;
  an item sells for half its price, treasure (`system.treasure`) at full value (`treasure.js`);
  rule `treasure-xp`: 2e "coin" (p12, 1 XP a coin, companions a half share p59), 1e "off",
  or 1e's designer's-note "gold" (1 XP per 100c), which still reads as Knave 1e
  (`config.js` `RULES_ALSO`; likewise a 2e world on Individual initiative reads as 2e, plan D11);
  an awarded item is `treasureCounted`. Repair under 2e attacks
  (and for gear without quality) is free (`quality.js` `repairBroken`).
- Knave 1e death: 0 HP unconscious, -1 dead (character `hp.value` min -1); no direct
  damage, so the Direct button is hidden. 1e healing: d8 + CON after a meal; a safe
  haven, all HP. 1e spells: no daily total; a card's level is the caster's level (L).
- Knave 1e creation: lowest of 3d6 per ability, swap two in the player's window
  (`validRolled` checks what the GM's client is sent), no careers, no coins, no
  spellbook, two rations, a weapon of choice, the 1e gear tables. Personality and
  Mannerism (2e tables) show under careers or once their world table exists.
- Wounds fill slots from the bottom up: empty slots first, then coin slots,
  then the lowest item. An item in a wounded slot is **Unusable**, not
  "dropped" as the book has it: the table decides later whether it was
  dropped or broken (user ruling 2026-11-14).
- Every character has an **improvised attack**: d4 with STR, no item, no
  slot, in the Attack window (`rolls.js` `IMPROVISED_ID`; user ruling
  2026-11-14).
- No failed-career hack: Knave 2e gives two careers (removed 2026-11-14).
- Blank Sheet is the GM's: players create random characters only (2026-11-14).
- Item order: a new inventory item is placed by band (weapons, armor, spellbooks, the rest)
  under the last row of its band, whatever sort it brings (`KnaveryItem._preCreateOperation`).
- Alignment and Background (Knave 1e traits) are hidden unless their switch (`show-alignment`,
  `show-background`) is on, and then show on the Knave page, never on Description; hidden ones are
  not rolled (`settings.js` `traitShown`). Backstory (`system.biography`) is guided to 35 words by a
  counter, never a limit (user, 2026-11-14).
- Item badges: `system.kind` (Ordinary, Magic, Relic, Potion; any item type) and the item type give
  each Inventory row a chit (`actor-sheet.js` `itemBadge`); magic gear keeps its type icon, glowing
  (user, 2026-11-14).
- Rations and torches per slot are the GM's settings `rations-per-slot` and `torches-per-slot` (Configure Inventory,
  Hacks; default 1 in both editions). Candles and arrows keep the shipped items' own bundles: 10 candles, 20 arrows
  a slot (user, 2026-11-14: no settings for them).
- Rest follows p12: HP back to max only after two watches of sleep and a meal; a safe haven
  also heals one wound; spellbooks reset either way (the sheet's Rest window, `KnaveryActor.rest`).
- Char Gen Mode holds every sheet's abilities, the GM's too, to the level's points: 3 + 3 per level
  above 1, no score above level + 2 (`level-up.js` `abilityBudget`, enforced in the sheet's
  `_prepareSubmitData`; user ruling 2026-11-14). With Char Gen Mode off the GM sets any score.
- Random creation rolls 3d6 for the abilities unless the player ticks "Place the 3 ability points
  myself" (user, 2026-11-14).

- Combat (0.3.0, user rulings 2026-11-14): a power attack is declared in the Attack window (the tick stays;
  no card button); Knave 1e hits only above the defense; the Damage page is the Combat page; a fall marks
  the combatant defeated (and 1e 0 HP unconscious) only when crossing the line, cleared on healing, the
  GM's own skull always wins; no first-casualty morale card and no Rally under 1e attacks; the leader's fall
  is a breaking point in both editions.


- Rules found by the 0.3.0 audit (user approved 2026-11-14): a rest eats one ration; a shell Names table falls
  back to the system's own list (`names.js`, this project's writing); the 2e kit adds a quiver with a missile
  weapon; a 2e cast asks the level (1 to INT) and every cast card shows the save; the GM may add a third career;
  companions are an NPC role made by Create NPC (`system.employer`); Carouse (Dice) and Forage (Time) run the
  book's procedures with the numbers only.


## Foundry v14 gotchas met so far
- An AppV2 window with `height: "auto"` is capped at the screen by core's `.application` max-height, and its
  `.window-content` hides overflow: a long window clipped its rows and its Save footer. Give the long part
  `flex: 1 1 auto; min-height: 0; overflow: auto` (settings menus, 0.3.0). A `#name` key in a settings group
  is a section heading; a setting whose hint key is missing shows no hint (`settings.js`).
- Re-preparing actors after a setting changes: `reset()` (settings.js `reprepareActors`), never
  `prepareData()` alone, which applies Active Effects again on top (review #2).
- Dialog content ids carry the window's own `idp` (`foundry.utils.randomID()`): two dialogs can be
  open at once, and a `<label for>` resolves to the first matching id in the page.
- Notifications with names: pass the key and `{format: {...}}`, so core escapes the values.
- `system.json` `gmOnlyFields` makes the server refuse a player's write (gmNotes).
- `FilePathField({categories: []})` throws in init; use `type: String` with
  `filePicker: "folder"`.
- Pack YAML must carry `folder: null`, `sort: 0` and `ownership: {default: 0}`
  on top-level documents. Otherwise the first world launch migrates the pack
  and the build guard reports drift.
- A `.background-line` (Air Bladder CSS) spans two grid columns. The name
  section pins its children with `grid-column: 1 / -1`.
- Loading compendium documents is slow on the CT (≈0.6 s each). Use pack
  indexes for lists.
- Pack text must survive a world launch unchanged: StringField trims, so a journal
  page whose HTML opened with a newline came back without it, and the pack build
  guard (and the probe fleet, whose setup starts the app before the deploy) reported
  drift on every server. The generator trims the guide HTML (2026-11-13).
