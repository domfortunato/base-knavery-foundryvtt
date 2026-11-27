/**
 * Adds a release to the Foundry package listing (foundryvtt.com/packages/base-knavery) through
 * Foundry's Package Release API (https://foundryvtt.com/article/package-release-api/).
 *
 * Run by the release workflow after the GitHub release has its system.json and system.zip, so the
 * version's manifest URL already answers. Reads:
 *   FOUNDRY_RELEASE_TOKEN  the package's release token (a GitHub secret; never printed)
 *   RELEASE_TAG            the version, e.g. 0.4.3
 *   REPO                   owner/name on GitHub
 *   FOUNDRY_DRY_RUN        "true": Foundry checks the request and saves nothing
 *
 *   node tools/foundry-release.mjs --print   prints the request body and sends nothing
 *
 * No token: says so and succeeds, so a fork or a missing secret never fails a release. A version the
 * listing already has (a rebuild of an old tag) is a notice, not a failure.
 */
import { readFileSync } from "node:fs";

const API = "https://foundryvtt.com/_api/packages/release_version/";
const manifest = JSON.parse(readFileSync(new URL("../system.json", import.meta.url), "utf8"));
const tag = process.env.RELEASE_TAG || manifest.version;
const repo = process.env.REPO || "domfortunato/base-knavery-foundryvtt";
const dryRun = process.env.FOUNDRY_DRY_RUN === "true";

const { minimum, verified, maximum } = manifest.compatibility ?? {};
const body = {
  id: manifest.id,
  ...(dryRun ? { "dry-run": true } : {}),
  release: {
    version: tag,
    // Foundry wants a manifest for this version, not the "latest" one the system itself polls.
    manifest: `https://github.com/${repo}/releases/download/${tag}/system.json`,
    notes: `https://github.com/${repo}/releases/tag/${tag}`,
    compatibility: { minimum, verified, ...(maximum ? { maximum } : {}) },
  },
};

if (process.argv.includes("--print")) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const token = process.env.FOUNDRY_RELEASE_TOKEN;
if (!token) {
  console.log("::notice::Foundry listing not updated: no FOUNDRY_RELEASE_TOKEN secret.");
  process.exit(0);
}

const send = () => fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: token },
  body: JSON.stringify(body),
});

let res = await send();
if (res.status === 429) {
  const wait = Math.min(Number(res.headers.get("retry-after")) || 60, 120);
  console.log(`Foundry asks to wait ${wait}s (rate limit); retrying once.`);
  await new Promise((r) => setTimeout(r, wait * 1000));
  res = await send();
}

const text = await res.text();
let data = {};
try { data = JSON.parse(text); } catch { /* not JSON: reported below */ }

if (res.ok && data.status === "success") {
  console.log(dryRun
    ? `Foundry listing: dry run of ${tag} accepted, nothing saved. ${data.message ?? ""}`
    : `Foundry listing: ${tag} added (${data.page ?? "foundryvtt.com"}).`);
  process.exit(0);
}

const all = data.errors?.__all__ ?? [];
if (res.status === 400 && all.some((e) => e.code === "unique_together")) {
  console.log(`::notice::Foundry listing already has ${tag}; nothing to add.`);
  process.exit(0);
}

console.log(`::error::Foundry listing not updated (HTTP ${res.status}).`);
console.log(data.errors ? JSON.stringify(data.errors, null, 2) : text.slice(0, 500));
process.exit(1);
