import { env } from "@/lib/env";

const FB_GROUPS_ACTOR_ID = "apify~facebook-groups-scraper";
const APIFY_API_BASE = "https://api.apify.com/v2";

export function isApifyConfigured(): boolean {
  return Boolean(env().APIFY_TOKEN);
}

function getToken(): string {
  const token = env().APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");
  return token;
}

async function apifyFetch(
  path: string,
  init: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown } = {
    method: "GET",
  },
): Promise<unknown> {
  const url = new URL(`${APIFY_API_BASE}${path}`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(url, { method: init.method, headers, body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

export function listMonitoredGroups(): Array<{ url: string; label: string | null }> {
  const raw = env().FACEBOOK_GROUP_URLS ?? "";
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({ url, label: null }));
}

export async function startFacebookGroupsRun(opts: {
  webhookUrl: string;
  webhookSecret: string;
  maxPostsPerGroup?: number;
}): Promise<{ runId: string; groupCount: number } | null> {
  const groups = listMonitoredGroups();
  if (groups.length === 0) return null;

  const webhooks = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
      requestUrl: opts.webhookUrl,
      headersTemplate: JSON.stringify({
        "x-apify-webhook-secret": opts.webhookSecret,
      }),
    },
  ];
  const webhooksB64 = Buffer.from(JSON.stringify(webhooks), "utf8").toString("base64");

  const input = {
    startUrls: groups.map((g) => ({ url: g.url })),
    resultsLimit: opts.maxPostsPerGroup ?? 20,
    onlyPostsNewerThan: "1 day",
  };

  const response = (await apifyFetch(`/acts/${FB_GROUPS_ACTOR_ID}/runs`, {
    method: "POST",
    body: input,
    query: { webhooks: webhooksB64 },
  })) as { data: { id: string } };

  return { runId: response.data.id, groupCount: groups.length };
}

export async function fetchDatasetItems(datasetId: string): Promise<unknown[]> {
  const items = (await apifyFetch(`/datasets/${encodeURIComponent(datasetId)}/items`, {
    method: "GET",
  })) as unknown[];
  return items;
}
