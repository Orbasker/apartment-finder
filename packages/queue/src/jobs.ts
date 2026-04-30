import { z } from "zod";

export const collectJobSchema = z.object({
  runId: z.string(),
  source: z.enum(["yad2", "facebook"]),
  cityId: z.string().min(1),
  enqueuedAt: z.number(), // Date.now()
});

export const ingestRawJobSchema = z.object({
  runId: z.string(),
  source: z.enum(["yad2", "facebook"]),
  cityId: z.string().min(1).optional(),
  blobUrl: z.string().url(),
});

export const ingestNormalizedJobSchema = z.object({
  runId: z.string(),
  source: z.enum(["yad2", "facebook"]),
  cityId: z.string().min(1).optional(),
  listingId: z.number().int(),
});

export const ingestEnrichJobSchema = z.object({
  runId: z.string(),
  listingId: z.number().int(),
});

export const ingestPersistJobSchema = z.object({
  runId: z.string(),
  listingId: z.number().int(),
});

export const ingestNotifyJobSchema = z.object({
  runId: z.string(),
  listingId: z.number().int(),
});

export type CollectJob = z.infer<typeof collectJobSchema>;
export type IngestRawJob = z.infer<typeof ingestRawJobSchema>;
export type IngestNormalizedJob = z.infer<typeof ingestNormalizedJobSchema>;
export type IngestEnrichJob = z.infer<typeof ingestEnrichJobSchema>;
export type IngestPersistJob = z.infer<typeof ingestPersistJobSchema>;
export type IngestNotifyJob = z.infer<typeof ingestNotifyJobSchema>;
