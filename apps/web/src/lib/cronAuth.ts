import { env } from "@/lib/env";

/**
 * Vercel signs cron requests with `Authorization: Bearer <CRON_SECRET>`.
 * In dev we skip verification if no secret is configured.
 */
export function verifyCronRequest(req: Request): Response | null {
  const secret = env().CRON_SECRET;
  if (!secret) {
    if (env().NODE_ENV === "production") {
      return new Response("CRON_SECRET not configured", { status: 500 });
    }
    return null;
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
