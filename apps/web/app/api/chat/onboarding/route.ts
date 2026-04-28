import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { isGatewayConfigured, model } from "@/lib/gateway";
import { recordAiUsage } from "@/lib/aiUsage";
import { getCurrentUser } from "@/lib/auth-server";
import { ONBOARDING_MODEL, ONBOARDING_SYSTEM } from "@/onboarding/agent";
import { buildOnboardingTools } from "@/onboarding/tools";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  return withApiLog("chat:onboarding", req, async () => {
    if (!isGatewayConfigured()) {
      return new Response("AI gateway not configured", { status: 503 });
    }
    const user = await getCurrentUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { messages } = (await req.json()) as { messages: UIMessage[] };

    const result = streamText({
      model: model(ONBOARDING_MODEL),
      system: ONBOARDING_SYSTEM,
      messages: convertToModelMessages(messages),
      tools: buildOnboardingTools(user.id),
      stopWhen: stepCountIs(8),
      onFinish: async ({ usage, response }) => {
        await recordAiUsage({
          feature: "onboarding.chat",
          model: ONBOARDING_MODEL,
          providerModel: response.modelId,
          usage,
        }).catch((err) => console.error("recordAiUsage(onboarding) failed:", err));
      },
    });

    return result.toUIMessageStreamResponse();
  });
}
