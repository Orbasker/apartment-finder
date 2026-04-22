import { generateText, stepCountIs } from "ai";
import { isGatewayConfigured, model } from "@/lib/gateway";
import { loadPreferences } from "@/preferences/store";
import { buildAgentTools } from "@/agent/tools";
import { recordAiUsage } from "@/lib/aiUsage";

const AGENT_MODEL = "anthropic/claude-sonnet-4-6";

export async function handleAgentMessage(input: {
  userId: string;
  text: string;
}): Promise<string> {
  if (!isGatewayConfigured()) {
    return "AI agent is not configured (missing AI_GATEWAY_API_KEY). Ask the dashboard owner to set it.";
  }

  const prefs = await loadPreferences(input.userId);
  const tools = buildAgentTools(input.userId);

  const result = await generateText({
    model: model(AGENT_MODEL),
    system: buildAgentSystem(prefs.budget.maxNis),
    prompt: input.text,
    tools,
    stopWhen: stepCountIs(8),
  });
  await recordAiUsage({
    feature: "agent.chat",
    model: AGENT_MODEL,
    providerModel: result.response.modelId,
    usage: result.totalUsage,
    metadata: { toolCalls: result.toolCalls.length },
  }).catch((err) => console.error("record agent AI usage failed:", err));

  return result.text.trim() || "(no reply)";
}

export function buildAgentSystem(budgetNis: number): string {
  return [
    "You are the user's personal Tel Aviv apartment-hunting assistant.",
    "You have tools for searching listings, fetching details, stats, and proposing preference changes.",
    "",
    "Guidelines:",
    "- Answer in the language the user wrote in (Hebrew or English).",
    "- Be concise. For lists, return ≤5 items with price + neighborhood + URL.",
    "- Prices are NIS/month unless stated.",
    `- Current budget cap: ₪${budgetNis}/mo.`,
    "- Never invent listings or URLs — only return what the search tool returns.",
    "- When the user wants to change preferences, call proposePreferencesPatch, summarize what will change, and tell them to reply /confirm or /cancel. Do NOT claim the preference was already saved.",
    "- Preferences cover: budget (min + max NIS), rooms, size (min/max sqm), allowed/blocked neighborhoods, hard requirements, nice-to-haves, deal-breakers, amenities (elevator, parking, balcony, airConditioning, furnished, renovated, petFriendly, safeRoom, storage, accessible, bars — each one of any/preferred/required/avoid), maxAgeHours, ai, alerts.",
    "- If the user mentions an amenity like 'must have parking' or 'no ground floor', update prefs.amenities or prefs.dealBreakers accordingly.",
    "- A minimum rent (prefs.budget.minNis) filters out spammy bait listings priced absurdly low.",
    "- Email alert settings, including run-summary and top-picks emails, are preferences. Update them via proposePreferencesPatch.",
    "- When showing a listing, always include its URL on its own line so links open cleanly on mobile.",
  ].join("\n");
}
