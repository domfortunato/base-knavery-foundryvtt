# Changelog

## Unreleased

- **Traits that fill.** The ten character traits (Physique to Misfortune) were Knave 1st-edition tables that
  Knave 2e's book does not have, so they always came out blank. Their tables now ship filled from Knave's first
  edition, which is CC BY 4.0 (credited in each table, LICENSE.txt, the README and the welcome window). Two
  Knave 2e traits, Personality and Mannerism, come first and fill from your rulebook PDF.
- Create Character is two big buttons: Randomly Generated and Blank Sheet, each with one line.
- The name d20 on the sheet joins a surname's two halves ("Adder-" + "bald") instead of leaving a trailing hyphen.
- The portrait picker rolls a random portrait in Char Gen Mode.
- The Inventory tab says how many coins the character has.
- The failed career stands on its own "Failed Career" line on the Knave page, and its Growth card carries a
  "Failed Career" band.
- **Bigger text, and your own text size.** Base Knavery's windows default to Large, and each player picks
  Normal, Large, Larger or Largest under Configure Settings → Base Knavery. Sheets and the dashboard open
  larger to match. Chat cards keep their size.
- The sheet footer is one short line; the welcome window keeps the full disclaimer and credits.
- The equip toggle is a fist.
- Traits open expanded, a Blank character starts with its traits rolled, and Char Gen Mode adds Roll every trait.
- Careers and the failed career change only at level 1, in Char Gen Mode (the GM can always): each career card
  rerolls or picks a replacement, which takes back the old career's items and gives the new one's. Removing a
  career takes back its items too. A career's items now sit on their own rows.
- The failed career's petty item is its own option in the Hacks settings, on by default.
- The settings windows' labels no longer wrap with gaps.
- **Char Gen Mode** (was Character Creation Mode). Players edit ability scores only with it on, and level and XP
  only when the GM's new switch "Players may change level & XP" is on too (dashboard, settings and a macro).
- An up arrow in the character's title bar when Char Gen Mode is on and the XP is there: it opens Level Up.
- Random creation asks where the 3 ability points go (or lets 3d6 decide), then rolls the rest. A character
  gets one spellbook per point of INT it starts with; a level-3 character no longer gets books for INT gained
  by its levels.
- The dashboard's XP tab: the same amount to each character, a different amount to each, or a total split evenly.
- New settings for max HP at each level (Knave 2e's reroll, add 1d6, or reroll keeping the better) and for
  first-level HP (1d6 or 1d4 + 2). The Growth page says what the next level brings.
- The Game Master's notes on the Growth page: the GM writes them, the player reads them.
- New hack, "Give Knaves a failed career": a third career the Knave failed at, granting one random item of its
  list, petty (no slot) while that Knave carries it. The Knave and Growth pages mark it; the die rolls one in
  Char Gen Mode.
- The ability roll link has a large d20 beside the name; both light up and show the tooltip. The AC tooltip
  states the rule: AC = 11 plus 1 per piece of equipped armor.
- The taglines under the abilities now list what each is used for, e.g. Strength: melee attacks,
  lifting, climbing, breaking free.
- The GLOG grimoire hack is gone. In a world that used it, a Grimoire is now an ordinary item
  and its spellbooks return to the inventory, taking slots and casting the Knave way.
- The actor sheet laid out after the Knave 2e sheet: the pages on a thumb-tab rail off the
  window's edge (DB Mythic's); the Knave page with the portrait, name, careers, level and coins
  over six circled abilities, AC in a shield, HP and wounds as bars, Rest, Heal Wound, the Die
  of Fate and the attacks; then Inventory (with a slots strip), Growth (the level ladder and
  careers) and Description (traits, biography, notes). The NPC sheet follows the same frame.
- The saves strip (Paralysis, Breath & Blast…) left the sheet; the GM dashboard, the print
  sheet and `game.knavery.rollSave` still roll them.
- The footer credits Knave: Second Edition to Ben Milton and Questing Beast LLC beside the
  Made for Knave logo, which swaps to its white version on the dark theme.
- The guide pack ships its page HTML trimmed, as Foundry stores it, so opening a world no
  longer rewrites the pack.
- **Your rulebook inside Foundry.** **Choose from this computer** (welcome window, dashboard,
  Configure Rulebook) uploads your own copy of the Knave 2e PDF to the server's
  `knavery-rulebook` folder and opens it; a PDF already on the server can be picked instead.
  Only its path is stored.
  It opens in Foundry's pdf.js viewer; **B** toggles it; the dashboard's tables carry a book icon
  at their page, and the table importer offers the page too; the GM can show a page to players
  when they are allowed to read it. A page-offset setting serves other printings.
