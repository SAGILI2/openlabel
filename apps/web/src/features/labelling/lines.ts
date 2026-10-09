import type { Box, EditableWord } from "./regions";

/**
 * Line grouping for the OCR editor. A line is an ordered list of word ids; words keep their own
 * boxes. Grouping follows the page, not the OCR engine's blocks, so "AXIS BANK LTD." is one line.
 */

const cy = (b: Box) => b.y + b.height / 2;

/** Groups words into lines by vertical overlap, each line left to right, lines top to bottom. */
export function groupIntoLines(words: readonly EditableWord[]): string[][] {
  const rows: { cy: number; h: number; ids: string[]; xs: number[] }[] = [];
  for (const w of [...words].sort((a, b) => cy(a.box) - cy(b.box))) {
    const row = rows.find((r) => Math.abs(r.cy - cy(w.box)) < Math.min(r.h, w.box.height) * 0.6);
    if (row) {
      row.cy = (row.cy * row.ids.length + cy(w.box)) / (row.ids.length + 1);
      row.ids.push(w.id);
      row.xs.push(w.box.x);
    } else rows.push({ cy: cy(w.box), h: w.box.height, ids: [w.id], xs: [w.box.x] });
  }
  return rows.map((r) =>
    r.ids
      .map((id, i) => ({ id, x: r.xs[i] ?? 0 }))
      .sort((a, b) => a.x - b.x)
      .map((e) => e.id),
  );
}

/** Rebuilds lines from saved `lineId`s, keeping their order; ungrouped words are grouped by position. */
export function linesFromWords(words: readonly EditableWord[]): string[][] {
  const byLine = new Map<string, EditableWord[]>();
  const loose: EditableWord[] = [];
  for (const w of words) {
    if (w.lineId) {
      const l = byLine.get(w.lineId) ?? [];
      l.push(w);
      byLine.set(w.lineId, l);
    } else loose.push(w);
  }
  // Saved lines keep the order they were saved in (the order of their first word).
  if (loose.length === words.length) return groupIntoLines(words);
  const lines = [...byLine.values()].map((l) => l.map((w) => w.id));
  let out = lines;
  for (const w of loose) out = place(out, words, w).lines;
  return out;
}

/** Vertical band of a line near x (its two nearest words), so slanted lines still match. */
function band(ids: readonly string[], byId: Map<string, EditableWord>, x: number) {
  const ws = ids.map((id) => byId.get(id)).filter((w): w is EditableWord => !!w);
  const near = ws
    .sort((a, b) => Math.abs(a.box.x + a.box.width / 2 - x) - Math.abs(b.box.x + b.box.width / 2 - x))
    .slice(0, 2);
  if (near.length === 0) return null;
  return {
    y: near.reduce((s, w) => s + w.box.y, 0) / near.length,
    y2: near.reduce((s, w) => s + w.box.y + w.box.height, 0) / near.length,
  };
}

export interface Placement {
  lines: string[][];
  /** Index of the line the word ended up in. */
  line: number;
  /** True when it started a new line. */
  newLine: boolean;
}

/**
 * Puts a word into the line it sits on, in reading order. It starts a new line only when it is
 * clearly away from every existing line (no real overlap and more than ~1.2 line-heights off).
 */
