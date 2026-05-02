import { describe, expect, test } from "vitest";

import { buildAnnotations, type AnnotationContext } from "./annotations";
import type { MatchFeedItem } from "./types";

const baseItem: MatchFeedItem = {
  apartmentId: 1,
  sentAt: new Date("2026-05-02T12:00:00Z"),
  seenAt: null,
  lat: 32.0853,
  lon: 34.7818,
  neighborhood: "נווה ים",
  city: "תל אביב",
  formattedAddress: null,
  rooms: 3,
  sqm: 70,
  floor: 2,
  priceNis: 7000,
  primaryListingId: 100,
  condition: null,
  arnonaNis: null,
  vaadBayitNis: null,
  entryDate: null,
  balconySqm: null,
  totalFloors: null,
  furnitureStatus: null,
  sourceUrl: null,
  pricePerSqm: 100,
  matchedAttributes: [],
  unverifiedAttributes: [],
  status: "new",
  note: null,
};

const baseCtx: AnnotationContext = {
  median: { byNeighborhoodAndRooms: () => null },
  center: null,
  userAttrs: [],
  now: new Date("2026-05-02T12:30:00Z"), // 30 min after sentAt
};

describe("buildAnnotations: price_vs_median", () => {
  test("emits below-median pill when price is meaningfully under the median", () => {
    const result = buildAnnotations(baseItem, {
      ...baseCtx,
      median: { byNeighborhoodAndRooms: () => 7600 },
    });
    const pill = result.find((a) => a.kind === "price_vs_median");
    expect(pill).toEqual({ kind: "price_vs_median", deltaNis: -600, deltaPct: -600 / 7600 });
  });

  test("emits above-median pill when price is meaningfully over the median", () => {
    const result = buildAnnotations(
      { ...baseItem, priceNis: 8400 },
      { ...baseCtx, median: { byNeighborhoodAndRooms: () => 7600 } },
    );
    const pill = result.find((a) => a.kind === "price_vs_median");
    expect(pill).toBeDefined();
    if (pill?.kind !== "price_vs_median") throw new Error("unreachable");
    expect(pill.deltaNis).toBe(800);
    expect(pill.deltaPct).toBeCloseTo(800 / 7600, 5);
  });

  test("skips the pill when delta is within ±5%", () => {
    const result = buildAnnotations(
      { ...baseItem, priceNis: 7700 }, // ~1.3% over 7600
      { ...baseCtx, median: { byNeighborhoodAndRooms: () => 7600 } },
    );
    expect(result.find((a) => a.kind === "price_vs_median")).toBeUndefined();
  });

  test("skips when median is unknown", () => {
    const result = buildAnnotations(baseItem, baseCtx);
    expect(result.find((a) => a.kind === "price_vs_median")).toBeUndefined();
  });

  test("skips when item has no price", () => {
    const result = buildAnnotations(
      { ...baseItem, priceNis: null },
      { ...baseCtx, median: { byNeighborhoodAndRooms: () => 7600 } },
    );
    expect(result.find((a) => a.kind === "price_vs_median")).toBeUndefined();
  });
});

describe("buildAnnotations: distance_to_center", () => {
  test("emits a pill when the user has a center configured", () => {
    const result = buildAnnotations(baseItem, {
      ...baseCtx,
      center: { lat: 32.087, lon: 34.789 }, // ~700m from baseItem (Tel Aviv)
    });
    const pill = result.find((a) => a.kind === "distance_to_center");
    expect(pill).toBeDefined();
    if (pill?.kind !== "distance_to_center") throw new Error("unreachable");
    expect(pill.meters).toBeGreaterThan(400);
    expect(pill.meters).toBeLessThan(900);
    expect(pill.walkMinutes).toBeGreaterThanOrEqual(5);
    expect(pill.walkMinutes).toBeLessThanOrEqual(15);
  });

  test("skips when no center is configured", () => {
    const result = buildAnnotations(baseItem, baseCtx);
    expect(result.find((a) => a.kind === "distance_to_center")).toBeUndefined();
  });

  test("skips when the apartment has no coordinates", () => {
    const result = buildAnnotations(
      { ...baseItem, lat: null, lon: null },
      { ...baseCtx, center: { lat: 32.087, lon: 34.789 } },
    );
    expect(result.find((a) => a.kind === "distance_to_center")).toBeUndefined();
  });
});

