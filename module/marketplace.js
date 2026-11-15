/**
 * The marketplace: buy (or, in Char Gen Mode, take) gear from aisles.
 *
 * An aisle is a RollTable named "Market: <Aisle>". Shipped aisles live in the
 * Marketplace compendium; a WORLD table with the same name replaces it, and a
 * world table with a new name adds an aisle. Each row is either a linked Item
 * or a plain text row; a row's price is the flag `base-knavery.price` when set,
 * else the item's own cost. The GM manages all of this in the Marketplace
 * Manager, and can hide aisles without deleting them.
 *
 * A world on Knave 1e's price list (rule `price-list`) shops the "Market 1e: <Aisle>" tables
 * instead, in copper (Knave 1.0 p3, CC BY 4.0). A row flagged `base-knavery.service` (a bed, a
 * meal, a house) only takes the coins: nothing goes in the inventory.
 */
import { FLAG_SCOPE, MARKET_1E_PREFIX, MARKET_PREFIX, SETTINGS_NS, SYS_PATH } from "./config.js";
import { usesPrices1e } from "./rules.js";
import { findTablesByPrefix, isPlaceholder, plainText, resultText } from "./compendium.js";
import { slotsForItem } from "./documents/actor.js";
import { P } from "./i18n.js";

const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const AISLE_ORDER = ["Weapons", "Armor", "Gear", "Food", "Animals & Transport", "Clothing", "Lodging & Meals", "Buildings"];

export const playerMarketClosed = () => !game.user.isGM && !game.settings.get(SETTINGS_NS, "allow-player-marketplace");

/** The aisle tables' prefix for the world's price list. */
export const marketPrefix = () => (usesPrices1e() ? MARKET_1E_PREFIX : MARKET_PREFIX);
/** The prefix an aisle's name starts with, or "" (a translated aisle may have none; its `market` flag counts). */
const prefixOf = (table) => (table.name.startsWith(MARKET_1E_PREFIX) ? MARKET_1E_PREFIX : table.name.startsWith(MARKET_PREFIX) ? MARKET_PREFIX : "");
/** The aisle's name as shown: its table name without the prefix. */
export const aisleName = (table) => table.name.slice(prefixOf(table).length).trim();
/** The aisle's English name, for hiding and shelf order: its `aisle` flag (kept by a translation), else its name. */
const aisleId = (table) => table.flags?.[FLAG_SCOPE]?.aisle ?? aisleName(table);
/** Each price list hides its own aisles (both have a "Weapons"); 1e's services ship hidden. */
const hiddenKey = () => (usesPrices1e() ? "market-hidden-aisles-1e" : "market-hidden-aisles");
const hiddenAisles = () => new Set(game.settings.get(SETTINGS_NS, hiddenKey()) ?? []);

/** Every aisle table (world copies shadowing shipped ones), in shelf order. */
export const marketTables = async ({ includeHidden = false } = {}) => {
  const hidden = hiddenAisles();
  const tables = (await findTablesByPrefix(marketPrefix()))
    .filter((t) => includeHidden || !hidden.has(aisleId(t)));
  const order = (t) => {
    const i = AISLE_ORDER.indexOf(aisleId(t));
    return i === -1 ? AISLE_ORDER.length : i;
  };
  return tables.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
};

/**
 * The price of a row: its override flag, else the linked item's cost. Coins are
 * whole, so a fractional cost is rounded up (it could never be paid otherwise).
 */
export const rowPrice = (result, item) => {
  const override = result.getFlag?.(FLAG_SCOPE, "price") ?? result.flags?.[FLAG_SCOPE]?.price;
  const raw = override !== undefined && override !== null && override !== "" ? override : item?.system?.cost;
  return Math.max(0, Math.ceil(Number(raw) || 0));
};

/**
 * Load every document an aisle's rows link to, one request per compendium
 * (loading them one at a time cost ≈0.6 s each on a small server).
 * @returns {Promise<Map<string, foundry.abstract.Document>>} by uuid
 */