export function place(
  lines: readonly string[][],
  words: readonly EditableWord[],
  w: EditableWord,
): Placement {
  const byId = new Map(words.map((x) => [x.id, x]));
  byId.set(w.id, w);
  const base = lines.map((l) => l.filter((id) => id !== w.id)).filter((l) => l.length > 0);
  const x = w.box.x + w.box.width / 2;
  let best: { i: number; overlap: number; dist: number; score: number } | null = null;
  base.forEach((l, i) => {
    const b = band(l, byId, x);
    if (!b) return;
    const bh = Math.max(1, b.y2 - b.y);
    const overlap =
      Math.max(0, Math.min(w.box.y + w.box.height, b.y2) - Math.max(w.box.y, b.y)) /
      Math.max(1, Math.min(w.box.height, bh));
    const dist = Math.abs(cy(w.box) - (b.y + b.y2) / 2) / bh;
    const score = overlap > 0 ? 1 + overlap : 1 / (1 + dist);
    if (!best || score > best.score) best = { i, overlap, dist, score };
  });
  const chosen = best as { i: number; overlap: number; dist: number } | null;
  if (chosen && (chosen.overlap > 0.15 || chosen.dist < 1.2)) {
    const next = base.map((l) => [...l]);
    const row = next[chosen.i] ?? [];
    row.push(w.id);
    row.sort((a, b) => (byId.get(a)?.box.x ?? 0) - (byId.get(b)?.box.x ?? 0));
    return { lines: next, line: chosen.i, newLine: false };
  }
  const at = base.findIndex((l) => {
    const b = band(l, byId, x);
    return b ? (b.y + b.y2) / 2 > cy(w.box) : false;
  });
  const i = at < 0 ? base.length : at;
  const next = [...base.slice(0, i), [w.id], ...base.slice(i)];
  return { lines: next, line: i, newLine: true };
}

/**
 * After a move or resize: the word stays in its line if it still sits on it (more than half its
 * height overlapping the rest of the line), otherwise it is placed again.
 */
export function refile(
  lines: readonly string[][],
  words: readonly EditableWord[],
  w: EditableWord,
): Placement {
  const i = lines.findIndex((l) => l.includes(w.id));
  const line = lines[i];
  if (line && line.length > 1) {
    const byId = new Map(words.map((x) => [x.id, x]));
    const others = line.filter((id) => id !== w.id);
    const b = band(others, byId, w.box.x + w.box.width / 2);
    if (b) {
      const overlap =
        Math.max(0, Math.min(w.box.y + w.box.height, b.y2) - Math.max(w.box.y, b.y)) /
        Math.max(1, Math.min(w.box.height, b.y2 - b.y));
      if (overlap > 0.5) {
        byId.set(w.id, w);
        const next = lines.map((l) => [...l]);
        next[i] = [...line].sort((a, c) => (byId.get(a)?.box.x ?? 0) - (byId.get(c)?.box.x ?? 0));
        return { lines: next, line: i, newLine: false };
      }
    }
  }
  return place(lines, words, w);
}

/** Moves a word to the line above (-1) or below (+1); past the ends it gets a line of its own. */
export function moveToLine(
  lines: readonly string[][],
  words: readonly EditableWord[],
  id: string,
  dir: -1 | 1,
) {
  const i = lines.findIndex((l) => l.includes(id));
  if (i < 0) return lines.map((l) => [...l]);
  const byId = new Map(words.map((w) => [w.id, w]));
  const next = lines.map((l) => l.filter((x) => x !== id));
  const target = i + dir;
  if (target < 0 || target >= lines.length) {
    const solo = [id];
    const out = dir < 0 ? [solo, ...next] : [...next, solo];
    return out.filter((l) => l.length > 0);
  }
  const row = next[target] ?? [];
  row.push(id);
  row.sort((a, b) => (byId.get(a)?.box.x ?? 0) - (byId.get(b)?.box.x ?? 0));
  return next.filter((l) => l.length > 0);
}

/** Swaps a word with its neighbour in the line (reading order fix). */
export function reorder(lines: readonly string[][], id: string, dir: -1 | 1): string[][] {
  return lines.map((l) => {
    const i = l.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.length) return [...l];
    const out = [...l];
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) return out;
    out[i] = b;
    out[j] = a;
    return out;
  });
}

/** Stamps each word with its line's id and returns the words in reading order (for saving). */
export function wordsInReadingOrder(
  lines: readonly string[][],
  words: readonly EditableWord[],
): EditableWord[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const out: EditableWord[] = [];
  lines.forEach((l, i) => {
    for (const id of l) {
      const w = byId.get(id);
      if (w) out.push({ ...w, lineId: `L${String(i + 1)}` });
    }
  });
  return out;
}
