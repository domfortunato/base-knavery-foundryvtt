/**
 * The portrait gallery and picker (ported from Air Bladder's art-picker.js),
 * plus the manifests of the shipped galleries and random portrait rolls.
 *
 * Galleries: Jon Aspeheim (portrait+token pairs), Lydia Comer (pairs, people
 * and monsters), game-icons.net and tlomdev (category folders), and the GM's
 * own folder, whose file list the GM caches in a hidden world setting so
 * players (who usually cannot browse files) see it too.
 */
import { SETTINGS_NS, SYS_PATH } from "./config.js";
import { ART_CREDITS } from "./welcome-data.js";

const L = (k) => game.i18n.localize(k);
const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const titleCase = (key) => String(key).replace(/[-_]+/g, " ").trim().split(/\s+/)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const IMAGE_RE = /\.(?:webp|png|jpe?g|gif|svg|avif)$/i;

/* -------------------------------------------- */
/*  Manifests                                    */
/* -------------------------------------------- */

const cache = new Map();
const manifest = async (file, fallback) => {
  if (!cache.has(file)) {
    try {
      const resp = await fetch(`${SYS_PATH}/module/data/${file}`);
      cache.set(file, resp.ok ? await resp.json() : fallback);
    } catch {
      cache.set(file, fallback);
    }
  }
  return cache.get(file);
};
export const getPortraitManifest = () => manifest("portrait-manifest.json", { names: [] });
export const getGameIconManifest = () => manifest("game-icons-manifest.json", { categories: [] });
export const getTlomdevManifest = () => manifest("tlomdev-manifest.json", { categories: [] });
export const getLydiaManifest = () => manifest("lydia-manifest.json", { sets: {} });

/* -------------------------------------------- */
/*  Galleries: on or off, and the random source  */
/* -------------------------------------------- */

/** Every gallery in the picker's order; the GM switches each on or off (the dashboard's Toggles, 0.3.0). */
export const GALLERIES = [
  { id: "custom", label: "KNAVERY.Art.TabCustom", icon: "fa-folder-open" },
  { id: "shipped", label: "KNAVERY.Art.TabAspeheim", icon: "fa-user" },
  { id: "lydia", label: "KNAVERY.Art.TabLydia", icon: "fa-paintbrush" },
  { id: "tlomdev", label: "KNAVERY.Art.TabTlomdev", icon: "fa-chess-knight" },
  { id: "gameicons", label: "KNAVERY.Art.TabGameIcons", icon: "fa-icons" },
];
const galleriesSetting = () => { try { return game.settings.get(SETTINGS_NS, "portrait-galleries") ?? {}; } catch { return {}; } };
/** Whether a gallery is on: on unless the GM switched it off. */
export const galleryOn = (id) => galleriesSetting()[id] !== false;
/** Where random portraits come from: "any" (every gallery that is on) or one gallery's id. */
export const randomPortraitSource = () => {
  try { return String(game.settings.get(SETTINGS_NS, "random-portrait-source") || "any"); } catch { return "any"; }
};
/** Tlomdev's folders that hold people; the rest are creatures (statues and oddments sit out). */
const TLOMDEV_PEOPLE = ["human-npcs-for-itmod", "kettlewright-portraits"];
const TLOMDEV_NEITHER = ["statues", "other"];

/* -------------------------------------------- */
/*  The GM's custom folder                       */
/* -------------------------------------------- */

export const customPortraitFolder = () => String(game.settings.get(SETTINGS_NS, "custom-portrait-folder") ?? "").replace(/\/+$/, "");
export const getCustomPortraitPaths = () => game.settings.get(SETTINGS_NS, "custom-portrait-list") ?? [];

/** GM only: walk the custom folder (two levels deep) and cache the list. */
export const refreshCustomPortraits = async () => {
  if (!game.user.isGM) return getCustomPortraitPaths();
  const root = customPortraitFolder();
  const FP = foundry.applications.apps.FilePicker.implementation;
  const out = [];
  const walk = async (dir, depth) => {
    let res;
    try { res = await FP.browse("data", dir); } catch { return; }
    out.push(...res.files.filter((f) => IMAGE_RE.test(f)));
    if (depth > 0) for (const d of res.dirs) await walk(d, depth - 1);
  };
  if (root) await walk(root, 2);
  out.sort();
  await game.settings.set(SETTINGS_NS, "custom-portrait-list", out);
  return out;
};

/* -------------------------------------------- */
/*  Random portraits                             */
/* -------------------------------------------- */

