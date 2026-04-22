import { generateText } from "ai";
import type {
  Judgment,
  NormalizedListing,
  Preferences,
} from "@apartment-finder/shared";
import { model } from "@/lib/gateway";

export async function summarizeForAlert(
  listing: NormalizedListing,
  judgment: Judgment,
  prefs: Preferences,
): Promise<string> {
  const { text } = await generateText({
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
      judgment.positiveSignals.length
        ? `Positives: ${judgment.positiveSignals.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  });
  return text.trim().replace(/\s+/g, " ").slice(0, 200);
}
