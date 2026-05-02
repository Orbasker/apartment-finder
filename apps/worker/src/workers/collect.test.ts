import { describe, expect, test, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { CollectJob } from "@apartment-finder/queue";

vi.mock("@apartment-finder/queue", () => ({
  collectJobSchema: {
    parse: (data: unknown) => data,
  },
  signRequest: vi.fn(() => "mock-signature"),
  getConnection: vi.fn(() => ({ options: {} })),
}));

const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockDb = { update: mockUpdate, select: mockSelect };
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(() => mockDb),
  schema: {
    collectionRuns: {},
    cities: {
      id: "cities.id",
      nameHe: "cities.nameHe",
      nameEn: "cities.nameEn",
      facebookGroupUrls: "cities.facebookGroupUrls",
      regionId: "cities.regionId",
      isActive: "cities.isActive",
    },
    yad2Regions: {
      id: "yad2Regions.id",
      slug: "yad2Regions.slug",
      nameHe: "yad2Regions.nameHe",
      nameEn: "yad2Regions.nameEn",
      feedUrl: "yad2Regions.feedUrl",
    },
  },
}));

const mockPut = vi.fn();
vi.mock("@vercel/blob", () => ({
  put: mockPut,
}));

const mockEnv = vi.fn();
vi.mock("../env.js", () => ({
  env: mockEnv,
}));

vi.mock("../lib/log.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  errorMessage: vi.fn((e: unknown) => String(e)),
}));

const mockYad2Collect = vi.fn();
vi.mock("../adapters/yad2.js", () => ({
  Yad2Adapter: vi.fn().mockImplementation(() => ({
    source: "yad2",
    collect: mockYad2Collect,
  })),
}));

vi.mock("../adapters/facebook.js", () => ({
  FacebookAdapter: vi.fn().mockImplementation(() => ({
    source: "facebook",
    collect: vi.fn().mockResolvedValue({ rawPayload: [], receivedCount: 0 }),
  })),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("processCollect", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv.mockReturnValue({
      BLOB_READ_WRITE_TOKEN: "test-token",
      COLLECTOR_WEBHOOK_SECRET: "test-secret-min-32-bytes-long-here",
      APP_PUBLIC_ORIGIN: "https://example.vercel.app",
    });

    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    // For yad2 jobs, processCollect makes two selects:
    // 1. yad2_regions (with .limit) -> region row
    // 2. cities (no .limit)         -> array of cities in region
    // For facebook jobs, one select on cities (with .limit).
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 3,
                slug: "tel-aviv",
                nameHe: "תל אביב והסביבה",
                nameEn: "Tel Aviv & Surroundings",
                feedUrl: "https://example.com/yad2?region=3",
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "tel-aviv", nameHe: "תל אביב-יפו" },
            { id: "ramat-gan", nameHe: "רמת גן" },
          ]),
        }),
      });

    mockYad2Collect.mockResolvedValue({ rawPayload: [{ id: 1 }], receivedCount: 1 });

    mockPut.mockResolvedValue({ url: "https://blob.vercel.app/collection-runs/run-1.json" });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
  });

  test("happy path: collects, uploads to blob, updates run, posts signed webhook", async () => {
    const { processCollect } = await import("./collect.js");
    const { signRequest } = await import("@apartment-finder/queue");

    const job = {
      data: {
        runId: "run-1",
        source: "yad2",
        regionId: 3,
        enqueuedAt: Date.now(),
      } satisfies CollectJob,
    } as Job<CollectJob>;

    await processCollect(job);

    expect(mockYad2Collect).toHaveBeenCalledTimes(1);
    expect(mockYad2Collect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 3,
        slug: "tel-aviv",
        feedUrl: expect.stringContaining("region=3"),
        cities: expect.arrayContaining([
          expect.objectContaining({ id: "tel-aviv" }),
          expect.objectContaining({ id: "ramat-gan" }),
        ]),
      }),
    );
    expect(mockPut).toHaveBeenCalledWith(
      "collection-runs/run-1.json",
      expect.any(String),
      expect.objectContaining({ access: "public", token: "test-token" }),
    );
    // status: collecting → collected (2 update chains during success path)
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(signRequest).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.vercel.app/api/collectors/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Signature": "mock-signature",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  test("size limit: rawPayload > 5MB throws and marks run failed without uploading or posting", async () => {
    const huge = Array.from({ length: 100_000 }, (_, i) => ({
      id: i,
      data: "x".repeat(60),
    }));
    mockYad2Collect.mockResolvedValueOnce({ rawPayload: huge, receivedCount: huge.length });

    const { processCollect } = await import("./collect.js");

    const job = {
      data: {
        runId: "run-big",
        source: "yad2",
        regionId: 3,
        enqueuedAt: Date.now(),
      } satisfies CollectJob,
    } as Job<CollectJob>;

    await expect(processCollect(job)).rejects.toThrow(/exceeds 5MB/i);
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    // status: collecting → failed (one update on entry, one in catch)
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  test("non-ok webhook response: throws so BullMQ retries and marks run failed", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({}),
    });

    const { processCollect } = await import("./collect.js");

    const job = {
      data: {
        runId: "run-webhook-fail",
        source: "yad2",
        regionId: 3,
        enqueuedAt: Date.now(),
      } satisfies CollectJob,
    } as Job<CollectJob>;

    await expect(processCollect(job)).rejects.toThrow(/webhook POST failed: 503/);
    // blob upload still happened; webhook still posted; the throw came after
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // status: collecting → collected → failed
    expect(mockUpdate).toHaveBeenCalledTimes(3);
  });
});
