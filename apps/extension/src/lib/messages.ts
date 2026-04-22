import type { ExtensionScrapedPost } from "@apartment-finder/shared";

export type ScrapedPostsMessage = {
  kind: "scraped-posts";
  posts: ExtensionScrapedPost[];
};

export type IngestResultMessage = {
  kind: "ingest-result";
  ok: boolean;
  status?: number;
  error?: string;
  received?: number;
  inserted?: number;
  alerted?: number;
};

export type Message = ScrapedPostsMessage | IngestResultMessage;
