# Base Knavery™

A [Foundry VTT](https://foundryvtt.com) game system for **Knave**, first and
second editions. Use it to run old TSR modules, OSE and other OSR adventures,
Dungeon Crawl Classics adventures, and Knave hacks. Built on ApplicationV2
throughout, for Foundry v14.

## Which rules

- **Knave 1e is built in.** A new world plays Knave first edition as written:
  abilities as the lowest of 3d6, rolled starting gear, unconscious at 0 HP
  and dead below it, d8 + CON healing, any number of spellbooks a day. Its
  rules, tables and 100 level-less spells ship with the system (CC BY 4.0).
  The [Knave PDF is on itch](https://questingbeast.itch.io/knave), if you
  want to support its author.
- **Knave 2e relies on your purchased copy of the book.** Upload your Knave 2e PDF and build its tables;
  the system then offers to switch the world to 2e rules (careers, wounds,
  2e healing, INT spellbooks a day). Characters you already have don't change.
- **Mix them.** Every rule has its own switch under **Configure Rules**, and
  the Rules choice at its top sets them all to one edition.
- A world made before 0.2.0 keeps the Knave 2e rules it played.

*Base Knavery is an independent production of Dom Bosco and is not affiliated
with Questing Beast LLC.*

<p align="center"><img src="logo/made-for-knave-yellow.png" alt="Made for Knave" width="260"></p>

## Install

In Foundry's **Game Systems → Install System**, paste the manifest URL:

```
https://github.com/domfortunato/base-knavery-foundryvtt/releases/latest/download/system.json
```

## What you get

**The character sheet**
- Laid out after the Knave 2e sheet, its pages on a thumb-tab rail off the
  window's edge: **Knave**, **Inventory**, **Growth** and **Description**.
- The Knave page: portrait, name with **pronouns** beside it, careers, level,
  XP and coins over six circled abilities (each showing its defense), AC in a
  shield, HP and wounds as bars, and the attacks.
- **Rest**, **Heal Wound** and the **Die of Fate**.
- Growth holds the level ladder and the careers; Description the traits,
  biography and notes.
- Values highlight when they are low or in peril (amber below max, red at 0),
  and banners appear for no HP, wounded slots, overburdened and dead.

**Rolls**
- Every check, save and attack asks **Disadvantage / Normal / Advantage**.
- The GM chooses how edges work:
  - *Knave 2e as written*: +5 / −5.
  - *2d20*: keep the higher or the lower die.
- Attacks have a **"Roll damage at the same time"** box, ticked by default.
- Attacks roll d20 + STR (melee) or WIS (ranged) against each targeted
  token's AC.
  - A total of 21 or more flags a free maneuver.
  - A natural 1 breaks the weapon. This is a setting.
  - A power attack doubles the damage dice.
- Saves from other games (paralysis, breath and blast, poison and death,
  magic device, spells) resolve as the matching ability check.

**Rules, one switch each** (Settings → Configure Rules; the Rules choice at the
top sets them all to Knave 1e or Knave 2e)
- Ability scores: 1e's lowest of 3d6 with an optional swap, or 2e's 3 points.
- Starting kit: 1e's rolled gear, two rations and a weapon of choice; 2e's two
  careers and coins; or the careers plus the 1e gear tables.
- Death: 1e's unconscious at 0 HP and dead below it, or 2e's wounds.
- Healing: 1e's d8 + CON a night (a safe haven, all HP), or 2e's full HP.
- Spells: 1e's any number of books a day, or 2e's as many as INT.
- A level every 1,000 XP, in place of 2e's XP table.
- Group initiative: one d6 a round, 1–3 the enemies act first, 4–6 the PCs.
- Max HP at each new level: 1e's one d8 per level (below the old maximum,
  +1), with 1d8 at first level.
- Outside the presets: random ability raises by 1e's method (a d20 against
  each ability's defense until three have risen), hard-mode wounds and the
  hazard dice.

**Damage and wounds** (Knave 2e's death rule)
- Damage comes off HP first. Each point past 0 fills an item slot with a
  wound, from the bottom up: empty slots, then coins, then the lowest item,
  which is marked *Unusable* until the wound heals.
- Direct damage skips HP. Monsters take it tripled.

**Inventory**
- 10 + CON slots, and every full 500 coins fill one.
- Equipping armor raises AC (11 + armor points, at most 7).
- Equipping a weapon adds it to **Attacks**.
- **Give** an item to another character: the other player accepts it on a chat
  card, and no GM needs to be online.

**Marketplace**
- Aisles of gear with prices.
- The GM's **Marketplace Manager** can add aisles, stock them by drag and drop,
  override prices and hide aisles.

**Character creation**
- **Create Character** makes a **random** knave; the GM can also make a
  **blank sheet**.
- The player chooses a starting level within the range the GM allows.
- **Char Gen Mode** adds dice and pick-lists to every field.
- **Level Up** appears once the XP is there.
- **Careers** are custom backgrounds. A career can:
  - add fields to the sheet (text, numbers, checkboxes, tracks, dice);
  - grant starting items;
  - carry Active Effects for mechanical bonuses.

**Portraits**
- A gallery and picker with four art sets, your own portrait folder, or any
  image path.

**Change log**
- Every hand edit to a sheet is whispered to the GM and the owners.

**The Game Master's Dashboard**
- Ask players for a check or save **and say why**. Each player sees the reason
  and a locked difficulty, and the results come back to the dashboard.
- Apply damage.
- Hazard dice, reaction, encounter distance and morale.
- Every table the system rolls on.
- Switches for the players' tools.

**Your rulebook, inside Foundry**
- **Choose your own copy** of the Knave 2e PDF from your computer; it is
  uploaded to your Foundry server and opens. Nothing of the book ships with the
  system, which stores only the file's path.
- It opens in Foundry's own PDF viewer, with the book's outline and search.
  **B** opens and closes it.
- The dashboard puts a book icon on each table at its page, so you can read
  the table while you fill it.
- **Show this page to players** opens the same page for everyone, when you let
  players read it.
- **Build tables from the book**: Base Knavery reads every table in your copy
  (careers, spells, names, reaction, and about seventy more) and, after you
  review and correct the rows, writes them as roll tables in your world, where
  the system rolls on them at once. Rebuilding never overwrites a table you
  made or edited.

**Welcome window**
- Opens for the GM at every login (a setting turns it off): what Base Knavery is, that it is
  unofficial, which rules this world plays, the credits, and where to buy
  Knave 1e and Knave 2e. Anyone can open it from
  the Settings sidebar.

**GM macros**
- Toggle the player marketplace, character creation, Char Gen Mode, level & XP and the
  change log.
- Open the dashboard, the Marketplace Manager and the table importer.

**Bestiary**
- Classic monsters and hirelings as statistics, ready to drop on a scene.

## The tables are yours to fill

Knave 2e's text is not licensed for reuse, so **every rollable table ships as
an empty shell**. That covers careers, spells, names and mishaps.
(The exceptions come from Knave's first edition, which is CC BY 4.0, and ship
filled: the character traits, alignment, reaction, starting gear and 100
level-less spells. A table you build from your 2e book replaces its 1e
counterpart; the spell list can be switched back to 1e in the settings.) Each shell has the right name and dice. With your own copy of the PDF,
**Build tables from the book** fills them for you (see above); otherwise:

To fill a table:
1. Open the GM Dashboard, go to **Tables**, and click **Import** next to it.
2. Paste your rows, e.g. `01-05 Rat-catcher: cage, sack, terrier`.

This creates a **world** table with the same name, and the system uses it from
then on. Careers written as `Name: item, item, item` bring their starting items
with them.

## Licensing

See [LICENSE.txt](LICENSE.txt).
- The code is **MIT** and descends from Air Bladder and Cairn-FoundryVTT.
- The name **Base Knavery** is not part of the MIT licence: fork and change the
  code freely, but give a modified version you share its own name. Saying it is
  based on or compatible with Base Knavery is welcome.
- The character traits, alignment, reaction, starting gear and the 100
  level-less spells are from *Knave* (first edition) by Ben Milton, licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- The art keeps its own licences:
  - game-icons.net, CC BY 3.0
  - Jon Aspeheim, CC BY 4.0
  - tlomdev, CC BY-SA 4.0
  - Lydia Comer, CC BY-NC-SA 4.0 (so the system as a whole may not be sold); the
    welcome window's knight is hers too, used with her permission
- The "Made for Knave" logo is © Questing Beast LLC, used under the Knave:
  Second Edition Third Party License. Knave: Second Edition is © Ben Milton and
  Questing Beast LLC; its own logo is not used, as that licence requires.
- This README shows the yellow Made for Knave logo; the system shows the black
  and white ones.
- The sheet's thumb-tab rail follows DB Mythic's, itself after Mythic-pwd's,
  and the rulebook reader follows Mythic-pwd's (PrinceWitherdick).
- The system contains no text from Knave 2e and none from Dungeon Crawl
  Classics.
