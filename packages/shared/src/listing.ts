import { z } from "zod";

export const ListingSource = z.enum(["yad2", "fb_apify", "fb_ext"]);
export type ListingSource = z.infer<typeof ListingSource>;

export const NormalizedListingSchema = z.object({
  source: ListingSource,
  sourceId: z.string().min(1),
  url: z.string().url(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  priceNis: z.number().int().nullable().optional(),
  rooms: z.number().nullable().optional(),
  sqm: z.number().int().nullable().optional(),
  floor: z.number().int().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  postedAt: z.date().nullable().optional(),
  isAgency: z.boolean().nullable().optional(),
  authorName: z.string().nullable().optional(),
  authorProfile: z.string().nullable().optional(),
  rawJson: z.unknown().optional(),
});

export type NormalizedListing = z.infer<typeof NormalizedListingSchema>;
