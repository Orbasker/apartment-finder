import { describe, expect, test } from "bun:test";
import {
  fetchYad2Listings,
  Yad2UpstreamUnavailableError,
} from "./yad2";

describe("fetchYad2Listings", () => {
  test("parses JSON payloads even when the content-type is html", async () => {
    const listings = await fetchYad2Listings({
      feedUrl: "https://example.com/yad2",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: {
              markers: [
                {
                  token: "abc123",
                  price: 4200,
                  adType: "private",
                  address: {
                    neighborhood: { text: "Florentin" },
                    street: { text: "Herzl" },
                    house: { floor: 2 },
                  },
                  additionalDetails: {
                    roomsCount: 2,
                    squareMeter: 55,
                  },
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
    });

    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      source: "yad2",
      sourceId: "abc123",
      priceNis: 4200,
      neighborhood: "Florentin",
      street: "Herzl",
      floor: 2,
    });
  });

  test("throws a typed error when Yad2 returns html instead of JSON", async () => {
    await expect(
      fetchYad2Listings({
        feedUrl: "https://example.com/yad2",
        fetchImpl: async () =>
          new Response("<head><title>Access Denied</title></head><body>blocked</body>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      }),
    ).rejects.toBeInstanceOf(Yad2UpstreamUnavailableError);

    await expect(
      fetchYad2Listings({
        feedUrl: "https://example.com/yad2",
        fetchImpl: async () =>
          new Response("<head><title>Access Denied</title></head><body>blocked</body>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      }),
    ).rejects.toThrow(/Access Denied/);
  });

  test("wraps request timeouts as upstream unavailable errors", async () => {
    await expect(
      fetchYad2Listings({
        feedUrl: "https://example.com/yad2",
        timeoutMs: 5,
        fetchImpl: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      }),
    ).rejects.toBeInstanceOf(Yad2UpstreamUnavailableError);

    await expect(
      fetchYad2Listings({
        feedUrl: "https://example.com/yad2",
        timeoutMs: 5,
        fetchImpl: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      }),
    ).rejects.toThrow(/timed out after 5ms/);
  });
});