const linkedDocuments = async (results) => {
  const found = new Map();
  const byPack = new Map();
  for (const r of results) {
    if (!r.documentUuid || found.has(r.documentUuid)) continue;
    const parsed = foundry.utils.parseUuid(r.documentUuid);
    const pack = parsed?.collection instanceof foundry.documents.collections.CompendiumCollection ? parsed.collection : null;
    if (pack && !parsed.embedded?.length) {
      if (!byPack.has(pack)) byPack.set(pack, new Map());
      byPack.get(pack).set(parsed.id, r.documentUuid);
    } else {
      const doc = fromUuidSync(r.documentUuid, { strict: false });
      if (doc && !doc.pack) found.set(r.documentUuid, doc);
    }
  }
  for (const [pack, ids] of byPack) {
    const docs = await pack.getDocuments({ _id__in: [...ids.keys()] }).catch(() => []);
    for (const doc of docs) found.set(ids.get(doc.id), doc);
  }
  return found;
};

/** Resolve an aisle's rows to {name, img, price, data, slots}. */
export const aisleStock = async (table) => {
  const rows = [];
  const linked = await linkedDocuments(table.results);
  for (const r of [...table.results].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0))) {
    if (isPlaceholder(r)) continue;
    const item = r.documentUuid ? (linked.get(r.documentUuid) ?? null) : null;
    if (item && item.documentName !== "Item") continue;
    const data = item ? item.toObject() : {
      name: plainText(resultText(r)) || "?",
      type: "item",
      img: r.img || `${SYS_PATH}/icons/generic-item.svg`,
      system: {},
    };
    delete data._id;
    const price = rowPrice(r, item);
    data.system = { ...(data.system ?? {}), cost: price, equipped: false };
    const service = !item && (r.getFlag?.(FLAG_SCOPE, "service") ?? r.flags?.[FLAG_SCOPE]?.service) === true;
    rows.push({
      id: r.id,
      name: data.name,
      img: data.img,
      price,
      data,
      service,
      slots: service ? 0 : (item ? slotsForItem(item) : 1),
      description: item?.system?.description ?? r.description ?? "",
    });
  }
  return rows;
};

/* -------------------------------------------- */
/*  The shop                                     */
/* -------------------------------------------- */

/**
 * Free Take: the GM, or a character in Char Gen Mode whose player may use
 * Char Gen Mode (the same test the sheet applies to its toggle).
 */
export const mayTakeFree = (actor) => {
  if (game.user.isGM) return true;
  return actor.type === "character" && actor.system.generationEnabled === true
    && game.settings.get(SETTINGS_NS, "allow-player-randomization");
};

