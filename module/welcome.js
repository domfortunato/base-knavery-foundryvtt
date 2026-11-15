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
import { findByKey } from "./keys.js";
import { currentRules } from "./rules.js";
import { ART_CREDITS, BOOKS, CC_BY_URL, WELCOME_BOOKENDS } from "./welcome-data.js";
import { canReadRulebook, hasRulebook, isClosing, openRulebook, pickLocalRulebook, renderWhenGone } from "./rulebook.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

const WELCOME_ID = "knavery-welcome";

export class WelcomeWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: WELCOME_ID,
    classes: ["knavery", "knavery-welcome"],
    window: { title: "KNAVERY.Welcome.Title", icon: "fa-solid fa-dungeon" },
    // Wide, in two columns (user, 2026-11-14: too long; nothing cut).
    position: { width: 800, height: "auto" },
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
      // Lydia Comer's knaves either side of the title, used and cropped with her permission
      // (art/welcome/CREDITS.md): her line art for the light theme, her white-filled versions for the dark one.
      bookends: Object.fromEntries(Object.entries(WELCOME_BOOKENDS).map(([side, n]) => [side, {
        light: `${SYS_PATH}/art/welcome/portraits/${n}.png`, dark: `${SYS_PATH}/art/welcome/portraits/${n}-white.png`,
      }])),
      logo: `${SYS_PATH}/logo/made-for-knave-black.png`,
      logoDark: `${SYS_PATH}/logo/made-for-knave-white.png`,
      disclaimer: L("KNAVERY.Disclaimer"),
      credit: L("KNAVERY.LogoCredit"),
      knave1eHeading: L("KNAVERY.Welcome.Knave1eHeading"),
      // The licence link is built here: the string carries only its words.
      knave1eBody: F("KNAVERY.Welcome.Knave1eBody", {
        license: `<a href="${CC_BY_URL}" target="_blank" rel="noopener">${L("KNAVERY.Welcome.Knave1eLicense")}</a>`,
      }),
      books: BOOKS,
      // A credit's words in the user's language; names, licences and links as they are.
      art: ART_CREDITS.map((a) => ({
        ...a, name: a.nameKey ? L(a.nameKey) : a.name, by: a.byKey ? L(a.byKey) : a.by, license: a.licenseKey ? L(a.licenseKey) : a.license,
      })),
      rules: currentRules(),
      thisWorld: F("KNAVERY.Welcome.ThisWorld", {
        // The first edition's title is just "Knave" (user, 2026-11-14).
        rules: L({ "1e": "KNAVERY.Welcome.ThisWorld1e", "2e": "KNAVERY.Welcome.ThisWorld2e" }[currentRules()] ?? "KNAVERY.Welcome.ThisWorldCustom"),
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
    await openGuide();
  }
}

/** The Guide's page each role lands on when none is named (user decision D7, 2026-11-14). */
export const GUIDE_HOME = { gm: "Start Here (GM)", player: "Your Knave (players)" };

/**
 * Open the Base Knavery guide (the guide compendium's journal) at a page: the one whose title is
 * given, else the GM's start page or the players' first page. Other windows call it with their
 * own page's title (and a heading's slug as `anchor` to land on a section). The titles are the
 * generator's (tools/content/build-content.mjs), which also derives the page ids from them.
 */
export const openGuide = async (title = null, { anchor = null } = {}) => {
  const pack = game.packs.get(`${SYSTEM_ID}.guide`);
  // By key first (keys.js): a translated Guide keeps its key and its pages' keys.
  const entry = findByKey(pack?.index ?? [], "Base Knavery Guide") ?? pack?.index.contents[0];
  const doc = entry ? await pack.getDocument(entry._id) : null;
  if (!doc) return null;
  const name = title ?? (game.user.isGM ? GUIDE_HOME.gm : GUIDE_HOME.player);
  const page = findByKey(doc.pages, name);
  return doc.sheet.render({ force: true, ...(page ? { pageId: page.id } : {}), ...(page && anchor ? { anchor } : {}) });
};

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
