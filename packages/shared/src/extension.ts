import { z } from "zod";

export const ExtensionScrapedPostSchema = z.object({
  postId: z.string().min(1),
  permalink: z.string().url(),
  groupUrl: z.string().url().nullable().optional(),
  groupName: z.string().nullable().optional(),
  text: z.string().min(1),
  authorName: z.string().nullable().optional(),
  authorUrl: z.string().url().nullable().optional(),
  timestampIso: z.string().datetime().nullable().optional(),
  scrapedAt: z.string().datetime(),
});

export type ExtensionScrapedPost = z.infer<typeof ExtensionScrapedPostSchema>;

export const ExtensionIngestPayloadSchema = z.object({
  posts: z.array(ExtensionScrapedPostSchema).min(1).max(100),
});

export type ExtensionIngestPayload = z.infer<typeof ExtensionIngestPayloadSchema>;

export const EXTENSION_INGEST_HEADER = "x-extension-ingest-secret";
