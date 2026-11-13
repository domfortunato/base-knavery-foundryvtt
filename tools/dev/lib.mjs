/**
 * Helpers for driving a local Foundry instance from Playwright.
 * Setup, and which probes run before tagging vs after publishing:
 * `docs/release-testing.md`.
 */

import path from "node:path";

export const FOUNDRY_URL = process.env.FOUNDRY_URL ?? "http://localhost:30000";

/** Foundry's minimum supported resolution; below this it logs a console error. */
export const VIEWPORT = { width: 1600, height: 1000 };

/**
 * The probe fleet (foundry-ops scripts/fleet-gpu/probe.sh) runs each probe in a
 * container on VM 200 with MB_TIME_SCALE=2 and MB_SHOTS set: every watchdog
 * stretches by the scale, and screenshots go where the fleet collects a failing
 * probe's. From a workstation both are unset: scale 1, tools/dev/out.
 */
export const TIME_SCALE = Number(process.env.MB_TIME_SCALE) || 1;
export const SHOTS = process.env.MB_SHOTS ?? path.resolve("tools/dev/out");

/**
 * Run `fn` and put every world setting back the way it was, even if `fn` throws.
 *
 *   await withSettings(page, async () => { ...probe body... });
 *
 * Why this exists, and why the restore has to live HERE rather than inside the
 * probe's `page.evaluate`: on 2026-07-29 `age-override-probe` set `min-age` to 99
 * to test the age floor, then threw on the next line (an AppV2 casualty —
 * `sheet._onRollAge` had stopped existing). Its restore sat *after* the throw,
 * inside the same evaluate, so it never ran. The setting stayed at 99 in the dev
 * world, and from then on EVERY character generated aged 99 and the age re-roll
 * looked broken — it was flooring to 99 too, so the value never visibly changed.
 * The user hit it as a system bug hours later.
 *
 * An exception inside `page.evaluate` propagates into Node, so a Node-level
 * `finally` still runs when an in-page one would have been skipped. Anything a
 * probe changes about the world it shares with a human belongs in that finally.
 *
 * Restores by diffing against the snapshot, so it touches only what actually
 * moved, and reports what it put back — a silent repair would hide a probe that
 * leaks on every run.
 */
export async function withSettings(page, fn) {
  const NS = "base-knavery";
  const snapshot = await page.evaluate((ns) => {
    const out = {};
    for (const [key, cfg] of game.settings.settings) {
      if (!key.startsWith(`${ns}.`) || cfg.scope === "client") continue;
      try { out[key.slice(ns.length + 1)] = game.settings.get(ns, key.slice(ns.length + 1)); } catch { /* unreadable */ }
    }
    return out;
  }, NS);

  try {
    return await fn();
  } finally {
    try {
      const restored = await page.evaluate(async ({ ns, snapshot }) => {
        const changed = [];
        for (const [key, was] of Object.entries(snapshot)) {
          let now;
          try { now = game.settings.get(ns, key); } catch { continue; }
          if (JSON.stringify(now) === JSON.stringify(was)) continue;
          await game.settings.set(ns, key, was);
          changed.push(`${key}: ${JSON.stringify(now)} -> ${JSON.stringify(was)}`);
        }
        return changed;
      }, { ns: NS, snapshot });
      if (restored.length) {
        console.log(`  note  restored ${restored.length} leaked setting(s):`);
        for (const c of restored) console.log(`          ${c}`);
      }
    } catch (e) {
      // Never let cleanup mask the real failure.
      console.error(`  note  could not restore settings: ${e.message}`);
    }
  }
}

/**
 * Clear the things that block automated clicks: the one-time usage-data consent
 * prompt, and tour overlays, which cover the screen and swallow pointer events.
 */
