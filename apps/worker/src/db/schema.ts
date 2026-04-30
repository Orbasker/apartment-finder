import {
  bigserial,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
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
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Lean MVP schema. Flow: collect → extract → geocode → embed → unify → match.
// Boolean attributes live in a KV table with a Postgres enum key; structured
// fields live in dedicated columns; open-text in arrays/jsonb.
// ---------------------------------------------------------------------------

export const listingSourceEnum = pgEnum("listing_source", ["yad2", "facebook"]);

export const listingStatusEnum = pgEnum("listing_status", [
  "pending",
  "extracted",
  "geocoded",
  "embedded",
  "unified",
  "failed",
]);

export const apartmentAttributeKeyEnum = pgEnum("apartment_attribute_key", [
  "elevator",
  "parking",
  "balcony",
  "air_conditioning",
  "furnished",
  "renovated",
  "pet_friendly",
  "safe_room",
  "storage",
  "accessible",
  "bars",
  "ground_floor",
  "roof_access",
  "shared_apartment",
  "garden",
  "pool",
  "solar_water_heater",
]);

export const attributeRequirementEnum = pgEnum("attribute_requirement", [
  "required_true",
  "required_false",
  "preferred_true",
  "dont_care",
]);

export const attributeSourceEnum = pgEnum("attribute_source", ["ai", "user", "manual"]);

export const filterTextKindEnum = pgEnum("filter_text_kind", ["wish", "dealbreaker"]);

export const neighborhoodFilterKindEnum = pgEnum("neighborhood_filter_kind", [
  "allowed",
  "blocked",
]);

export const notificationDestinationEnum = pgEnum("notification_destination", [
  "email",
  "telegram",
]);

export const collectionRunStatusEnum = pgEnum("collection_run_status", [
  "queued",
  "collecting",
  "collected",
  "ingesting",
  "completed",
  "failed",
]);

export const collectionRuns = pgTable(
  "collection_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: text("run_id").notNull(),
    source: listingSourceEnum("source").notNull(),
    status: collectionRunStatusEnum("status").notNull().default("queued"),
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true }).notNull().defaultNow(),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    webhookReceivedAt: timestamp("webhook_received_at", { withTimezone: true }),
    rawBlobUrl: text("raw_blob_url"),
    receivedCount: integer("received_count").default(0).notNull(),
    inserted: integer("inserted").default(0).notNull(),
    skippedExisting: integer("skipped_existing").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),
    error: text("error"),
  },
  (t) => ({
    runIdUnique: uniqueIndex("collection_runs_run_id_unique").on(t.runId),
    sourceIdx: index("collection_runs_source_idx").on(t.source, t.enqueuedAt),
  }),
);
// ---------------------------------------------------------------------------
// listings: one row per source observation.
// ---------------------------------------------------------------------------

export const listings = pgTable(
  "listings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: listingSourceEnum("source").notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url").notNull(),
    rawText: text("raw_text"),
    rawJson: jsonb("raw_json"),
    contentHash: text("content_hash").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    authorName: text("author_name"),
    authorProfile: text("author_profile"),
    sourceGroupUrl: text("source_group_url"),
    status: listingStatusEnum("status").default("pending").notNull(),
    failureReason: text("failure_reason"),
    retries: smallint("retries").default(0).notNull(),
  },
  (t) => ({
    sourceUnique: uniqueIndex("listings_source_unique").on(t.source, t.sourceId),
    statusIdx: index("listings_status_idx").on(t.status),
    postedAtIdx: index("listings_posted_at_idx").on(t.postedAt.desc()),
  }),
);

// ---------------------------------------------------------------------------
// listing_extractions: AI-extracted structured fields per listing version.
// Includes the embedding used for unification.
// ---------------------------------------------------------------------------

export const listingExtractions = pgTable(
  "listing_extractions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").default(1).notNull(),
    model: text("model").notNull(),
    // Structured numeric/text fields
    priceNis: integer("price_nis"),
    rooms: real("rooms"),
    sqm: integer("sqm"),
    floor: integer("floor"),
    // Address - what the AI saw before geocoding.
    rawAddress: text("raw_address"),
    street: text("street"),
    houseNumber: text("house_number"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    // Geocoded - populated after Google Geocoding step.
    placeId: text("place_id"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    geocodeConfidence: text("geocode_confidence"),
    // Open-text
    description: text("description"),
    condition: text("condition"),
    // Misc
    isAgency: boolean("is_agency"),
    phoneE164: text("phone_e164"),
    // Additional structured fields shown in the email "מידע נוסף על הנכס" table.
    arnonaNis: integer("arnona_nis"),
    vaadBayitNis: integer("vaad_bayit_nis"),
    entryDate: text("entry_date"),
    balconySqm: integer("balcony_sqm"),
    totalFloors: integer("total_floors"),
    furnitureStatus: text("furniture_status"),
    extras: jsonb("extras"),
    // Embedding - gemini-embedding-001 at 1536 dims (HNSW supports up to 2000 for `vector`).
    embedding: vector("embedding", { dimensions: 1536 }),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    listingVersionUnique: uniqueIndex("listing_extractions_unique").on(
      t.listingId,
      t.schemaVersion,
    ),
    placeIdIdx: index("listing_extractions_place_id_idx").on(t.placeId),
    geoIdx: index("listing_extractions_geo_idx").on(t.lat, t.lon),
  }),
);

