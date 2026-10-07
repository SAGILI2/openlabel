import { z } from "zod";

/**
 * Preset value types for text regions and fields (architecture section 10.1).
 *
 * A value type says what a piece of text is allowed to look like. The editor validates
 * against it while labelling, suggests fixes for common OCR confusions, and evaluation
 * uses it to choose a normalisation (e.g. `1,250.00` == `1250.00` for a decimal field).
 */
export const presetValueTypeSchema = z.enum([
  "any",
  "alpha",
  "numeric",
  "alphanumeric",
  "integer",
  "decimal",
  "currency",
  "percentage",
  "date",
  "time",
  "email",
  "phone",
  "url",
  "code",
]);

export type PresetValueType = z.infer<typeof presetValueTypeSchema>;

/** Options a project or label can set on top of a preset. */
export const valueTypeOptionsSchema = z.object({
  /** Decimal separator for decimal/currency/percentage. */
  decimalSeparator: z.enum([".", ","]).default("."),
  /** Thousands separator; `""` means none allowed. */
  thousandsSeparator: z.enum([",", ".", " ", "'", ""]).default(","),
  /** Currency symbols/codes accepted before or after the amount. */
  currencySymbols: z
    .array(z.string().min(1))
    .default(["$", "€", "£", "₹", "¥", "RS", "Rs", "INR", "USD", "EUR"]),
  /** Accepted date layouts using the tokens DD, MM, MMM, YY, YYYY. */
  dateFormats: z
    .array(z.string().min(1))
    .default(["DD/MM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "DD/MM/YY", "DD-MMM-YYYY"]),
  /** Extra characters allowed in addition to the preset's own set, e.g. "-/." for `code`. */
  extraChars: z.string().default(""),
  /** Whether letters must be upper case (alpha/alphanumeric/code). */
  upperCaseOnly: z.boolean().default(false),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  /** Full-match regular expression for the `custom` case or to tighten a preset. */
  pattern: z.string().optional(),
});

export type ValueTypeOptions = z.infer<typeof valueTypeOptionsSchema>;

/** A value type as stored on a label or region: a preset plus options. */
export const valueTypeSchema = z.object({
  preset: presetValueTypeSchema,
  options: valueTypeOptionsSchema.default(valueTypeOptionsSchema.parse({})),
});

export type ValueType = z.infer<typeof valueTypeSchema>;

/** Human-readable description of each preset, shown in the taxonomy editor. */
export const PRESET_DESCRIPTIONS: Readonly<Record<PresetValueType, string>> = {
  any: "Any text, no restrictions",
  alpha: "Letters only (any script), plus allowed extra characters",
  numeric: "Digits only, e.g. 004521",
  alphanumeric: "Letters and digits",
  integer: "Whole number, optional sign and thousands separators, e.g. -1,250",
  decimal: "Number with optional decimals, e.g. 1,250.75",
  currency: "Amount with optional currency symbol or code, e.g. $1,250.75 or RS.0",
  percentage: "Number followed by %, e.g. 18%",
  date: "Date in one of the configured layouts",
  time: "Time as HH:MM or HH:MM:SS (24h) or with AM/PM",
  email: "Email address",
  phone: "Phone number: digits with optional +, spaces, dashes, brackets",
  url: "Web address",
  code: "Identifier: upper-case letters, digits and allowed separators, e.g. INV-2024-00187",
};
