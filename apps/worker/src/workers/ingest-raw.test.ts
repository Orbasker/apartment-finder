import { describe, expect, test, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { IngestRawJob } from "@apartment-finder/queue";

vi.mock("@apartment-finder/queue", () => ({
  ingestRawJobSchema: {
    parse: (data: unknown) => data,
  },
  ingestNormalizedQueue: {
    add: vi.fn().mockResolvedValue({}),
  },
  getConnection: vi.fn(() => ({ options: {} })),
}));

const mockBulkInsertListings = vi.fn();
vi.mock("../ingestion/insert.js", () => ({
  bulkInsertListings: mockBulkInsertListings,
}));

const mockUpdate = vi.fn();
const mockDb = { update: mockUpdate };
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(() => mockDb),
  schema: { collectionRuns: {} },
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

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const RAW_LISTINGS = [
  {
    source: "yad2",
    sourceId: "a1",
    url: "https://yad2.co.il/a1",
    rawText: null,
    rawJson: {},
    contentHash: "abc",
    postedAt: null,
  },
  {
    source: "yad2",
    sourceId: "a2",
    url: "https://yad2.co.il/a2",
    rawText: null,
    rawJson: {},
    contentHash: "def",
    postedAt: null,
  },
];

describe("processIngestRaw", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    mockBulkInsertListings.mockResolvedValue({
      inserted: [
        { id: 1, source: "yad2", sourceId: "a1" },
        { id: 2, source: "yad2", sourceId: "a2" },
      ],
      skippedExisting: 0,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify(RAW_LISTINGS)),
    });
  });

  test("happy path: downloads blob, calls bulkInsertListings, updates run, enqueues ingest-normalized per inserted listing", async () => {
    const { processIngestRaw } = await import("./ingest-raw.js");
    const { ingestNormalizedQueue } = await import("@apartment-finder/queue");

    const job = {
      data: {
        runId: "run-2",
        source: "yad2",
        blobUrl: "https://blob.vercel.app/collection-runs/run-2.json",
      } satisfies IngestRawJob,
    } as Job<IngestRawJob>;

    await processIngestRaw(job);

    expect(mockFetch).toHaveBeenCalledWith("https://blob.vercel.app/collection-runs/run-2.json");
    expect(mockBulkInsertListings).toHaveBeenCalledTimes(1);
    expect(mockBulkInsertListings).toHaveBeenCalledWith(RAW_LISTINGS);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(ingestNormalizedQueue.add).toHaveBeenCalledTimes(2);
    expect(ingestNormalizedQueue.add).toHaveBeenNthCalledWith(
      1,
      "ingest-normalized",
      expect.objectContaining({ runId: "run-2", source: "yad2", listingId: 1 }),
      expect.any(Object),
    );
    expect(ingestNormalizedQueue.add).toHaveBeenNthCalledWith(
      2,
      "ingest-normalized",
      expect.objectContaining({ runId: "run-2", source: "yad2", listingId: 2 }),
      expect.any(Object),
    );
  });

  test("blob download failure: throws and does not insert or enqueue", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: vi.fn() });
    const { processIngestRaw } = await import("./ingest-raw.js");
    const { ingestNormalizedQueue } = await import("@apartment-finder/queue");

    const job = {
      data: {
        runId: "run-3",
        source: "yad2",
        blobUrl: "https://blob.vercel.app/collection-runs/run-3.json",
      } satisfies IngestRawJob,
    } as Job<IngestRawJob>;

    await expect(processIngestRaw(job)).rejects.toThrow(/Failed to download blob/);
    expect(mockBulkInsertListings).not.toHaveBeenCalled();
    expect(ingestNormalizedQueue.add).not.toHaveBeenCalled();
  });

  test("zero new inserts: marks run completed and does not enqueue any ingest-normalized jobs", async () => {
    mockBulkInsertListings.mockResolvedValueOnce({ inserted: [], skippedExisting: 2 });
    const { processIngestRaw } = await import("./ingest-raw.js");
    const { ingestNormalizedQueue } = await import("@apartment-finder/queue");

    const job = {
      data: {
        runId: "run-dupes",
        source: "yad2",
        blobUrl: "https://blob.vercel.app/collection-runs/run-dupes.json",
      } satisfies IngestRawJob,
    } as Job<IngestRawJob>;

    await processIngestRaw(job);

    expect(mockBulkInsertListings).toHaveBeenCalledTimes(1);
    expect(ingestNormalizedQueue.add).not.toHaveBeenCalled();
    // single update chain → status: completed
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
