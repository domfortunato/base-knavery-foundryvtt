/**
 * Create Item (plan item 12, 0.3.0): one section for tools/dev/e2e-chargen.mjs, to paste after its
 * last part (the number follows). It uses that file's `section`, `ok`, `gm`, `T`, `SHOTS`, `SYS`,
 * `ids` and `closeDialogs`. Everything it makes is named "Probe …" and deleted here; a world table
 * it lends for the missing-table check is renamed back.
 *
 * Runs on the probe fleet, never from the workstation (CLAUDE.md).
 */

  await section("33. Create Item: the kinds and their pre-filled fields, a Roll held by a missing table, one of each kind into the Items directory, a weapon into a character's inventory, gear onto a world aisle.", async () => {
    const CI = "#knavery-create-item";
    const pick = async (kind) => {
      await gm.locator(`${CI} .kn-ci-kind:has(input[value="${kind}"])`).click();
      await gm.waitForTimeout(T(700));
    };
    await gm.evaluate(async (sys) => { const m = await import(`${sys}/create-item.js`); m.openCreateItem(); }, SYS);
    await gm.waitForSelector(`${CI} .kn-ci-kinds`, { timeout: T(10000) });
    const win = await gm.evaluate((sel) => {
      const el = document.querySelector(sel);
      const f = el.elements;
      return {
        kinds: [...el.querySelectorAll('.kn-ci-kinds input[name="kind"]')].map((i) => i.value),
        checked: el.querySelector('.kn-ci-kinds input[name="kind"]:checked')?.value,
        damage: f.damage?.value, hands: f.hands?.value, slots: f.slots?.value, cost: Number(f.cost?.value),
        band: [...(f.band?.options ?? [])].find((o) => o.selected)?.value,
        where: [...f.where.options].map((o) => o.value),
        groups: [...el.querySelectorAll('select[name="where"] optgroup')].map((g) => g.label),
        nameRoll: !!el.querySelector('button[data-action="rollName"]'), effectRoll: !!el.querySelector('button[data-action="rollEffect"]'),
        knavery: el.classList.contains("knavery") && el.classList.contains("knavery-create-item"),
      };
    }, CI);
    await gm.screenshot({ path: `${SHOTS}/create-item.png` });
    ok(win.kinds.join() === "weapon,armor,gear,potion,relic,spellbook,chaos" && win.checked === "weapon", "the window offers the seven kinds, Weapon first", JSON.stringify(win.kinds));
    ok(win.damage === "d6" && win.hands === "1" && win.slots === "1" && win.cost > 0 && win.band !== "", "a weapon comes pre-filled: d6, one hand, one slot, a price on the world's price list", JSON.stringify(win));
    ok(win.where[0] === "world" && win.where.includes(`actor:${ids.a}`) && win.groups.length >= 2, "Create into offers the Items directory, the world's actors and the aisles", JSON.stringify({ where: win.where.slice(0, 3), groups: win.groups }));
    ok(win.nameRoll && win.effectRoll && win.knavery, "a Roll sits beside the name and beside the effect; the window carries the knavery class", JSON.stringify(win));

    // Armor: the die and hands go, the type and points come (a piece: 1 point on the 2e list; 1e's
    // brigandine line of 2 for a piece of no named type); no table names armor, so no Roll by its name.
    await pick("armor");
    const armor = await gm.evaluate((sel) => {
      const f = document.querySelector(sel).elements;
      return {
        damage: !!f.damage, points: f.points?.value, type: f.armorType?.value, list: game.settings.get("base-knavery", "price-list"),
        nameRoll: !!document.querySelector(`${sel} button[data-action="rollName"]`), effectRoll: !!document.querySelector(`${sel} button[data-action="rollEffect"]`),
      };
    }, CI);
    const piece = armor.list === "knave1e" ? 2 : 1;
    ok(!armor.damage && armor.points === String(piece) && armor.type === "other" && !armor.nameRoll && armor.effectRoll, "Armor: points and a type instead of a die; a Roll for the effect only", JSON.stringify(armor));

    // A missing table holds its Roll and names itself. A relic's name needs Symbols and Domains; a world
    // that has Symbols (the real book built) lends it for the check and gets it back.
    const held = await gm.evaluate(async () => {
      const t = game.tables.getName("Symbols");
      if (t) await t.update({ name: "Probe held Symbols" });
      return t?.id ?? null;
    });
    try {
      await pick("relic");
      const relic = await gm.evaluate((sel) => {
        const b = document.querySelector(`${sel} button[data-action="rollName"]`);
        return { disabled: b?.disabled, tip: b?.dataset.tooltip ?? "", wrapTip: b?.closest(".kn-ci-roll-wrap")?.dataset.tooltip ?? "", badge: document.querySelector(sel).elements.badge?.value };
      }, CI);
      ok(relic.disabled === true && /Symbols/.test(relic.tip) && relic.tip === relic.wrapTip && relic.badge === "relic",
        "a relic's name Roll is held while the world lacks Symbols; its tooltip names the table; the relic badge is set", JSON.stringify(relic));
    } finally {
      if (held) await gm.evaluate(async (id) => game.tables.get(id)?.update({ name: "Symbols" }), held);
    }

    // A potion from the window into the Items directory: the effect's lines become its description, its sheet opens.
    await pick("potion");
    await gm.locator(`${CI} input[name="name"]`).fill("Probe Potion");
    await gm.locator(`${CI} textarea[name="description"]`).fill("Probe effect\nProbe taste");
    await gm.locator(`${CI} select[name="where"]`).selectOption("world");
    await gm.locator(`${CI} button[type="submit"]`).click();
    await gm.waitForSelector(".knavery.sheet.item", { timeout: T(10000) });
    await gm.waitForTimeout(T(800)); // the window closes with core's fade
    const potion = await gm.evaluate(() => {
      const i = game.items.getName("Probe Potion");
      return {
        type: i?.type, kind: i?.system.kind, uses: i?.system.uses, slots: i?.system.slots, desc: i?.system.description,
        open: !!i && [...foundry.applications.instances.values()].some((a) => a.document?.id === i.id),
        windowGone: !document.getElementById("knavery-create-item"),
      };
    });
    ok(potion.type === "item" && potion.kind === "potion" && potion.uses?.max === 1 && potion.uses?.value === 1 && potion.slots === 1,
      "Create makes the potion: an item with the potion badge, one use, one slot", JSON.stringify(potion));
    ok(potion.desc === "<p>Probe effect</p><p>Probe taste</p>" && potion.open && potion.windowGone,
      "the effect's lines are its description; its sheet opens and the window closes", JSON.stringify(potion));

    // The other kinds into the Items directory by the module's own call; a weapon into Alice's inventory; gear onto a world aisle.
    const made = await gm.evaluate(async ([sys, pcId]) => {
      const m = await import(`${sys}/create-item.js`);
      const { marketPrefix } = await import(`${sys}/marketplace.js`);
      const out = {};
      for (const kind of ["weapon", "armor", "gear", "relic", "spellbook", "chaos"]) {
        const item = await m.createItem({ ...m.kindDefaults(kind), name: `Probe ${kind}` }, "world");
        out[kind] = {
          type: item?.type, kind: item?.system.kind, slots: item?.system.slots, chaos: item?.system.chaos, qmax: item?.system.quality?.max,
          damage: item?.system.damage, points: item?.system.points, world: !!game.items.get(item?.id),
        };
      }
      const pc = game.actors.get(pcId);
      const blade = await m.createItem({ ...m.kindDefaults("weapon"), name: "Probe Blade", hands: 2 }, `actor:${pcId}`);
      out.blade = { owned: blade?.parent?.id === pcId, type: blade?.type, hands: blade?.system.hands, inList: pc.items.getName("Probe Blade")?.id === blade?.id };
      const aisle = await RollTable.create({ name: `${marketPrefix()}Probe Aisle`, formula: "1d1", replacement: true });
      const lamp = await m.createItem({ ...m.kindDefaults("gear"), name: "Probe Lamp", cost: 20 }, `aisle:${aisle.uuid}`);
      const row = aisle.results.contents[0];
      out.aisle = {
        rows: aisle.results.size, linked: row?.documentUuid === lamp?.uuid, isDoc: row?.type === CONST.TABLE_RESULT_TYPES.DOCUMENT,
        formula: aisle.formula, range: row?.range, inWorld: !!game.items.get(lamp?.id), cost: lamp?.system.cost,
      };
      for (const app of [...foundry.applications.instances.values()]) if (app.document?.name?.startsWith("Probe ")) await app.close();
      for (const i of game.items.filter((x) => x.name.startsWith("Probe "))) await i.delete();
      await pc.items.getName("Probe Blade")?.delete();
      await aisle.delete();
      return out;
    }, [SYS, ids.a]);
    ok(made.weapon.type === "weapon" && made.weapon.damage === "d6" && made.weapon.slots === 1 && made.weapon.qmax === 3 && made.weapon.world,
      "a weapon: type weapon, d6, one slot, quality 3", JSON.stringify(made.weapon));
    ok(made.armor.type === "armor" && made.armor.points === piece && made.armor.qmax === piece + 2, "armor: type armor, the list's points for a piece, quality points + 2", JSON.stringify(made.armor));
    ok(made.gear.type === "item" && made.gear.kind === "ordinary" && made.gear.slots === 1 && made.relic.type === "item" && made.relic.kind === "relic",
      "gear is an ordinary one-slot item; a relic wears the relic badge", JSON.stringify({ gear: made.gear, relic: made.relic }));
    ok(made.spellbook.type === "spellbook" && made.spellbook.chaos === false && made.chaos.type === "spellbook" && made.chaos.chaos === true,
      "a spellbook, and a chaos spellbook with its chaos flag", JSON.stringify({ spellbook: made.spellbook, chaos: made.chaos }));
    ok(made.blade.owned && made.blade.type === "weapon" && made.blade.hands === 2 && made.blade.inList, "a two-handed weapon created into Alice's inventory", JSON.stringify(made.blade));
    ok(made.aisle.rows === 1 && made.aisle.linked && made.aisle.isDoc && made.aisle.formula === "1d1" && made.aisle.range?.join() === "1,1" && made.aisle.inWorld && made.aisle.cost === 20,
      "gear created onto a world aisle: in the Items directory, linked from the aisle's one row, the die matching", JSON.stringify(made.aisle));
    await closeDialogs();
  });