/** One gallery's portraits, with their tokens, for a person or a monster. */
const galleryPairs = async (id, kind) => {
  const pairs = [];
  if (id === "custom") {
    for (const p of getCustomPortraitPaths()) pairs.push({ img: p, token: p });
  } else if (id === "shipped" && kind === "person") {
    const m = await getPortraitManifest();
    for (const n of m.names ?? []) pairs.push({ img: `${m.portraitDir}/${n}`, token: `${m.tokenDir}/${n}` });
  } else if (id === "lydia") {
    const l = (await getLydiaManifest())?.sets?.[kind === "monster" ? "monsters" : "characters"];
    for (const p of l?.pairs ?? []) pairs.push({ img: `${l.portraitDir}/${p.portrait}`, token: `${l.tokenDir}/${p.token}` });
  } else if (id === "tlomdev") {
    const t = await getTlomdevManifest();
    for (const c of t.categories ?? []) {
      if (TLOMDEV_NEITHER.includes(c.key) || TLOMDEV_PEOPLE.includes(c.key) !== (kind === "person")) continue;
      for (const n of c.names ?? []) { const p = `${t.artDir}/${c.key}/${n}`; pairs.push({ img: p, token: p }); }
    }
  }
  return pairs;
};

/**
 * A random portrait (and its paired token) for a person or a monster, from the GM's chosen source
 * (Toggles): one gallery, or every gallery that is on. A chosen gallery with nothing to give falls
 * back to the rest with a warning, never to a blank portrait (user, 2026-11-14).
 */
export const randomPortraitPair = async (kind = "person") => {
  const source = randomPortraitSource();
  const draw = async (ids) => {
    const pairs = [];
    for (const id of ids) pairs.push(...await galleryPairs(id, kind));
    return pairs.length ? pairs[Math.floor(Math.random() * pairs.length)] : null;
  };
  if (source !== "any") {
    const pair = await draw([source]);
    if (pair) return pair;
    if (game.user.isGM) {
      ui.notifications.warn("KNAVERY.Art.SourceEmpty", { format: { gallery: L(GALLERIES.find((g) => g.id === source)?.label ?? "") } });
    }
  }
  return draw(GALLERIES.map((g) => g.id).filter((id) => id !== "gameicons" && galleryOn(id)));
};

/** The token that belongs with a shipped portrait, or null. */
export const pairedTokenFor = async (portraitPath) => {
  const src = String(portraitPath ?? "");
  const base = src.split("/").pop();
  const m = await getPortraitManifest();
  if (m?.names?.includes(base) && src === `${m.portraitDir}/${base}`) return `${m.tokenDir}/${base}`;
  const l = await getLydiaManifest();
  for (const set of Object.values(l?.sets ?? {})) {
    const pair = (set.pairs ?? []).find((p) => src === `${set.portraitDir}/${p.portrait}`);
    if (pair) return `${set.tokenDir}/${pair.token}`;
  }
  return null;
};

/** Set an actor's portrait, and its token when the portrait has a pair. */
export const setActorArt = async (actor, img) => {
  const token = (await pairedTokenFor(img)) ?? img;
  const update = { img, "prototypeToken.texture.src": token };
  await actor.update(update);
  if (actor.isToken) await actor.token.update({ "texture.src": token });
};

/* -------------------------------------------- */
/*  The picker                                   */
/* -------------------------------------------- */

/**
 * Open the gallery.
 * @param {object} o
 * @param {string} o.current     the image in use now (marked selected)
 * @param {string} o.title
 * @param {"person"|"monster"|"item"} [o.kind]
 * @param {(src:string)=>Promise} o.onPick
 */
/** Each gallery's credit, its artist linked to the gallery's page (ART_CREDITS, the welcome's list). */
const CREDIT_LINKS = {
  "KNAVERY.Art.CreditAspeheim": { credit: "Lemurs Portraits", text: "Jon Aspeheim" },
  "KNAVERY.Art.CreditLydia": { credit: "Portraits and tokens", text: "Lydia Comer" },
  "KNAVERY.Art.CreditTlomdev": { credit: "Tlomdev's Tokens", text: "tlomdev" },
  "KNAVERY.Art.CreditGameIcons": { credit: "Game-icons.net", text: "game-icons.net" },
};
const creditHtml = (key) => {
  const c = CREDIT_LINKS[key];
  const url = ART_CREDITS.find((a) => a.name === c?.credit)?.url;
  const link = url ? `<a href="${attr(url)}" target="_blank" rel="noopener">${attr(c.text)}</a>` : attr(c?.text ?? "");
  return game.i18n.format(key, { link });
};

