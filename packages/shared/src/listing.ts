import { z } from "zod";

export const ListingSource = z.enum(["yad2", "facebook"]);
export type ListingSource = z.infer<typeof ListingSource>;

export const NormalizedListingSchema = z.object({
  source: ListingSource,
  sourceId: z.string().min(1),
  url: z.string().url(),
  rawText: z.string().nullable().optional(),
  rawJson: z.unknown().optional(),
  contentHash: z.string().min(1),
  postedAt: z.date().nullable().optional(),
  authorName: z.string().nullable().optional(),
  authorProfile: z.string().nullable().optional(),
  sourceGroupUrl: z.string().nullable().optional(),
});
export type NormalizedListing = z.infer<typeof NormalizedListingSchema>;
