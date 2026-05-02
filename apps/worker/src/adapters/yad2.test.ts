import { describe, expect, test, vi, beforeEach } from "vitest";
import type { CollectorRegionConfig } from "@apartment-finder/queue";

const { mockFetchYad2Listings } = vi.hoisted(() => ({
  mockFetchYad2Listings: vi.fn(),
}));
vi.mock("../scrapers/yad2.js", () => ({
  fetchYad2Listings: mockFetchYad2Listings,
}));

vi.mock("@apartment-finder/shared/contentHash", () => ({
  contentHash: vi.fn(() => "stub-hash"),
}));

vi.mock("../lib/log.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { Yad2Adapter, normalizeCityName } from "./yad2.js";

const REGION: CollectorRegionConfig = {
  id: 3,
  slug: "tel-aviv",
  nameHe: "תל אביב והסביבה",
  nameEn: "Tel Aviv & Surroundings",
  feedUrl: "https://gw.yad2.co.il/realestate-feed/rent/map?region=3&property=1",
  cities: [
    // Hyphenated form on our side; Yad2 emits without the hyphen.
    { id: "tel-aviv", nameHe: "תל אביב-יפו" },
    { id: "ramat-gan", nameHe: "רמת גן" },
    { id: "givatayim", nameHe: "גבעתיים" },
    { id: "holon", nameHe: "חולון" },
  ],
};

function makeListing(city: string | null, sourceId: string) {
  return {
    source: "yad2" as const,
    sourceId,
    url: `https://www.yad2.co.il/realestate/item/${sourceId}`,
    title: null,
    description: null,
    priceNis: null,
    rooms: null,
    sqm: null,
    floor: null,
    neighborhood: null,
    street: null,
    postedAt: null,
    isAgency: null,
    authorName: null,
    authorProfile: null,
    rawJson: city === null ? {} : { address: { city: { text: city } } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeCityName", () => {
  test("strips hyphens and collapses whitespace", () => {
    expect(normalizeCityName("תל אביב-יפו")).toBe(normalizeCityName("תל אביב יפו"));
    expect(normalizeCityName("  Tel-Aviv ")).toBe("tel aviv");
  });
});

describe("Yad2Adapter", () => {
  test("routes markers to the correct cityId by Hebrew name (with hyphen normalization)", async () => {
    mockFetchYad2Listings.mockResolvedValue([
      makeListing("תל אביב יפו", "a1"),
      makeListing("רמת גן", "a2"),
      makeListing("חולון", "a3"),
      makeListing("גבעתיים", "a4"),
    ]);
    const result = await new Yad2Adapter().collect(REGION);

    expect(result.receivedCount).toBe(4);
    const payload = result.rawPayload as Array<{ sourceId: string; cityId: string }>;
    expect(payload.map((l) => `${l.sourceId}:${l.cityId}`).sort()).toEqual([
      "a1:tel-aviv",
      "a2:ramat-gan",
      "a3:holon",
      "a4:givatayim",
    ]);
  });

  test("drops markers whose city is not in the region catalog (strict mode)", async () => {
    mockFetchYad2Listings.mockResolvedValue([
      makeListing("תל אביב יפו", "a1"),
      makeListing("בת ים", "a2"), // Not in catalog above — should be dropped.
      makeListing("רמת גן", "a3"),
    ]);
    const result = await new Yad2Adapter().collect(REGION);

    expect(result.receivedCount).toBe(2);
    expect(result.metrics?.yad2_unmapped_city).toBe(1);
    expect(result.metrics?.yad2_total).toBe(3);
    const payload = result.rawPayload as Array<{ sourceId: string; cityId: string }>;
    expect(payload.map((l) => l.sourceId).sort()).toEqual(["a1", "a3"]);
  });

  test("counts markers missing address.city.text separately from unmapped", async () => {
    mockFetchYad2Listings.mockResolvedValue([
      makeListing("תל אביב יפו", "a1"),
      makeListing(null, "a2"), // No address.city.text at all.
    ]);
    const result = await new Yad2Adapter().collect(REGION);

    expect(result.receivedCount).toBe(1);
    expect(result.metrics?.yad2_missing_city_field).toBe(1);
    expect(result.metrics?.yad2_unmapped_city).toBe(0);
  });

  test("uses region.feedUrl for the upstream call", async () => {
    mockFetchYad2Listings.mockResolvedValue([]);
    await new Yad2Adapter().collect(REGION);
    expect(mockFetchYad2Listings).toHaveBeenCalledWith({ feedUrl: REGION.feedUrl });
  });
});
