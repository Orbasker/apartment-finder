import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies that would require real I/O
vi.mock("@/lib/env", () => ({
  env: vi.fn(() => ({ USE_BULLMQ_COLLECTORS: "true" })),
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

// Mock old-path deps (needed to avoid module-load errors)
vi.mock("@/scrapers/yad2", () => ({
  fetchYad2Listings: vi.fn(),
  Yad2UpstreamUnavailableError: class extends Error {},
}));
vi.mock("@/integrations/apify", () => ({
  isApifyConfigured: vi.fn(() => false),
  startFacebookGroupsRun: vi.fn(),
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
vi.mock("@/lib/appOrigin", () => ({
  isLoopbackOrigin: vi.fn(() => false),
  resolveAppPublicOrigin: vi.fn((o: string) => o),
}));

import { getDb } from "@/db";
import { collectQueue } from "@apartment-finder/queue";
import { runYad2PollJob, runApifyPollJob } from "./cron";

function makeMockDb() {
  const mockInsert = {
    values: vi.fn().mockResolvedValue(undefined),
  };
  return { insert: vi.fn().mockReturnValue(mockInsert) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runYad2PollJob (USE_BULLMQ_COLLECTORS=true)", () => {
  it("inserts collection_runs row and enqueues collect job", async () => {
    const mockDb = makeMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await runYad2PollJob({ enforceSchedule: false });

    // Should return 200 with queued:true
    expect(result.status).toBe(200);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.queued).toBe(true);
    expect(result.payload.runId).toBe("test-run-id-123");

    // DB insert should be called
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const insertValues = vi.mocked(mockDb.insert().values).mock.calls[0][0];
    expect(insertValues).toMatchObject({ source: "yad2", status: "queued" });

    // collectQueue.add should be called with yad2 source
    expect(collectQueue.add).toHaveBeenCalledTimes(1);
    expect(collectQueue.add).toHaveBeenCalledWith(
      "collect",
      expect.objectContaining({ source: "yad2", runId: "test-run-id-123" }),
      expect.any(Object),
    );
  });
});

describe("runApifyPollJob (USE_BULLMQ_COLLECTORS=true)", () => {
  it("inserts collection_runs row and enqueues collect job for facebook", async () => {
    const mockDb = makeMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await runApifyPollJob({ origin: "https://example.com", enforceSchedule: false });

    // Should return 200 with queued:true
    expect(result.status).toBe(200);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.queued).toBe(true);

    // DB insert should be called
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const insertValues = vi.mocked(mockDb.insert().values).mock.calls[0][0];
    expect(insertValues).toMatchObject({ source: "facebook", status: "queued" });

    // collectQueue.add should be called with facebook source
    expect(collectQueue.add).toHaveBeenCalledTimes(1);
    expect(collectQueue.add).toHaveBeenCalledWith(
      "collect",
      expect.objectContaining({ source: "facebook" }),
      expect.any(Object),
    );
  });
});
