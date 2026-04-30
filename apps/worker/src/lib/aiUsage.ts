import type { LanguageModelUsage } from "ai";
import { desc, gte, sql } from "drizzle-orm";

type Pricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
};

type UsageRecordInput = {
  feature: string;
  model: string;
  providerModel?: string | null;
  usage: LanguageModelUsage;
  metadata?: Record<string, unknown>;
};

type UsageSummaryRow = {
  label: string;
  calls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export type AiUsageSummary = {
  hoursAgo: number;
  windowStart: Date;
  windowEnd: Date;
  totalCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  unpricedCalls: number;
  byFeature: UsageSummaryRow[];
  byModel: UsageSummaryRow[];
};

// Pricing source: Anthropic's published Claude pricing and Google's published
// Gemini pricing. Family aliases are mapped to the nearest matching current
// public tier when the provider returns a custom gateway id instead of an
// official provider model id.
const PRICING_BY_MODEL: Array<{ match: RegExp; pricing: Pricing }> = [
  {
    match: /gemini-2\.5-pro/i,
    pricing: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10, cachedInputUsdPerMillion: 0.31 },
  },
  {
    match: /gemini-2\.5-flash-lite/i,
    pricing: { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4, cachedInputUsdPerMillion: 0.025 },
  },
  {
    match: /gemini-2\.5-flash|gemini-2\.0-flash/i,
    pricing: { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.075 },
  },
  {
    match: /claude-opus-4|claude-opus-4-1/i,
    pricing: { inputUsdPerMillion: 15, outputUsdPerMillion: 75, cachedInputUsdPerMillion: 1.5 },
  },
  {
    match:
      /claude-sonnet-4|claude-3-7-sonnet|claude-3-5-sonnet|claude-sonnet-4-5|claude-sonnet-4-6/i,
    pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15, cachedInputUsdPerMillion: 0.3 },
  },
  {
    match: /claude-3-5-haiku|claude-haiku-4-5/i,
    pricing: { inputUsdPerMillion: 0.8, outputUsdPerMillion: 4, cachedInputUsdPerMillion: 0.08 },
  },
  {
    match: /claude-3-haiku/i,
    pricing: {
      inputUsdPerMillion: 0.25,
      outputUsdPerMillion: 1.25,
      cachedInputUsdPerMillion: 0.03,
    },
  },
];

export function estimateCostUsd(
  modelId: string,
  usage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "cachedInputTokens">,
): number {
  const pricing = getPricing(modelId);
  if (!pricing) return 0;

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedInputTokens = Math.min(usage.cachedInputTokens ?? 0, inputTokens);
  const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);

  return (
    (billableInputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (cachedInputTokens / 1_000_000) *
      (pricing.cachedInputUsdPerMillion ?? pricing.inputUsdPerMillion) +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMillion
  );
}

export async function recordAiUsage(input: UsageRecordInput): Promise<void> {
  const { db, aiUsage } = await loadAiUsageDb();
  const pricedModel = input.providerModel ?? input.model;
  const estimatedCostUsd = estimateCostUsd(pricedModel, input.usage);

  await db.insert(aiUsage).values({
    feature: input.feature,
    model: input.model,
    providerModel: input.providerModel ?? null,
    inputTokens: input.usage.inputTokens ?? 0,
    outputTokens: input.usage.outputTokens ?? 0,
    totalTokens:
      input.usage.totalTokens ?? (input.usage.inputTokens ?? 0) + (input.usage.outputTokens ?? 0),
    reasoningTokens: input.usage.reasoningTokens ?? null,
    cachedInputTokens: input.usage.cachedInputTokens ?? null,
    estimatedCostUsd,
    metadata: input.metadata ?? null,
  });
}

export async function getAiUsageSummary(hoursAgo = 24): Promise<AiUsageSummary> {
  const { db, aiUsage } = await loadAiUsageDb();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - hoursAgo * 3_600_000);

  const [totals] = await db
    .select({
      totalCalls: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      estimatedCostUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)::float`,
      unpricedCalls: sql<number>`count(*) filter (where ${aiUsage.totalTokens} > 0 and ${aiUsage.estimatedCostUsd} = 0)::int`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, windowStart));

  const byFeature = await db
    .select({
      label: aiUsage.feature,
      calls: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      estimatedCostUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)::float`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, windowStart))
    .groupBy(aiUsage.feature)
    .orderBy(desc(sql`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)`), desc(sql`count(*)`));

  const labelSql = sql<string>`coalesce(${aiUsage.providerModel}, ${aiUsage.model})`;
  const byModel = await db
    .select({
      label: labelSql,
      calls: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      estimatedCostUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)::float`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, windowStart))
    .groupBy(labelSql)
    .orderBy(desc(sql`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)`), desc(sql`count(*)`));

  return {
    hoursAgo,
    windowStart,
    windowEnd,
    totalCalls: totals?.totalCalls ?? 0,
    totalTokens: totals?.totalTokens ?? 0,
    inputTokens: totals?.inputTokens ?? 0,
    outputTokens: totals?.outputTokens ?? 0,
    estimatedCostUsd: totals?.estimatedCostUsd ?? 0,
    unpricedCalls: totals?.unpricedCalls ?? 0,
    byFeature,
    byModel,
  };
}

function getPricing(modelId: string): Pricing | null {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return null;

  for (const entry of PRICING_BY_MODEL) {
    if (entry.match.test(normalized)) return entry.pricing;
  }

  return null;
}

async function loadAiUsageDb() {
  const [{ getDb }, { aiUsage }] = await Promise.all([import("../db/index.js"), import("../db/schema.js")]);

  return {
    db: getDb(),
    aiUsage,
  };
}
