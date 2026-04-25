import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-server";
import { recordFeedback } from "@/feedback/store";
import { withApiLog, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  listingId: z.number().int().positive(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request): Promise<Response> {
  return withApiLog("feedback", req, async (log) => {
    const user = await getCurrentUser();
    if (!user) {
      log.warn("unauthenticated");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      log.warn("invalid body", { user: user.id });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    try {
      await recordFeedback(user.id, parsed.data.listingId, parsed.data.rating, parsed.data.note);
      log.info("feedback recorded", {
        user: user.id,
        listingId: parsed.data.listingId,
        rating: parsed.data.rating,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      log.error("feedback failed", {
        user: user.id,
        listingId: parsed.data.listingId,
        error: errorMessage(err),
      });
      throw err;
    }
  });
}
