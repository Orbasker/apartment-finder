import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@apartment-finder/queue", () => ({
  verifyRequest: vi.fn(),
  ingestRawQueue: { add: vi.fn() },
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: vi.fn(() => ({ COLLECTOR_WEBHOOK_SECRET: "test-secret-32-bytes-minimum-abc" })),
}));

vi.mock("@/lib/log", () => ({
  withApiLog: vi.fn((name: string, req: Request, handler: (log: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }) => Promise<Response>) =>
    handler({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  ),
}));

import { verifyRequest, ingestRawQueue } from "@apartment-finder/queue";
import { getDb } from "@/db";
import { POST } from "./route";

function makeRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/collectors/webhook", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

const VALID_HEADERS = {
  "x-signature": "abc123",
  "x-timestamp": String(Math.floor(Date.now() / 1000)),
};

const HAPPY_BODY = JSON.stringify({
  runId: "run-abc-123",
  source: "yad2",
  status: "ok",
  receivedCount: 5,
  blobUrl: "https://blob.vercel.app/raw.json",
});

const ERROR_BODY = JSON.stringify({
  runId: "run-err-456",
  source: "facebook",
  status: "error",
  error: "apify run failed",
  receivedCount: 0,
});

function makeMockDb(updatedRows: { id: number }[] = [{ id: 1 }]) {
  const mockUpdate = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(updatedRows),
  };
  return { update: vi.fn().mockReturnValue(mockUpdate) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/collectors/webhook", () => {
  it("returns 400 when X-Signature is missing", async () => {
    const req = makeRequest(HAPPY_BODY, { "x-timestamp": "1234567890" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Missing X-Signature or X-Timestamp/i);
  });

  it("returns 400 when X-Timestamp is missing", async () => {
    const req = makeRequest(HAPPY_BODY, { "x-signature": "abc123" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Missing X-Signature or X-Timestamp/i);
  });

  it("returns 401 when signature is invalid", async () => {
    vi.mocked(verifyRequest).mockReturnValue(false);
    const req = makeRequest(HAPPY_BODY, VALID_HEADERS);
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Unauthorized/i);
  });

  it("happy path: returns 200 with queued:true, updates DB, enqueues ingest-raw", async () => {
    vi.mocked(verifyRequest).mockReturnValue(true);
    const mockDb = makeMockDb([{ id: 1 }]);
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const req = makeRequest(HAPPY_BODY, VALID_HEADERS);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.queued).toBe(true);
    expect(json.runId).toBe("run-abc-123");

    // DB update should have been called
    expect(mockDb.update).toHaveBeenCalled();
    // ingestRawQueue.add should have been called once
    expect(ingestRawQueue.add).toHaveBeenCalledTimes(1);
    expect(ingestRawQueue.add).toHaveBeenCalledWith(
      "ingest-raw",
      expect.objectContaining({ runId: "run-abc-123", source: "yad2" }),
      expect.any(Object),
    );
  });

  it("replay: returns 200 with idempotent:true, does NOT enqueue when DB returns 0 rows", async () => {
    vi.mocked(verifyRequest).mockReturnValue(true);
    const mockDb = makeMockDb([]); // empty = already processed
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const req = makeRequest(HAPPY_BODY, VALID_HEADERS);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.idempotent).toBe(true);
    // ingestRawQueue.add must NOT be called
    expect(ingestRawQueue.add).not.toHaveBeenCalled();
  });

  it("error path: returns 200 with recorded:'error', no enqueue", async () => {
    vi.mocked(verifyRequest).mockReturnValue(true);
    const mockDb = makeMockDb([{ id: 2 }]);
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const req = makeRequest(ERROR_BODY, VALID_HEADERS);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.recorded).toBe("error");
    expect(ingestRawQueue.add).not.toHaveBeenCalled();
  });
});
