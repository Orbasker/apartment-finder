import type { CollectorAdapter, CollectorResult } from "@apartment-finder/queue";
import { contentHash } from "@apartment-finder/shared/contentHash";
import { fetchYad2Listings, type Yad2Listing } from "../scrapers/yad2.js";
import type { CollectedListing } from "../ingestion/insert.js";

function yad2ToCollected(l: Yad2Listing): CollectedListing {
  return {
    source: "yad2",
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

  async collect(): Promise<CollectorResult> {
    const listings = await fetchYad2Listings();
    const normalized: CollectedListing[] = listings.map(yad2ToCollected);
    return { rawPayload: normalized, receivedCount: normalized.length };
  }
}
