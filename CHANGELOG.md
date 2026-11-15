# Changelog

## Unreleased

- Removed: the "Knave 1e random ability raises" switch under Advancement. Level Up's Random button raises
  three different abilities at random in every world.
- The Game Master's Dashboard's Random page is now **Dice**.
- Removed: the "Hazard dice on the Random page" switch (Configure General and the Toggles page). The hazard dice
  and the Time page's clock always show.
- The Printing settings have their own window, **Configure Printing**, out of Configure General.
- Ready for translations, step one: the system finds its tables, items, market aisles and Guide pages by a
  hidden key as well as by name, so a table or compendium entry in another language still works. The table
  importer has **Use as**: a pasted table under any name can stand in for one of the system's (a Careers table
  in your language, for example).
- Ready for translations, step two: plurals follow each language's rules (Polish has three forms, for example),
  lists of names read the language's way ("Alice, Bob and Carol"), coins and XP get the language's thousands
  separator ("1,234 coins"), and a label and its number sit in one translatable phrase ("Slots 3 / 10").
  `TRANSLATING.md` explains how to send a translation or publish one as a module.
- Ready for translations, step three: `babele-template/` lists every translatable compendium entry (the Guide,
  gear, bestiary and the Knave 1e tables and spells) for a Babele translation module, and a translated Knave 1e
  starting-gear table still gives the right items.

## 0.3.0

- For the probe fleet: `dev:fresh`, a story in a world no Game Master has opened: it plays Knave 1e as written,
  gets the GM's own book, builds its tables, takes the offer and switches to Knave 2e, and checks what the switch
  leaves alone.
- **The Guide, rewritten.** Ten pages, each titled with its reader: Start Here (GM); Your Knave and Rolling and
  Fighting (players); then the GM's Rules, Settings, the Game Master's Dashboard, Your Rulebook and the Tables,
  Characters, NPCs and Monsters, Combat, Damage and Morale, and Items, Careers and the Marketplace. Every page
  opens with where the thing is and what to click, names windows and buttons as they read on screen, and links
  the other pages. **Open the guide** lands a player on Your Knave and the GM on Start Here; every Configure
  window, the dashboard's rail and the Settings sidebar have a Guide button that opens their own page.
- **The printed sheet is one page**, on A4 and US Letter alike, in both editions: the head (portrait, name, level,
  title and XP, then careers under Knave 2e or alignment and background under Knave 1e), the six abilities with
  their defenses, a vitals strip (AC, HP, wounds, coins, spells cast today as tick boxes), one numbered row per
  slot with coins after the gear, empty slots as pencil lines and wounds marked from the bottom (an item in a
  wounded slot is struck through as Unusable), the traits as a compact grid, career features without their
  descriptions, a Spells list with a box per book or scroll, the backstory (six lines at most) and Notes ruled to
  the foot. Knave 1e weapons and armor print their quality as boxes to pencil in wear. The footer carries the
  short disclaimer and the Knave 1e CC BY credit. The old Saves block is gone.
- **Printing settings** under Configure General: paper (Auto, A4, US Letter), text size (9.5 or 10 pt), and
  whether career features, the backstory and the ruled lines print. The sheet stays one page at every choice.
- **Create Item** (Game Master): in the Items directory and on the dashboard's Marketplace page. Pick a kind,
  weapon, armor, gear or tool, potion, relic, spellbook or chaos spellbook, and its fields come filled in for
  your price list: the die by hands and reach, armor points by type, slots, a price band, the magic, relic or
  potion badge, and under Knave 1e attacks its quality. Roll beside the name or the effect draws on the tables
  you built from your own book (Weapons, Tools, Miscellaneous Items, Books, Clothing Items, Treasures, Potions
  with their textures, tastes, colors and ingredients, Item Traits, Materials, Symbols and Domains, the spell
  formulae); a table you have not built yet says so in the Roll's tooltip. Create puts the item in the Items
  directory, in a character's or NPC's inventory, or on one of your marketplace aisles, and opens its sheet.
