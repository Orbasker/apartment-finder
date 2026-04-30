import type { CollectorAdapter, CollectorResult } from "@apartment-finder/queue";
import { contentHash } from "@apartment-finder/shared/contentHash";
import { env } from "../env.js";
import type { CollectedListing } from "../ingestion/insert.js";
import { createLogger } from "../lib/log.js";

const log = createLogger("adapter:facebook");
const APIFY_API_BASE = "https://api.apify.com/v2";
const FB_GROUPS_ACTOR_ID = "apify~facebook-groups-scraper";

async function apifyFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<unknown> {
  const url = `${APIFY_API_BASE}${path}`;
  const token = env().APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(url, { method: init.method, headers, body });
  if (!res.ok) throw new Error(`Apify API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

function listGroups(): string[] {
  const raw = env().APIFY_GROUPS ?? "";
  return raw
    .split(";")
    .map((u) => u.trim())
    .filter(Boolean);
}

async function waitForRun(runId: string, maxMs = 5 * 60 * 1000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const run = (await apifyFetch(`/actor-runs/${runId}`)) as {
      data: { status: string; defaultDatasetId: string };
    };
    if (run.data.status === "SUCCEEDED") return run.data.defaultDatasetId;
    if (run.data.status === "FAILED" || run.data.status === "ABORTED") {
      throw new Error(`Apify run ${runId} ${run.data.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`Apify run ${runId} timed out`);
}

function apifyItemToCollected(item: Record<string, unknown>): CollectedListing | null {
  const url = (item["url"] ?? item["postUrl"] ?? item["link"]) as string | undefined;
  const text = (item["text"] ?? item["message"] ?? item["content"]) as string | undefined;
  if (!url && !text) return null;
  const sourceId = (item["postId"] ?? item["id"] ?? contentHash(JSON.stringify(item))) as string;
  return {
    source: "facebook",
    sourceId: String(sourceId),
    url: url ?? "",
    rawText: text ?? null,
    rawJson: item,
    contentHash: contentHash(item),
    postedAt: item["timestamp"] ? new Date(item["timestamp"] as string) : null,
    authorName: ((item["authorName"] ?? item["author"]) as string | undefined) ?? null,
    authorProfile: ((item["authorUrl"] ?? item["profileUrl"]) as string | undefined) ?? null,
    sourceGroupUrl: (item["groupUrl"] as string | undefined) ?? null,
  };
}

export class FacebookAdapter implements CollectorAdapter {
  readonly source = "facebook" as const;

  async collect(): Promise<CollectorResult> {
    const groups = listGroups();
    if (groups.length === 0) return { rawPayload: [], receivedCount: 0 };

    const response = (await apifyFetch(`/acts/${FB_GROUPS_ACTOR_ID}/runs`, {
      method: "POST",
      body: {
        startUrls: groups.map((url) => ({ url })),
        resultsLimit: 20,
        onlyPostsNewerThan: "1 day",
      },
    })) as { data: { id: string } };
    const runId = response.data.id;
    log.info("apify run started", { runId, groups: groups.length });

    const datasetId = await waitForRun(runId);
    const items = (await apifyFetch(`/datasets/${encodeURIComponent(datasetId)}/items`)) as Record<
      string,
      unknown
    >[];

    const normalized: CollectedListing[] = items
      .map(apifyItemToCollected)
      .filter((x): x is CollectedListing => x !== null);
    return { rawPayload: normalized, receivedCount: normalized.length };
  }
}
