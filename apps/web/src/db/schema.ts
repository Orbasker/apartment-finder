import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const listings = pgTable(
  "listings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    priceNis: integer("price_nis"),
    rooms: real("rooms"),
    sqm: integer("sqm"),
    floor: integer("floor"),
    neighborhood: text("neighborhood"),
    street: text("street"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
    isAgency: boolean("is_agency"),
    authorName: text("author_name"),
    authorProfile: text("author_profile"),
    rawJson: jsonb("raw_json"),
    textHash: text("text_hash"),
  },
  (t) => ({
    sourceUnique: uniqueIndex("listings_source_unique").on(t.source, t.sourceId),
    ingestedAtIdx: index("listings_ingested_at_idx").on(t.ingestedAt.desc(), t.id.desc()),
    sourceIdx: index("listings_source_idx").on(t.source),
    priceIdx: index("listings_price_nis_idx").on(t.priceNis),
    roomsIdx: index("listings_rooms_idx").on(t.rooms),
  }),
);

export const judgments = pgTable(
  "judgments",
  {
    listingId: integer("listing_id").primaryKey(),
    score: integer("score"),
    decision: text("decision"),
    reasoning: text("reasoning"),
    redFlags: jsonb("red_flags").$type<string[]>(),
    positiveSignals: jsonb("positive_signals").$type<string[]>(),
    model: text("model"),
    judgedAt: timestamp("judged_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    decisionIdx: index("judgments_decision_idx").on(t.decision),
    scoreIdx: index("judgments_score_idx").on(t.score),
  }),
);

export const feedback = pgTable("feedback", {
  listingId: integer("listing_id").primaryKey(),
  rating: smallint("rating"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sentAlerts = pgTable(
  "sent_alerts",
  {
    listingId: integer("listing_id").notNull(),
    channel: text("channel").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.listingId, t.channel] }),
  }),
);

export const blockedAuthors = pgTable("blocked_authors", {
  profileUrl: text("profile_url").primaryKey(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const preferences = pgTable("preferences", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pendingPatches = pgTable("pending_patches", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolCallId: text("tool_call_id").notNull(),
  patch: jsonb("patch").notNull(),
  chatId: text("chat_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const monitoredGroups = pgTable("monitored_groups", {
  url: text("url").primaryKey(),
  label: text("label"),
  enabled: boolean("enabled").default(true).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    providerModel: text("provider_model"),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    reasoningTokens: integer("reasoning_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    estimatedCostUsd: real("estimated_cost_usd").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    createdAtIdx: index("ai_usage_created_at_idx").on(t.createdAt),
    featureIdx: index("ai_usage_feature_idx").on(t.feature),
  }),
);

export type MonitoredGroup = typeof monitoredGroups.$inferSelect;

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type JudgmentRow = typeof judgments.$inferSelect;
export type NewJudgmentRow = typeof judgments.$inferInsert;
export type AiUsageRow = typeof aiUsage.$inferSelect;
export type NewAiUsageRow = typeof aiUsage.$inferInsert;
