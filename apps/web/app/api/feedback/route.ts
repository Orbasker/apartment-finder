import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { recordFeedback } from "@/feedback/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  listingId: z.number().int().positive(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await recordFeedback(
    user.id,
    parsed.data.listingId,
    parsed.data.rating,
    parsed.data.note,
  );
  return NextResponse.json({ ok: true });
}
