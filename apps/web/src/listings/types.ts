// Row + result shape consumed by both the future table and map views on the
// /listings page. Server-shaped, narrow (no embeddings, no raw text).
//
// All numeric/string fields are nullable because the AI extraction pipeline
// can leave gaps. Renderers must handle null for every column.

export type MatchedListing = {
  /** apartments.id */
  id: number;
  /** sent_alerts.sentAt aggregated as MAX() per apartment — primary sort key */
  alertedAt: Date;
  // Geo (nullable because extractions/geocoding can fail)
  lat: number | null;
  lon: number | null;
  // Display
  formattedAddress: string | null;
  neighborhood: string | null;
  city: string | null;
  // Numeric facts
  priceNis: number | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  // Source link for the row's "view source" affordance
  sourceUrl: string | null;
};

export type MatchedListingsResult = {
  rows: MatchedListing[];
  /** Total distinct matched apartments for this user (for pagination UI). */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