const acquire = async (actor, data, pay, { service = false } = {}) => {
  if (playerMarketClosed()) return ui.notifications.warn("KNAVERY.Notify.MarketplaceClosed", { localize: true });
  if (!pay && !mayTakeFree(actor)) return ui.notifications.warn("KNAVERY.Notify.RandomizationDisabled", { localize: true });
  const cost = Math.max(0, Math.ceil(Number(data.system.cost) || 0));
  const coins = actor._source.system.coins ?? 0;
  if (pay && coins < cost) {
    ui.notifications.warn("KNAVERY.Notify.NotEnoughCoins", { format: { name: data.name, cost } });
    return false;
  }
  // The coins go first: an item handed over before a payment that then failed
  // was free. If the item cannot be added, the coins come back.
  if (pay && cost) await actor.update({ "system.coins": coins - cost }, { knNoLog: true });
  try {
    if (!service) await actor.addItems([data], { knNoLog: pay });
  } catch (err) {
    if (pay && cost) await actor.update({ "system.coins": actor._source.system.coins + cost }, { knNoLog: true });
    throw err;
  }
  if (pay) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="knavery-market-note"><i class="fas fa-store"></i> ${esc(F("KNAVERY.Market.Bought", { name: data.name, cost }))}</p>`,
      whisper: game.users.filter((u) => u.isGM || actor.testUserPermission(u, "OWNER")).map((u) => u.id),
    });
  }
  if (actor.overburdened) ui.notifications.warn("KNAVERY.Notify.Overburdened", { format: { name: actor.name } });
  return true;
};

/** Open the shop for `actor`. Take (free) is offered to the GM and in Char Gen Mode. */
export const openMarketplace = async (actor) => {
  if (playerMarketClosed()) return ui.notifications.warn("KNAVERY.Notify.MarketplaceClosed", { localize: true });
  const tables = await marketTables();
  const aisles = [];
  for (const t of tables) {
    const stock = await aisleStock(t);
    if (stock.length) aisles.push({ name: aisleName(t), stock });
  }
  if (!aisles.length) return ui.notifications.warn("KNAVERY.Notify.MarketplaceEmpty", { localize: true });
  const canTake = mayTakeFree(actor);
  const built = [];
  const sections = aisles.map((a) => `<div class="mkt-cat"><div class="mkt-cat-name">${esc(a.name)}</div>${a.stock.map((row) => {
    const idx = built.push(row) - 1;
    return `<div class="mkt-row" data-idx="${idx}" data-cost="${row.price}" data-name="${esc(row.name.toLowerCase())}">
      <div class="mkt-line">
        <div class="mkt-row-main"><img class="mkt-img" src="${esc(row.img)}" alt="" /><span class="mkt-name">${esc(row.name)}</span></div>
        <span class="mkt-slots">${row.service ? esc(L("KNAVERY.Market.Service")) : esc(P("KNAVERY.NSlots", row.slots))}</span>
        <span class="mkt-cost"><i class="fas fa-coins"></i> ${row.price}</span>
        <span class="mkt-actions">
          <button type="button" class="mkt-buy" data-idx="${idx}">${L("KNAVERY.Market.Buy")}</button>
          ${canTake && !row.service ? `<button type="button" class="mkt-take" data-idx="${idx}" data-tooltip="KNAVERY.Market.TakeHint">${L("KNAVERY.Market.Take")}</button>` : ""}
        </span>
      </div>
      <div class="mkt-desc" hidden>${row.description ? esc(plainText(row.description)) : `<em>${esc(L("KNAVERY.NoDescription"))}</em>`}</div>
    </div>`;
  }).join("")}</div>`).join("");

  const dialog = new DialogV2({
    window: { title: F("KNAVERY.Market.Title", { name: actor.name }), icon: "fas fa-store" },
    classes: ["knavery", "knavery-marketplace"],
    position: { width: 600, height: 640 },
    content: `<div class="marketplace">
      <div class="mkt-header">
        <span class="mkt-purse"><i class="fas fa-coins"></i> <span class="mkt-coins"></span></span>
        <span class="mkt-slotcount"><i class="fas fa-box"></i> <span class="mkt-slotval"></span></span>
        <input type="search" class="mkt-search" placeholder="${esc(L("KNAVERY.Filter"))}" />
      </div>
      <div class="mkt-list">${sections}</div></div>`,
    buttons: [{ action: "close", label: "KNAVERY.Close", default: true }],
  });
  const refresh = () => {
    const root = dialog.element;
    if (!root) return;
    const coins = actor.system.coins ?? 0;
    root.querySelector(".mkt-coins").textContent = coins;
    root.querySelector(".mkt-slotval").textContent = `${actor.calcSlotsUsed()}/${actor.system.slotsMax ?? 0}`;
    root.querySelectorAll(".mkt-buy").forEach((b) => { b.disabled = busy || coins < Number(b.closest(".mkt-row").dataset.cost); });
    root.querySelectorAll(".mkt-take").forEach((b) => { b.disabled = busy; });
  };
  // One purchase at a time: two quick clicks would both pass the coin check.
  let busy = false;
  await dialog.render(true);
  const root = dialog.element;
  root.querySelector(".mkt-list").addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".mkt-buy, .mkt-take");
    if (btn) {
      ev.preventDefault();
      const row = built[Number(btn.dataset.idx)];
      if (!row || busy) return;
      busy = true;
      refresh();
      try {
        await acquire(actor, foundry.utils.deepClone(row.data), btn.classList.contains("mkt-buy"), { service: row.service });
      } catch (err) {
        console.error("Base Knavery | marketplace purchase failed", err);
        ui.notifications.error("KNAVERY.Notify.PurchaseFailed", { localize: true });
      } finally {
        busy = false;
        refresh();
      }
      return;
    }
    const main = ev.target.closest(".mkt-row-main");
    if (main) {
      const desc = main.closest(".mkt-row")?.querySelector(".mkt-desc");
      if (desc) desc.hidden = !desc.hidden;
    }
  });
  const search = root.querySelector(".mkt-search");
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    root.querySelectorAll(".mkt-cat").forEach((cat) => {
      let any = false;
      cat.querySelectorAll(".mkt-row").forEach((row) => {
        row.hidden = !!q && !row.dataset.name.includes(q);
        any ||= !row.hidden;
      });
      cat.hidden = !any;
    });
  });
  refresh();
};

/* -------------------------------------------- */
/*  The GM's Marketplace page (gm-dashboard.js)  */
/* -------------------------------------------- */
/*
 * The aisles and their rows are the dashboard's Marketplace page (user, 2026-11-14; a
 * window of its own before 0.3.0). The dashboard keeps the chosen aisle in
 * `marketSelected`; the handlers in MARKET_ACTIONS run with the dashboard as `this`,
 * as AppV2 calls an application's actions.
 */

/** The page's context: every aisle, and the chosen one's rows. */
export const marketPageContext = async (app) => {
  const hidden = hiddenAisles();
  const tables = await marketTables({ includeHidden: true });
  const aisles = tables.map((t) => ({
    uuid: t.uuid, id: aisleId(t), name: aisleName(t), world: !t.pack, hidden: hidden.has(aisleId(t)), count: t.results.size,
  }));
  if (!app.marketSelected || !aisles.some((a) => a.uuid === app.marketSelected)) app.marketSelected = aisles[0]?.uuid ?? null;
  const table = app.marketSelected ? await fromUuid(app.marketSelected) : null;
  const rows = [];
  if (table) {
    const linked = await linkedDocuments(table.results);
    for (const r of [...table.results].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0))) {
      if (isPlaceholder(r)) continue;
      const item = r.documentUuid ? (linked.get(r.documentUuid) ?? null) : null;
      const override = r.getFlag(FLAG_SCOPE, "price");
      rows.push({
        id: r.id,
        name: item?.name ?? plainText(resultText(r)),
        img: item?.img ?? r.img,
        base: item?.system?.cost ?? null,
        override: override ?? "",
        linked: !!item,
      });
    }
  }
  return {
    aisles: aisles.map((a) => ({ ...a, selected: a.uuid === app.marketSelected })),
    table: table ? { uuid: table.uuid, name: aisleName(table), world: !table.pack } : null,
    rows,
  };
};

const rerender = (app) => app.render({ parts: ["market"] });

/**
 * Wire the page after a render: a price override on change, items dropped onto the aisle. Once per drawing of
 * the market part: `_onRender` runs on every render, and a render of another part keeps this section and its
 * listeners (a second drop handler would add a second row).
 */
export const bindMarketPage = (app) => {
  const root = app.element?.querySelector('section[data-tab="market"]');
  if (!root || root.dataset.knBound) return;
  root.dataset.knBound = "1";
  root.querySelectorAll("input.mm-price").forEach((input) => input.addEventListener("change", async () => {
    const table = await fromUuid(app.marketSelected);
    if (!table || table.pack) return;
    const v = input.value.trim();
    await table.updateEmbeddedDocuments("TableResult", [{
      _id: input.dataset.rowId,
      [`flags.${FLAG_SCOPE}.price`]: v === "" ? null : Math.max(0, Math.ceil(Number(v) || 0)),
    }]);
  }));
  const drop = root.querySelector(".mm-drop");
  drop?.addEventListener("dragover", (e) => e.preventDefault());
  drop?.addEventListener("drop", async (e) => {
    e.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
    if (data?.type !== "Item") return;
    const table = await fromUuid(app.marketSelected);
    if (!table) return;
    if (table.pack) return ui.notifications.warn("KNAVERY.Market.CustomizeFirst", { localize: true });
    const item = await fromUuid(data.uuid);
    if (!item) return;
    const n = nextRow(table);
    await table.createEmbeddedDocuments("TableResult", [{
      type: CONST.TABLE_RESULT_TYPES.DOCUMENT, documentUuid: item.uuid, name: item.name, img: item.img, range: [n, n], weight: 1,
    }]);
    await renumberAisle(table);
    rerender(app);
  });
};

/** The page's actions; `this` is the dashboard. */
export const MARKET_ACTIONS = {
  selectAisle(_e, target) {
    this.marketSelected = target.dataset.uuid;
    rerender(this);
  },

  async newAisle() {
    const name = await DialogV2.prompt({
      classes: ["knavery"],
      window: { title: L("KNAVERY.Market.NewAisle") },
      content: `<div class="form-group"><label>${L("KNAVERY.Market.AisleName")}</label><input type="text" name="aisle" autofocus /></div>`,
      ok: { callback: (_e, b) => b.form.elements.aisle.value.trim() },
      rejectClose: false,
    });
    if (!name) return;
    const table = await RollTable.create({ name: `${marketPrefix()}${name}`, formula: "1d1", replacement: true });
    this.marketSelected = table.uuid;
    rerender(this);
  },

  /** Copy a shipped aisle into the world so it can be edited; the copy shadows it. */
  async customize(_e, target) {
    const src = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    if (!src?.pack) return;
    const data = game.tables.fromCompendium(src);
    const copy = await RollTable.create(data);
    this.marketSelected = copy.uuid;
    ui.notifications.info("KNAVERY.Market.Customized", { format: { name: aisleName(copy) } });
    rerender(this);
  },

  async toggleHidden(_e, target) {
    const name = target.closest("[data-name]").dataset.name;
    const hidden = hiddenAisles();
    if (hidden.has(name)) hidden.delete(name);
    else hidden.add(name);
    await game.settings.set(SETTINGS_NS, hiddenKey(), [...hidden]);
    rerender(this);
  },

  async renameAisle(_e, target) {
    const table = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    if (!table || table.pack) return;
    const name = await DialogV2.prompt({
      classes: ["knavery"],
      window: { title: L("KNAVERY.Market.RenameAisle") },
      content: `<div class="form-group"><label>${L("KNAVERY.Market.AisleName")}</label><input type="text" name="aisle" value="${esc(aisleName(table))}" autofocus /></div>`,
      ok: { callback: (_e2, b) => b.form.elements.aisle.value.trim() },
      rejectClose: false,
    });
    if (name) await table.update({ name: `${prefixOf(table)}${name}` });
    rerender(this);
  },

  async deleteAisle(_e, target) {
    const table = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    if (!table || table.pack) return;
    const ok = await DialogV2.confirm({
      classes: ["knavery"],
      window: { title: L("KNAVERY.Market.DeleteAisle") },
      content: `<p>${esc(F("KNAVERY.Market.DeleteAisleConfirm", { name: aisleName(table) }))}</p>`,
    });
    if (ok) await table.delete();
    rerender(this);
  },

  async openTable(_e, target) {
    (await fromUuid(target.closest("[data-uuid]").dataset.uuid))?.sheet.render(true);
  },

  async addTextRow() {
    const table = await fromUuid(this.marketSelected);
    if (!table || table.pack) return ui.notifications.warn("KNAVERY.Market.CustomizeFirst", { localize: true });
    const res = await DialogV2.prompt({
      classes: ["knavery"],
      window: { title: L("KNAVERY.Market.AddTextRow") },
      content: `<div class="form-group"><label>${L("KNAVERY.Name")}</label><input type="text" name="name" autofocus /></div>
        <div class="form-group"><label>${L("KNAVERY.Price")}</label><input type="number" name="price" min="0" value="5" /></div>`,
      ok: { callback: (_e, b) => ({ name: b.form.elements.name.value.trim(), price: Number(b.form.elements.price.value) || 0 }) },
      rejectClose: false,
    });
    if (!res?.name) return;
    const n = nextRow(table);
    await table.createEmbeddedDocuments("TableResult", [{
      type: CONST.TABLE_RESULT_TYPES.TEXT, name: res.name, description: "", range: [n, n], weight: 1,
      flags: { [FLAG_SCOPE]: { price: Math.max(0, Math.ceil(res.price)) } },
    }]);
    await renumberAisle(table);
    rerender(this);
  },

  async removeRow(_e, target) {
    const table = await fromUuid(this.marketSelected);
    if (!table || table.pack) return;
    await table.deleteEmbeddedDocuments("TableResult", [target.closest("[data-row-id]").dataset.rowId]);
    await renumberAisle(table);
    rerender(this);
  },
};

/** The face after an aisle's highest row. */
export const nextRow = (table) => Math.max(0, ...table.results.map((r) => r.range?.[1] ?? 0)) + 1;

/**
 * Number an aisle's rows 1…n in shelf order, one face each, and set its die to
 * match, so a removed row leaves no gap and an added one shares no face.
 */
export const renumberAisle = async (table) => {
  const rows = [...table.results].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
  const updates = rows.map((r, i) => ({ _id: r.id, range: [i + 1, i + 1], weight: 1 }))
    .filter((u, i) => rows[i].range?.[0] !== u.range[0] || rows[i].range?.[1] !== u.range[1] || rows[i].weight !== 1);
  if (updates.length) await table.updateEmbeddedDocuments("TableResult", updates);
  await table.update({ formula: `1d${Math.max(1, rows.length)}` });
};
