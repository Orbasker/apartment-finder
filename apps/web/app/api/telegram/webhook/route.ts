import { telegramWebhookHandler } from "@/integrations/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const handler = telegramWebhookHandler();
  return handler(req);
}
