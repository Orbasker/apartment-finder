import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { neighborhoods } from "@/db/schema";
import {
  iterateResourceRows,
  normalizeNeighborhoodRow,
  type NormalizedNeighborhood,
} from "@/lib/govil";
import { env } from "@/lib/env";
import { createLogger, errorMessage, newId } from "@/lib/log";
import type { JobRunResult } from "@/jobs/cron";

const UPSERT_BATCH = 500;

export async function runSeedNeighborhoodsJob(): Promise<JobRunResult> {
  const startedAt = Date.now();
  const log = createLogger("job:seed-neighborhoods", { run: newId() });

  const resourceId = env().NEIGHBORHOODS_CKAN_RESOURCE_ID;
  if (!resourceId) {
    log.warn("NEIGHBORHOODS_CKAN_RESOURCE_ID not configured; skipping");
    return {
      status: 200,
      payload: { ok: true, skipped: "NEIGHBORHOODS_CKAN_RESOURCE_ID not configured" },
    };
  }

  log.info("seed started", { resourceId });

  let fetched = 0;
  let normalized = 0;
  let upserted = 0;
  let skippedRows = 0;
  const buffer: NormalizedNeighborhood[] = [];

  try {
    for await (const row of iterateResourceRows(resourceId)) {
      fetched++;
      const n = normalizeNeighborhoodRow(row);
      if (!n) {
        skippedRows++;
        continue;
      }
      normalized++;
      buffer.push(n);
      if (buffer.length >= UPSERT_BATCH) {
        upserted += await upsertBatch(buffer);
        buffer.length = 0;
      }
    }
    if (buffer.length > 0) {
      upserted += await upsertBatch(buffer);
      buffer.length = 0;
    }

    log.info("seed finished", {
      fetched,
      normalized,
      upserted,
      skippedRows,
      durationMs: Date.now() - startedAt,
    });
    return {
      status: 200,
      payload: {
        ok: true,
        fetched,
        normalized,
        upserted,
        skippedRows,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    log.error("seed failed", { error: errorMessage(err) });
    return {
      status: 500,
      payload: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        fetched,
        normalized,
        upserted,
      },
    };
  }
}

async function upsertBatch(rows: NormalizedNeighborhood[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getDb();
  const values = rows.map((n) => ({
    id: n.id,
    cityCode: n.cityCode,
    cityNameHe: n.cityNameHe,
    nameHe: n.nameHe,
    nameEn: n.nameEn,
    centerLat: n.centerLat,
    centerLon: n.centerLon,
    source: "gov.il" as const,
    updatedAt: new Date(),
  }));
  await db
    .insert(neighborhoods)
    .values(values)
    .onConflictDoUpdate({
      target: neighborhoods.id,
      set: {
        cityCode: sql`excluded.city_code`,
        cityNameHe: sql`excluded.city_name_he`,
        nameHe: sql`excluded.name_he`,
        nameEn: sql`excluded.name_en`,
        centerLat: sql`excluded.center_lat`,
        centerLon: sql`excluded.center_lon`,
        source: sql`excluded.source`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  return values.length;
}
