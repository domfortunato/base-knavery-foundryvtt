# Translating Base Knavery

Thank you for helping. There are two ways to send a translation, and both work:

- **Send it to us.** Add `lang/<code>.json` (for example `lang/fr.json`) in a pull request on
  [GitHub](https://github.com/domfortunato/base-knavery-foundryvtt), with its line in `system.json`
  `languages`. It ships with the next release.
- **Publish it yourself** as a Foundry module, no permission needed. Its `module.json` names the system:

  ```json
  "languages": [{ "lang": "fr", "name": "Français", "path": "lang/fr.json", "system": "base-knavery" }]
  ```

## The language file

Copy `lang/en.json` and translate the values, never the keys. Anything you leave out shows in English.

- Keep every `{placeholder}` and HTML tag. You may move them; don't rename them.
- **Plurals** are groups of forms, the ones your language uses: `one`, `two`, `few`, `many`, `other`. English gives
  `one` and `other`. Polish, for example, gives `one`, `few`, `many` and `other`. `other` is used for any form you
  leave out.

  ```json
  "NSlots": { "one": "{n} emplacement", "other": "{n} emplacements" }
  ```

- **Table names.** The system's tables (Careers, Spells, Physique, …) can carry your language's name. Add
  `KNAVERY.TableName.<key>`, where the key is the English name in lower case with dashes (`careers`, `spells-knave-1e`,
  `market-weapons`). A world table with that name is then used as that table.
- **Item words.** Rations get eaten and torches burn by their names. Tell the system your words, separated by `|`:

  ```json
  "ItemWords": { "rations": "ration|rations", "torch": "torche|torches", "candle": "bougie|bougies", "lantern": "lanterne", "arrows": "flèche|flèches" }
  ```

Check your file with `npm run check:i18n`. It prints your coverage and stops on a placeholder or tag English doesn't
have. `node tools/dev/i18n-check.mjs --status` lists every key you haven't translated yet.

## Content: the Guide, gear and Knave 1e tables

Compendium content is translated with [Babele](https://foundryvtt.com/packages/babele), keyed by each entry's id,
which never changes.

- **The Guide and the interface** are this project's own writing: translate them freely.
- **Knave 1e's tables and spells** (CC BY 4.0) ship translated only under the translation's own licence, with its
  translator credited. Tell us whose translation it is.
- **Knave 2e has no translations**, and none of its text ships, in any language.

Translations by people only, please: tell us if any part of yours was machine-made.
