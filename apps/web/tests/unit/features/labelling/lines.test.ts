import { describe, expect, it } from "vitest";
import {
  groupIntoLines,
  linesFromWords,
  moveToLine,
  place,
  refile,
  reorder,
  wordsInReadingOrder,
} from "@/features/labelling/lines";
import type { EditableWord } from "@/features/labelling/regions";

const w = (id: string, x: number, y: number, width = 40, height = 20, lineId?: string): EditableWord => ({
  id,
  text: id,
  box: { x, y, width, height },
  conf: 0.99,
  ...(lineId ? { lineId } : {}),
});

// A receipt: "AXIS BANK LTD." / "STR RS100000" / "INC RS0", the second line slightly slanted.
const words = [
  w("AXIS", 100, 10),
  w("BANK", 150, 11),
  w("LTD", 200, 12),
  w("STR", 10, 60),
  w("RS100000", 200, 64, 80),
  w("INC", 10, 90),
  w("RS0", 230, 92),
];

describe("groupIntoLines", () => {
  it("groups by row and orders each line left to right", () => {
    expect(groupIntoLines(words)).toEqual([
      ["AXIS", "BANK", "LTD"],
      ["STR", "RS100000"],
      ["INC", "RS0"],
    ]);
  });

  it("keeps saved line ids and order, and slots unsaved words into their line", () => {
    const saved = [w("A", 10, 10, 40, 20, "L2"), w("B", 10, 60, 40, 20, "L1"), w("C", 80, 61)];
    expect(linesFromWords(saved)).toEqual([["A"], ["B", "C"]]);
  });
});

describe("place (drawing a new box)", () => {
  const lines = groupIntoLines(words);

  it("joins the line it sits on, in reading order", () => {
    const p = place(lines, words, w("NEW", 120, 62));
    expect(p).toMatchObject({ line: 1, newLine: false });
    expect(p.lines[1]).toEqual(["STR", "NEW", "RS100000"]);
  });

  it("joins a line even when drawn a little too high or low", () => {
    expect(place(lines, words, w("NEW", 300, 100, 40, 14)).line).toBe(2);
  });

  it("starts a new line only when it is clearly away from every line", () => {
    const p = place(lines, words, w("NEW", 50, 140));
    expect(p).toMatchObject({ line: 3, newLine: true });
    const between = place(lines, words, w("MID", 50, 42, 40, 8));
    expect(between.newLine).toBe(true);
    expect(between.lines.map((l) => l[0])).toEqual(["AXIS", "MID", "STR", "INC"]);
  });
});

describe("refile (move or resize)", () => {
  const lines = groupIntoLines(words);

  it("stays in its line after a small move", () => {
    const moved = { ...w("RS100000", 170, 67, 80) };
    const p = refile(
      lines,
      words.map((x) => (x.id === moved.id ? moved : x)),
      moved,
    );
    expect(p).toMatchObject({ line: 1, newLine: false });
  });

  it("goes to the line it was dragged onto", () => {
    const moved = { ...w("RS100000", 120, 91, 80) };
    const p = refile(
      lines,
      words.map((x) => (x.id === moved.id ? moved : x)),
      moved,
    );
    expect(p.line).toBe(2);
    expect(p.lines[2]).toEqual(["INC", "RS100000", "RS0"]);
  });
});

describe("manual moves and saving", () => {
  const lines = groupIntoLines(words);

  it("moves a word to the line above or below, or onto its own line past the ends", () => {
    expect(moveToLine(lines, words, "RS0", -1)[1]).toEqual(["STR", "RS100000", "RS0"]);
    expect(moveToLine(lines, words, "AXIS", -1)[0]).toEqual(["AXIS"]);
  });

  it("swaps a word with its neighbour", () => {
    expect(reorder(lines, "BANK", 1)[0]).toEqual(["AXIS", "LTD", "BANK"]);
  });

  it("saves words in reading order with their line id", () => {
    const out = wordsInReadingOrder(lines, words);
    expect(out.map((x) => [x.id, x.lineId])).toEqual([
      ["AXIS", "L1"],
      ["BANK", "L1"],
      ["LTD", "L1"],
      ["STR", "L2"],
      ["RS100000", "L2"],
      ["INC", "L3"],
      ["RS0", "L3"],
    ]);
  });
});
