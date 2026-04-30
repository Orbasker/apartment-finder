export interface CollectorResult {
  rawPayload: unknown;
  receivedCount: number;
}

export interface CollectorCityConfig {
  id: string;
  nameHe: string;
  nameEn: string;
  yad2FeedUrl: string | null;
  facebookGroupUrls: string[];
}

export interface CollectorAdapter {
  readonly source: "yad2" | "facebook";
  collect(city: CollectorCityConfig): Promise<CollectorResult>;
}
