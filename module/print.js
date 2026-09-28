/**
 * The printable sheet: one self-contained page written into a new window.
 * The window is opened SYNCHRONOUSLY in the click handler — a popup blocker
 * allows window.open only inside the user gesture, before any await.
 */
import { ABILITIES, LEVELS, SAVE_CATEGORIES, SYS_PATH, TABLES } from "./config.js";
import { slotsForItem } from "./documents/actor.js";

const L = (k) => game.i18n.localize(k);
const TextEditor = foundry.applications.ux.TextEditor.implementation;
const abs = (src) => (src ? new URL(foundry.utils.getRoute(src), window.location.href).href : "");

export const printActorSheet = (actor) => {
  const win = window.open("", "_blank");
  if (!win) return ui.notifications.warn("KNAVERY.Notify.PrintBlocked", { localize: true });
  fill(win, actor).catch((err) => {
    console.error("Base Knavery | print failed", err);
    win.close();
  });
  return win;
};

const fill = async (win, actor) => {
  const s = actor.system;
  const isChar = actor.type === "character";
  const layout = actor.slotLayout();
  const items = actor.inventory.map((i) => {
    const pos = layout.get(i.id);
    const bits = [];
    if (i.type === "weapon") bits.push(i.system.damage, L(i.system.attackType === "ranged" ? "KNAVERY.Ranged" : "KNAVERY.Melee"));
    if (i.type === "armor") bits.push(game.i18n.format("KNAVERY.NAp", { n: i.system.points }));
    if (i.system.quantity > 1) bits.push(`×${i.system.quantity}`);
    return {
      slot: pos?.first ? (pos.first === pos.last ? `${pos.first}` : `${pos.first}–${pos.last}`) : "—",
      name: i.name, equipped: i.system.equipped, tags: bits.join(", "), slots: slotsForItem(i),
    };
  });
  const careers = [];
  for (const c of actor.items.filter((i) => i.type === "career")) {
    const ckey = c.system.key || c.id;
    careers.push({
      name: c.name,
      description: await TextEditor.enrichHTML(c.system.description ?? "", { relativeTo: c }),
      features: (c.system.features ?? []).filter((f) => f.key).map((f) => ({
        label: f.label,
        value: String(foundry.utils.getProperty(s.features ?? {}, `${ckey}.${f.key}`) ?? f.initial ?? ""),
      })),
    });
  }
  const traits = Object.keys(TABLES.traits).map((k) => ({ label: L(`KNAVERY.Trait.${k}`), value: s.traits?.[k] }))
    .filter((t) => t.value);
  const context = {
    lang: game.i18n.lang,
    name: actor.name,
    pronouns: s.pronouns,
    portrait: abs(actor.img),
    logo: abs(`${SYS_PATH}/logo/made-for-knave-black.png`),
    isChar,
    level: s.level,
    levelTitle: isChar ? L(`KNAVERY.LevelTitle.${s.level}`) : "",
    xp: s.xp,
    nextXp: LEVELS.find((r) => r.level === s.level + 1)?.xp ?? null,
    abilities: ABILITIES.map((k) => ({ label: L(`KNAVERY.AbilityShort.${k}`), value: s.abilities[k].value, defense: s.abilities[k].defense })),
    saves: Object.entries(SAVE_CATEGORIES).map(([k, a]) => ({ label: L(`KNAVERY.Save.${k}`), ability: L(`KNAVERY.AbilityShort.${a}`) })),
    hp: s.hp,
    ac: s.ac,
    wounds: s.wounds,
    coins: s.coins,
    slotsUsed: actor.calcSlotsUsed(),
    slotsMax: s.slotsMax,
    items,
    careers,
    traits,
    biography: await TextEditor.enrichHTML(s.biography ?? s.description ?? "", { relativeTo: actor }),
    notes: await TextEditor.enrichHTML(s.notes ?? "", { relativeTo: actor }),
    disclaimer: L("KNAVERY.Disclaimer"),
  };
  const html = await foundry.applications.handlebars.renderTemplate(`${SYS_PATH}/templates/print/character-print.html`, context);
  win.document.open();
  win.document.write(html);
  win.document.close();
  const go = () => { win.focus(); win.print(); };
  if (win.document.readyState === "complete") setTimeout(go, 300);
  else win.addEventListener("load", () => setTimeout(go, 300));
};
