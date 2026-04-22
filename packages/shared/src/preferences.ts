import { z } from "zod";

export const PreferencesSchema = z.object({
  budget: z.object({
    maxNis: z.number().int().positive(),
    flexibilityPct: z.number().min(0).max(100).default(10),
  }),
  rooms: z.object({
    min: z.number().min(1),
    max: z.number().min(1),
  }),
  sizeSqm: z
    .object({
      min: z.number().int().positive(),
    })
    .optional(),
  allowedNeighborhoods: z.array(z.string()).default([]),
  blockedNeighborhoods: z.array(z.string()).default([]),
  hardRequirements: z.array(z.string()).default([]),
  niceToHaves: z.array(z.string()).default([]),
  dealBreakers: z.array(z.string()).default([]),
  maxAgeHours: z.number().int().positive().default(24),
  ai: z
    .object({
      scoreThreshold: z.number().min(0).max(100).default(70),
      primaryModel: z.string().default("anthropic/claude-haiku-4-5"),
      escalationModel: z.string().default("anthropic/claude-sonnet-4-6"),
    })
    .default({
      scoreThreshold: 70,
      primaryModel: "anthropic/claude-haiku-4-5",
      escalationModel: "anthropic/claude-sonnet-4-6",
    }),
  alerts: z.object({
    telegram: z.object({
      enabled: z.boolean().default(true),
      chatId: z.string().optional(),
    }),
    email: z
      .object({
        enabled: z.boolean().default(false),
        to: z.string().email().optional(),
      })
      .default({ enabled: false }),
    whatsapp: z
      .object({
        enabled: z.boolean().default(false),
      })
      .default({ enabled: false }),
  }),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const PreferencesPatchSchema = PreferencesSchema.deepPartial();
export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>;

export const defaultPreferences: Preferences = PreferencesSchema.parse({
  budget: { maxNis: 8000, flexibilityPct: 10 },
  rooms: { min: 2, max: 4 },
  allowedNeighborhoods: [],
  blockedNeighborhoods: [],
  hardRequirements: [],
  niceToHaves: [],
  dealBreakers: [],
  maxAgeHours: 24,
  ai: {
    scoreThreshold: 70,
    primaryModel: "anthropic/claude-haiku-4-5",
    escalationModel: "anthropic/claude-sonnet-4-6",
  },
  alerts: {
    telegram: { enabled: true },
    email: { enabled: false },
    whatsapp: { enabled: false },
  },
});
