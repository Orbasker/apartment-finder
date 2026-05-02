import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  useBullmqCollectors: "true",
}));

vi.mock("@/lib/env", () => ({
  env: vi.fn(() => ({
    USE_BULLMQ_COLLECTORS: mockState.useBullmqCollectors,
  })),
}));

vi.mock("@/lib/schedule", () => ({
  describeLocalSchedule: vi.fn(() => "09:00 Sun"),
  shouldRunYad2Poll: vi.fn(() => true),
  shouldRunApifyPoll: vi.fn(() => true),
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  })),
  newId: vi.fn(() => "test-run-id-123"),
  errorMessage: vi.fn((err: unknown) => String(err)),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@apartment-finder/queue", () => ({
  collectQueue: { add: vi.fn() },
  ingestRawQueue: { add: vi.fn() },
}));

vi.mock("@/scrapers/yad2", () => ({
  fetchYad2Listings: vi.fn(),
  Yad2UpstreamUnavailableError: class extends Error {},
}));

vi.mock("@/ingestion/insert", () => ({
  bulkInsertListings: vi.fn(),
}));

vi.mock("@/ingestion/pipeline", () => ({
  processListing: vi.fn(),
}));

vi.mock("@/lib/contentHash", () => ({
  contentHash: vi.fn(),
}));

import { getDb } from "@/db";
import { collectQueue } from "@apartment-finder/queue";
import { runApifyPollJob, runYad2PollJob } from "./cron";

function makeFacebookCitiesDb() {
  const mockInsert = { values: vi.fn().mockResolvedValue(undefined) };
  const mockSelect = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([
        {
          id: "tel-aviv",
          yad2FeedUrl: "https://example.com/yad2",
          facebookGroupUrls: ["https://facebook.com/groups/tel-aviv-rentals"],
        },
      ]),
    }),
  };
  return {
    insert: vi.fn().mockReturnValue(mockInsert),
    select: vi.fn().mockReturnValue(mockSelect),
  };
}

function makeYad2RegionsDb(regionRows: Array<{ id: number; slug: string }>) {
  const mockInsert = { values: vi.fn().mockResolvedValue(undefined) };
  const mockSelect = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(regionRows),
    }),
  };
  return {
    insert: vi.fn().mockReturnValue(mockInsert),
    select: vi.fn().mockReturnValue(mockSelect),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.useBullmqCollectors = "true";
});

describe("runYad2PollJob", () => {
  it("enqueues one collect job per active region (not per city)", async () => {
    const mockDb = makeYad2RegionsDb([
      { id: 3, slug: "tel-aviv" },
      { id: 5, slug: "north-coast" },
      { id: 6, slug: "jerusalem" },
    ]);
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await runYad2PollJob({ enforceSchedule: false });

    expect(result.status).toBe(200);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.queued).toBe(true);
    expect(result.payload.batchId).toBe("test-run-id-123");

    expect(mockDb.insert).toHaveBeenCalledTimes(3);
    const insertCalls = mockDb.insert().values.mock.calls.map((c: unknown[]) => c[0]);
    expect(insertCalls).toEqual([
      expect.objectContaining({ source: "yad2", regionId: 3, status: "queued" }),
      expect.objectContaining({ source: "yad2", regionId: 5, status: "queued" }),
      expect.objectContaining({ source: "yad2", regionId: 6, status: "queued" }),
    ]);

    expect(collectQueue.add).toHaveBeenCalledTimes(3);
    expect(collectQueue.add).toHaveBeenNthCalledWith(
      1,
      "collect",
      expect.objectContaining({
        source: "yad2",
        regionId: 3,
        runId: "test-run-id-123-region-3-yad2",
      }),
      expect.any(Object),
    );
  });

  it("returns ok with zero queued when no region has launch-ready cities", async () => {
    const mockDb = makeYad2RegionsDb([]);
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await runYad2PollJob({ enforceSchedule: false });

    expect(result.status).toBe(200);
    expect(result.payload.queued).toBe(true);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(collectQueue.add).not.toHaveBeenCalled();
  });
});

describe("runApifyPollJob", () => {
  it("inserts a collection run and enqueues a collect job for Facebook when BullMQ collectors are enabled", async () => {
    const mockDb = makeFacebookCitiesDb();
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await runApifyPollJob({
      origin: "https://example.com",
      enforceSchedule: false,
    });

    expect(result.status).toBe(200);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.queued).toBe(true);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.insert().values).toHaveBeenCalledWith(
      expect.objectContaining({ source: "facebook", cityId: "tel-aviv", status: "queued" }),
    );
    expect(collectQueue.add).toHaveBeenCalledWith(
      "collect",
      expect.objectContaining({
        source: "facebook",
        cityId: "tel-aviv",
        runId: "test-run-id-123-tel-aviv-facebook",
      }),
      expect.any(Object),
    );
  });
});
