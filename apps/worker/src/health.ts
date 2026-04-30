import { createServer, type Server } from "node:http";
import {
  collectQueue,
  ingestRawQueue,
  ingestNormalizedQueue,
  ingestEnrichQueue,
  ingestPersistQueue,
  ingestNotifyQueue,
} from "@apartment-finder/queue";
import { createLogger } from "./lib/log.js";

const log = createLogger("health");

export function startHealthServer(port: number): Server {
  const startedAt = Date.now();
  const server = createServer(async (req, res) => {
    if (req.url !== "/health") {
      res.writeHead(404).end("Not Found");
      return;
    }
    try {
      const [collect, raw, norm, enrich, persist, notify] = await Promise.all([
        collectQueue.getJobCounts(),
        ingestRawQueue.getJobCounts(),
        ingestNormalizedQueue.getJobCounts(),
        ingestEnrichQueue.getJobCounts(),
        ingestPersistQueue.getJobCounts(),
        ingestNotifyQueue.getJobCounts(),
      ]);
      const body = JSON.stringify({
        ok: true,
        uptimeMs: Date.now() - startedAt,
        queues: {
          collect,
          "ingest-raw": raw,
          "ingest-normalized": norm,
          "ingest-enrich": enrich,
          "ingest-persist": persist,
          "ingest-notify": notify,
        },
      });
      res.writeHead(200, { "Content-Type": "application/json" }).end(body);
    } catch (err) {
      log.error("health check failed", { error: String(err) });
      res.writeHead(500).end(JSON.stringify({ ok: false }));
    }
  });
  server.listen(port, () => log.info("health server listening", { port }));
  return server;
}
