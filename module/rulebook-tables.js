/**
 * Read roll tables out of the GM's own rulebook PDF.
 *
 * Pure functions over pdf.js text content (items with a string and a position),
 * with no Foundry dependency, so the same code runs in the GM's browser
 * (module/rulebook-import.js) and in Node for development
 * (tools/dev/rulebook-tables-check.mjs, against a local PDF; never committed).
 * Nothing here contains the book's text: only how its tables are laid out.
 *
 * A table is a numbered list ("17 Something", "4 alchemist: acid, …") in a
 * region of one or more pages: the whole page, or its left or right half. The
 * entries may stand in several sub-columns (1–50 beside 51–100) and may wrap
 * over several lines; a line without a number continues the entry above it in
 * reading order, which runs sub-column by sub-column, top to bottom, page by
 * page. Text above a table's first entry (its heading) and bare page numbers
 * are dropped. `below` names a heading the table starts under, for a region
 * that holds prose first.
 */

/** Items closer than this (PDF points) on one line join into one segment. */
const JOIN_GAP = 7;
/** A bare entry number joins the text beside it across up to this gap. */
const NUMBER_GAP = 22;
/** Lines whose baselines differ by less than this are one line. */
const LINE_TOLERANCE = 2.5;
/** A line belongs to an entry whose number stands at most this far below it (a centred number). */
const OWN_TOLERANCE = 7;
/** Entry starts further apart than this horizontally are different sub-columns. */
const COLUMN_GAP = 18;

/** "17 Something"; the book prints entry 100 of a d100 table as "00". */
const ENTRY = /^(\d{1,3}|00)\s+(\S.*)$/;
const entryNumber = (m) => (m[1] === "00" ? 100 : Number(m[1]));

/**
 * One page's text items, in PDF points with y growing downward from the top.
 * @param {{items: object[]}} textContent  pdf.js page.getTextContent()
 * @param {number} pageHeight
 */
export const pageItems = (textContent, pageHeight) => textContent.items
  .filter((it) => typeof it.str === "string" && it.str.trim())
  .map((it) => ({ str: it.str, x: it.transform[4], y: pageHeight - it.transform[5], w: it.width }));

/** Lines of segments in a region, top to bottom. */
const segments = (items, { pageWidth, region, belowY = -Infinity }) => {
  const mid = pageWidth / 2;
  const inRegion = items.filter((it) => {
    if (it.y <= belowY + LINE_TOLERANCE) return false;
    if (region === "left") return it.x < mid - 2;
    if (region === "right") return it.x >= mid - 2;
    return true;
  });
  // Where the entry numbers stand: x positions at which three or more bare
  // numbers line up. A bare number there always starts a new segment, however
  // close the end of a long entry in the sub-column before it.
  const isBare = (s) => /^\s*(\d{1,3}|00)\s*$/.test(s);
  const counts = new Map();
  for (const it of inRegion) if (isBare(it.str)) counts.set(Math.round(it.x), (counts.get(Math.round(it.x)) ?? 0) + 1);
  const numberXs = [...counts].filter(([, n]) => n >= 3).map(([x]) => x);
  const atNumberColumn = (it) => isBare(it.str) && numberXs.some((x) => Math.abs(x - it.x) <= 1.5);
  const lines = [];
  for (const it of [...inRegion].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < LINE_TOLERANCE);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  const out = [];
  for (const line of lines) {
    let seg = null;
    for (const it of line.items.sort((a, b) => a.x - b.x)) {
      // A bare number joins the text beside it even across the wider gap the
      // book's right-aligned numbering leaves ("1      Something").
      const bareNumber = seg && /^\s*\d{1,3}\s*$/.test(seg.text);
      // A bare number never joins what is before it: it starts an entry,
      // often in the next sub-column a few points after a long entry ends.
      const startsEntry = seg && atNumberColumn(it);
      if (seg && !startsEntry && it.x - (seg.x + seg.w) < (bareNumber ? NUMBER_GAP : JOIN_GAP)) {
        const gap = it.x - (seg.x + seg.w);
        const space = (bareNumber || gap > 0.8) && !seg.text.endsWith(" ") && !it.str.startsWith(" ");
        seg.text += (space ? " " : "") + it.str;
        seg.w = it.x + it.w - seg.x;
      } else {
        seg = { x: it.x, y: line.y, w: it.w, text: it.str };
        out.push(seg);
      }
    }
  }
  for (const s of out) s.text = s.text.replace(/\s+/g, " ").trim();
  return out.filter((s) => s.text);
};

/** A heading's baseline in a region: the first segment that starts with it, case-insensitive. */
const headingY = (items, { pageWidth, region, below }) => {
  const want = below.toLowerCase();
  const hit = segments(items, { pageWidth, region }).find((s) => s.text.toLowerCase().startsWith(want));
  return hit ? hit.y : null;
};