- **A rest eats a ration** (the stack with the fewest left), and says so; an empty pack is said too.
- **A new knave always has a name:** when the Names table is still a shell (a Knave 1e world, or a 2e world before
  its book is built) the system's own list of names steps in. No more "Nameless Knave".
- **A quiver of 20 arrows** comes with a missile weapon in the Knave 2e starting kit.
- **Spells:** under Knave 2e a book may be cast below INT (a level prompt), and every cast card carries the
  save line: 2e a check against 11 + level (halved, or ended by 10 over); 1e INT against the level.
- **The GM may give a third career** (Knave 2e career training); players stay at two.
- **Companions:** Create NPC makes a companion of a knave (half share of XP, no morale tests).
- **Carouse** (Random page, Downtime): a knave, a village / town / city, the night's cost and XP, the morning's
  CON check and the mishap from your table. **Forage** (Time page, travelling): a WIS check for d6 rations, and
  the watch ends.
- **Combat by side, both editions.** *Initiative* in Configure Rules is a choice: Knave 1e (one d6 a round, by
  side), Knave 2e (one CHA check between the sides' leaders decides who acts first, and the order holds for the
  fight) or Individual (Foundry's roll per token). Under a side rule the Combat Tracker lists Player characters
  and Enemies under two headers, the acting side lit, with a tick per row for who has acted (cleared each
  round) and a **Next side** button; no side numbers show. The leaders are the party's highest CHA and the
  enemies' highest level unless you pick them. The old "Knave 1e group initiative" switch is gone.
- **The Damage page is now Combat:** the running round and acting side, Roll initiative by the rule, Next side,
  *They are surprised* / *We are surprised* (round 1 without a roll, with the +5 reminder), Mark selected
  defeated, Morale and Rally for the selection, the leaders, and **hazard presets** (falling, fire, on fire,
  freezing, lightning) that fill the damage box. Direct damage hides under Knave 1e.
- **A fall marks the tracker.** Dead marks the combatant defeated with the overlay; a Knave 1e character at 0 HP
  is Unconscious; healing takes both off again. Your own skull always wins.
- **Knave 1e attacks hit only above the defense** (an equal total misses), and the Attack window offers an
  **Ideal weapon** tick (+1 damage die, at the GM's word). A ranged weapon shows the melee reminder.
- **Advantage follows the edition:** 2d20 under Knave 1e, ±5 under Knave 2e, now in Configure Rules.
- **Morale by edition:** no first-casualty card and no Rally under Knave 1e; a side's leader falling is a breaking
  point in both.
- **The dashboard's Toggles page** holds the players' switches and gains two (Players may read the rulebook,
  Hazard dice on the Random page), one switch per **portrait gallery** (Yours, Portraits, Lydia Comer, Tlomdev,
  Icons: a gallery that is off leaves the portrait picker and the random portraits) and **Random portraits
  from:** any gallery that is on, or one named gallery, with your own folder's path and a Rescan. Your folder no
  longer takes over random portraits silently whenever it has files; choose it as the source instead.
- **A Marketplace page on the dashboard** (a stack of coins on the rail) holds the aisles, their rows and
  prices; the separate Marketplace Manager window is gone.
- **Configure windows that scroll, align and say less.** Every Base Knavery Configure window scrolls its rows
  under a Save button that stays in reach; a checkbox sits on its label's line; a thin rule separates the
  rows; every choice fits its box ("Knave 1e: …" / "Knave 2e: …"); a hint is one short sentence or absent.
  The Rules window has section headings: Creation, Hit points, Death and healing, Spells, Combat, Money,
  Advancement. *Hazard dice on the Random page* moved to Configure General (it is not a rule).
- **Configure Inventory has a Hacks section:** Rations per slot (now any number up to 10) and the new
  **Torches per slot** (1 to 5). Candles and arrows keep the books' own bundles: 10 candles and 20 arrows
  to a slot.
- **One text size.** The per-player "Text size in Base Knavery windows" setting (0.1.1) is gone; every Base
  Knavery window has one size. For bigger text use Foundry's own Font Size (Configure Settings → Core →
  Interface Configuration).
- **Dashboard section headings** are small caps on a rule, sized like the item sheet's, instead of core's
  page-sized headings.
- **A hazard card pressed twice** asks "Roll for spoiled rations again?" (or Burn, or Fatigue) instead of
  "Damage already applied".
- **The welcome window's notice** (unofficial, fan-made) is set in italic; the README and the Foundry listing
  follow.
- Two tooltips said wounds fill slots "from the top"; they fill from the bottom up, as the sheet does.
- **The Dungeon and Travel hazard dice** head the Random page too, as plain buttons (the Time page's End
  turn / End watch still rolls them and moves the clock).
- **The Random page grows:** Activity and a Surprise shortcut (it sets up the closest PC's WIS check on Requests) join
  the encounter rolls; **On the fly** rolls a Monster or a quick NPC (name, personality, profession,
  detail in one card); **Downtime** rolls a Carousing mishap. All from your Knave 2e tables, whispered.
- **The dashboard's title bar names the page** ("Game Master's Dashboard: Party"), and its rail has a
  **Guide** button that opens the Base Knavery guide.
- **Show to players** sits in words on the rulebook's title bar for the GM, no longer in the ⋮ menu.
- **The portrait picker's credits link** to each gallery's page (game-icons.net for the icons).
- **The dashboard's Dice page is now Random**, with an **Events** section: weather, travel and delve
  shifts, signs, city events and disasters, each rolled (whispered to the GM) from the table built from
  your Knave 2e book; a button stays off until its table exists.
- **Difficulty guide** under the Requests tab's Difficulty: 0 to 10, 5 for most tasks; against a creature,
  its ability score or level; the situation sets the edge (Knave 2e p7, Knave 1e p2, in our words).
- **The Game Master's Dashboard** opens from a big button at the top of the left toolbar (the GM's
  only; the toolbar moves down for it). Its pages are on a thumb-tab rail off the window's edge, as on
  the character sheet, in place of the tab strip, and the players' switches have a page of their own
  (**Toggles**), apart from Tables.
- **Requests set the edge:** the dashboard's Requests tab has an Edge choice (the player chooses,
  Disadvantage, Normal or Advantage). A set edge leaves the player one button, "The GM set this roll";
  the card and the results list say which. **All** beside Who ticks every character (or none).