export async function dismissChrome(page) {
  // The welcome window opens for a GM after an update and at every login while
  // the world has no rulebook (welcome.js welcomeDue). game.ready is set before
  // the ready hook runs, so when it is due, wait for it, then close it.
  const due = await page.evaluate(async () => {
    try { return (await import("/systems/base-knavery/module/welcome.js")).welcomeDue(); } catch { return false; }
  }).catch(() => false);
  if (due) await page.waitForSelector("#knavery-welcome", { timeout: 10000 * TIME_SCALE }).catch(() => {});
  await page.evaluate(async () => {
    await foundry.applications.instances.get("knavery-welcome")?.close({ animate: false });
  }).catch(() => {});
  const decline = page.getByRole("button", { name: /Decline Sharing/i });
  if (await decline.count()) {
    await decline.first().click().catch(() => {});
    await page.waitForTimeout(800);
  }

  // Exit via the API so the dismissal persists, then sweep any leftover nodes.
  await page.evaluate(() => {
    try {
      for (const t of globalThis.game?.tours?.contents ?? []) {
        if (t.status === "in-progress") t.exit();
      }
    } catch { /* the setup page does not expose game.tours */ }
  }).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.querySelectorAll(".tour-overlay, .tour.active").forEach(e => e.remove());
  }).catch(() => {});

  // Notifications, which are NOT chrome you can ignore. Headless Chromium always
  // raises a PERMANENT hardware-acceleration warning, and it renders in the
  // top-right — directly over a window's header controls. Anything driving the
  // `⋮` menu fails with "notification intercepts pointer events" and looks like a
  // broken sheet rather than a covered button.
  await page.evaluate(() => {
    try { ui.notifications?.clear?.(); } catch { /* pre-ready */ }
    document.querySelectorAll("#notifications > li").forEach(e => e.remove());
  }).catch(() => {});
}

/**
 * Fail the run after `ms` instead of hanging until the harness gives up.
 *
 * Written after a probe deadlocked for SEVEN MINUTES: `DialogV2` is modal and its
 * promise settles only on a button press, so one code path that returned without
 * pressing anything left an awaited `createDialog()` pending forever. A hang is the
 * worst failure mode there is — it costs the whole harness timeout and reports
 * nothing about what broke — and it is the normal shape of failure for any probe
 * that awaits a dialog, a socket round trip, or a poll.
 *
 * Call once, right after launching the browser. `unref()` so a probe that finishes
 * early is not held open by the timer.
 */
