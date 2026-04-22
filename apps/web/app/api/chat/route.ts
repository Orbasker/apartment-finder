import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { buildAgentSystem } from "@/agent/agent";
import { buildAgentTools } from "@/agent/tools";
import { isGatewayConfigured, model } from "@/lib/gateway";
import { loadPreferences } from "@/preferences/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_MODEL = "anthropic/claude-sonnet-4-6";
const WEB_CHAT_ID = "web";

export async function POST(req: Request) {
  if (!isGatewayConfigured()) {
    return NextResponse.json(
      { error: "AI_GATEWAY_API_KEY is not set" },
      { status: 503 },
    );
  }

  const { messages }: { messages: UIMessage[] } = await req.json();
  const prefs = await loadPreferences();
  const tools = buildAgentTools(WEB_CHAT_ID);

  const result = streamText({
    model: model(AGENT_MODEL),
    system: buildAgentSystem(prefs.budget.maxNis),
    messages: convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
