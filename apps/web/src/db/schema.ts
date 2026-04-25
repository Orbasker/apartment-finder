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
  vector,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Three-layer pipeline (P1):
//   raw_posts           — immutable per-source observation
//   extractions         — versioned AI output (one per raw post per schema_version)
//   canonical_apartments — one row per real-world apartment
// Plus: canonical_attributes (merged tri-state amenities), apartment_sources
// (M:N), merge_candidates (review queue).
// ---------------------------------------------------------------------------

export const rawPosts = pgTable(
  "raw_posts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url").notNull(),
    rawJson: jsonb("raw_json"),
    rawText: text("raw_text"),
    contentHash: text("content_hash"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    sourceGroupUrl: text("source_group_url"),
    authorName: text("author_name"),
    authorProfile: text("author_profile"),
    extractionStatus: text("extraction_status").default("pending").notNull(),
  },
  (t) => ({
    sourceUnique: uniqueIndex("raw_posts_source_unique").on(t.source, t.sourceId),
    extractionStatusIdx: index("raw_posts_extraction_status_idx").on(t.extractionStatus),
    fetchedAtIdx: index("raw_posts_fetched_at_idx").on(t.fetchedAt.desc()),
    sourceIdx: index("raw_posts_source_idx").on(t.source),
  }),
);

export const extractions = pgTable(
  "extractions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rawPostId: integer("raw_post_id")
      .notNull()
      .references(() => rawPosts.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").default(1).notNull(),
    model: text("model"),
    // Core typed fields.
    priceNis: integer("price_nis"),
    rooms: real("rooms"),
    sqm: integer("sqm"),
    floor: integer("floor"),
    street: text("street"),
    houseNumber: text("house_number"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    condition: text("condition"),
    isAgency: boolean("is_agency"),
    phoneE164: text("phone_e164"),
    // Tri-state amenity flags (NULL = unknown). Snake_case mirrors AMENITY_KEYS.
    hasElevator: boolean("has_elevator"),
    hasParking: boolean("has_parking"),
    hasBalcony: boolean("has_balcony"),
    hasAirConditioning: boolean("has_air_conditioning"),
    hasFurnished: boolean("has_furnished"),
    hasRenovated: boolean("has_renovated"),
    hasPetFriendly: boolean("has_pet_friendly"),
    hasSafeRoom: boolean("has_safe_room"),
    hasStorage: boolean("has_storage"),
    hasAccessible: boolean("has_accessible"),
    hasBars: boolean("has_bars"),
    extras: jsonb("extras"),
    // pgvector embedding. The CREATE EXTENSION + ALTER TABLE are handled by the
    // manual reset SQL; Drizzle generates `vector(768)` here for type safety.
    embedding: vector("embedding", { dimensions: 768 }),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    rawPostVersionUnique: uniqueIndex("extractions_raw_post_id_schema_version_unique").on(
      t.rawPostId,
      t.schemaVersion,
    ),
    rawPostIdIdx: index("extractions_raw_post_id_idx").on(t.rawPostId),
  }),
);

export const canonicalApartments = pgTable(
  "canonical_apartments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    primaryAddress: text("primary_address"),
    street: text("street"),
    houseNumber: text("house_number"),
    city: text("city"),
    neighborhood: text("neighborhood"),
    rooms: real("rooms"),
    sqm: integer("sqm"),
    matchKey: text("match_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    matchKeyIdx: index("canonical_apartments_match_key_idx").on(t.matchKey),
  }),
);

export const canonicalAttributes = pgTable("canonical_attributes", {
  canonicalId: integer("canonical_id")
    .primaryKey()
    .references(() => canonicalApartments.id, { onDelete: "cascade" }),
  hasElevator: boolean("has_elevator"),
  hasParking: boolean("has_parking"),
  hasBalcony: boolean("has_balcony"),
  hasAirConditioning: boolean("has_air_conditioning"),
  hasFurnished: boolean("has_furnished"),
  hasRenovated: boolean("has_renovated"),
  hasPetFriendly: boolean("has_pet_friendly"),
  hasSafeRoom: boolean("has_safe_room"),
  hasStorage: boolean("has_storage"),
  hasAccessible: boolean("has_accessible"),
  hasBars: boolean("has_bars"),
  extras: jsonb("extras"),
  lastMergedAt: timestamp("last_merged_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apartmentSources = pgTable(
  "apartment_sources",
  {
    canonicalId: integer("canonical_id")
      .notNull()
      .references(() => canonicalApartments.id, { onDelete: "cascade" }),
    extractionId: integer("extraction_id")
      .notNull()
      .references(() => extractions.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.canonicalId, t.extractionId] }),
  }),
);

