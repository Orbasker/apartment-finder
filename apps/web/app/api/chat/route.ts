import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { buildAgentSystem } from "@/agent/agent";
import { buildAgentTools } from "@/agent/tools";
import { isGatewayConfigured, model } from "@/lib/gateway";
import { loadPreferences } from "@/preferences/store";
import { getCurrentUser } from "@/lib/supabase/server";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_MODEL = "google/gemini-2.5-flash";
const WEB_CHAT_ID = "web";

export async function POST(req: Request) {
  return withApiLog("chat", req, async (log) => {
    if (!isGatewayConfigured()) {
      log.warn("gateway not configured");
      return NextResponse.json(
        { error: "AI_GATEWAY_API_KEY is not set" },
        { status: 503 },
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      log.warn("unauthenticated");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { messages }: { messages: UIMessage[] } = await req.json();
    const prefs = await loadPreferences(user.id);
    const tools = buildAgentTools(WEB_CHAT_ID);

    log.info("stream starting", {
      user: user.id,
      model: AGENT_MODEL,
      messageCount: messages.length,
    });

    const result = streamText({
      model: model(AGENT_MODEL),
      system: buildAgentSystem(prefs.budget.maxNis),
      messages: convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(8),
    });

    return result.toUIMessageStreamResponse();
  });
}