/**
 * Parse one region of one page into entries in reading order.
 *
 * An entry starts at a number: "17 Something" on one line, or a bare number
 * standing in a column of numbers (the book centres a number between the lines
 * of a two-line entry). Every other line joins the entry in its sub-column
 * whose number stands at most OWN_TOLERANCE below it and nearest above
 * otherwise, so both a centred number and wrapped lines find their entry. A
 * line before any entry in its sub-column continues the last entry of the
 * sub-column before (an entry wrapped over a column break).
 * @returns {{n:number, text:string}[]}
 */
export const parseRegion = (items, { pageWidth, region = "full", below = null, first = 1, last = 100 }) => {
  let belowY = -Infinity;
  if (below) {
    const y = headingY(items, { pageWidth, region, below });
    if (y === null) return [];
    belowY = y;
  }
  const segs = segments(items, { pageWidth, region, belowY });
  const inRange = (n) => n >= first && n <= last;
  const bare = (s) => /^(\d{1,3}|00)$/.test(s.text);
  const numberOf = (s) => (s.text.startsWith("00") ? 100 : parseInt(s.text, 10));

  // Entry starts: "N text", or a bare N at an x where other numbers stand.
  const withText = segs.filter((s) => {
    const m = s.text.match(ENTRY);
    return m && inRange(entryNumber(m)) && !/^\d{1,3}$/.test(m[2].trim());
  });
  const numberXs = withText.map((s) => s.x);
  const bareStarts = segs.filter((s) => bare(s) && inRange(numberOf(s))
    && numberXs.some((x) => Math.abs(x - s.x) <= 6));
  const starts = [...withText, ...bareStarts];
  if (!starts.length) return [];

  // Sub-columns from where entries start.
  const xs = [...new Set(starts.map((s) => Math.round(s.x)))].sort((a, b) => a - b);
  const cols = [];
  for (const x of xs) if (!cols.length || x - cols.at(-1) > COLUMN_GAP) cols.push(x);
  const colOf = (s) => {
    let c = 0;
    for (let i = 0; i < cols.length; i++) if (s.x >= cols[i] - COLUMN_GAP / 2) c = i;
    return c;
  };

  const entries = starts.map((s) => {
    const m = s.text.match(ENTRY);
    return { n: m ? entryNumber(m) : numberOf(s), col: colOf(s), y: s.y, parts: m ? [{ y: s.y, text: m[2] }] : [] };
  }).sort((a, b) => a.col - b.col || a.y - b.y);

  const startSet = new Set(starts);
  for (const s of segs) {
    if (startSet.has(s) || bare(s)) continue;
    const col = colOf(s);
    const inCol = entries.filter((e) => e.col === col);
    let owner = null;
    for (const e of inCol) if (e.y <= s.y + OWN_TOLERANCE) owner = e;
    if (!owner) owner = entries.filter((e) => e.col < col).at(-1) ?? null;
    if (owner) owner.parts.push({ y: s.y, text: s.text });
  }

  return entries
    .map((e) => ({ n: e.n, text: e.parts.sort((a, b) => a.y - b.y).reduce((acc, p) => (
      !acc ? p.text : acc.endsWith("-") ? acc + p.text : `${acc} ${p.text}`), "") }))
    .filter((e) => e.text);
};

/**
 * Parse a table spec over its pages. `pages` maps a PDF page index to its
 * {items, width}. Continuation text at the top of a later page joins the last
 * entry of the page before.
 * @returns {{rows: {range:[number,number], text:string}[], missing:number[], duplicates:number[]}}
 */
export const parseTable = (spec, pages) => {
  const first = spec.first ?? 1;
  const last = spec.last ?? 100;
  const all = [];
  for (const index of spec.pdfPages) {
    const page = pages[index];
    if (!page) continue;
    const entries = parseRegion(page.items, {
      pageWidth: page.width, region: spec.region ?? "full", below: index === spec.pdfPages[0] ? spec.below : null, first, last,
    });
    all.push(...entries);
  }
  const byN = new Map();
  const duplicates = [];
  for (const e of all) {
    if (byN.has(e.n)) duplicates.push(e.n);
    else byN.set(e.n, e.text);
  }
  const missing = [];
  for (let n = first; n <= last; n++) if (!byN.has(n)) missing.push(n);
  const rows = [...byN.entries()].sort((a, b) => a[0] - b[0])
    .map(([n, text]) => ({ range: [n, n], text: tidy(text) }));
  return { rows, missing, duplicates };
};

/** Typographic clean-up: spaces, and the PDF's ligature and dash forms. */
const tidy = (text) => text
  .replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
  .replace(/\s+([,.;:)])/g, "$1")
  .replace(/\s+/g, " ")
  .trim();

/** Split "name: rest" (careers, spells): the name capitalised, the rest as is. */
export const splitNamed = (text) => {
  const i = text.indexOf(":");
  if (i < 1) return { name: capitalise(text), rest: "" };
  return { name: capitalise(text.slice(0, i).trim()), rest: text.slice(i + 1).trim() };
};

export const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