export const mergeCandidates = pgTable(
  "merge_candidates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    extractionId: integer("extraction_id")
      .notNull()
      .references(() => extractions.id, { onDelete: "cascade" }),
    canonicalId: integer("canonical_id")
      .notNull()
      .references(() => canonicalApartments.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    status: text("status").default("pending").notNull(),
    reviewedBy: uuid("reviewed_by").references(() => user.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("merge_candidates_status_idx").on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// Existing tables that get FK-rebound from listing_id → canonical_id.
// They restart empty (the manual reset SQL drops them so Drizzle re-creates
// them with the new shape on the next push).
// ---------------------------------------------------------------------------

export const judgments = pgTable(
  "judgments",
  {
    canonicalId: integer("canonical_id")
      .primaryKey()
      .references(() => canonicalApartments.id, { onDelete: "cascade" }),
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

export const feedback = pgTable(
  "feedback",
  {
    canonicalId: integer("canonical_id")
      .notNull()
      .references(() => canonicalApartments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rating: smallint("rating"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.canonicalId, t.userId] }),
  }),
);

export const sentAlerts = pgTable(
  "sent_alerts",
  {
    canonicalId: integer("canonical_id").notNull(),
    channel: text("channel").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.canonicalId, t.channel, t.userId] }),
  }),
);

// ---------------------------------------------------------------------------
// Preserved tables — unchanged from pre-P1.
// ---------------------------------------------------------------------------

export const blockedAuthors = pgTable("blocked_authors", {
  profileUrl: text("profile_url").primaryKey(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const preferences = pgTable("preferences", {
  userId: uuid("user_id").primaryKey(),
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
  addedBy: uuid("added_by"),
});

export const userGroupSubscriptions = pgTable(
  "user_group_subscriptions",
  {
    userId: uuid("user_id").notNull(),
    groupUrl: text("group_url").notNull(),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.groupUrl] }),
  }),
);

export const telegramLinks = pgTable(
  "telegram_links",
  {
    chatId: text("chat_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index("telegram_links_user_id_idx").on(t.userId),
  }),
);

export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index("telegram_link_tokens_user_id_idx").on(t.userId),
  }),
);

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

// ---------------------------------------------------------------------------
// Better Auth tables. IDs are UUIDs to match the existing `uuid("user_id")`
// FK columns elsewhere in this schema. With the Postgres Drizzle adapter,
// Better Auth relies on DB-side UUID defaults for models it creates internally.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("user").notNull(),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  impersonatedBy: uuid("impersonated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Type exports.
// ---------------------------------------------------------------------------

export type MonitoredGroup = typeof monitoredGroups.$inferSelect;

export type RawPost = typeof rawPosts.$inferSelect;
export type NewRawPost = typeof rawPosts.$inferInsert;
export type Extraction = typeof extractions.$inferSelect;
export type NewExtraction = typeof extractions.$inferInsert;
export type CanonicalApartment = typeof canonicalApartments.$inferSelect;
export type NewCanonicalApartment = typeof canonicalApartments.$inferInsert;
export type CanonicalAttributes = typeof canonicalAttributes.$inferSelect;
export type NewCanonicalAttributes = typeof canonicalAttributes.$inferInsert;
export type ApartmentSource = typeof apartmentSources.$inferSelect;
export type NewApartmentSource = typeof apartmentSources.$inferInsert;
export type MergeCandidate = typeof mergeCandidates.$inferSelect;
export type NewMergeCandidate = typeof mergeCandidates.$inferInsert;

export type JudgmentRow = typeof judgments.$inferSelect;
export type NewJudgmentRow = typeof judgments.$inferInsert;
export type AiUsageRow = typeof aiUsage.$inferSelect;
export type NewAiUsageRow = typeof aiUsage.$inferInsert;
export type UserGroupSubscription = typeof userGroupSubscriptions.$inferSelect;
export type TelegramLink = typeof telegramLinks.$inferSelect;
export type TelegramLinkToken = typeof telegramLinkTokens.$inferSelect;
