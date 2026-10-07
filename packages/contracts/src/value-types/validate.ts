import { digitsFromConfusables, LETTER_TO_DIGIT, lettersFromConfusables } from "./confusables.js";
import type { PresetValueType, ValueType, ValueTypeOptions } from "./presets.js";

export interface ValueCheck {
  valid: boolean;
  /** Why the value failed, when invalid. */
  reason?: string;
  /** A corrected value that passes, built from common OCR confusions. Suggest only; never auto-apply. */
  suggestion?: string;
  /** Canonical form for numeric types (no grouping separators, "." as decimal). Used by evaluation. */
  normalised?: string;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const escapeClass = (s: string): string => s.replace(/[\\\]^-]/g, "\\$&");

/** Presets whose whole value should be digits once symbols and separators are removed. */
const DIGIT_PRESETS = new Set<PresetValueType>([
  "numeric",
  "integer",
  "decimal",
  "percentage",
  "time",
  "phone",
]);
const NUMBER_PRESETS = new Set<PresetValueType>(["integer", "decimal", "currency", "percentage"]);

/**
 * Signed number. Grouping accepts both Western (1,250,000) and Indian (12,50,000) styles,
 * so the first group has 1–3 digits and later groups 2–3.
 */
function numberSource(o: ValueTypeOptions, decimals: boolean): string {
  const t = o.thousandsSeparator === "" ? "" : escapeRe(o.thousandsSeparator);
  const intPart = t === "" ? "\\d+" : `(?:\\d{1,3}(?:${t}\\d{2,3})+|\\d+)`;
  const frac = decimals ? `(?:${escapeRe(o.decimalSeparator)}\\d+)?` : "";
  return `[+-]?${intPart}${frac}`;
}

function currencySymbolSource(o: ValueTypeOptions): string {
  const syms = [...o.currencySymbols].sort((a, b) => b.length - a.length).map(escapeRe);
  return syms.length === 0 ? "(?!)" : `(?:${syms.join("|")})`;
}

const DATE_TOKENS = ["YYYY", "MMM", "YY", "MM", "DD"] as const;
const DATE_TOKEN_SOURCE: Readonly<Record<(typeof DATE_TOKENS)[number], string>> = {
  YYYY: "\\d{4}",
  YY: "\\d{2}",
  MMM: "[A-Za-z]{3}",
  MM: "(?:0?[1-9]|1[0-2])",
  DD: "(?:0?[1-9]|[12]\\d|3[01])",
};

function dateSource(format: string): string {
  let out = "";
  let i = 0;
  while (i < format.length) {
    const token = DATE_TOKENS.find((t) => format.startsWith(t, i));
    if (token) {
      out += DATE_TOKEN_SOURCE[token];
      i += token.length;
    } else {
      out += escapeRe(format.charAt(i));
      i += 1;
    }
  }
  return out;
}

/** Regular-expression source (without anchors) for a value type. */
export function valuePatternSource({ preset, options: o }: ValueType): string {
  const extra = escapeClass(o.extraChars);
  switch (preset) {
    case "any":
      return "[\\s\\S]*";
    case "alpha":
      return `[\\p{L}\\p{M}${extra}]+`;
    case "numeric":
      return `[0-9${extra}]+`;
    case "alphanumeric":
      return `[\\p{L}\\p{M}\\p{N}${extra}]+`;
    case "integer":
      return numberSource(o, false);
    case "decimal":
      return numberSource(o, true);
    case "currency": {
      const sym = currencySymbolSource(o);
      return `(?:${sym}[.\\s]?)?${numberSource(o, true)}(?:\\s?${sym})?`;
    }
    case "percentage":
      return `${numberSource(o, true)}\\s?%`;
    case "date":
      return o.dateFormats.map((f) => `(?:${dateSource(f)})`).join("|");
    case "time":
      return "(?:[01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?(?:\\s?[AaPp][Mm])?";
    case "email":
      return "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";
    case "phone":
      return "\\+?[\\d\\s()-]{6,20}";
    case "url":
      return "(?:https?:\\/\\/|www\\.)\\S+";
    case "code":
      return `[A-Za-z0-9${escapeClass("-/._")}${extra}]+`;
  }
}

function failureReason(value: string, vt: ValueType): string | null {
  const o = vt.options;
  if (o.minLength !== undefined && value.length < o.minLength)
    return `shorter than ${o.minLength} characters`;
  if (o.maxLength !== undefined && value.length > o.maxLength) return `longer than ${o.maxLength} characters`;
  if (!new RegExp(`^(?:${valuePatternSource(vt)})$`, "u").test(value))
    return `does not match type "${vt.preset}"`;
  if (vt.preset === "phone" && value.replace(/\D/g, "").length < 6)
    return "phone number needs at least 6 digits";
  if (o.upperCaseOnly && value !== value.toUpperCase()) return "must be upper case";
  if (o.pattern !== undefined && !new RegExp(`^(?:${o.pattern})$`, "u").test(value)) {
    return "does not match the custom pattern";
  }
  return null;
}

const allDigits = (s: string): string =>
  Array.from(s)
    .map((c) => LETTER_TO_DIGIT[c] ?? c)
    .join("");

function suggestion(value: string, vt: ValueType): string | undefined {
  let candidate: string;
  if (vt.preset === "currency") {
    // keep the symbol (e.g. "RS.") and convert only the amount: "RS.O" -> "RS.0"
    const m = new RegExp(`^(${currencySymbolSource(vt.options)}[.\\s]?)?([\\s\\S]*)$`, "u").exec(value);
    candidate = (m?.[1] ?? "") + allDigits(m?.[2] ?? value);
  } else if (DIGIT_PRESETS.has(vt.preset)) {
    candidate = allDigits(value);
  } else if (vt.preset === "date" || vt.preset === "code" || vt.preset === "alphanumeric") {
    candidate = digitsFromConfusables(value);
  } else if (vt.preset === "alpha") {
    candidate = lettersFromConfusables(value);
  } else {
    return undefined;
  }
  return candidate !== value && failureReason(candidate, vt) === null ? candidate : undefined;
}

function normalisedNumber(value: string, vt: ValueType): string {
  const o = vt.options;
  let v = value;
  if (vt.preset === "currency") {
    const sym = currencySymbolSource(o);
    v = v.replace(new RegExp(`^${sym}[.\\s]?|\\s?${sym}$`, "gu"), "");
  }
  if (vt.preset === "percentage") v = v.replace(/\s?%$/u, "");
  if (o.thousandsSeparator !== "") v = v.split(o.thousandsSeparator).join("");
  if (o.decimalSeparator !== ".") v = v.replace(o.decimalSeparator, ".");
  return v.replace(/^\+/, "");
}

/** Checks a value against its type; on failure, may suggest a fix for common OCR confusions. */
export function validateValue(value: string, vt: ValueType): ValueCheck {
  const reason = failureReason(value, vt);
  if (reason === null) {
    return NUMBER_PRESETS.has(vt.preset)
      ? { valid: true, normalised: normalisedNumber(value, vt) }
      : { valid: true };
  }
  const fix = suggestion(value, vt);
  return fix === undefined ? { valid: false, reason } : { valid: false, reason, suggestion: fix };
}
