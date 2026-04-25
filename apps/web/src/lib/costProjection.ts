import type { AiUsageSummary } from "@/lib/aiUsage";

export type FixedCost = {
  label: string;
  monthlyUsd: number;
  note?: string;
};

// Edit these to match your real bills. Single-user project — inline is fine.
export const FIXED_COSTS: FixedCost[] = [
  { label: "Vercel Pro", monthlyUsd: 20 },
  { label: "Supabase", monthlyUsd: 0, note: "Free tier" },
  { label: "Apify", monthlyUsd: 49, note: "Starter plan" },
  { label: "Resend", monthlyUsd: 0, note: "Free tier" },
];

export type CostProjection = {
  ai7dUsd: number;
  ai30dUsd: number;
  aiMonthlyProjectedUsd: number;
  fixedMonthlyUsd: number;
  totalMonthlyUsd: number;
  fixed: FixedCost[];
};

export function buildCostProjection(
  week: Pick<AiUsageSummary, "estimatedCostUsd">,
  month: Pick<AiUsageSummary, "estimatedCostUsd">,
): CostProjection {
  // Prefer the 7d trend extrapolated to a month for a more recent signal;
  // fall back to the trailing-30d window if 7d is empty.
  const aiMonthlyProjectedUsd =
    week.estimatedCostUsd > 0 ? week.estimatedCostUsd * (30 / 7) : month.estimatedCostUsd;

  const fixedMonthlyUsd = FIXED_COSTS.reduce((sum, c) => sum + c.monthlyUsd, 0);

  return {
    ai7dUsd: week.estimatedCostUsd,
    ai30dUsd: month.estimatedCostUsd,
    aiMonthlyProjectedUsd,
    fixedMonthlyUsd,
    totalMonthlyUsd: aiMonthlyProjectedUsd + fixedMonthlyUsd,
    fixed: FIXED_COSTS,
  };
}
