import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildDefaultYad2Fetch,
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

  describe("buildDefaultYad2Fetch", () => {
    const origUrl = process.env.YAD2_PROXY_URL;
    const origSecret = process.env.YAD2_PROXY_SECRET;
    const origFetch = globalThis.fetch;

    beforeEach(() => {
      process.env.YAD2_PROXY_URL = "https://proxy.example.run.app/";
      process.env.YAD2_PROXY_SECRET = "s3cret";
    });
    afterEach(() => {
      if (origUrl === undefined) delete process.env.YAD2_PROXY_URL;
      else process.env.YAD2_PROXY_URL = origUrl;
      if (origSecret === undefined) delete process.env.YAD2_PROXY_SECRET;
      else process.env.YAD2_PROXY_SECRET = origSecret;
      globalThis.fetch = origFetch;
    });

    test("rewrites the Yad2 URL through the proxy with the shared secret", async () => {
      let calledWith: { url: string; init: RequestInit | undefined } | null = null;
      globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
        calledWith = { url: typeof input === "string" ? input : input.toString(), init };
        return new Response("ok", { status: 200 });
      }) as typeof fetch;

      const proxied = buildDefaultYad2Fetch();
      await proxied("https://gw.yad2.co.il/realestate-feed/rent/map?region=3");

      expect(calledWith).not.toBeNull();
      expect(calledWith!.url).toBe(
        "https://proxy.example.run.app/fetch?url=https%3A%2F%2Fgw.yad2.co.il%2Frealestate-feed%2Frent%2Fmap%3Fregion%3D3",
      );
      expect((calledWith!.init?.headers as Record<string, string>)["x-proxy-secret"]).toBe("s3cret");
    });

    test("returns plain fetch when proxy env is not fully set", () => {
      delete process.env.YAD2_PROXY_URL;
      expect(buildDefaultYad2Fetch()).toBe(fetch);
    });
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
