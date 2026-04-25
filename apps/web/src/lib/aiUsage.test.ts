import { describe, expect, test } from "vitest";
import { estimateCostUsd } from "./aiUsage";

describe("estimateCostUsd", () => {
  test("prices sonnet-family usage from current Anthropic rates", () => {
    expect(
      estimateCostUsd("claude-sonnet-4-20250514", {
        inputTokens: 100_000,
        outputTokens: 10_000,
      }),
    ).toBeCloseTo(0.45, 5);
  });

  test("applies cached-input pricing when cached tokens are present", () => {
    expect(
      estimateCostUsd("google/gemini-2.5-flash", {
        inputTokens: 100_000,
        cachedInputTokens: 40_000,
        outputTokens: 10_000,
      }),
    ).toBeCloseTo(0.046, 5);
  });

  test("returns zero for unknown models", () => {
    expect(
      estimateCostUsd("unknown/model", {
        inputTokens: 50_000,
        outputTokens: 5_000,
      }),
    ).toBe(0);
  });
});