export function watchdog(ms = 120000, label = "probe", cleanup = null) {
  ms *= TIME_SCALE;
  const t = setTimeout(async () => {
    console.error(`\n  FAIL  ${label} exceeded ${ms}ms — treating as a hang, not a slow run`);
    // CLOSE THE BROWSER BEFORE EXITING. `process.exit` skips every async
    // teardown a probe would otherwise run, so a watchdog firing used to leave
    // a Chromium alive with a live WARDEN session attached to the dev world —
    // and this repo already records what a parked Warden client does to the
    // probes that come after it (a relay probe counts double; dev:changelog
    // refuses outright). A timeout in one probe must not become a red in the
    // next four. Bounded, because the whole point is that something is stuck:
    // if the close does not come back in two seconds we exit anyway.
    if (typeof cleanup === "function") {
      try {
        await Promise.race([
          Promise.resolve(cleanup()),
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      } catch { /* exiting anyway */ }
    }
    process.exit(1);
  }, ms);
  t.unref();
  return t;
}

/**
 * Run `fn` with one of the system's hooks unregistered, then put it back.
 *
 * This is how a probe negative-controls a hook-based feature WITHOUT editing source
 * and re-running: `Hooks.events` is a public registry of `{hook, id, fn}` entries and
 * `Hooks.off` takes either the id or the function, so the feature can be switched off
 * in the live page, asserted absent, and switched back on — seconds, one session, and
 * the repo is never dirty.
 *
 * The alternative cost real time and left a hazard: stubbing `module/cairn.js` and
 * re-running meant a full browser launch per direction, and when the harness killed
 * one run mid-flight the stub stayed in the working tree. Same reasoning as
 * `withSettings` above — the restore belongs in a Node-level `finally`, where a throw
 * inside the page cannot skip it.
 *
 * Identifies the handler by FUNCTION NAME, so the hook must be registered as a named
 * function expression. That is deliberate: matching on `fn.toString()` would silently
 * stop matching the day the implementation is reworded.
 *
 * @param {import("playwright").Page} page
 * @param {String} hook     e.g. "renderDialogV2"
 * @param {String} fnName   the registered handler's function name
 * @param {Function} fn     Node-side callback run while the hook is off
 */
export async function withHookOff(page, hook, fnName, fn) {
  const found = await page.evaluate(([hook, fnName]) => {
    const entry = (Hooks.events[hook] ?? []).find((e) => e.fn?.name === fnName);
    if (!entry) return false;
    globalThis.__knHookOff = { hook, fn: entry.fn };
    Hooks.off(hook, entry.id);
    return true;
  }, [hook, fnName]);
  if (!found) throw new Error(`withHookOff: no "${fnName}" handler registered for ${hook}`);
  try {
    return await fn();
  } finally {
    await page.evaluate(() => {
      const saved = globalThis.__knHookOff;
      if (!saved) return;
      Hooks.on(saved.hook, saved.fn);
      delete globalThis.__knHookOff;
    });
  }
}

/**
 * Collect real console errors. Two known-irrelevant messages are filtered:
 * the viewport warning (an artifact of the headless window size) and the
 * hardware-acceleration warning (headless Chromium has no GPU).
 */
export function watchErrors(page) {
  const errors = [];
  const ignore = [
    /requires a screen resolution/i,
    /hardware acceleration/i,
    // A race INSIDE CORE's notification UI, not ours. `#postNotification`
    // re-queries the card it just inserted AFTER awaiting a 100ms spacer
    // animation and dereferences the result unguarded
    // (`element.hidden = false`, scripts/foundry.mjs:130673-130674), so a
    // notification whose element is gone by then throws. Two warnings posted
    // close together is enough; nothing a system does can prevent it.
    //
    // Matched on the FRAME as well as the message, deliberately. "Cannot set
    // properties of null (setting 'hidden')" occurs in half a dozen places in
    // this system too — `CairnActor.createDialog`'s render callback has an
    // unguarded `otherEl.hidden` of exactly this shape — and a message-only
    // ignore would swallow ours along with core's.
    /Cannot set properties of null \(setting 'hidden'\)[\s\S]*#postNotification/,
  ];
  const keep = (t) => !ignore.some((re) => re.test(t));
  page.on("console", m => {
    if (m.type() !== "error") return;
    let t = m.text();
    if (!keep(t)) return;
    // A failed resource load says only "Failed to load resource: ... 404"; the
    // URL is in the message's location, and a 404 is nothing without it.
    const url = m.location()?.url;
    if (url && !t.includes(url)) t = `${t} (${url})`;
    errors.push(t);
  });
  // The STACK too, first frame onwards. A pageerror reported as its message
  // alone ("Cannot set properties of null (setting 'hidden')") names neither the
  // file nor the caller, and the same message occurs in half a dozen places
  // across core and this system — which turns a one-line diagnosis into a hunt,
  // and tempts a re-run instead. Trimmed so a long core stack cannot bury the
  // rest of the report.
  page.on("pageerror", (e) => {
    const frames = String(e.stack ?? "").split("\n").slice(1, 5).map((s) => s.trim()).join(" <- ");
    const t = `pageerror: ${e.message}${frames ? `\n    at ${frames}` : ""}`;
    // The ignore list applies HERE TOO. It used to filter console errors only,
    // so a pageerror was unconditionally fatal — which is why the ignore above
    // can be written against the stack at all.
    if (keep(t)) errors.push(t);
  });
  return errors;
}

/** Join the world as the first available user (the Gamemaster on a fresh world). */
/**
 * Join through /join. The user control is a dropdown named `userid` up to
 * Foundry 14.365, a plain name box on 14.367 and 14.368, and a dropdown named
 * `userId` from 14.369 (met on the probe fleet, 2026-11-13; DB Mythic's
 * lib.mjs had it first). The name is matched without regard to case. 14.369
 * also disables the option of a user already in the world, and the probes
 * open a second session of one user on purpose, so the option is re-enabled.
 */
const JOIN_SELECT = 'select[name="userid" i]';
async function joinWith(page, name) {
  await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(`input[name="username"], ${JOIN_SELECT}`, { state: "attached", timeout: 30000 * TIME_SCALE });
  const text = page.locator('input[name="username"]');
  if (await text.count()) {
    await text.fill(name ?? "Gamemaster");
  } else {
    await page.waitForSelector(`${JOIN_SELECT} option[value]:not([value=""])`, { state: "attached", timeout: 30000 * TIME_SCALE });
    const picked = await page.evaluate(({ name, select }) => {
      const s = document.querySelector(select);
      const opt = [...s.options].find((o) => o.value && (!name || o.textContent.trim() === name));
      if (!opt) return null;
      opt.disabled = false;
      s.value = opt.value;
      s.dispatchEvent(new Event("change", { bubbles: true }));
      return opt.value;
    }, { name, select: JOIN_SELECT });
    if (!picked) throw new Error(`join: no user named "${name}"`);
  }
  await page.locator('button[type="submit"][name="join"], form#join-game button[type="submit"]')
    .first().click({ timeout: 15000 * TIME_SCALE });
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90000 * TIME_SCALE });
  await dismissChrome(page);
}

