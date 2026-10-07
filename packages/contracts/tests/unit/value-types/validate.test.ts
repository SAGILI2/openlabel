import { describe, expect, it } from "vitest";
import { valueTypeSchema, type PresetValueType } from "../../../src/value-types/presets.js";
import { validateValue } from "../../../src/value-types/validate.js";

const vt = (preset: PresetValueType, options: Record<string, unknown> = {}) =>
  valueTypeSchema.parse({ preset, options });

describe("validateValue", () => {
  it.each<[PresetValueType, string]>([
    ["numeric", "004521"],
    ["alpha", "Total"],
    ["alpha", "कुल"],
    ["alphanumeric", "MPZ06075"],
    ["integer", "-1,250"],
    ["decimal", "1,250.75"],
    ["currency", "$1,250.75"],
    ["currency", "RS.0"],
    ["currency", "₹12,50,000.00"],
    ["percentage", "18%"],
    ["date", "05/09/2026"],
    ["date", "05-SEP-2026"],
    ["date", "2026-09-05"],
    ["time", "18:23:12"],
    ["time", "4:05 PM"],
    ["email", "ops@example.com"],
    ["phone", "+91 96069 70216"],
    ["url", "https://example.com/a"],
    ["code", "INV-2024-00187"],
  ])("%s accepts %s", (preset, value) => {
    expect(validateValue(value, vt(preset)).valid).toBe(true);
  });

  it.each<[PresetValueType, string]>([
    ["numeric", "12a"],
    ["integer", "1.5"],
    ["date", "32/01/2026"],
    ["time", "25:00"],
    ["email", "not-an-email"],
    ["phone", "12"],
  ])("%s rejects %s", (preset, value) => {
    expect(validateValue(value, vt(preset)).valid).toBe(false);
  });

  it("suggests digit fixes for OCR confusions in amounts", () => {
    expect(validateValue("RS.O", vt("currency"))).toMatchObject({ valid: false, suggestion: "RS.0" });
    expect(validateValue("0O4521", vt("numeric"))).toMatchObject({ suggestion: "004521" });
    expect(validateValue("1O:3O", vt("time"))).toMatchObject({ suggestion: "10:30" });
  });

  it("suggests letter fixes for alphabetic values", () => {
    expect(validateValue("T0TAL", vt("alpha"))).toMatchObject({ suggestion: "TOTAL" });
  });

  it("gives no suggestion when no simple fix exists", () => {
    expect(validateValue("hello", vt("numeric")).suggestion).toBeUndefined();
  });

  it("normalises numbers for evaluation", () => {
    expect(validateValue("$1,250.75", vt("currency")).normalised).toBe("1250.75");
    expect(validateValue("RS.0", vt("currency")).normalised).toBe("0");
    expect(validateValue("18%", vt("percentage")).normalised).toBe("18");
    expect(
      validateValue("€1.250,75", vt("currency", { decimalSeparator: ",", thousandsSeparator: "." }))
        .normalised,
    ).toBe("1250.75");
  });

  it("applies length limits, upper-case and custom patterns", () => {
    expect(validateValue("abc", vt("alpha", { minLength: 4 })).valid).toBe(false);
    expect(validateValue("inv-1", vt("code", { upperCaseOnly: true })).valid).toBe(false);
    expect(
      validateValue("29AAFCE4243B1ZY", vt("code", { pattern: "\\d{2}[A-Z]{5}\\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]" }))
        .valid,
    ).toBe(true);
    expect(
      validateValue("29AAFCE4243B1XY", vt("code", { pattern: "\\d{2}[A-Z]{5}\\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]" }))
        .valid,
    ).toBe(false);
  });

  it("allows extra characters when configured", () => {
    expect(validateValue("12-34", vt("numeric")).valid).toBe(false);
    expect(validateValue("12-34", vt("numeric", { extraChars: "-" })).valid).toBe(true);
  });
});