- **Generate a spell** (Knave 2e p27), at the GM's request: on the dashboard's Requests tab choose
  *Generate a spell* and the characters. Each player's window rolls a formula and its words (wizard
  name, quality, effect, element, form); they may roll one word again and adjust the wording, then add
  it as a spellbook, its effect left for the player and the GM to agree. A card shows it, and the
  request's result reads the spell's name. The tables come from your Knave 2e book (the table builder)
  or the table importer; the window names any that are missing.

## 0.2.0

- **Knave 1e out of the box.** A new world plays Knave first edition as written; Knave 2e comes with
  your own book; any rule can be mixed. Settings → **Configure Rules** (the old Hacks window) opens with
  a Rules choice, Knave 1e, Knave 2e or Custom, that sets every rule below it:
  - Ability scores: 1e's lowest of 3d6 for each, then swap two if you like (a window shows the six
    rolls), or 2e's 3 points.
  - Starting kit: 1e's rolled armor and gear, two rations and a weapon of your choice (a window asks),
    no coins and no spellbook; 2e's two careers and coins; or the careers plus the 1e gear tables (what
    the old starting-gear hack did).
  - Death: 1e's unconscious at 0 HP and dead below it, with no wounds (the Wounds bar and the Direct
    damage button go), or 2e's wounds.
  - Healing: 1e's d8 + CON after a night's rest and a meal, all HP in a safe haven; or 2e's.
  - Spells a day: 1e's any number, each book once (a spell card's level is the caster's level); or 2e's
    as many as INT.
  - First-level and level-up HP, the XP ladder, group initiative, Alignment and Background, and the
    spell list follow the choice too.
  - A world made before this version keeps the Knave 2e rules it played: at the first Game Master
    login, every rule it never set is written with its 2e value. (A player who logs in before any GM
    sees the 1e defaults until then.)
  - Building tables from your Knave 2e book now asks: "Switch this world to Knave 2e rules?" Characters
    you already have keep their numbers and items either way.
  - In a 1e world, Personality and Mannerism (2e tables) stay hidden until their tables are built.
  - Attacks: 1e's quality and critical hits, or 2e's breakage. Under 1e a weapon has 3 quality and armor
    1 to 7. A natural 20 rolls one more damage die and puts a **Wear armor** button on the card for each
    target hit: the target's owner (the GM for a monster) picks the piece that loses a point. A natural 1
    costs the weapon a point. At 0 the item is destroyed and marked Broken; the item sheet's **Repair**
    restores it at 10% of its price a point, from the owner's coins. There is no power attack and no
    free maneuver at 21+ under 1e. A worn item shows "Quality 2/3" in the inventory.
  - Prices and wages: 1e's price list in copper, or 2e's. A new compendium, **Gear & Prices (Knave 1e)**,
    holds every item on it, and the shop shows its aisles (Weapons, Armor, Gear, Food, Animals &
    Transport, Clothing); Lodging & Meals and Buildings are there too, hidden until the GM shows them in
    the Marketplace Manager, and buying one only takes the coins. Starting gear and the weapon choice
    come from the 1e list. Create NPC offers 1e's ten henchmen at their daily wages, and the Time tab's
    **Pay** settles every day owed. A hireling's sheet says whether the wage is by the month or the day.
  - Coins per slot: 100 (1e) or 500 (2e).
  - The ability taglines in a 1e world: CON "Resisting poison and sickness, item slots, healing", INT
    "Lockpicking, alchemy, resisting magic", WIS "...spotting illusions", CHA "Persuasion, henchmen,
    blessings". A 2e or Custom world keeps the 2e lines.
  - XP for treasure: off in 1e (XP for deeds), or 1e's designer's-note XP for gold at 1 XP per 100 copper
    (still Knave 1e); 1 XP per coin in 2e.
  - A world already on this version's rules gets the new ones in the edition its others play.
