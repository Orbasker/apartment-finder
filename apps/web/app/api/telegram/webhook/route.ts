import { telegramWebhookHandler } from "@/integrations/telegram";
import { withApiLog, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  return withApiLog("telegram:webhook", req, async (log) => {
    const handler = telegramWebhookHandler();
    try {
      return await handler(req);
    } catch (err) {
      log.error("telegram webhook handler failed", { error: errorMessage(err) });
      return new Response("ok", { status: 200 });
    }
  });
}
