import { Worker, type Job } from "bullmq";
import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import {
  collectJobSchema,
  type CollectJob,
  signRequest,
  getConnection,
  type CollectorRegionConfig,
} from "@apartment-finder/queue";
import { getDb, schema } from "../db/index.js";
import { env } from "../env.js";
import { createLogger, errorMessage } from "../lib/log.js";
import { Yad2Adapter } from "../adapters/yad2.js";
import { FacebookAdapter } from "../adapters/facebook.js";

const log = createLogger("worker:collect");
const BLOB_WARN_BYTES = 4 * 1024 * 1024;
const BLOB_MAX_BYTES = 5 * 1024 * 1024;

export async function processCollect(job: Job<CollectJob>): Promise<void> {
  const data = collectJobSchema.parse(job.data);
  const db = getDb();
  log.info("collect started", {
    runId: data.runId,
    source: data.source,
    cityId: data.cityId,
    regionId: data.regionId,
  });

  try {
    await db
      .update(schema.collectionRuns)
      .set({ status: "collecting" })
      .where(eq(schema.collectionRuns.runId, data.runId));

    let rawPayload: unknown;
    let receivedCount: number;

    if (data.source === "yad2") {
      if (data.regionId === undefined) {
        throw new Error(`yad2 collect job missing regionId: ${data.runId}`);
      }
      const region = await loadRegionConfig(db, data.regionId);
      const result = await new Yad2Adapter().collect(region);
      rawPayload = result.rawPayload;
      receivedCount = result.receivedCount;
    } else {
      if (!data.cityId) {
        throw new Error(`facebook collect job missing cityId: ${data.runId}`);
      }
      const [city] = await db
        .select({
          id: schema.cities.id,
          nameHe: schema.cities.nameHe,
          nameEn: schema.cities.nameEn,
          yad2FeedUrl: schema.cities.yad2FeedUrl,
          facebookGroupUrls: schema.cities.facebookGroupUrls,
        })
        .from(schema.cities)
        .where(eq(schema.cities.id, data.cityId))
        .limit(1);
      if (!city) throw new Error(`city not found: ${data.cityId}`);
      const result = await new FacebookAdapter().collect(city);
      rawPayload = result.rawPayload;
      receivedCount = result.receivedCount;
    }

    const bodyStr = JSON.stringify(rawPayload);
    const bytes = Buffer.byteLength(bodyStr);
    if (bytes > BLOB_MAX_BYTES) {
      throw new Error(`Payload size ${bytes} bytes exceeds 5MB limit`);
    }
    if (bytes > BLOB_WARN_BYTES) {
      log.warn("payload approaching size limit", { bytes, runId: data.runId });
    }

    const { url } = await put(`collection-runs/${data.runId}.json`, bodyStr, {
      access: "public",
      token: env().BLOB_READ_WRITE_TOKEN,
    });

    await db
      .update(schema.collectionRuns)
      .set({ status: "collected", collectedAt: new Date(), receivedCount })
      .where(eq(schema.collectionRuns.runId, data.runId));

    // Sign and POST completion to Vercel webhook
    const completionBody = JSON.stringify({
      runId: data.runId,
      source: data.source,
      cityId: data.cityId,
      regionId: data.regionId,
      status: "ok",
      receivedCount,
      blobUrl: url,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signRequest({
      body: completionBody,
      secret: env().COLLECTOR_WEBHOOK_SECRET,
      timestamp,
    });

    const res = await fetch(`${env().APP_PUBLIC_ORIGIN}/api/collectors/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
        "X-Timestamp": timestamp,
      },
      body: completionBody,
    });
    if (!res.ok) {
      // Throw so BullMQ retries the collect job. The catch block below will
      // mark the run failed; if a later retry succeeds, the collect will
      // re-upload the blob and re-POST, and the webhook handler's
      // idempotency anchor (webhookReceivedAt IS NULL) prevents double-ingest.
      throw new Error(`webhook POST failed: ${res.status}`);
    }
    log.info("collect completed", {
      runId: data.runId,
      cityId: data.cityId,
      regionId: data.regionId,
      receivedCount,
      blobUrl: url,
    });
  } catch (err) {
    const message = errorMessage(err);
    log.error("collect failed", {
      runId: data.runId,
      cityId: data.cityId,
      regionId: data.regionId,
      error: message,
    });
    await db
      .update(schema.collectionRuns)
      .set({ status: "failed", error: message })
      .where(eq(schema.collectionRuns.runId, data.runId))
      .catch(() => {});
    throw err;
  }
}

async function loadRegionConfig(
  db: ReturnType<typeof getDb>,
  regionId: number,
): Promise<CollectorRegionConfig> {
  const [region] = await db
    .select({
      id: schema.yad2Regions.id,
      slug: schema.yad2Regions.slug,
      nameHe: schema.yad2Regions.nameHe,
      nameEn: schema.yad2Regions.nameEn,
      feedUrl: schema.yad2Regions.feedUrl,
    })
    .from(schema.yad2Regions)
    .where(eq(schema.yad2Regions.id, regionId))
    .limit(1);
  if (!region) throw new Error(`region not found: ${regionId}`);

  const cityRows = await db
    .select({ id: schema.cities.id, nameHe: schema.cities.nameHe })
    .from(schema.cities)
    .where(and(eq(schema.cities.regionId, regionId), eq(schema.cities.isActive, true)));

  return { ...region, cities: cityRows };
}

export function createCollectWorker() {
  return new Worker<CollectJob>("collect", processCollect, {
    connection: getConnection(),
    concurrency: 2,
  });
}