export async function pickArt({ current, title, kind = "person", onPick, onRoll = null }) {
  const isGM = game.user.isGM;
  const cellFor = (src, label = null) => {
    const sel = src === current ? " selected" : "";
    const t = attr(label ?? String(src).split("/").pop().replace(/\.[^.]+$/, ""));
    return `<img class="knavery-portrait-choice${sel}" src="${attr(src)}" data-src="${attr(src)}" title="${t}" alt="${t}" loading="lazy" />`;
  };
  const folderTile = (dir, key, names) =>
    `<button type="button" class="knavery-icon-folder" data-category="${attr(key)}" title="${attr(titleCase(key))}">
      <img src="${attr(`${dir}/${key}/${names[0]}`)}" alt="" loading="lazy" /><span>${attr(titleCase(key))}</span></button>`;
  const folderPane = (dir, cats, credit) => `<div class="knavery-icon-folders">${cats.map(({ key, names }) => folderTile(dir, key, names)).join("")}</div>
    <div class="knavery-icon-category" hidden>
      <button type="button" class="knavery-icon-back"><i class="fas fa-chevron-left"></i> ${L("KNAVERY.Art.Back")}</button>
      <div class="knavery-portrait-grid"></div>
    </div>
    ${credit ? `<div class="knavery-portrait-credit">${creditHtml(credit)}</div>` : ""}`;

  const panes = [];
  const shipped = await getPortraitManifest();
  const lydia = await getLydiaManifest();
  const icons = await getGameIconManifest();
  const tlom = await getTlomdevManifest();
  const custom = getCustomPortraitPaths();

  // Each gallery only while it is on (Toggles).
  if (kind !== "item" && galleryOn("custom") && custom.length + (isGM ? 1 : 0) > 0) {
    panes.push({
      id: "custom",
      label: L("KNAVERY.Art.TabCustom"),
      body: `<div class="knavery-portrait-grid">${custom.map((p) => cellFor(p)).join("")}</div>
        <div class="knavery-portrait-empty"${custom.length ? " hidden" : ""}>${game.i18n.format("KNAVERY.Art.CustomEmpty", { folder: attr(customPortraitFolder()) })}</div>
        ${isGM ? `<button type="button" class="knavery-portrait-refresh"><i class="fas fa-rotate"></i> ${L("KNAVERY.Art.Refresh")}</button>` : ""}`,
    });
  }
  if (kind === "person" && shipped.names?.length && galleryOn("shipped")) {
    panes.push({
      id: "shipped",
      label: L("KNAVERY.Art.TabAspeheim"),
      body: `<div class="knavery-portrait-grid">${shipped.names.map((n) => cellFor(`${shipped.portraitDir}/${n}`)).join("")}</div>
        <div class="knavery-portrait-credit">${creditHtml("KNAVERY.Art.CreditAspeheim")}</div>`,
    });
  }
  const lset = lydia.sets?.[kind === "monster" ? "monsters" : "characters"];
  if (kind !== "item" && lset?.pairs?.length && galleryOn("lydia")) {
    panes.push({
      id: "lydia",
      label: L("KNAVERY.Art.TabLydia"),
      body: `<div class="knavery-portrait-grid">${lset.pairs.map(({ portrait }) =>
        cellFor(`${lset.portraitDir}/${portrait}`)).join("")}</div>
        <div class="knavery-portrait-credit">${creditHtml("KNAVERY.Art.CreditLydia")}</div>`,
    });
  }
  if (tlom.categories?.length && kind !== "item" && galleryOn("tlomdev")) {
    panes.push({ id: "tlomdev", label: L("KNAVERY.Art.TabTlomdev"), body: folderPane(tlom.artDir, tlom.categories, "KNAVERY.Art.CreditTlomdev") });
  }
  if (icons.categories?.length && galleryOn("gameicons")) {
    panes.push({ id: "gameicons", label: L("KNAVERY.Art.TabGameIcons"), body: folderPane(icons.iconDir, icons.categories, "KNAVERY.Art.CreditGameIcons") });
  }

  const owns = (p) => current && (
    (p.id === "custom" && custom.includes(current))
    || (p.id === "shipped" && current.startsWith(shipped.portraitDir))
    || (p.id === "lydia" && current.startsWith(lset?.portraitDir ?? "\0"))
    || (p.id === "tlomdev" && current.startsWith(tlom.artDir))
    || (p.id === "gameicons" && current.startsWith(icons.iconDir)));
  const start = panes.find(owns)?.id ?? panes.find((p) => p.id !== "custom" || custom.length)?.id ?? panes[0]?.id;

  const tabs = panes.length > 1
    ? `<div class="knavery-portrait-tabs">${panes.map((p) =>
      `<button type="button" class="knavery-portrait-tab${p.id === start ? " active" : ""}" data-tab="${p.id}">${p.label}</button>`).join("")}</div>`
    : "";
  const paneHtml = panes.map((p) => `<div class="knavery-portrait-pane" data-pane="${p.id}"${p.id === start ? "" : " hidden"}>${p.body}</div>`).join("");
  const browse = game.user.can("FILES_BROWSE")
    ? `<button type="button" class="knavery-portrait-browse"><i class="fas fa-folder-open"></i> ${L("KNAVERY.Art.Browse")}</button>` : "";
  const url = `<div class="knavery-portrait-url"><input type="text" class="knavery-portrait-url-input" placeholder="${L("KNAVERY.Art.UrlPlaceholder")}" />
    <button type="button" class="knavery-portrait-url-set">${L("KNAVERY.Art.UrlSet")}</button></div>`;

  // Char Gen Mode: a roll for a random portrait, besides choosing one.
  const roll = onRoll
    ? `<button type="button" class="knavery-portrait-roll"><i class="fas fa-dice-d20"></i> ${L("KNAVERY.Art.Roll")}</button>` : "";
  const dialog = new foundry.applications.api.DialogV2({
    window: { title, icon: "fas fa-image" },
    classes: ["knavery"],
    position: { width: 540 },
    content: `<div class="knavery-portrait-gallery">${roll}${tabs}${paneHtml}${url}${browse}</div>`,
    buttons: [{ action: "close", label: "KNAVERY.Close", default: true }],
  });
  await dialog.render(true);
  const root = dialog.element;

  const commit = async (src) => {
    try { await onPick(src); } catch (err) {
      console.error("Base Knavery | art pick failed", err);
    } finally { dialog.close(); }
  };
  const wire = (el) => el.querySelectorAll(".knavery-portrait-choice").forEach((img) =>
    img.addEventListener("click", () => commit(img.dataset.src)));
  wire(root);
  root.querySelector(".knavery-portrait-roll")?.addEventListener("click", async () => {
    try { await onRoll(); } catch (err) {
      console.error("Base Knavery | portrait roll failed", err);
    } finally { dialog.close(); }
  });
  root.querySelectorAll(".knavery-portrait-tab").forEach((btn) => btn.addEventListener("click", () => {
    root.querySelectorAll(".knavery-portrait-tab").forEach((b) => b.classList.toggle("active", b === btn));
    root.querySelectorAll(".knavery-portrait-pane").forEach((p) => { p.hidden = p.dataset.pane !== btn.dataset.tab; });
  }));
  for (const [id, dir, cats] of [["gameicons", icons.iconDir, icons.categories], ["tlomdev", tlom.artDir, tlom.categories]]) {
    const pane = root.querySelector(`[data-pane="${id}"]`);
    const folders = pane?.querySelector(".knavery-icon-folders");
    const category = pane?.querySelector(".knavery-icon-category");
    if (!folders || !category) continue;
    const grid = category.querySelector(".knavery-portrait-grid");
    folders.querySelectorAll(".knavery-icon-folder").forEach((btn) => btn.addEventListener("click", () => {
      const cat = cats.find((c) => c.key === btn.dataset.category);
      if (!cat) return;
      grid.innerHTML = cat.names.map((n) => cellFor(`${dir}/${cat.key}/${n}`)).join("");
      wire(grid);
      folders.hidden = true;
      category.hidden = false;
    }));
    category.querySelector(".knavery-icon-back")?.addEventListener("click", () => {
      category.hidden = true;
      folders.hidden = false;
    });
  }
  root.querySelector(".knavery-portrait-refresh")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget; // null once the await below yields
    btn.disabled = true;
    const list = await refreshCustomPortraits();
    const pane = root.querySelector('[data-pane="custom"] .knavery-portrait-grid');
    if (pane) { pane.innerHTML = list.map((p) => cellFor(p)).join(""); wire(pane); }
    const empty = root.querySelector(".knavery-portrait-empty");
    if (empty) empty.hidden = list.length > 0;
    btn.disabled = false;
  });
  const input = root.querySelector(".knavery-portrait-url-input");
  const applyUrl = () => { const v = input?.value.trim(); if (v) commit(v); };
  root.querySelector(".knavery-portrait-url-set")?.addEventListener("click", applyUrl);
  input?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyUrl(); } });
  root.querySelector(".knavery-portrait-browse")?.addEventListener("click", () => {
    new foundry.applications.apps.FilePicker.implementation({
      type: "image", current: current ?? "", callback: (path) => commit(path),
    }).render(true);
  });
  return dialog;
}
