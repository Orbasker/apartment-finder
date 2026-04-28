import { fetchYad2Listings, Yad2UpstreamUnavailableError } from "@/scrapers/yad2";
import { isApifyConfigured, startFacebookGroupsRun } from "@/integrations/apify";
import { describeLocalSchedule, shouldRunApifyPoll, shouldRunYad2Poll } from "@/lib/schedule";
import { env } from "@/lib/env";
import { isLoopbackOrigin, resolveAppPublicOrigin } from "@/lib/appOrigin";
import { createLogger, errorMessage, newId } from "@/lib/log";

export type JobRunResult = {
  status: number;
  payload: Record<string, unknown>;
};

export async function runYad2PollJob(options?: {
  enforceSchedule?: boolean;
}): Promise<JobRunResult> {
  const startedAt = Date.now();
  const localTime = describeLocalSchedule();
  const enforceSchedule = options?.enforceSchedule ?? true;
  const log = createLogger("job:yad2", { run: newId() });

  if (enforceSchedule && !shouldRunYad2Poll()) {
    log.info("skipped outside schedule", { localTime });
    return { status: 200, payload: { ok: true, skipped: "outside schedule", localTime } };
  }

  log.info("job started", { localTime, enforceSchedule });

  try {
    const listings = await fetchYad2Listings();
    log.info("yad2 fetched", {
      listings: listings.length,
      durationMs: Date.now() - startedAt,
    });
    return {
      status: 200,
      payload: {
        ok: true,
        fetched: listings.length,
        ingested: 0,
        note: "ingestion pipeline rebuild in progress",
        localTime,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    if (err instanceof Yad2UpstreamUnavailableError) {
      log.warn("yad2 upstream unavailable", { error: err.message, status: err.status });
      return {
        status: 200,
        payload: { ok: true, fetched: 0, upstreamStatus: "unavailable", localTime },
      };
    }
    log.error("job failed", { error: errorMessage(err) });
    return {
      status: 500,
      payload: { ok: false, error: err instanceof Error ? err.message : String(err), localTime },
    };
  }
}

export async function runApifyPollJob(options: {
  origin: string;
  enforceSchedule?: boolean;
}): Promise<JobRunResult> {
  const enforceSchedule = options.enforceSchedule ?? true;
  const log = createLogger("job:apify", { run: newId() });

  if (enforceSchedule && !shouldRunApifyPoll()) {
    return { status: 200, payload: { ok: true, skipped: "outside schedule" } };
  }

  if (!isApifyConfigured()) {
    return { status: 200, payload: { ok: false, skipped: "APIFY_TOKEN not set" } };
  }

  const webhookSecret = env().APIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return { status: 500, payload: { ok: false, error: "APIFY_WEBHOOK_SECRET not set" } };
  }

  const origin = resolveAppPublicOrigin(options.origin);
  if (isLoopbackOrigin(origin)) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: "Apify cannot call webhooks on localhost. Set APP_PUBLIC_ORIGIN to a public origin.",
      },
    };
  }

  const webhookUrl = new URL("/api/webhooks/apify", origin).toString();

  try {
    const result = await startFacebookGroupsRun({ webhookUrl, webhookSecret });
    if (!result) {
      return { status: 200, payload: { ok: true, skipped: "no monitored groups" } };
    }
    log.info("apify run started", { runId: result.runId, groupCount: result.groupCount });
    return { status: 200, payload: { ok: true, ...result } };
  } catch (err) {
    log.error("apify poll failed", { error: errorMessage(err) });
    return {
      status: 500,
      payload: { ok: false, error: err instanceof Error ? err.message : String(err) },
    };
  }
}
