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

function makeMockDb() {
  const mockInsert = {
    values: vi.fn().mockResolvedValue(undefined),
  };
  return { insert: vi.fn().mockReturnValue(mockInsert) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.useBullmqCollectors = "true";
});

describe("runYad2PollJob", () => {
  it("inserts a collection run and enqueues a collect job when BullMQ collectors are enabled", async () => {
    const mockDb = makeMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await runYad2PollJob({ enforceSchedule: false });

    expect(result.status).toBe(200);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.queued).toBe(true);
    expect(result.payload.runId).toBe("test-run-id-123");
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.insert().values).toHaveBeenCalledWith(
      expect.objectContaining({ source: "yad2", status: "queued" }),
    );
    expect(collectQueue.add).toHaveBeenCalledWith(
      "collect",
      expect.objectContaining({ source: "yad2", runId: "test-run-id-123" }),
      expect.any(Object),
    );
  });
});

describe("runApifyPollJob", () => {
  it("inserts a collection run and enqueues a collect job for Facebook when BullMQ collectors are enabled", async () => {
    const mockDb = makeMockDb();
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
      expect.objectContaining({ source: "facebook", status: "queued" }),
    );
    expect(collectQueue.add).toHaveBeenCalledWith(
      "collect",
      expect.objectContaining({ source: "facebook", runId: "test-run-id-123" }),
      expect.any(Object),
    );
  });
});
