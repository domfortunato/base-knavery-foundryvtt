# Changelog

## Unreleased

- **An improvised attack for everyone:** d4 with STR, no item and no slot, always in the Attack window. The
  Attack button is never greyed out now.
- **Wounds make items unusable.** A wound with no empty slot lands on the lowest coin slot or item and marks it
  Unusable (it was "drop it"): the table decides whether it was dropped or broken.
- Level, XP and Coins sit under the abilities, with a half-width XP bar; Slots sits under the HP and Wounds bars.
- Brighter glow on the ability rolls, larger defense numbers, and careers side by side on the Growth page.
- The character sheet opens just tall enough for the Knave page; the traits on the Description page are smaller and lighter.
- The HP bar turns gold when HP is below its maximum.
- **The Knave page, rearranged.** Level, XP (with its progress bar) and Coins sit in a band at the bottom; the head
  keeps the name, Careers and Slots. Level and XP are plain text unless Char Gen Mode is on.
- HP and Wounds change with + and − under each bar; their current values are no longer typed. Wounds − replaces
  the Heal Wound button.
- The failed-career hack is gone (Knave gives each character two careers, and that is all). Worlds that used it
  keep those careers as ordinary ones, and their petty items take a slot like any other.
- The thumb rail has an Attack button too, under the pages: the Attack window from any page.
- The d20 beside each ability is a little smaller.
- **A narrower character sheet:** as wide as the abilities and vitals. Inventory, Growth and Description fit one
  column, and dragging the sheet wider brings back two. Max HP, wounds, AC and the buttons read larger.
- **One Attack button** (with the damage splat) replaces the Attacks list: it opens a window to choose an equipped
  weapon, Disadvantage, Normal or Advantage, a modifier, damage in the same card and a power attack.
- Ability scores above 0 stand out in gold; zeros sit back.
- The welcome window's intro is lighter, Knave 1e's CC BY 4.0 licence has its own notice with a link and the
  changes made, and the sheet footer says Base Knavery is an unofficial fan-made system for Knave Second Edition.
- The welcome window opens each time a Game Master loads the world, not only after an update. Turn it off with
  "Welcome window on start" in the General settings.
- **Knave 1e rules, one switch each, in the Hacks settings:** a level every 1,000 XP; random ability raises by
  1e's d20 against defense (Level Up's Random button and random creation above level 1); and group initiative,
  one d6 at the start of each round (1–3 the enemies act first, 4–6 the PCs), rolled by the Game Master. The
  "Max HP at each new level" setting gains 1e's one d8 per level, and first-level HP gains 1d8.
- **More of Knave 1e, which is CC BY 4.0.** Reaction, Alignment (a new trait), the starting-gear tables and the
  100 level-less spells ship filled. A table you build from your 2e book replaces its 1e counterpart by name.
  Random spellbooks draw from your own Spells table once it has rows, otherwise from 1e's; the new "Spell list"
  setting can switch back to 1e. A new hack, "Knave 1e starting gear", rolls 1e's armor, helmet and shield and
  four items at creation (1e armor at AC 12/13/14 becomes 1/2/3 armor points).
- **Traits that fill.** The ten character traits (Physique to Misfortune) were Knave 1st-edition tables that
  Knave 2e's book does not have, so they always came out blank. Their tables now ship filled from Knave's first
  edition, which is CC BY 4.0 (credited in each table, LICENSE.txt, the README and the welcome window). Two
  Knave 2e traits, Personality and Mannerism, come first and fill from your rulebook PDF.
- Create Character is two big buttons: Randomly Generated and Blank Sheet, each with one line.
- The name d20 on the sheet joins a surname's two halves ("Adder-" + "bald") instead of leaving a trailing hyphen.
- The portrait picker rolls a random portrait in Char Gen Mode.
- The Inventory tab says how many coins the character has.
- **Bigger text, and your own text size.** Base Knavery's windows default to Large, and each player picks
  Normal, Large, Larger or Largest under Configure Settings → Base Knavery. Sheets and the dashboard open
  larger to match. Chat cards keep their size.
- The sheet footer is one short line; the welcome window keeps the full disclaimer and credits.
- The equip toggle is a fist.
- Traits open expanded, a Blank character starts with its traits rolled, and Char Gen Mode adds Roll every trait.
- Careers change only at level 1, in Char Gen Mode (the GM can always): each career card
  rerolls or picks a replacement, which takes back the old career's items and gives the new one's. Removing a
  career takes back its items too. A career's items now sit on their own rows.
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