- **The welcome window** says which rules the world plays, how 1e and 2e fit together, and links the
  Knave 1e PDF on itch beside the Knave 2e book, though the 1e rules are built in. An **AI disclosure**
  says first that there is no AI art: Base Knavery ships with more than 2,900 human-made art assets
  (portraits, tokens and icons) and will never use AI-generated art; and no AI game text: no spell, item or
  monster description was written by AI (Base Knavery's code is written with the help of an AI coding assistant); the
  art's licences fold under it. A **Licensing** section lists each edition's licence as a folded bullet.
  The window is wider, in two columns (one on a narrow screen), and scrolls within the screen. Two knaves by
  Lydia Comer, used with her permission, stand as book ends either side of the title, facing it (her white versions on
  the dark theme).
  The README now opens with the welcome window's words, and `docs/foundry-listing.html` holds the
  same for the Foundry package listing: both are generated from the welcome's strings
  (`npm run build:readme`), and `npm run check` fails if they fall out of step.
  LICENSE.txt and the README now say the name Base Knavery is not part of the MIT licence: a fork
  that is shared needs its own name, marked Base Knavery™ on the welcome and in the README. The Made for
  Knave logo is a faint watermark behind the welcome's Licensing section. The first
  edition is called by its title, Knave.
- **The sheet footer** now reads "...for Knave (first and second editions)...".
- **A Party tab** on the Game Master's Dashboard: each player character's HP (unconscious or dead), wounds,
  slots used of the maximum, coins, lights (lit ones first) and spellbooks still ready today, with the
  spells left under Knave 2e. A name opens the sheet; the tab keeps up as the characters change.
- **Treasure:** a Treasure tick on every item. The XP tab's new *Treasure brought back* mode lists the
  treasure the chosen characters carry, adds any coins you type, and splits the XP evenly (Knave 2e:
  1 XP per coin); a companion takes a half share, noted on the card. Each item counts once.
- **Selling:** a coin icon on each Inventory row sells the item, or some of a stack, for half its price;
  treasure sells for its full value. It follows the player marketplace switch.
- **Repair** on every broken item: a hammer on the Inventory row and a button beside Broken on the item
  sheet. Free under Knave 2e attacks (the book has no repair rule); 10% of the price a point for a worn
  weapon or armor under Knave 1e.
- **Time and hazards** (a new Time tab on the Game Master's Dashboard): end a dungeon turn or a travel
  watch, and the world clock moves on 10 minutes or 4 hours and the hazard die rolls. The tab counts the
  turns, or the day and its six watches, and the watches of travel today; a box marks the party resting.
  - A fatigue, burn or depletion card carries one button, and nothing changes until you click it:
    fatigue deals 1 damage to the characters you leave ticked; burn uses up one torch from each lit
    stack and puts it out; depletion rolls a d6 for each ration and each 1 spoils. The party is every
    character a player owns.
  - While the party rests, fatigue is ignored. A fourth watch of travel in a day notes the CON check
    against 1 direct damage.
- **Light it:** torches, candles and lanterns have a flame toggle on the Inventory row, and a lit one
  says so.
- **Morale at breaking points:** in a running combat, a side's first casualty, half a side fallen, or an
  NPC left alone at half HP whispers the GM a card with a Roll morale button for the NPCs still standing
  (each once a battle). A failed morale test offers the leader's CHA check for a reroll, once per side a
  battle. Companions never test morale.
- **Backstory:** the Description page's Biography is now Backstory, with a word counter under it
  ("12 / 35 words", amber past 35). Nothing stops a longer one.
- **Alignment and Background** leave the Description page. Each has a Knave 1e switch in the hacks
  settings (off by default) that shows it on the Knave page, under the pronouns; new characters roll
  it only while its switch is on. Values already on a sheet are kept.
- **Item badges:** a small chit before each Inventory name marks weapons (sword) and armor (shield) in
  ink, and spellbooks, spell scrolls, magic items, relics and potions in the accent colour. A new Kind
  choice on the item sheet (Ordinary, Magic, Relic, Potion) marks any item; magic weapons and armor
  keep their own icon, glowing.
- **Wages:** a hireling's sheet names its employer. The Time tab lists each hireling's monthly wage and
  when it is due (a month is 30 days of the world clock); Pay takes the wage from the employer's coins.

## 0.1.1

- **Foundry review #2 fixes:**
  - Changing *Rations per slot* or the Knave 1e XP hack no longer adds a career's effects a second time.
  - The GM's notes are guarded by the server too: a player cannot overwrite them, even outside the sheet.
  - A career dropped onto a sheet follows the same rules as the career buttons (Char Gen Mode, two at most).
  - The Attack window's Target list shows players only the names the GM lets them see; a hidden name reads
    "Unknown creature".
  - A hireling's sheet shows its monthly wage, and an NPC's Description page shows its traits.
  - Names with `<` or `&` show as typed in notifications.
  - Under the Knave 1e initiative hack, a round a player ends goes to the first combatant who isn't
    defeated (with Skip Defeated on), and a player who reloads sees the same turn.
  - Editing one spell item from the rulebook no longer stops the Spells table from being rebuilt.
  - The portrait picker's Refresh button works more than once; the Import a Table macro has its icon.
  - Two windows open at once no longer share their labels' targets.
  - The guide, README and licence describe the current rules and the filled Knave 1e tables.
  - A release stamps the packs with its own version.
- **An improvised attack for everyone:** d4 with STR, no item and no slot, always in the Attack window. The
  Attack button is never greyed out now.
- **Wounds make items unusable.** A wound with no empty slot lands on the lowest coin slot or item and marks it
  Unusable (it was "drop it"): the table decides whether it was dropped or broken.
- Level, XP and Coins sit under the abilities, with a half-width XP bar; Slots sits under the HP and Wounds bars.
- Brighter glow on the ability rolls, larger defense numbers, and careers side by side on the Growth page.
- The character sheet opens just tall enough for the Knave page; the traits on the Description page are smaller and lighter.
- The HP bar turns gold when HP is below its maximum.
- The roll window: Roll with Disadvantage, Straight Roll (highlighted) and Roll with Advantage on one row, each
  saying what it does when hovered; the mode line is gone, and the modifier and checkboxes sit by their labels.
- The free-maneuver and power-attack notes on chat cards are dark teal and bold, readable on the card.
- **Create NPC** (Game Masters, in the Actors sidebar, replacing Create Monster): a monster from the bestiary
  with its HP rolled (a d8 per level, or level × 4); a person met on the road; or a hireling, mercenary or
  expert with the book's stat line and monthly wage. People get a random name, traits and portrait.
- **Spell items from your rulebook.** Building the tables from your Knave 2e PDF now also makes a spellbook and
  a spell scroll for each of the 100 spells, with its effect, in a world compendium "Spells (from your
  rulebook)". The Spells table links to the spellbooks, so random characters get the real item. A rebuild keeps
  any you edited. Scrolls are used up when cast.
- **Weapons and armor go to the top.** A new weapon lands under your last weapon, armor under your armor,
  spellbooks next, and other gear at the bottom. Rows you dragged stay where you put them.
- **Rations per slot**, a new Inventory setting (1, 2, 3 or 5; default 1, as both editions read).
- Blank Sheet is for Game Masters only. The name field says "Random if left blank".
- Labels in every Base Knavery window wrap without gaps.
- The Inventory's footer: the bottom rows are wounded and marked unusable or damaged first.
- **Compact attack cards:** each roll is one row (formula left, total right; click it for the dice), Hit and
  Miss are bold badges, and Damage is a small label on its row.
- The splats on the Attack button and the card's Apply button are red. A full HP bar is teal, matching Die of Fate's glow.
- **Rest asks first** (Knave 2e's healing rule): slept two watches and ate a meal brings HP back to full; in a
  safe haven one wound heals too. Spellbooks are ready again either way. A card says what happened. Campfire icon.
- **A Target list in the Attack window:** the tokens you can see on the scene, nearest first. "Hide other player
  characters" is ticked by default. The chosen token is targeted, and the card says hit or miss against its AC.
- **Random creation rolls the abilities** (3d6). Tick "Place the 3 ability points myself" to place them instead.
- **A blank sheet is built by the rules.** In Char Gen Mode the abilities hold to the level's points (3 at level
  1, +3 a level, no score above level + 2), with a counter under them, for the Game Master too. New dice roll
  max HP for the level and the starting coins (3d6 × 10). The careers line keeps a slot open until there are
  two, and a rolled career is never one the knave already has. A blank sheet starts with Foundry's blank portrait.
- The portrait's die is no longer hidden under its list button.
- The sheet's header fits the narrow window: Pop Out and Print are icons, so the menu and close stay in view.
- Careers show a tied scroll instead of the shattered heart; existing careers change over when the GM loads the world.
- A rule above the Biography on the Description page.
- The spell line reads "Spells left today: 2 / 2": each spellbook once a day, as many a day as your INT.
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