// ---------------------------------------------------------------------------
// listing_attributes: KV booleans. Absence-of-row = unknown; value column is
// NOT NULL true/false. This avoids 3-valued logic in the matcher SQL.
// ---------------------------------------------------------------------------

export const listingAttributes = pgTable(
  "listing_attributes",
  {
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    key: apartmentAttributeKeyEnum("key").notNull(),
    value: boolean("value").notNull(),
    source: attributeSourceEnum("source").default("ai").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.listingId, t.key] }),
    keyValueIdx: index("listing_attributes_key_value_idx").on(t.key, t.value),
  }),
);

// ---------------------------------------------------------------------------
// apartments: canonical dedup'd entity.
// ---------------------------------------------------------------------------

export const apartments = pgTable(
  "apartments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    placeId: text("place_id"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    formattedAddress: text("formatted_address"),
    street: text("street"),
    houseNumber: text("house_number"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    rooms: real("rooms"),
    sqm: integer("sqm"),
    floor: integer("floor"),
    priceNisLatest: integer("price_nis_latest"),
    primaryListingId: integer("primary_listing_id"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    placeIdIdx: index("apartments_place_id_idx").on(t.placeId),
    geoIdx: index("apartments_geo_idx").on(t.lat, t.lon),
  }),
);

// ---------------------------------------------------------------------------
// apartment_listings: M:N (one apartment → many listing observations). The
// reverse direction is enforced unique (one listing → one apartment).
// ---------------------------------------------------------------------------

export const apartmentListings = pgTable(
  "apartment_listings",
  {
    apartmentId: integer("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull(),
    matchedBy: text("matched_by").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.apartmentId, t.listingId] }),
    listingUnique: uniqueIndex("apartment_listings_listing_unique").on(t.listingId),
  }),
);

// ---------------------------------------------------------------------------
// user_filters: one row per user. Hot-path columns + arrays for fast SQL
// prefilter; attribute requirements normalized into a child table.
// ---------------------------------------------------------------------------

export const userFilters = pgTable("user_filters", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  priceMinNis: integer("price_min_nis"),
  priceMaxNis: integer("price_max_nis"),
  roomsMin: real("rooms_min"),
  roomsMax: real("rooms_max"),
  sqmMin: integer("sqm_min"),
  sqmMax: integer("sqm_max"),
  wishes: text("wishes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  dealbreakers: text("dealbreakers")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  // When a must-have attribute is unknown on a listing, false = notify (default,
  // user would rather over-see than miss); true = drop until confirmed.
  strictUnknowns: boolean("strict_unknowns").default(false).notNull(),
  dailyAlertCap: integer("daily_alert_cap").default(20).notNull(),
  maxAgeHours: integer("max_age_hours").default(48).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userFilterAttributes = pgTable(
  "user_filter_attributes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: apartmentAttributeKeyEnum("key").notNull(),
    requirement: attributeRequirementEnum("requirement").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.key] }),
    reqIdx: index("user_filter_attributes_req_idx").on(t.key, t.requirement),
  }),
);

// ---------------------------------------------------------------------------
// user_filter_cities: per-user city allowlist. Each row caches Google's
// place_id + display name from the time the user picked it; an empty list
// means "any city" (no filter), non-empty means "only these cities".
// ---------------------------------------------------------------------------

export const userFilterCities = pgTable(
  "user_filter_cities",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull(),
    nameHe: text("name_he").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.placeId] }),
  }),
);

// ---------------------------------------------------------------------------
// user_filter_neighborhoods: per-user allowed/blocked neighborhood selections.
// Each row caches Google's place_id + display name + city name from the time
// the user picked it; matching against listings is text-based on (name_he,
// city_name_he) since both sides come from Google's geocoder.
// ---------------------------------------------------------------------------

export const userFilterNeighborhoods = pgTable(
  "user_filter_neighborhoods",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cityPlaceId: text("city_place_id").notNull(),
    placeId: text("place_id").notNull(),
    nameHe: text("name_he").notNull(),
    // Denormalized from user_filter_cities for cheap match-time string compare
    // against apartments.city. Kept in sync via the form action / chat tools.
    cityNameHe: text("city_name_he").notNull(),
    kind: neighborhoodFilterKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.placeId, t.kind] }),
    userKindIdx: index("user_filter_neighborhoods_user_kind_idx").on(t.userId, t.kind),
    cityFk: foreignKey({
      columns: [t.userId, t.cityPlaceId],
      foreignColumns: [userFilterCities.userId, userFilterCities.placeId],
      name: "user_filter_neighborhoods_city_fk",
    }).onDelete("cascade"),
  }),
);

