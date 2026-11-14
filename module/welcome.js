/**
 * The welcome window: what this system is, who made it, that it is
 * unofficial, whose game it serves, and where to buy that game.
 *
 * It opens by itself for a GM once per world per system version (setting
 * `welcome-shown-version`), and at every GM login while the world has no
 * rulebook PDF (the user's ask, 2026-11-13: log in, be asked for the book),
 * unless they untick "Show after each update" (`welcome-on-start`).
 * Players are never shown it unasked; anyone opens it from the Settings
 * sidebar or `game.knavery.openWelcome()`. The wording follows the Knave 2e
 * Third Party License: the §3 disclaimer verbatim (KNAVERY.Disclaimer), only
 * the Made for Knave logo, nothing that implies approval.
 */
import { SETTINGS_NS, SYS_PATH, SYSTEM_ID } from "./config.js";
import { canReadRulebook, hasRulebook, isClosing, openRulebook, pickLocalRulebook, renderWhenGone } from "./rulebook.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

const WELCOME_ID = "knavery-welcome";

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
      credit1e: L("KNAVERY.Knave1eCredit"),
      links: BUY_LINKS,
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
