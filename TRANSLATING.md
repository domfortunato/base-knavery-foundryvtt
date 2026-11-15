# Translating Base Knavery

Thank you for helping. Base Knavery is set up so the **interface** and the **Knave 1e rules** it ships can be fully
localized. Knave 1e is CC BY 4.0, so its traits, tables, gear and 100 spells may be translated freely, with credit to
Ben Milton.

**Knave 2e** is published in English only, and none of its text ships with the system. If Knave 2e is translated, we'll
work with its translators to localize the Knave 2e side too: the tables built from the book and the rulebook reader.

## Two ways to send a translation

- **Send it to us.** Add `lang/<code>.json` (for example `lang/fr.json`) in a pull request on
  [GitHub](https://github.com/domfortunato/base-knavery-foundryvtt), with its line in `system.json` `languages`. It ships
  with the next release, credited to you.
- **Publish it yourself** as a Foundry module, no permission needed. Its `module.json` names the system:

  ```json
  "languages": [{ "lang": "fr", "name": "Français", "path": "lang/fr.json", "system": "base-knavery" }]
  ```

## 1. The interface: the language file

Copy `lang/en.json` and translate the values, never the keys. Anything you leave out shows in English.

- Keep every `{placeholder}` and HTML tag. You may move them; don't rename them.
- **Plurals** are groups of forms, the ones your language uses: `one`, `two`, `few`, `many`, `other`. English gives
  `one` and `other`. Polish, for example, gives `one`, `few`, `many` and `other`. `other` is used for any form you
  leave out.

  ```json
  "NSlots": { "one": "{n} emplacement", "other": "{n} emplacements" }
  ```

- **Item words.** Rations get eaten and torches burn by their names. Tell the system your words, separated by `|`:

  ```json
  "ItemWords": { "rations": "ration|rations", "torch": "torche|torches", "candle": "bougie|bougies", "lantern": "lanterne", "arrows": "flèche|flèches" }
  ```

- **Table names.** A world table in your language can stand for one of the system's: add `TableName.<key>` (the English
  name in lower case with dashes: `careers`, `spells-knave-1e`, `market-weapons`), or use **Use as** in the table
  importer.

Check your file with `npm run check:i18n`. It prints your coverage and stops on a placeholder or tag English doesn't
have. `node tools/dev/i18n-check.mjs --status` lists every key you haven't translated yet.

## 2. The content: the Guide, gear, bestiary and Knave 1e tables

The compendia are translated with [Babele](https://foundryvtt.com/packages/babele). `babele-template/` holds every
translatable entry, with the English as the starting text: one file per compendium, keyed by the English names.

1. Make a Babele translation module: copy `babele-template/` into it as your language's folder and register it with
   Babele (see Babele's own instructions).
2. Translate the values: names, descriptions, table rows (by range) and the Guide's pages. Never change the keys.
3. The system finds its tables and items by hidden keys, not names, so translated names break nothing: rations are
   still eaten, the Knave 1e starting gear still gives the right items, the Guide still opens at the right page.

The Knave 1e spells give each row as `{ "name", "description" }` (the spell and its effect). Check that your Babele
version accepts that form, and tell us if it doesn't.

## What we ship

- **The interface and the Guide** are this project's own writing. Translate them freely.
- **Knave 1e's text:** your own translation of what the system ships, with Ben Milton credited as the original author.
  We don't ship existing published translations of Knave 1e, whose translators hold their own rights.
- **Knave 2e:** no text in any language. See above for what happens if it's translated.

Translations by people only, please: tell us if any part of yours was machine-made.