// Embedded wishes/dealbreakers - embed once at filter-save time, then cosine-
// compare to listing embedding at match time (advisory for wishes, gating for
// dealbreakers).
export const userFilterTexts = pgTable(
  "user_filter_texts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: filterTextKindEnum("kind").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userKindIdx: index("user_filter_texts_user_kind_idx").on(t.userId, t.kind),
  }),
);

// ---------------------------------------------------------------------------
// sent_alerts: outbox dedup. One alert per (user, apartment, destination) so
// the same listing can fan out to email and Telegram independently and we
// don't double-send if the same channel reruns.
// ---------------------------------------------------------------------------

export const sentAlerts = pgTable(
  "sent_alerts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apartmentId: integer("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    destination: notificationDestinationEnum("destination").default("email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    providerMessageId: text("provider_message_id"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.apartmentId, t.destination] }),
    sentAtIdx: index("sent_alerts_sent_at_idx").on(t.sentAt.desc()),
  }),
);

// ---------------------------------------------------------------------------
// user_notification_destinations: per-user toggles for each delivery channel,
// plus the Telegram chat binding once the user has linked the bot. 1:1 with
// `user`. CHECK constraint mirrored in the application layer keeps at least
// one channel enabled.
// ---------------------------------------------------------------------------

export const userNotificationDestinations = pgTable(
  "user_notification_destinations",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").default(true).notNull(),
    telegramEnabled: boolean("telegram_enabled").default(false).notNull(),
    telegramChatId: text("telegram_chat_id"),
    telegramLinkedAt: timestamp("telegram_linked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    telegramChatUnique: uniqueIndex("user_notification_destinations_telegram_chat_unique")
      .on(t.telegramChatId)
      .where(sql`${t.telegramChatId} IS NOT NULL`),
  }),
);

// ---------------------------------------------------------------------------
// telegram_link_tokens: short-lived tokens minted when a user starts the
// "connect Telegram" deep-link flow. The bot looks the token up on /start and
// binds the chat ID to the user. 15-minute TTL, single-use.
// ---------------------------------------------------------------------------

export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userExpiresIdx: index("telegram_link_tokens_user_expires_idx").on(t.userId, t.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// geocode_cache: keyed by normalized raw-address string. Cuts Google Geocoding
// calls roughly 60% in Tel Aviv where the same buildings re-list constantly.
// ---------------------------------------------------------------------------

export const geocodeCache = pgTable("geocode_cache", {
  addressKey: text("address_key").primaryKey(),
  placeId: text("place_id"),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  formattedAddress: text("formatted_address"),
  street: text("street"),
  houseNumber: text("house_number"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  confidence: text("confidence"),
  cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Preserved tables.
// ---------------------------------------------------------------------------

export const blockedAuthors = pgTable("blocked_authors", {
  profileUrl: text("profile_url").primaryKey(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

// ---------------------------------------------------------------------------
// Better Auth tables. UUID PKs with DB-side defaults.
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
// Row type exports.
// ---------------------------------------------------------------------------

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type ListingExtraction = typeof listingExtractions.$inferSelect;
export type NewListingExtraction = typeof listingExtractions.$inferInsert;
export type ListingAttribute = typeof listingAttributes.$inferSelect;
export type NewListingAttribute = typeof listingAttributes.$inferInsert;
export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;
export type ApartmentListing = typeof apartmentListings.$inferSelect;
export type NewApartmentListing = typeof apartmentListings.$inferInsert;
export type UserFilter = typeof userFilters.$inferSelect;
export type NewUserFilter = typeof userFilters.$inferInsert;
export type UserFilterAttribute = typeof userFilterAttributes.$inferSelect;
export type NewUserFilterAttribute = typeof userFilterAttributes.$inferInsert;
export type UserFilterText = typeof userFilterTexts.$inferSelect;
export type NewUserFilterText = typeof userFilterTexts.$inferInsert;
export type SentAlert = typeof sentAlerts.$inferSelect;
export type NewSentAlert = typeof sentAlerts.$inferInsert;
export type UserNotificationDestinations = typeof userNotificationDestinations.$inferSelect;
export type NewUserNotificationDestinations = typeof userNotificationDestinations.$inferInsert;
export type TelegramLinkToken = typeof telegramLinkTokens.$inferSelect;
export type NewTelegramLinkToken = typeof telegramLinkTokens.$inferInsert;
export type GeocodeCache = typeof geocodeCache.$inferSelect;
export type NewGeocodeCache = typeof geocodeCache.$inferInsert;
export type UserFilterCity = typeof userFilterCities.$inferSelect;
export type NewUserFilterCity = typeof userFilterCities.$inferInsert;
export type UserFilterNeighborhood = typeof userFilterNeighborhoods.$inferSelect;
export type NewUserFilterNeighborhood = typeof userFilterNeighborhoods.$inferInsert;
export type AiUsageRow = typeof aiUsage.$inferSelect;
export type NewAiUsageRow = typeof aiUsage.$inferInsert;
