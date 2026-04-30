import { createCollectWorker } from "./workers/collect.js";
import { createIngestRawWorker } from "./workers/ingest-raw.js";
import { createIngestNormalizedWorker } from "./workers/ingest-normalized.js";
import { createIngestEnrichWorker } from "./workers/ingest-enrich.js";
import { createIngestPersistWorker } from "./workers/ingest-persist.js";
import { createIngestNotifyWorker } from "./workers/ingest-notify.js";
import { startHealthServer } from "./health.js";
import { env } from "./env.js";
import { createLogger } from "./lib/log.js";

const log = createLogger("worker:main");

async function main() {
  log.info("starting workers");
  const workers = [
    createCollectWorker(),
    createIngestRawWorker(),
    createIngestNormalizedWorker(),
    createIngestEnrichWorker(),
    createIngestPersistWorker(),
    createIngestNotifyWorker(),
  ];
  const healthServer = startHealthServer(env().PORT);

  log.info(
    "[ready] queues=collect,ingest-raw,ingest-normalized,ingest-enrich,ingest-persist,ingest-notify",
  );

  const shutdown = async () => {
    log.info("[draining queues]");
    await Promise.all(workers.map((w) => w.close()));
    healthServer.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("worker main failed:", err);
  process.exit(1);
});
