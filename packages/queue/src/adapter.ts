export interface CollectorResult {
  rawPayload: unknown;
  receivedCount: number;
  /** Optional per-collector counters surfaced in worker logs (e.g. unmapped markers). */
  metrics?: Record<string, number>;
}

export interface CollectorCityConfig {
  id: string;
  nameHe: string;
  nameEn: string;
  yad2FeedUrl: string | null;
  facebookGroupUrls: string[];
}

/** Catalog of cities reachable from a single Yad2 region — used by the Yad2
 *  adapter to resolve markers to the right cityId by Hebrew name match. */
export interface RegionCityCatalog {
  /** city id (e.g. "tel-aviv") */
  id: string;
  /** name_he as Yad2 emits it (or close — match is normalized: hyphens stripped, whitespace collapsed) */
  nameHe: string;
}

export interface CollectorRegionConfig {
  id: number;
  slug: string;
  nameHe: string;
  nameEn: string;
  feedUrl: string;
  cities: RegionCityCatalog[];
}

export interface CollectorAdapter<TConfig = CollectorCityConfig> {
  readonly source: "yad2" | "facebook";
  collect(config: TConfig): Promise<CollectorResult>;
}
