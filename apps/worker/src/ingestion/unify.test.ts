import { describe, expect, test } from "vitest";
import { haversineMeters, toVectorLiteral } from "./unify.js";

describe("haversineMeters", () => {
  test("returns 0 for identical points", () => {
    expect(haversineMeters(32.0853, 34.7818, 32.0853, 34.7818)).toBeCloseTo(0, 5);
  });

  test("two close Tel Aviv points (~25m apart)", () => {
    // Two points roughly 25m apart at TA latitude.
    const d = haversineMeters(32.0853, 34.7818, 32.08552, 34.78185);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(30);
  });

  test("kilometers scale", () => {
    // Tel Aviv to Jaffa Old City - ~5 km
    const d = haversineMeters(32.0853, 34.7818, 32.054, 34.7517);
    expect(d).toBeGreaterThan(4_000);
    expect(d).toBeLessThan(6_000);
  });
});

describe("toVectorLiteral", () => {
  test("formats array as pgvector text literal", () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  test("handles empty array", () => {
    expect(toVectorLiteral([])).toBe("[]");
  });

  test("preserves negative + scientific notation", () => {
    expect(toVectorLiteral([-1.5, 1e-3])).toBe("[-1.5,0.001]");
  });
});
