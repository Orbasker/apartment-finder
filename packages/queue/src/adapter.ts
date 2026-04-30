export interface CollectorResult {
  rawPayload: unknown;
  receivedCount: number;
}

export interface CollectorAdapter {
  readonly source: "yad2" | "facebook";
  collect(): Promise<CollectorResult>;
}
