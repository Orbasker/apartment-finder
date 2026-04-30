import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth-server";
import { getDb } from "@/db";
import { schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = getDb();
  const rows = await db
    .select({
      id: schema.collectionRuns.id,
      runId: schema.collectionRuns.runId,
      source: schema.collectionRuns.source,
      status: schema.collectionRuns.status,
      enqueuedAt: schema.collectionRuns.enqueuedAt,
      collectedAt: schema.collectionRuns.collectedAt,
      webhookReceivedAt: schema.collectionRuns.webhookReceivedAt,
      receivedCount: schema.collectionRuns.receivedCount,
      inserted: schema.collectionRuns.inserted,
      skippedExisting: schema.collectionRuns.skippedExisting,
      error: schema.collectionRuns.error,
    })
    .from(schema.collectionRuns)
    .orderBy(desc(schema.collectionRuns.enqueuedAt))
    .limit(20);

  return NextResponse.json(rows);
}
