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

async function processCollect(job: Job<CollectJob>): Promise<void> {
  const data = collectJobSchema.parse(job.data);
  const db = getDb();
  log.info("collect started", { runId: data.runId, source: data.source });

  try {
    await db
      .update(schema.collectionRuns)
      .set({ status: "collecting" })
      .where(eq(schema.collectionRuns.runId, data.runId));

    const adapter =
      data.source === "yad2" ? new Yad2Adapter() : new FacebookAdapter();
    const { rawPayload, receivedCount } = await adapter.collect();

    const bodyStr = JSON.stringify(rawPayload);
    const bytes = Buffer.byteLength(bodyStr);
    if (bytes > BLOB_MAX_BYTES) {
      throw new Error(`Payload size ${bytes} bytes exceeds 5MB limit`);
    }
    if (bytes > BLOB_WARN_BYTES) {
      log.warn("payload approaching size limit", { bytes, runId: data.runId });
    }

    const { url } = await put(
      `collection-runs/${data.runId}.json`,
      bodyStr,
      {
        access: "public",
        token: env().BLOB_READ_WRITE_TOKEN,
      },
    );

    await db
      .update(schema.collectionRuns)
      .set({ status: "collected", collectedAt: new Date(), receivedCount })
      .where(eq(schema.collectionRuns.runId, data.runId));

    // Sign and POST completion to Vercel webhook
    const completionBody = JSON.stringify({
      runId: data.runId,
      source: data.source,
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

    const res = await fetch(
      `${env().APP_PUBLIC_ORIGIN}/api/collectors/webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
        body: completionBody,
      },
    );
    if (!res.ok) {
      log.warn("webhook returned non-ok", {
        status: res.status,
        runId: data.runId,
      });
    }
    log.info("collect completed", {
      runId: data.runId,
      receivedCount,
      blobUrl: url,
    });
  } catch (err) {
    const message = errorMessage(err);
    log.error("collect failed", { runId: data.runId, error: message });
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
