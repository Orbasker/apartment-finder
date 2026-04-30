import { describe, expect, test } from "vitest";
import { contentHash } from "./contentHash";

describe("contentHash", () => {
  test("is stable for the same string input", () => {
    expect(contentHash("hello")).toBe(contentHash("hello"));
  });

  test("differs across distinct inputs", () => {
    expect(contentHash("hello")).not.toBe(contentHash("world"));
  });

  test("hashes objects via JSON.stringify (key order matters)", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ a: 1, b: 2 }));
    expect(contentHash({ a: 1, b: 2 })).not.toBe(contentHash({ b: 2, a: 1 }));
  });

  test("returns 64-char sha256 hex digest", () => {
    expect(contentHash("anything")).toMatch(/^[a-f0-9]{64}$/);
  });
});
