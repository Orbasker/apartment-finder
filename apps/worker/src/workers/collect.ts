import { Worker, type Job } from "bullmq";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import {
  collectJobSchema,
  type CollectJob,
  signRequest,
  getConnection,
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
  log.info("collect started", { runId: data.runId, source: data.source, cityId: data.cityId });

  try {
    await db
      .update(schema.collectionRuns)
      .set({ status: "collecting" })
      .where(eq(schema.collectionRuns.runId, data.runId));

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

    const adapter = data.source === "yad2" ? new Yad2Adapter() : new FacebookAdapter();
    const { rawPayload, receivedCount } = await adapter.collect(city);

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
      receivedCount,
      blobUrl: url,
    });
  } catch (err) {
    const message = errorMessage(err);
    log.error("collect failed", { runId: data.runId, cityId: data.cityId, error: message });
    await db
      .update(schema.collectionRuns)
      .set({ status: "failed", error: message })
      .where(eq(schema.collectionRuns.runId, data.runId))
      .catch(() => {});
    throw err;
  }
}

export function createCollectWorker() {
  return new Worker<CollectJob>("collect", processCollect, {
    connection: getConnection(),
    concurrency: 2,
  });
}
