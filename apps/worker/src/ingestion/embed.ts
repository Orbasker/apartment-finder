import { embed } from "ai";
import { textEmbeddingModel } from "@apartment-finder/shared/gateway";
import { recordAiUsage } from "../lib/aiUsage.js";

const EMBEDDING_MODEL = "google/gemini-embedding-001";
const EMBEDDING_DIMS = 1536;

export async function embedText(text: string): Promise<number[]> {
  const result = await embed({
    model: textEmbeddingModel(EMBEDDING_MODEL),
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMS,
      },
    },
  });

  await recordAiUsage({
    feature: "ingestion.embed",
    model: EMBEDDING_MODEL,
    providerModel: EMBEDDING_MODEL,
    usage: {
      inputTokens: result.usage?.tokens ?? 0,
      outputTokens: 0,
      totalTokens: result.usage?.tokens ?? 0,
    },
    metadata: { dims: EMBEDDING_DIMS },
  }).catch((err) => console.error("recordAiUsage(embed) failed:", err));

  return result.embedding;
}

/** Compose a stable text representation of an apartment to embed. */
export function composeEmbeddingText(parts: {
  neighborhood?: string | null;
  street?: string | null;
  rooms?: number | null;
  sqm?: number | null;
  description?: string | null;
}): string {
  const segments = [
    parts.neighborhood?.trim(),
    parts.street?.trim(),
    parts.rooms != null ? `${parts.rooms} rooms` : null,
    parts.sqm != null ? `${parts.sqm} sqm` : null,
    parts.description?.trim(),
  ].filter((s) => s && s.length > 0);
  return segments.join(" · ");
}