/**
 * A one-page PDF written by hand (no book text: a title line), for the
 * rulebook reader. ASCII only, so string length is byte length and the xref
 * offsets hold.
 */
export const probePdf = () => {
  const content = "BT /F1 36 Tf 72 700 Td (Probe rulebook) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
};

export const PROBE_PDF = "knavery-rulebook/probe-rulebook.pdf";

/**
 * As the GM: upload the probe PDF into the user data folder and point the
 * world's rulebook at it, offset 0 (it has one page). A fleet box is reset
 * from pristine every run, so the file does not accumulate.
 */
export async function useProbeRulebook(page, { forPlayers = false } = {}) {
  await page.evaluate(async ({ text, path, forPlayers }) => {
    const FP = foundry.applications.apps.FilePicker.implementation;
    const [dir, name] = path.split("/");
    const root = await FP.browse("data", "");
    if (!root.dirs.includes(dir)) await FP.createDirectory("data", dir, {});
    await FP.upload("data", dir, new File([text], name, { type: "application/pdf" }), {}, { notify: false });
    await game.settings.set("base-knavery", "rulebook-page-offset", 0);
    await game.settings.set("base-knavery", "rulebook-for-players", forPlayers);
    await game.settings.set("base-knavery", "rulebook-pdf", path);
  }, { text: probePdf(), path: PROBE_PDF, forPlayers });
}

/** Wait until the open reader's pdf.js viewer has loaded its document. */
export async function waitForRulebook(page, timeout = 20000) {
  await page.waitForSelector("#knavery-rulebook iframe.knavery-rulebook-frame", { timeout: timeout * TIME_SCALE });
  await page.waitForFunction(() => {
    try {
      return !!document.querySelector("#knavery-rulebook iframe.knavery-rulebook-frame")
        ?.contentWindow?.PDFViewerApplication?.pdfDocument;
    } catch {
      return false;
    }
  }, null, { timeout: timeout * TIME_SCALE });
}

export async function joinAsGM(page) {
  return joinWith(page, process.env.FOUNDRY_GM ?? "Gamemaster");
}

export async function joinAs(page, name) {
  return joinWith(page, name);
}

export async function confirmImportOptions(page) {
  await page.waitForSelector(".kwi-options", { timeout: 15000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".dialog-v2 button, .application.dialog button, dialog.application button")]
      .find((b) => b.dataset.action === "import");
    btn?.click();
  });
}
