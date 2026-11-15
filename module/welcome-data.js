/**
 * What the welcome window, the README and the Foundry package listing share (user, 2026-11-14:
 * the welcome is also the README and the listing). Pure data, no Foundry globals, so
 * tools/content/build-readme.mjs can read it in Node. Names and licences are proper names,
 * so they live here, not in the language file; LICENSE.txt has the detail. A credit's words
 * that are not names ("Portraits and tokens", "used with permission") are language keys too
 * (`nameKey`, `byKey`, `licenseKey`; `name` stays the English identity art.js matches on).
 */

/** The licence Knave's first edition is under (Knave 1.0, p1): its rules and tables ship with this system. */
export const CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/";

/**
 * The art that ships, for the folded Art licensing: every piece is human-made (2,949 image files in
 * art/ and icons/ at 0.2.0, so "more than 2,900"), and the system will never use AI-generated art.
 */
export const ART_CREDITS = [
  { name: "Lemurs Portraits", by: "Jon Aspeheim", url: "https://jonaspeheim.itch.io/lemurs-portraits", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
  { name: "Portraits and tokens", nameKey: "KNAVERY.Welcome.Credit.LydiaPortraits", by: "Lydia Comer", url: "https://linktr.ee/lydiadidmyink", license: "CC BY-NC-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/" },
  { name: "Tlomdev's Tokens", by: "tlomdev", url: "https://tlomdev.itch.io/tlomdevs-tokens", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  { name: "Game-icons.net", by: "many artists, each credited in art/game-icons/CREDITS.md", byKey: "KNAVERY.Welcome.Credit.GameIconsBy", url: "https://game-icons.net", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/" },
  // Her permission covers Base Knavery and promoting it (art/welcome/CREDITS.md), so the README and listing too.
  { name: "The two knaves beside the title", nameKey: "KNAVERY.Welcome.Credit.TwoKnaves", by: "Lydia Comer", url: "https://linktr.ee/lydiadidmyink", license: "used with permission", licenseKey: "KNAVERY.Welcome.Credit.WithPermission", licenseUrl: null },
  { name: "Alegreya fonts", nameKey: "KNAVERY.Welcome.Credit.AlegreyaFonts", by: "The Alegreya Project Authors", url: "https://github.com/huertatipografica/Alegreya", license: "SIL OFL 1.1", licenseUrl: "https://openfontlicense.org/" },
];

/** The book ends either side of the title, each facing in toward it: the woman looks right, the knight left. */
export const WELCOME_BOOKENDS = { left: "femme", right: "knight" };

/** Where to buy Knave (first edition): its rules ship here, and the PDF supports its author (user, 2026-11-14). */
export const BUY_LINKS_1E = [
  { label: "KNAVERY.Welcome.BuyItch", icon: "fa-solid fa-gamepad", href: "https://questingbeast.itch.io/knave" },
];

/** Where to buy Knave: Second Edition. The DriveThruRPG link carries the author's affiliate id. */
export const BUY_LINKS_2E = [
  {
    label: "KNAVERY.Welcome.BuyDtrpg", icon: "fa-solid fa-cart-shopping",
    href: "https://www.drivethrurpg.com/en/product/484910/knave-second-edition-2e?affiliate_id=379088",
  },
  { label: "KNAVERY.Welcome.BuyItch", icon: "fa-solid fa-gamepad", href: "https://questingbeast.itch.io/knave-second-edition" },
  { label: "KNAVERY.Welcome.BuyPrint", icon: "fa-solid fa-book", href: "https://shop.swordfishislands.com/questing-beast/" },
];

/** The books, in the order the welcome lists them. */
export const BOOKS = [
  { edition: "1e", label: "KNAVERY.Welcome.Book1e", links: BUY_LINKS_1E, note: "KNAVERY.Welcome.Book1eNote" },
  { edition: "2e", label: "KNAVERY.Welcome.Book2e", links: BUY_LINKS_2E, note: null },
];
