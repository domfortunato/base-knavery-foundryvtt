/**
 * The GM's own rulebook, read inside Foundry.
 *
 * Nothing of the book ships. The world stores a path to a PDF the GM put in the
 * user data folder (setting `rulebook-pdf`), and config.js RULEBOOK
 * holds page numbers. The reader is one AppV2 window around an <iframe> of the
 * pdf.js viewer Foundry already serves at scripts/pdfjs (its own PDF journal
 * pages use it), so the outline, search and thumbnails come with it. The same
 * mechanism as PrinceWitherdick's mythic-bastionland-pwd.
 *
 * The GM gets the PDF there one of two ways: "Choose from this computer"
 * (pickLocalRulebook: the computer's own file dialog, then an upload into
 * RULEBOOK_DIR, as PWD does), or core's file picker in Configure Rulebook for
 * a file already on the server. It must live on the server: players are shown
 * pages from it, and a GM's other browsers read it too.
 *
 * The window never re-renders to turn a page, since that would reload the
 * frame: it drives the viewer's PDFViewerApplication (same origin) instead.
 * Page numbers are PRINTED pages; the PDF index adds `rulebook-page-offset`.
 */
import { RULEBOOK, SETTINGS_NS, SYS_PATH } from "./config.js";
import { emit, onSocket } from "./socket.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

const READER_ID = "knavery-rulebook";
/** Where a PDF picked from the GM's computer is uploaded, at the user data root (outside systems/). */
export const RULEBOOK_DIR = "knavery-rulebook";
const SETTINGS_MENU_ID = "knavery-settings-rulebook";

/* -------------------------------------------- */
/*  Paths and pages                              */
/* -------------------------------------------- */

export const rulebookPath = () => String(game.settings.get(SETTINGS_NS, "rulebook-pdf") ?? "").trim();
export const hasRulebook = () => /\.pdf$/i.test(rulebookPath());
export const canReadRulebook = () => game.user.isGM || game.settings.get(SETTINGS_NS, "rulebook-for-players");
const pageOffset = () => Number(game.settings.get(SETTINGS_NS, "rulebook-page-offset")) || 0;

/** The printed page a table is on, or null (config.js RULEBOOK.pages). */
export const tablePage = (name) => RULEBOOK.pages[name] ?? null;

/** Printed page → PDF index, never below 1. */
export const toIndex = (printed, offset = pageOffset()) => Math.max(1, Math.round(Number(printed) || 1) + offset);

/**
 * The viewer's URL for a PDF under the user data folder (or an absolute URL),
 * opened at a printed page. Pure apart from getRoute, so a probe can check it.
 */
export const viewerUrl = (path, { page = null, offset } = {}) => {
  const file = URL.parse(path) ? path : foundry.utils.getRoute(path);
  const params = new URLSearchParams({ file });
  const hash = page ? `#page=${toIndex(page, offset ?? pageOffset())}` : "";
  return `${foundry.utils.getRoute("scripts/pdfjs/web/viewer.html")}?${params}${hash}`;
};

/* -------------------------------------------- */
/*  The reader                                   */
/* -------------------------------------------- */

/** Files already warned about for a page count other than the edition's. */
const warnedEdition = new Set();

