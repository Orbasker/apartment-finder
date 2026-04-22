import { z } from "zod";

export const JudgmentDecision = z.enum(["alert", "skip", "unsure"]);
export type JudgmentDecision = z.infer<typeof JudgmentDecision>;

export const JudgmentSchema = z.object({
  score: z.number().min(0).max(100),
  decision: JudgmentDecision,
  reasoning: z.string(),
  redFlags: z.array(z.string()).default([]),
  positiveSignals: z.array(z.string()).default([]),
  extracted: z
    .object({
      priceNis: z.number().int().nullable(),
      rooms: z.number().nullable(),
      neighborhood: z.string().nullable(),
    })
    .optional(),
});

export type Judgment = z.infer<typeof JudgmentSchema>;