- **Tables from your rulebook.** Build tables from the book (dashboard, Configure Rulebook, and
  right after you choose your PDF) reads every table in your copy of Knave 2e in your browser:
  careers, spells, names (male and female, 1d200), surnames (now joined from the book's two
  halves), reaction, and some seventy more, from weather to weaknesses. A review shows each
  table's rows to correct or untick; then they become world roll tables in a "From your
  rulebook" folder, and the system rolls on them at once. A rebuild replaces only tables it
  built that you have not changed; anything you made, imported or edited is kept. Spellbooks
  rolled at creation carry the spell's effect.
- **A welcome window** for the GM after each update: the system, its author, that it is
  unofficial, the Knave 2e credit, the Made for Knave logo and where to buy the book. The
  Settings sidebar gains Welcome & credits, Rulebook and (for the GM) Dashboard buttons.
- The Configure submenus render again: their template had never been committed. Path settings
  (the portrait folder, the rulebook) get core's file picker.
- The README shows the yellow Made for Knave logo at a modest size.
- **Fixes from the first Foundry review:**
  - Sheets you can only look at (a bestiary creature in its compendium, another player's
    character) keep their page tabs, the Die of Fate and the NPC Check working.
  - A career's Active Effects (say +2 max HP) no longer add up on every edit: the sheet's
    boxes hold the stored value, and a dashed outline and tooltip show the value in play.
    Level-up works from the stored values too.
  - Pressing Enter in the roll prompt rolls Normal, not Disadvantage; in the level-up
    dialog it levels up with the ticked abilities, not at random.
  - Only the roller and the GM get a damage card's Apply buttons. The GM applies a relayed
    request only from that card's author, for its total, to targets they can see. An
    applied card says so, and asks before applying again. Damage to a hidden token is
    reported to the GM only.
  - An item offer whose card names someone else's item can no longer be accepted.
  - Item descriptions, biographies, notes and career texts can no longer carry working
    sheet buttons or form fields.
  - Rolls from sheets follow the chat's roll mode; the dashboard's private rolls use
    Foundry's new message modes.
  - Duplicating or importing an actor keeps its token settings. New hirelings and
    companions start friendly, other NPCs neutral, monsters hostile.
  - The marketplace loads its stock in one request per compendium, takes the coins before
    handing over the item, rounds a fractional price up, allows one purchase at a time, and
    offers the free Take only when the player may use the creation tools. Aisle rows are
    renumbered after an add or a remove.
  - A rulebook-built table you have linked to items, re-imaged or given a new formula
    counts as yours, and a rebuild keeps it.
  - The table importer writes the new rows before removing the old ones, and turns a link
    that names nothing into a plain text row instead of failing.
  - A player's Create Character is always answered: refused, failed or made, and only once.
  - B closes the rulebook while you are reading in it, and the reader keeps its page when
    popped out or when settings are saved.
  - A limited viewer sees no page rail. Pick-lists ignore Enter with nothing chosen.
    "1 wound" and "1 spellbook" read right. A weapon with no dice for damage still attacks.
    A monster casts at its level.
  - The disclaimer reads the same everywhere. The rulebook settings say plainly what
    "Players may read it" does and does not do.
  - Releases are headed "Base Knavery", and a refused release can be retried.

## 0.1.0

First release: a Knave 2e-compatible system on ApplicationV2 for Foundry v14.

- Character sheet in the Air Bladder layout:
  - pronouns beside the name; careers, level and XP; HP, AC, wounds and coins
  - Rest, Heal Wound and the Die of Fate; six abilities with their defenses
  - value highlighting and status banners; Print
- Edge prompt on every check, save and attack (Disadvantage, Normal, Advantage):
  - two paradigms: Knave 2e's ±5, or 2d20 keep-high/low
  - "Roll damage at the same time", ticked by default
- Attacks roll against each target's AC, with free maneuvers at 21+, weapon breaks on a natural 1, and power attacks.
- Damage fills wound slots from the top once HP is gone; direct damage; monsters die at 0 HP.
- Inventory:
  - 10 + CON slots; equipping armor sets AC; equipped weapons become attacks
  - give and receive items between players
- Marketplace with aisles, and the GM's Marketplace Manager for aisles, stock, price overrides and hiding.
- Character creation, random or from a blank sheet, at a level within the GM's range.
- Character Creation Mode with dice and pick-lists, and Level Up.
- Careers as custom backgrounds: sheet features, starting items and Active Effects.
- Portrait gallery and picker; the change log of hand edits.
- The Game Master's Dashboard:
  - roll requests with a reason, and their results
  - damage, hazard dice, reaction, encounter distance and morale
  - tables, and the player-tool switches
- Table importer: every shipped table is an empty shell for the GM to fill.
- GM macros; a statistics-only bestiary and hirelings; gear with prices.
- The GLOG grimoire hack; hard-mode wounds; an in-world guide.
