import type {
  CollectorAdapter,
  CollectorRegionConfig,
  CollectorResult,
} from "@apartment-finder/queue";
import { contentHash } from "@apartment-finder/shared/contentHash";
import { fetchYad2Listings, type Yad2Listing } from "../scrapers/yad2.js";
import type { CollectedListing } from "../ingestion/insert.js";
import { createLogger } from "../lib/log.js";

const log = createLogger("adapter:yad2");

/**
 * Match-time normalization for Hebrew city names. Yad2 emits names without the
 * gov.il-style hyphen (e.g. "תל אביב יפו" vs our seed "תל אביב-יפו"). Strip
 * hyphens (ASCII + Hebrew maqaf), collapse whitespace, lowercase to be safe.
 */
export function normalizeCityName(input: string): string {
  return input.replace(/[-־]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function yad2ToCollected(l: Yad2Listing, cityId: string): CollectedListing {
  return {
    source: "yad2",
    cityId,
    sourceId: l.sourceId,
    url: l.url,
    rawText: null,
    rawJson: l.rawJson,
    contentHash: contentHash(l.rawJson ?? l.url),
    postedAt: l.postedAt,
    authorName: l.authorName,
    authorProfile: l.authorProfile,
  };
}

/**
 * Pull `address.city.text` off the raw marker payload. Adapters that build on
 * top of `Yad2Listing` lose this field (it's flattened away), so we read it
 * directly from `rawJson`.
 */
function extractMarkerCityName(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const addr = (rawJson as { address?: unknown }).address;
  if (!addr || typeof addr !== "object") return null;
  const city = (addr as { city?: unknown }).city;
  if (!city || typeof city !== "object") return null;
  const text = (city as { text?: unknown }).text;
  return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
}

export class Yad2Adapter implements CollectorAdapter<CollectorRegionConfig> {
  readonly source = "yad2" as const;

  async collect(region: CollectorRegionConfig): Promise<CollectorResult> {
    const listings = await fetchYad2Listings({ feedUrl: region.feedUrl });

    // Build normalized lookup once: normalize(name_he) -> cityId.
    const nameToCityId = new Map<string, string>();
    for (const c of region.cities) {
      nameToCityId.set(normalizeCityName(c.nameHe), c.id);
    }

    const collected: CollectedListing[] = [];
    let unmapped = 0;
    let missingCityField = 0;
    const unmappedSamples = new Set<string>();

    for (const listing of listings) {
      const rawCityName = extractMarkerCityName(listing.rawJson);
      if (!rawCityName) {
        missingCityField++;
        continue;
      }
      const cityId = nameToCityId.get(normalizeCityName(rawCityName));
      if (!cityId) {
        unmapped++;
        if (unmappedSamples.size < 5) unmappedSamples.add(rawCityName);
        continue;
      }
      collected.push(yad2ToCollected(listing, cityId));
    }

    if (unmapped > 0 || missingCityField > 0) {
      log.warn("yad2 markers dropped", {
        regionId: region.id,
        regionSlug: region.slug,
        total: listings.length,
        kept: collected.length,
        unmapped,
        missingCityField,
        unmappedSamples: Array.from(unmappedSamples).join(","),
      });
    }

    return {
      rawPayload: collected,
      receivedCount: collected.length,
      metrics: {
        yad2_total: listings.length,
        yad2_kept: collected.length,
        yad2_unmapped_city: unmapped,
        yad2_missing_city_field: missingCityField,
      },
    };
  }
}
