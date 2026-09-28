/**
 * The marketplace: buy (or, in creation mode, take) gear from aisles.
 *
 * An aisle is a RollTable named "Market: <Aisle>". Shipped aisles live in the
 * Marketplace compendium; a WORLD table with the same name replaces it, and a
 * world table with a new name adds an aisle. Each row is either a linked Item
 * or a plain text row; a row's price is the flag `base-knavery.price` when set,
 * else the item's own cost. The GM manages all of this in the Marketplace
 * Manager, and can hide aisles without deleting them.
 */
import { FLAG_SCOPE, MARKET_PREFIX, SETTINGS_NS, SYS_PATH } from "./config.js";
import { findTablesByPrefix, isPlaceholder, plainText, resultText } from "./compendium.js";
import { slotsForItem } from "./documents/actor.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const AISLE_ORDER = ["Weapons", "Armor", "Gear", "Animals & Transport"];

export const playerMarketClosed = () => !game.user.isGM && !game.settings.get(SETTINGS_NS, "allow-player-marketplace");

const aisleName = (table) => table.name.slice(MARKET_PREFIX.length).trim();
const hiddenAisles = () => new Set(game.settings.get(SETTINGS_NS, "market-hidden-aisles") ?? []);

/** Every aisle table (world copies shadowing shipped ones), in shelf order. */
export const marketTables = async ({ includeHidden = false } = {}) => {
  const hidden = hiddenAisles();
  const tables = (await findTablesByPrefix(MARKET_PREFIX))
    .filter((t) => includeHidden || !hidden.has(aisleName(t)));
  const order = (t) => {
    const i = AISLE_ORDER.indexOf(aisleName(t));
    return i === -1 ? AISLE_ORDER.length : i;
  };
  return tables.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
};

/** The price of a row: its override flag, else the linked item's cost. */
export const rowPrice = (result, item) => {
  const override = result.getFlag?.(FLAG_SCOPE, "price") ?? result.flags?.[FLAG_SCOPE]?.price;
  if (override !== undefined && override !== null && override !== "") return Number(override) || 0;
  return Number(item?.system?.cost) || 0;
};

/** Resolve an aisle's rows to {name, img, price, data, slots}. */
export const aisleStock = async (table) => {
  const rows = [];
  for (const r of [...table.results].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0))) {
    if (isPlaceholder(r)) continue;
    let item = null;
    if (r.documentUuid) item = await fromUuid(r.documentUuid).catch(() => null);
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
    rows.push({
      id: r.id,
      name: data.name,
      img: data.img,
      price,
      data,
      slots: item ? slotsForItem(item) : 1,
      description: item?.system?.description ?? r.description ?? "",
    });
  }
  return rows;
};

/* -------------------------------------------- */
/*  The shop                                     */
/* -------------------------------------------- */

