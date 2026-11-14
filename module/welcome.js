/**
 * The welcome window: what this system is, who made it, that it is
 * unofficial, which rules this world plays (Knave 1e built in, Knave 2e with
 * the GM's book; user rulings 2026-11-14), and where to buy both books.
 *
 * It opens by itself at every GM login (user ruling 2026-11-14), unless they
 * untick "Show each time a Game Master loads the world" (`welcome-on-start`).
 * Players are never shown it unasked; anyone opens it from the Settings
 * sidebar or `game.knavery.openWelcome()`. The wording follows the Knave 2e
 * Third Party License: the §3 disclaimer verbatim (KNAVERY.Disclaimer), only
 * the Made for Knave logo, nothing that implies approval.
 */
import { SETTINGS_NS, SYS_PATH, SYSTEM_ID } from "./config.js";
import { currentRules } from "./rules.js";
import { canReadRulebook, hasRulebook, isClosing, openRulebook, pickLocalRulebook, renderWhenGone } from "./rulebook.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

const WELCOME_ID = "knavery-welcome";
/** The licence Knave's first edition is under (Knave 1.0, p1): its tables ship with this system. */
const CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/";

/**
 * The art that ships, for the AI disclosure's folded Art licensing (user, 2026-11-14): every
 * piece is human-made, and the system will never use AI-generated art. Names and licences
 * are proper names, so they live here, not in the language file; LICENSE.txt has the detail.
 */
const ART_CREDITS = [
  { name: "Lemurs Portraits", by: "Jon Aspeheim", url: "https://jonaspeheim.itch.io/lemurs-portraits", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
  { name: "Portraits and tokens", by: "Lydia Comer", url: "https://linktr.ee/lydiadidmyink", license: "CC BY-NC-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/" },
  { name: "Tlomdev's Tokens", by: "tlomdev", url: "https://tlomdev.itch.io/tlomdevs-tokens", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  { name: "Game-icons.net", by: "many artists, each credited in art/game-icons/CREDITS.md", url: "https://game-icons.net", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/" },
  { name: "Alegreya fonts", by: "The Alegreya Project Authors", url: "https://github.com/huertatipografica/Alegreya", license: "SIL OFL 1.1", licenseUrl: "https://openfontlicense.org/" },
];

/** Where to buy Knave (first edition): its rules ship here, and the PDF supports its author (user, 2026-11-14). */
const BUY_LINKS_1E = [
  { label: "KNAVERY.Welcome.BuyItch", icon: "fa-solid fa-gamepad", href: "https://questingbeast.itch.io/knave" },
];

/** Where to buy Knave: Second Edition. The DriveThruRPG link carries the author's affiliate id. */
const BUY_LINKS = [
  {
    label: "KNAVERY.Welcome.BuyDtrpg", icon: "fa-solid fa-cart-shopping",
    href: "https://www.drivethrurpg.com/en/product/484910/knave-second-edition-2e?affiliate_id=379088",
  },
  { label: "KNAVERY.Welcome.BuyItch", icon: "fa-solid fa-gamepad", href: "https://questingbeast.itch.io/knave-second-edition" },
  { label: "KNAVERY.Welcome.BuyPrint", icon: "fa-solid fa-book", href: "https://shop.swordfishislands.com/questing-beast/" },
];

export class WelcomeWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: WELCOME_ID,
    classes: ["knavery", "knavery-welcome"],
    window: { title: "KNAVERY.Welcome.Title", icon: "fa-solid fa-dungeon" },
    position: { width: 560, height: "auto" },
    actions: {
      openGuide: WelcomeWindow.#onOpenGuide,
      chooseRulebook: () => pickLocalRulebook(),
      openRulebook: () => openRulebook(),
    },
  };

  static PARTS = {
    body: { template: `${SYS_PATH}/templates/apps/welcome.html` },
  };

  async _prepareContext() {
    const author = game.system.authors?.first?.() ?? [...(game.system.authors ?? [])][0] ?? { name: "Dom Bosco" };
    return {
      title: game.system.title,
      byline: F("KNAVERY.Welcome.By", { author: author.name, version: game.system.version }),
      authorUrl: author.url ?? "",
      logo: `${SYS_PATH}/logo/made-for-knave-black.png`,
      logoDark: `${SYS_PATH}/logo/made-for-knave-white.png`,
      disclaimer: L("KNAVERY.Disclaimer"),
      credit: L("KNAVERY.LogoCredit"),
      knave1eHeading: L("KNAVERY.Welcome.Knave1eHeading"),
      // The licence link is built here: the string carries only its words.
      knave1eBody: F("KNAVERY.Welcome.Knave1eBody", {
        license: `<a href="${CC_BY_URL}" target="_blank" rel="noopener">${L("KNAVERY.Welcome.Knave1eLicense")}</a>`,
      }),
      books: [
        { edition: "1e", label: "KNAVERY.Welcome.Book1e", links: BUY_LINKS_1E, note: "KNAVERY.Welcome.Book1eNote" },
        { edition: "2e", label: "KNAVERY.Welcome.Book2e", links: BUY_LINKS, note: null },
      ],
      art: ART_CREDITS,
      rules: currentRules(),
      thisWorld: F("KNAVERY.Welcome.ThisWorld", {
        rules: L({ "1e": "KNAVERY.Settings.Rules1e", "2e": "KNAVERY.Settings.Rules2e" }[currentRules()] ?? "KNAVERY.Settings.RulesCustom"),
      }),
      // The "show after each update" box writes a world setting.
      isGM: game.user.isGM && game.user.can("SETTINGS_MODIFY"),
      hasRulebook: hasRulebook(),
      canReadRulebook: canReadRulebook(),
      showOnStart: game.settings.get(SETTINGS_NS, "welcome-on-start"),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector('input[name="welcome-on-start"]')?.addEventListener("change", (event) => {
      game.settings.set(SETTINGS_NS, "welcome-on-start", event.currentTarget.checked);
    });
  }

  static async #onOpenGuide() {
    const pack = game.packs.get(`${SYSTEM_ID}.guide`);
    const entry = pack?.index.contents[0];
    const doc = entry ? await pack.getDocument(entry._id) : null;
    doc?.sheet.render({ force: true });
  }
}

export const openWelcome = () => {
  const open = foundry.applications.instances.get(WELCOME_ID);
  if (open && !isClosing(open)) return open.render({ force: true });
  return renderWhenGone(open, new WelcomeWindow());
};

/** Whether this login should open the welcome window (the probes ask too, to wait for it). */
export const welcomeDue = () => {
  // Only for a GM who may write world settings: an Assistant GM whose
  // "Modify Configuration Settings" was taken away could not switch it off.
  if (!game.user.isGM || !game.user.can("SETTINGS_MODIFY")) return false;
  // At every GM login (user ruling 2026-11-14: "whenever the world is restarted";
  // a page cannot tell a restart from a fresh login), until the GM turns it off.
  return game.settings.get(SETTINGS_NS, "welcome-on-start") === true;
};

/** From `ready`: at each GM login, unless the GM turned it off. */
export const maybeOpenWelcome = async () => {
  if (!welcomeDue()) return;
  await openWelcome();
  if (game.settings.get(SETTINGS_NS, "welcome-shown-version") !== game.system.version) {
    await game.settings.set(SETTINGS_NS, "welcome-shown-version", game.system.version);
  }
};
