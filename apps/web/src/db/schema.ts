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
    sourceGroupUrl: text("source_group_url"),
  },
  (t) => ({
    sourceUnique: uniqueIndex("listings_source_unique").on(t.source, t.sourceId),
    sourceGroupUrlIdx: index("listings_source_group_url_idx").on(t.sourceGroupUrl),
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

export const feedback = pgTable(
  "feedback",
  {
    listingId: integer("listing_id").notNull(),
    userId: uuid("user_id").notNull(),
    rating: smallint("rating"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.listingId, t.userId] }),
  }),
);

export const sentAlerts = pgTable(
  "sent_alerts",
  {
    listingId: integer("listing_id").notNull(),
    channel: text("channel").notNull(),
    userId: uuid("user_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.listingId, t.channel, t.userId] }),
  }),
);

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
// FK columns elsewhere in this schema. Better Auth pre-computes UUIDs via
// `advanced.database.generateId: "uuid"` in `lib/auth.ts`, so no DB-side
// default is needed here.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: uuid("id").primaryKey(),
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
  id: uuid("id").primaryKey(),
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
  id: uuid("id").primaryKey(),
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
  id: uuid("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MonitoredGroup = typeof monitoredGroups.$inferSelect;

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type JudgmentRow = typeof judgments.$inferSelect;
export type NewJudgmentRow = typeof judgments.$inferInsert;
export type AiUsageRow = typeof aiUsage.$inferSelect;
export type NewAiUsageRow = typeof aiUsage.$inferInsert;
export type UserGroupSubscription = typeof userGroupSubscriptions.$inferSelect;
export type TelegramLink = typeof telegramLinks.$inferSelect;
export type TelegramLinkToken = typeof telegramLinkTokens.$inferSelect;
