/**
 * Common OCR confusions between letters and digits. Used only to *suggest* a correction
 * when a value fails its type; never applied automatically.
 */
export const LETTER_TO_DIGIT: Readonly<Record<string, string>> = {
  O: "0",
  o: "0",
  D: "0",
  Q: "0",
  I: "1",
  l: "1",
  i: "1",
  "|": "1",
  Z: "2",
  z: "2",
  S: "5",
  s: "5",
  B: "8",
  G: "6",
  b: "6",
  g: "9",
  q: "9",
};

export const DIGIT_TO_LETTER: Readonly<Record<string, string>> = {
  "0": "O",
  "1": "I",
  "2": "Z",
  "5": "S",
  "8": "B",
  "6": "G",
};

/** Replaces confusable letters with digits inside runs that are otherwise numeric. */
export function digitsFromConfusables(text: string): string {
  return text.replace(/[0-9A-Za-z|]+/g, (run) => {
    const digits = Array.from(run).filter((c) => /[0-9]/.test(c)).length;
    // only touch runs that are mostly digits, so words like "Total" are left alone
    if (digits === 0 || digits < run.length / 2) return run;
    return Array.from(run)
      .map((c) => LETTER_TO_DIGIT[c] ?? c)
      .join("");
  });
}

/** Replaces confusable digits with letters inside runs that are otherwise alphabetic. */
export function lettersFromConfusables(text: string): string {
  return text.replace(/[0-9A-Za-z]+/g, (run) => {
    const letters = Array.from(run).filter((c) => /[A-Za-z]/.test(c)).length;
    if (letters === 0 || letters < run.length / 2) return run;
    return Array.from(run)
      .map((c) => DIGIT_TO_LETTER[c] ?? c)
      .join("");
  });
}