describe("buildAnnotations: must_have_coverage", () => {
  test("emits matched/total against the user's must-have set", () => {
    const result = buildAnnotations(
      {
        ...baseItem,
        matchedAttributes: ["elevator", "parking"],
        unverifiedAttributes: ["safe_room"],
      },
      {
        ...baseCtx,
        userAttrs: [
          { key: "elevator", requirement: "required_true" },
          { key: "parking", requirement: "required_true" },
          { key: "safe_room", requirement: "required_true" },
          { key: "balcony", requirement: "preferred_true" }, // ignored
        ],
      },
    );
    const pill = result.find((a) => a.kind === "must_have_coverage");
    expect(pill).toBeDefined();
    if (pill?.kind !== "must_have_coverage") throw new Error("unreachable");
    expect(pill.matched).toBe(2);
    expect(pill.total).toBe(3);
    expect(pill.missing).toEqual(["safe_room"]);
  });

  test("skips when the user has no must-haves", () => {
    const result = buildAnnotations(baseItem, {
      ...baseCtx,
      userAttrs: [{ key: "balcony", requirement: "preferred_true" }],
    });
    expect(result.find((a) => a.kind === "must_have_coverage")).toBeUndefined();
  });

  test("required_false counts toward the must-have set", () => {
    const result = buildAnnotations(
      { ...baseItem, matchedAttributes: ["shared_apartment"] },
      {
        ...baseCtx,
        userAttrs: [{ key: "shared_apartment", requirement: "required_false" }],
      },
    );
    const pill = result.find((a) => a.kind === "must_have_coverage");
    expect(pill).toEqual({
      kind: "must_have_coverage",
      matched: 1,
      total: 1,
      missing: [],
    });
  });
});

describe("buildAnnotations: fresh", () => {
  test("emits a fresh pill within 24h of sentAt", () => {
    const result = buildAnnotations(baseItem, baseCtx); // 30min old
    const pill = result.find((a) => a.kind === "fresh");
    expect(pill).toEqual({ kind: "fresh", ageMinutes: 30 });
  });

  test("skips after 24h", () => {
    const result = buildAnnotations(baseItem, {
      ...baseCtx,
      now: new Date("2026-05-04T12:30:00Z"), // 2 days later
    });
    expect(result.find((a) => a.kind === "fresh")).toBeUndefined();
  });

  test("clamps negative ages (clock skew) to zero", () => {
    const result = buildAnnotations(baseItem, {
      ...baseCtx,
      now: new Date("2026-05-02T11:50:00Z"), // 10 min before sentAt
    });
    const pill = result.find((a) => a.kind === "fresh");
    expect(pill).toEqual({ kind: "fresh", ageMinutes: 0 });
  });
});

describe("buildAnnotations: combined", () => {
  test("returns multiple pills when several signals fire", () => {
    const result = buildAnnotations(baseItem, {
      median: { byNeighborhoodAndRooms: () => 7600 },
      center: { lat: 32.09, lon: 34.79 },
      userAttrs: [{ key: "elevator", requirement: "required_true" }],
      now: new Date("2026-05-02T12:30:00Z"),
    });
    const kinds = result.map((a) => a.kind).sort();
    expect(kinds).toEqual(["distance_to_center", "fresh", "must_have_coverage", "price_vs_median"]);
  });

  test("returns an empty list when no signal fires", () => {
    const result = buildAnnotations(
      { ...baseItem, lat: null, lon: null },
      { ...baseCtx, now: new Date("2026-05-04T12:30:00Z") }, // stale, no median, no center
    );
    expect(result).toEqual([]);
  });
});