export class RulebookReader extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: READER_ID,
    classes: ["knavery", "knavery-rulebook"],
    window: { title: "KNAVERY.Rulebook.Title", icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 900, height: 820 },
    actions: {
      showPage: RulebookReader.#onShowPage,
      openTab: RulebookReader.#onOpenTab,
      choosePdf: () => pickLocalRulebook(),
    },
  };

  static PARTS = {
    reader: { template: `${SYS_PATH}/templates/apps/rulebook.html` },
  };

  /** The printed page to open at, and one asked for before the viewer was ready. */
  #page;
  #pending = null;

  constructor({ page = null, ...options } = {}) {
    super(options);
    this.#page = page;
  }

  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({ action: "openTab", icon: "fa-solid fa-up-right-from-square", label: "KNAVERY.Rulebook.OpenTab" });
    if (game.user.isGM) {
      controls.push(
        { action: "showPage", icon: "fa-solid fa-eye", label: "KNAVERY.Rulebook.Show" },
        { action: "choosePdf", icon: "fa-solid fa-file-arrow-up", label: "KNAVERY.Rulebook.FromComputer" },
      );
    }
    return controls;
  }

  async _prepareContext() {
    return { src: viewerUrl(rulebookPath(), { page: this.#page }), title: L("KNAVERY.Rulebook.Title") };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const frame = this.element.querySelector("iframe.knavery-rulebook-frame");
    frame?.addEventListener("load", () => this.#bindViewer(frame), { once: true });
  }

  /** The frame's PDFViewerApplication, once its script has run. */
  #viewer() {
    try {
      return this.element?.querySelector("iframe.knavery-rulebook-frame")?.contentWindow?.PDFViewerApplication ?? null;
    } catch {
      return null;
    }
  }

  async #bindViewer(frame) {
    const app = frame.contentWindow?.PDFViewerApplication;
    if (!app) return;
    await app.initializedPromise;
    // Links out of the book open a new tab, never inside the frame.
    try { app.pdfLinkService.externalLinkTarget = 2; } catch { /* older viewer */ }
    app.eventBus?.on("pagesinit", () => {
      const path = rulebookPath();
      if (app.pagesCount !== RULEBOOK.pdfPages && !warnedEdition.has(path)) {
        warnedEdition.add(path);
        ui.notifications.warn(F("KNAVERY.Rulebook.OtherEdition", { pages: app.pagesCount, expected: RULEBOOK.pdfPages }));
      }
      if (this.#pending) {
        app.page = toIndex(this.#pending);
        this.#pending = null;
      }
    });
  }

  /** The printed page on screen. */
  get currentPage() {
    const app = this.#viewer();
    return app?.pdfDocument ? Math.max(1, app.page - pageOffset()) : (this.#pending ?? this.#page ?? 1);
  }

  /** Turn to a printed page without reloading the frame. */
  goToPage(printed) {
    if (!printed) return;
    const app = this.#viewer();
    if (app?.pdfDocument) app.page = toIndex(printed);
    else this.#pending = printed;
  }

  static #onShowPage() {
    showRulebookPage(this.currentPage);
  }

  static #onOpenTab() {
    window.open(viewerUrl(rulebookPath(), { page: this.currentPage }), "_blank", "noopener");
  }
}

/* -------------------------------------------- */
/*  Opening, toggling, showing                   */
/* -------------------------------------------- */

/**
 * GM: choose a PDF on this computer with its own file dialog, upload it into
 * RULEBOOK_DIR on the server, make it the world's rulebook and open it.
 * Must be called from a click or key press (a file dialog needs one).
 * Resolves to the stored path, or null if nothing was chosen or it failed.
 */
export const pickLocalRulebook = () => {
  if (!game.user.isGM) return Promise.resolve(null);
  if (!game.user.can("FILES_UPLOAD")) {
    ui.notifications.warn("KNAVERY.Rulebook.NoUpload", { localize: true });
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        ui.notifications.warn("KNAVERY.Rulebook.NotPdf", { localize: true });
        return resolve(null);
      }
      resolve(await uploadRulebook(file));
    }, { once: true });
    input.click();
  });
};

/** Upload a PDF File into RULEBOOK_DIR and point the world at it. */
export const uploadRulebook = async (file) => {
  const FP = foundry.applications.apps.FilePicker.implementation;
  const note = ui.notifications.info(game.i18n.format("KNAVERY.Rulebook.Uploading", { name: file.name }), { permanent: true });
  try {
    const root = await FP.browse("data", "");
    if (!root.dirs.includes(RULEBOOK_DIR)) await FP.createDirectory("data", RULEBOOK_DIR, {});
    const result = await FP.upload("data", RULEBOOK_DIR, file, {}, { notify: false });
    if (!result?.path) return null;
    await game.settings.set(SETTINGS_NS, "rulebook-pdf", result.path);
    ui.notifications.info(game.i18n.format("KNAVERY.Rulebook.Uploaded", { name: file.name }));
    openRulebook();
    return result.path;
  } catch (err) {
    console.error("Base Knavery | rulebook upload failed", err);
    ui.notifications.error("KNAVERY.Rulebook.UploadFailed", { localize: true });
    return null;
  } finally {
    if (note) ui.notifications.remove(note);
  }
};

