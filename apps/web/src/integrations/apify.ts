import { ApifyClient } from "apify-client";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb } from "@/db";
import { monitoredGroups } from "@/db/schema";

const FB_GROUPS_ACTOR_ID = "apify~facebook-groups-scraper";

let client: ApifyClient | undefined;

export function isApifyConfigured(): boolean {
  return Boolean(env().APIFY_TOKEN);
}

function getClient(): ApifyClient {
  if (client) return client;
  const token = env().APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");
  client = new ApifyClient({ token });
  return client;
}

export async function listMonitoredGroups(): Promise<
  Array<{ url: string; label: string | null }>
> {
  const db = getDb();
  const rows = await db
    .select({ url: monitoredGroups.url, label: monitoredGroups.label })
    .from(monitoredGroups)
    .where(eq(monitoredGroups.enabled, true));
  return rows;
}

export async function startFacebookGroupsRun(opts: {
  webhookUrl: string;
  webhookSecret: string;
  maxPostsPerGroup?: number;
}): Promise<{ runId: string; groupCount: number } | null> {
  const groups = await listMonitoredGroups();
  if (groups.length === 0) return null;

  const run = await getClient()
    .actor(FB_GROUPS_ACTOR_ID)
    .start({
      startUrls: groups.map((g) => ({ url: g.url })),
      resultsLimit: opts.maxPostsPerGroup ?? 20,
      onlyPostsNewerThan: "1 day",
    }, {
      webhooks: [
        {
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
          requestUrl: opts.webhookUrl,
          headersTemplate: JSON.stringify({
            "x-apify-webhook-secret": opts.webhookSecret,
          }),
        },
      ],
    });

  return { runId: run.id, groupCount: groups.length };
}

export async function fetchDatasetItems(datasetId: string): Promise<unknown[]> {
  const { items } = await getClient().dataset(datasetId).listItems();
  return items;
}
