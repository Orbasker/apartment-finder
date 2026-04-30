import type {
  CollectorAdapter,
  CollectorCityConfig,
  CollectorResult,
} from "@apartment-finder/queue";
import { contentHash } from "@apartment-finder/shared/contentHash";
import { fetchYad2Listings, type Yad2Listing } from "../scrapers/yad2.js";
import type { CollectedListing } from "../ingestion/insert.js";

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

export class Yad2Adapter implements CollectorAdapter {
  readonly source = "yad2" as const;

  async collect(city: CollectorCityConfig): Promise<CollectorResult> {
    if (!city.yad2FeedUrl) return { rawPayload: [], receivedCount: 0 };
    const listings = await fetchYad2Listings({ feedUrl: city.yad2FeedUrl });
    const normalized: CollectedListing[] = listings.map((listing) =>
      yad2ToCollected(listing, city.id),
    );
    return { rawPayload: normalized, receivedCount: normalized.length };
  }
}
