import { telegramWebhookHandler } from "@/integrations/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const handler = telegramWebhookHandler();
  try {
    return await handler(req);
  } catch (err) {
    console.error("telegram webhook handler failed:", err);
    return new Response("ok", { status: 200 });
  }
}