const acquire = async (actor, data, pay) => {
  if (playerMarketClosed()) return ui.notifications.warn("KNAVERY.Notify.MarketplaceClosed", { localize: true });
  const cost = data.system.cost ?? 0;
  if (pay && (actor.system.coins ?? 0) < cost) {
    ui.notifications.warn(F("KNAVERY.Notify.NotEnoughCoins", { name: data.name, cost }));
    return false;
  }
  await actor.createEmbeddedDocuments("Item", [data], { knNoLog: pay });
  if (pay) {
    await actor.update({ "system.coins": actor.system.coins - cost }, { knNoLog: true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="knavery-market-note"><i class="fas fa-store"></i> ${esc(F("KNAVERY.Market.Bought", { name: data.name, cost }))}</p>`,
      whisper: game.users.filter((u) => u.isGM || actor.testUserPermission(u, "OWNER")).map((u) => u.id),
    });
  }
  if (actor.overburdened) ui.notifications.warn(F("KNAVERY.Notify.Overburdened", { name: actor.name }));
  return true;
};

/** Open the shop for `actor`. Take (free) is offered to the GM and in creation mode. */
export const openMarketplace = async (actor) => {
  if (playerMarketClosed()) return ui.notifications.warn("KNAVERY.Notify.MarketplaceClosed", { localize: true });
  const tables = await marketTables();
  const aisles = [];
  for (const t of tables) {
    const stock = await aisleStock(t);
    if (stock.length) aisles.push({ name: aisleName(t), stock });
  }
  if (!aisles.length) return ui.notifications.warn("KNAVERY.Notify.MarketplaceEmpty", { localize: true });
  const canTake = game.user.isGM || actor.system.generationEnabled === true;
  const built = [];
  const sections = aisles.map((a) => `<div class="mkt-cat"><div class="mkt-cat-name">${esc(a.name)}</div>${a.stock.map((row) => {
    const idx = built.push(row) - 1;
    return `<div class="mkt-row" data-idx="${idx}" data-cost="${row.price}" data-name="${esc(row.name.toLowerCase())}">
      <div class="mkt-line">
        <div class="mkt-row-main"><img class="mkt-img" src="${esc(row.img)}" alt="" /><span class="mkt-name">${esc(row.name)}</span></div>
        <span class="mkt-slots">${esc(F("KNAVERY.NSlots", { n: row.slots }))}</span>
        <span class="mkt-cost"><i class="fas fa-coins"></i> ${row.price}</span>
        <span class="mkt-actions">
          <button type="button" class="mkt-buy" data-idx="${idx}">${L("KNAVERY.Market.Buy")}</button>
          ${canTake ? `<button type="button" class="mkt-take" data-idx="${idx}" data-tooltip="KNAVERY.Market.TakeHint">${L("KNAVERY.Market.Take")}</button>` : ""}
        </span>
      </div>
      <div class="mkt-desc" hidden>${row.description ? plainText(row.description) : `<em>${L("KNAVERY.NoDescription")}</em>`}</div>
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
    root.querySelectorAll(".mkt-buy").forEach((b) => { b.disabled = coins < Number(b.closest(".mkt-row").dataset.cost); });
  };
  await dialog.render(true);
  const root = dialog.element;
  root.querySelector(".mkt-list").addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".mkt-buy, .mkt-take");
    if (btn) {
      ev.preventDefault();
      const row = built[Number(btn.dataset.idx)];
      if (!row) return;
      btn.disabled = true;
      try { await acquire(actor, foundry.utils.deepClone(row.data), btn.classList.contains("mkt-buy")); } finally { refresh(); }
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
/*  The GM's Marketplace Manager                 */
/* -------------------------------------------- */

export class MarketplaceManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "knavery-marketplace-manager",
    classes: ["knavery", "knavery-market-manager"],
    window: { title: "KNAVERY.Market.ManagerTitle", icon: "fas fa-store", resizable: true },
    position: { width: 720, height: 700 },
    actions: {
      newAisle: MarketplaceManager.#onNewAisle,
      customize: MarketplaceManager.#onCustomize,
      toggleHidden: MarketplaceManager.#onToggleHidden,
      renameAisle: MarketplaceManager.#onRename,
      deleteAisle: MarketplaceManager.#onDelete,
      openTable: MarketplaceManager.#onOpenTable,
      addTextRow: MarketplaceManager.#onAddTextRow,
      removeRow: MarketplaceManager.#onRemoveRow,
      selectAisle: MarketplaceManager.#onSelect,
    },
  };

  static PARTS = { body: { template: `${SYS_PATH}/templates/apps/market-manager.html`, scrollable: [".mm-rows"] } };

  #selected = null;

  async _prepareContext() {
    const hidden = hiddenAisles();
    const tables = await marketTables({ includeHidden: true });
    const aisles = tables.map((t) => ({
      uuid: t.uuid, name: aisleName(t), world: !t.pack, hidden: hidden.has(aisleName(t)), count: t.results.size,
    }));
    if (!this.#selected || !aisles.some((a) => a.uuid === this.#selected)) this.#selected = aisles[0]?.uuid ?? null;
    const table = this.#selected ? await fromUuid(this.#selected) : null;
    const rows = [];
    if (table) {
      for (const r of [...table.results].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0))) {
        if (isPlaceholder(r)) continue;
        const item = r.documentUuid ? await fromUuid(r.documentUuid).catch(() => null) : null;
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
      aisles: aisles.map((a) => ({ ...a, selected: a.uuid === this.#selected })),
      table: table ? { uuid: table.uuid, name: aisleName(table), world: !table.pack } : null,
      rows,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    root.querySelectorAll("input.mm-price").forEach((input) => input.addEventListener("change", async () => {
      const table = await fromUuid(this.#selected);
      if (!table || table.pack) return;
      const v = input.value.trim();
      await table.updateEmbeddedDocuments("TableResult", [{
        _id: input.dataset.rowId,
        [`flags.${FLAG_SCOPE}.price`]: v === "" ? null : Math.max(0, Number(v) || 0),
      }]);
    }));
    const drop = root.querySelector(".mm-drop");
    drop?.addEventListener("dragover", (e) => e.preventDefault());
    drop?.addEventListener("drop", async (e) => {
      e.preventDefault();
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
      if (data?.type !== "Item") return;
      const table = await fromUuid(this.#selected);
      if (!table) return;
      if (table.pack) return ui.notifications.warn("KNAVERY.Market.CustomizeFirst", { localize: true });
      const item = await fromUuid(data.uuid);
      if (!item) return;
      const n = table.results.size + 1;
      await table.createEmbeddedDocuments("TableResult", [{
        type: CONST.TABLE_RESULT_TYPES.DOCUMENT, documentUuid: item.uuid, name: item.name, img: item.img, range: [n, n], weight: 1,
      }]);
      await table.update({ formula: `1d${table.results.size}` });
      this.render();
    });
  }

  static #onSelect(_e, target) {
    this.#selected = target.dataset.uuid;
    this.render();
  }

  static async #onNewAisle() {
    const name = await DialogV2.prompt({
      window: { title: L("KNAVERY.Market.NewAisle") },
      content: `<div class="form-group"><label>${L("KNAVERY.Market.AisleName")}</label><input type="text" name="aisle" autofocus /></div>`,
      ok: { callback: (_e, b) => b.form.elements.aisle.value.trim() },
      rejectClose: false,
    });
    if (!name) return;
    const table = await RollTable.create({ name: `${MARKET_PREFIX}${name}`, formula: "1d1", replacement: true });
    this.#selected = table.uuid;
    this.render();
  }

  /** Copy a shipped aisle into the world so it can be edited; the copy shadows it. */
  static async #onCustomize(_e, target) {
    const src = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    if (!src?.pack) return;
    const data = game.tables.fromCompendium(src);
    const copy = await RollTable.create(data);
    this.#selected = copy.uuid;
    ui.notifications.info(F("KNAVERY.Market.Customized", { name: aisleName(copy) }));
    this.render();
  }

  static async #onToggleHidden(_e, target) {
    const name = target.closest("[data-name]").dataset.name;
    const hidden = hiddenAisles();
    if (hidden.has(name)) hidden.delete(name);
    else hidden.add(name);
    await game.settings.set(SETTINGS_NS, "market-hidden-aisles", [...hidden]);
    this.render();
  }

  static async #onRename(_e, target) {
    const table = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    if (!table || table.pack) return;
    const name = await DialogV2.prompt({
      window: { title: L("KNAVERY.Market.RenameAisle") },
      content: `<div class="form-group"><label>${L("KNAVERY.Market.AisleName")}</label><input type="text" name="aisle" value="${esc(aisleName(table))}" autofocus /></div>`,
      ok: { callback: (_e2, b) => b.form.elements.aisle.value.trim() },
      rejectClose: false,
    });
    if (name) await table.update({ name: `${MARKET_PREFIX}${name}` });
    this.render();
  }

  static async #onDelete(_e, target) {
    const table = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    if (!table || table.pack) return;
    const ok = await DialogV2.confirm({
      window: { title: L("KNAVERY.Market.DeleteAisle") },
      content: `<p>${esc(F("KNAVERY.Market.DeleteAisleConfirm", { name: aisleName(table) }))}</p>`,
    });
    if (ok) await table.delete();
    this.render();
  }

  static async #onOpenTable(_e, target) {
    (await fromUuid(target.closest("[data-uuid]").dataset.uuid))?.sheet.render(true);
  }

  static async #onAddTextRow() {
    const table = await fromUuid(this.#selected);
    if (!table || table.pack) return ui.notifications.warn("KNAVERY.Market.CustomizeFirst", { localize: true });
    const res = await DialogV2.prompt({
      window: { title: L("KNAVERY.Market.AddTextRow") },
      content: `<div class="form-group"><label>${L("KNAVERY.Name")}</label><input type="text" name="name" autofocus /></div>
        <div class="form-group"><label>${L("KNAVERY.Price")}</label><input type="number" name="price" min="0" value="5" /></div>`,
      ok: { callback: (_e, b) => ({ name: b.form.elements.name.value.trim(), price: Number(b.form.elements.price.value) || 0 }) },
      rejectClose: false,
    });
    if (!res?.name) return;
    const n = table.results.size + 1;
    await table.createEmbeddedDocuments("TableResult", [{
      type: CONST.TABLE_RESULT_TYPES.TEXT, name: res.name, description: "", range: [n, n], weight: 1,
      flags: { [FLAG_SCOPE]: { price: res.price } },
    }]);
    await table.update({ formula: `1d${table.results.size}` });
    this.render();
  }

  static async #onRemoveRow(_e, target) {
    const table = await fromUuid(this.#selected);
    if (!table || table.pack) return;
    await table.deleteEmbeddedDocuments("TableResult", [target.closest("[data-row-id]").dataset.rowId]);
    this.render();
  }
}

export const openMarketplaceManager = () => {
  if (!game.user.isGM) return;
  const app = foundry.applications.instances.get("knavery-marketplace-manager") ?? new MarketplaceManager();
  app.render(true);
};
