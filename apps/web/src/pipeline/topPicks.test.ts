import { describe, expect, test } from "vitest";
import { resolvePicks, type CandidateListing, type TopPick } from "./topPicks-core";

function candidate(id: number, overrides: Partial<CandidateListing> = {}): CandidateListing {
  return {
    id,
    source: "yad2",
    url: `https://example.com/${id}`,
    title: `Listing ${id}`,
    description: null,
    priceNis: 7000,
    rooms: 2,
    sqm: 50,
    neighborhood: "Florentin",
    street: null,
    isAgency: false,
    postedAt: null,
    ingestedAt: new Date(),
    score: null,
    decision: null,
    reasoning: null,
    ...overrides,
  };
}

function pick(id: number, rank: number): TopPick {
  return {
    listingId: id,
    rank,
    headline: `headline ${id}`,
    reasoning: `reasoning ${id}`,
    concerns: [],
  };
}

describe("resolvePicks", () => {
  test("resolves picks in rank order and attaches listings", () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const resolved = resolvePicks([pick(2, 2), pick(1, 1)], candidates, 5);
    expect(resolved.map((r) => r.listingId)).toEqual([1, 2]);
    expect(resolved[0]?.listing.id).toBe(1);
  });

  test("drops unknown listing ids", () => {
    const candidates = [candidate(1)];
    const resolved = resolvePicks([pick(999, 1), pick(1, 2)], candidates, 5);
    expect(resolved.map((r) => r.listingId)).toEqual([1]);
  });

  test("drops duplicate listing ids", () => {
    const candidates = [candidate(1), candidate(2)];
    const resolved = resolvePicks([pick(1, 1), pick(1, 2), pick(2, 3)], candidates, 5);
    expect(resolved.map((r) => r.listingId)).toEqual([1, 2]);
  });

  test("caps result at topN", () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const resolved = resolvePicks([pick(1, 1), pick(2, 2), pick(3, 3)], candidates, 2);
    expect(resolved.map((r) => r.listingId)).toEqual([1, 2]);
  });
});
