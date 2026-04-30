import { describe, expect, test } from "vitest";

import {
  DEFAULT_QUERY,
  isQueryEmpty,
  parseListingsQuery,
  serializeListingsQuery,
} from "./url-state";

describe("parseListingsQuery", () => {
  test("returns defaults for empty record", () => {
    expect(parseListingsQuery({})).toEqual(DEFAULT_QUERY);
  });

  test("returns defaults for empty URLSearchParams", () => {
    expect(parseListingsQuery(new URLSearchParams())).toEqual(DEFAULT_QUERY);
  });

  test("parses scalar params from awaited record", () => {
    expect(
      parseListingsQuery({
        view: "map",
        priceMin: "8000",
        priceMax: "15000",
        rooms: "3.5",
        sort: "priceAsc",
        page: "3",
      }),
    ).toEqual({
      view: "map",
      priceMin: 8000,
      priceMax: 15000,
      rooms: 3.5,
      sort: "priceAsc",
      page: 3,
      neighborhood: [],
    });
  });

  test("parses scalar params from URLSearchParams instance", () => {
    const usp = new URLSearchParams();
    usp.set("view", "map");
    usp.set("priceMin", "8000");
    usp.set("priceMax", "15000");
    usp.set("rooms", "3.5");
    usp.set("sort", "priceAsc");
    usp.set("page", "3");

    expect(parseListingsQuery(usp)).toEqual({
      view: "map",
      priceMin: 8000,
      priceMax: 15000,
      rooms: 3.5,
      sort: "priceAsc",
      page: 3,
      neighborhood: [],
    });
  });

  test("parses repeated neighborhood values into an array (record form)", () => {
    const r = parseListingsQuery({ neighborhood: ["ChIJ_a", "ChIJ_b"] });
    expect(r.neighborhood).toEqual(["ChIJ_a", "ChIJ_b"]);
  });

  test("parses repeated neighborhood values into an array (URLSearchParams form)", () => {
    const usp = new URLSearchParams();
    usp.append("neighborhood", "ChIJ_a");
    usp.append("neighborhood", "ChIJ_b");

    const r = parseListingsQuery(usp);
    expect(r.neighborhood).toEqual(["ChIJ_a", "ChIJ_b"]);
  });

  test("parses single-element neighborhood as one-item array", () => {
    const r = parseListingsQuery({ neighborhood: "ChIJ_a" });
    expect(r.neighborhood).toEqual(["ChIJ_a"]);
  });

  test("falls back to defaults on garbage values", () => {
    expect(
      parseListingsQuery({
        view: "spaceship",
        priceMin: "abc",
        priceMax: "-50",
        rooms: "NaN",
        sort: "random",
        page: "0",
      }),
    ).toEqual(DEFAULT_QUERY);
  });

  test("filters out empty-string neighborhood entries", () => {
    const r = parseListingsQuery({ neighborhood: ["ChIJ_a", "", "ChIJ_b"] });
    expect(r.neighborhood).toEqual(["ChIJ_a", "ChIJ_b"]);
  });
});

describe("serializeListingsQuery", () => {
  test("omits defaults entirely", () => {
    expect(serializeListingsQuery(DEFAULT_QUERY).toString()).toBe("");
  });

  test("encodes a populated query", () => {
    const out = serializeListingsQuery({
      view: "map",
      priceMin: 8000,
      priceMax: null,
      rooms: 3,
      sort: "priceDesc",
      page: 2,
      neighborhood: ["ChIJ_a", "ChIJ_b"],
    }).toString();

    expect(out).toContain("view=map");
    expect(out).toContain("priceMin=8000");
    expect(out).not.toContain("priceMax");
    expect(out).toContain("rooms=3");
    expect(out).toContain("sort=priceDesc");
    expect(out).toContain("page=2");
    expect(out).toContain("neighborhood=ChIJ_a");
    expect(out).toContain("neighborhood=ChIJ_b");
  });

  test("returns a URLSearchParams instance", () => {
    const out = serializeListingsQuery(DEFAULT_QUERY);
    expect(out).toBeInstanceOf(URLSearchParams);
  });

  test("round-trips serialize → parse", () => {
    const original = {
      view: "table" as const,
      priceMin: 7000,
      priceMax: 12000,
      rooms: 2.5,
      sort: "newest" as const,
      page: 4,
      neighborhood: ["ChIJ_x", "ChIJ_y"],
    };

    const usp = serializeListingsQuery(original);
    const parsed = parseListingsQuery(usp);

    expect(parsed).toEqual(original);
  });

  test("round-trips defaults → empty → defaults", () => {
    const usp = serializeListingsQuery(DEFAULT_QUERY);
    expect(parseListingsQuery(usp)).toEqual(DEFAULT_QUERY);
  });
});

describe("isQueryEmpty", () => {
  test("returns true for the default query", () => {
    expect(isQueryEmpty(DEFAULT_QUERY)).toBe(true);
  });

  test("returns false when any filter is set", () => {
    expect(isQueryEmpty({ ...DEFAULT_QUERY, priceMin: 8000 })).toBe(false);
    expect(isQueryEmpty({ ...DEFAULT_QUERY, neighborhood: ["x"] })).toBe(false);
    expect(isQueryEmpty({ ...DEFAULT_QUERY, sort: "priceAsc" })).toBe(false);
  });
});