/** The Configure Rulebook settings window. */
export const openRulebookSettings = () => {
  if (!game.user.isGM) return null;
  const open = foundry.applications.instances.get(SETTINGS_MENU_ID);
  if (open) return open.render({ force: true });
  const Menu = game.settings.menus.get(`${SETTINGS_NS}.rulebook`)?.type;
  return Menu ? new Menu().render({ force: true }) : null;
};

/**
 * Open the reader, at a printed page if given. Returns the window, or null
 * (with a notice) when the world has no book or this user may not read it.
 */
export const openRulebook = ({ page = null } = {}) => {
  if (!hasRulebook()) {
    ui.notifications.warn(game.user.isGM ? "KNAVERY.Rulebook.NotSet" : "KNAVERY.Rulebook.NoCopy", { localize: true });
    return null;
  }
  if (!canReadRulebook()) {
    ui.notifications.warn("KNAVERY.Rulebook.NoCopy", { localize: true });
    return null;
  }
  const open = foundry.applications.instances.get(READER_ID);
  if (open) {
    open.bringToFront();
    open.goToPage(page);
    return open;
  }
  const reader = new RulebookReader({ page });
  reader.render({ force: true });
  return reader;
};

/** The B key: close an open reader, else open it (a GM with no book is sent to choose one). */
export const toggleRulebook = () => {
  const open = foundry.applications.instances.get(READER_ID);
  if (open) return open.close();
  if (!hasRulebook() && game.user.isGM) return openRulebookSettings();
  return openRulebook();
};

/** GM: open the reader at a printed page on every other connected client allowed to read it. */
export const showRulebookPage = (page) => {
  if (!game.user.isGM) return;
  if (!hasRulebook()) return ui.notifications.warn("KNAVERY.Rulebook.NotSet", { localize: true });
  const others = game.users.filter((u) => u.active && !u.isSelf);
  if (!game.settings.get(SETTINGS_NS, "rulebook-for-players") || !others.length) {
    return ui.notifications.warn("KNAVERY.Rulebook.NobodyToShow", { localize: true });
  }
  const printed = Math.max(1, Math.round(Number(page) || 1));
  emit("showRulebookPage", { page: printed });
  ui.notifications.info(F("KNAVERY.Rulebook.ShownPlayers", { page: printed }));
};

/** Socket and settings wiring, called once from init. */
export const registerRulebook = () => {
  onSocket("showRulebookPage", (msg, senderId) => {
    if (!game.users.get(senderId)?.isGM) return;
    if (!hasRulebook() || !canReadRulebook()) return;
    openRulebook({ page: Math.max(1, Math.round(Number(msg.page) || 1)) });
  });
  // Configure Rulebook: "Choose from this computer" beside the server file picker.
  Hooks.on("renderSettingsGroupMenu", (app, html) => {
    if (app.id !== SETTINGS_MENU_ID) return;
    const picker = html.querySelector(`file-picker[name="${SETTINGS_NS}.rulebook-pdf"]`);
    if (!picker || html.querySelector(".knavery-rulebook-local")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "knavery-rulebook-local";
    button.innerHTML = `<i class="fa-solid fa-file-arrow-up" inert></i> ${L("KNAVERY.Rulebook.FromComputer")}`;
    button.addEventListener("click", async () => {
      const path = await pickLocalRulebook();
      if (path) picker.value = path;
    });
    picker.closest(".form-fields")?.after(button) ?? picker.after(button);
  });
  Hooks.on("knaveryRulebookChanged", () => {
    const open = foundry.applications.instances.get(READER_ID);
    if (open) {
      if (hasRulebook() && canReadRulebook()) open.render();
      else open.close();
    }
    foundry.applications.instances.get("knavery-gm-dashboard")?.render();
    foundry.applications.instances.get("knavery-welcome")?.render();
    ui.settings?.render();
  });
};
