import { generateText } from "ai";
import type { Judgment, NormalizedListing, Preferences } from "@apartment-finder/shared";
import { model } from "@/lib/gateway";
import { recordAiUsage } from "@/lib/aiUsage";

export async function summarizeForAlert(
  listing: NormalizedListing,
  judgment: Judgment,
  prefs: Preferences,
): Promise<string> {
  const result = await generateText({
    model: model(prefs.ai.primaryModel),
    system: [
      "Write a single-line alert summary (max 160 chars) for a matching Tel Aviv apartment.",
      "Highlight the strongest positive signals. Neutral, concise, no emojis, no quotes.",
      "Respond in the same primary language as the listing (Hebrew or English).",
    ].join(" "),
    prompt: [
      `Listing: ${listing.title ?? "(no title)"} in ${listing.neighborhood ?? "TA"}.`,
      listing.priceNis ? `Price ₪${listing.priceNis}.` : "",
      listing.rooms ? `${listing.rooms} rooms.` : "",
      `Score ${judgment.score}. Reasoning: ${judgment.reasoning}.`,
      judgment.positiveSignals.length ? `Positives: ${judgment.positiveSignals.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  });
  await recordAiUsage({
    feature: "pipeline.summarize",
    model: prefs.ai.primaryModel,
    providerModel: result.response.modelId,
    usage: result.totalUsage,
  }).catch((err) => console.error("record summarize AI usage failed:", err));

  return result.text.trim().replace(/\s+/g, " ").slice(0, 200);
}
