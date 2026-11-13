#!/usr/bin/env node
/**
 * Check the rulebook table catalogue against a local copy of the Knave 2e PDF:
 * for every table in module/rulebook-catalogue.js, how many rows
 * module/rulebook-tables.js reads, and which numbers are missing or doubled.
 * Prints no book text unless --show names a table (for the terminal only;
 * never commit its output).
 *
 *   node tools/dev/rulebook-tables-check.mjs "<path to the PDF>" [--pdfjs <dir with pdf.mjs>] [--offset 6] [--show "Careers"]
 *
 * pdf.js comes from a Foundry install (node_modules/@foundryvtt/pdfjs/build),
 * the same build the system uses in the browser. Exit 1 when a table is short.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RULEBOOK_TABLES } from "../../module/rulebook-catalogue.js";
import { pageItems, parseTable } from "../../module/rulebook-tables.js";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const pdfPath = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!pdfPath) {
  console.error("usage: node tools/dev/rulebook-tables-check.mjs <pdf> [--pdfjs dir] [--offset 6] [--show name]");
  process.exit(2);
}
const pdfjsDir = opt("--pdfjs", process.env.PDFJS_DIR
  ?? path.join(process.env.FOUNDRY_APP ?? path.join(process.env.USERPROFILE ?? "", "foundry", "app"), "node_modules/@foundryvtt/pdfjs/build"));
const offset = Number(opt("--offset", 6));
const show = opt("--show", null);

const pdfjs = await import(pathToFileURL(path.join(pdfjsDir, "pdf.mjs")).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(pdfjsDir, "pdf.worker.mjs")).href;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)) }).promise;

const cache = {};
const page = async (index) => {
  if (!cache[index]) {
    const p = await doc.getPage(index);
    const vp = p.getViewport({ scale: 1 });
    cache[index] = { items: pageItems(await p.getTextContent(), vp.height), width: vp.width };
  }
  return cache[index];
};

let short = 0;
console.log(`${doc.numPages} pages, offset ${offset}`);
for (const spec of RULEBOOK_TABLES) {
  const pdfPages = spec.pages.map((p) => p + offset);
  const pages = {};
  for (const i of pdfPages) if (i <= doc.numPages) pages[i] = await page(i);
  const { rows, missing, duplicates } = parseTable({ ...spec, pdfPages }, pages);
  const want = spec.last - spec.first + 1;
  if (rows.length < want) short++;
  const flag = rows.length === want && !duplicates.length ? "ok  " : "SHORT";
  console.log(`${flag} ${spec.name.padEnd(22)} p${spec.pages.join(",")} ${String(rows.length).padStart(3)}/${want}`
    + (missing.length ? `  missing ${missing.join(",")}` : "") + (duplicates.length ? `  doubled ${duplicates.join(",")}` : ""));
  if (show && spec.name === show) for (const r of rows) console.log(`      ${r.range[0]} ${r.text}`);
}
console.log(short ? `\n${short} table(s) short.` : "\nevery table complete.");
process.exit(short ? 1 : 0);
