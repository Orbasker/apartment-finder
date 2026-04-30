export type ListingSource = "yad2" | "facebook";

/** Nullable everywhere — the AI extraction pipeline can leave gaps. */
export type MatchedListing = {
  id: number;
  alertedAt: Date;
  lat: number | null;
  lon: number | null;
  formattedAddress: string | null;
  neighborhood: string | null;
  city: string | null;
  priceNis: number | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  sourceUrl: string | null;
  source: ListingSource | null;
  postedAt: Date | null;
};

export type MatchedListingsResult = {
  rows: MatchedListing[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type MatchedListingsMapResult = {
  rows: MatchedListing[];
  total: number;
  noLocationCount: number;
};
