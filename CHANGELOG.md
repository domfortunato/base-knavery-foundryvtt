# Changelog

## Unreleased

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
- **A welcome window** for the GM after each update: the system, its author, that it is
  unofficial, the Knave 2e credit, the Made for Knave logo and where to buy the book. The
  Settings sidebar gains Welcome & credits, Rulebook and (for the GM) Dashboard buttons.
- The Configure submenus render again: their template had never been committed. Path settings
  (the portrait folder, the rulebook) get core's file picker.
- The README shows the yellow Made for Knave logo at a modest size.

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
