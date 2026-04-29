import { describe, expect, test } from "vitest";
import { normalizeText } from "./neighborhoodResolver";

describe("normalizeText", () => {
  test("collapses whitespace and lowercases ASCII", () => {
    expect(normalizeText("  Florentin   Quarter ")).toBe("florentin quarter");
  });

  test("preserves Hebrew characters under NFC", () => {
    expect(normalizeText("פלורנטין")).toBe("פלורנטין");
  });

  test("collapses whitespace inside Hebrew strings", () => {
    expect(normalizeText("  כרם  התימנים  ")).toBe("כרם התימנים");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(normalizeText("   ")).toBe("");
  });

  test("normalizes mixed scripts the same way each call", () => {
    const a = normalizeText("Tel-Aviv שכונה");
    const b = normalizeText("Tel-Aviv שכונה");
    expect(a).toBe(b);
  });
});
