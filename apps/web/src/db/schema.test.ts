import { describe, expect, test } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, type IndexedColumn, type PgVector } from "drizzle-orm/pg-core";
import { APARTMENT_ATTRIBUTE_KEYS } from "@apartment-finder/shared";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// Schema pin tests for the lean MVP rebuild. Introspect the Drizzle table
// definitions; do not connect to Postgres.
// ---------------------------------------------------------------------------

function columnNames(table: ReturnType<typeof getTableColumns>) {
  return Object.values(table).map((col) => (col as { name: string }).name);
}

describe("schema: legacy tables removed", () => {
  test("rawPosts / extractions / canonicalApartments / judgments / etc. are gone", () => {
    const s = schema as Record<string, unknown>;
    expect(s.rawPosts).toBeUndefined();
    expect(s.extractions).toBeUndefined();
    expect(s.canonicalApartments).toBeUndefined();
    expect(s.canonicalAttributes).toBeUndefined();
    expect(s.apartmentSources).toBeUndefined();
    expect(s.mergeCandidates).toBeUndefined();
    expect(s.judgments).toBeUndefined();
    expect(s.feedback).toBeUndefined();
    expect(s.preferences).toBeUndefined();
    expect(s.pendingPatches).toBeUndefined();
    expect(s.monitoredGroups).toBeUndefined();
    expect(s.userGroupSubscriptions).toBeUndefined();
    // Telegram came back in APA-7, but as a different shape: a single
    // `telegram_link_tokens` table for the deep-link flow plus
    // `user_notification_destinations` for the per-user channel toggles.
    // The pre-PR1 `telegramLinks` table is still gone.
    expect(s.telegramLinks).toBeUndefined();
  });
});

describe("schema: enums", () => {
  test("listing_source enum exposes yad2 + facebook only", () => {
    expect(schema.listingSourceEnum.enumValues).toEqual(["yad2", "facebook"]);
  });

  test("listing_status enum covers the full pipeline progression", () => {
    expect(schema.listingStatusEnum.enumValues).toEqual([
      "pending",
      "extracted",
      "geocoded",
      "embedded",
      "unified",
      "failed",
    ]);
  });

  test("apartment_attribute_key enum matches the shared constant", () => {
    expect([...schema.apartmentAttributeKeyEnum.enumValues]).toEqual([...APARTMENT_ATTRIBUTE_KEYS]);
  });

  test("attribute_requirement enum lists the 4 supported requirements", () => {
    expect(schema.attributeRequirementEnum.enumValues).toEqual([
      "required_true",
      "required_false",
      "preferred_true",
      "dont_care",
    ]);
  });
});

describe("schema: listings", () => {
  test("table exists with the expected columns", () => {
    expect(schema.listings).toBeDefined();
    expect(getTableName(schema.listings)).toBe("listings");
    const names = columnNames(getTableColumns(schema.listings));
    for (const f of [
      "id",
      "source",
      "source_id",
      "url",
      "raw_text",
      "raw_json",
      "content_hash",
      "posted_at",
      "fetched_at",
      "author_name",
      "author_profile",
      "source_group_url",
      "status",
      "failure_reason",
      "retries",
    ]) {
      expect(names).toContain(f);
    }
  });

  test("source / source_id / url / content_hash / status / retries are NOT NULL", () => {
    const cols = getTableColumns(schema.listings);
    expect(cols.source.notNull).toBe(true);
    expect(cols.sourceId.notNull).toBe(true);
    expect(cols.url.notNull).toBe(true);
    expect(cols.contentHash.notNull).toBe(true);
    expect(cols.status.notNull).toBe(true);
    expect(cols.retries.notNull).toBe(true);
  });

  test("status defaults to 'pending'", () => {
    const cols = getTableColumns(schema.listings);
    expect((cols.status as unknown as { default: unknown }).default).toBe("pending");
  });

  test("unique index on (source, source_id)", () => {
    const cfg = getTableConfig(schema.listings);
    const unique = cfg.indexes.find((idx) => idx.config.unique === true);
    expect(unique).toBeDefined();
    const cols = unique!.config.columns.map((c) => (c as IndexedColumn).name);
    expect(cols).toEqual(["source", "source_id"]);
  });
});

describe("schema: listing_extractions", () => {
  test("table exists with structured + geocoded + embedding columns", () => {
    expect(schema.listingExtractions).toBeDefined();
    const names = columnNames(getTableColumns(schema.listingExtractions));
    for (const f of [
      "id",
      "listing_id",
      "schema_version",
      "model",
      "price_nis",
      "rooms",
      "sqm",
      "floor",
      "raw_address",
      "street",
      "house_number",
      "neighborhood",
      "city",
      "place_id",
      "lat",
      "lon",
      "geocode_confidence",
      "description",
      "condition",
      "is_agency",
      "phone_e164",
      "extras",
      "embedding",
      "extracted_at",
    ]) {
      expect(names).toContain(f);
    }
  });

  test("listing_id is NOT NULL and cascades", () => {
    const cfg = getTableConfig(schema.listingExtractions);
    const cols = getTableColumns(schema.listingExtractions);
    expect(cols.listingId.notNull).toBe(true);
    const fk = cfg.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "listing_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("cascade");
  });

  test("embedding column is pgvector with 1536 dimensions", () => {
    const cols = getTableColumns(schema.listingExtractions);
    const embedding = cols.embedding as unknown as PgVector<never>;
    expect(embedding.columnType).toBe("PgVector");
    expect(embedding.dimensions).toBe(1536);
  });

  test("unique index on (listing_id, schema_version)", () => {
    const cfg = getTableConfig(schema.listingExtractions);
    const unique = cfg.indexes.find((idx) => idx.config.unique === true);
    expect(unique).toBeDefined();
    const cols = unique!.config.columns.map((c) => (c as IndexedColumn).name);
    expect(cols).toContain("listing_id");
    expect(cols).toContain("schema_version");
  });
});

describe("schema: listing_attributes (KV booleans)", () => {
  test("composite PK on (listing_id, key)", () => {
    const cfg = getTableConfig(schema.listingAttributes);
    expect(cfg.primaryKeys).toHaveLength(1);
    const pk = cfg.primaryKeys[0]!.columns.map((c) => c.name).sort();
    expect(pk).toEqual(["key", "listing_id"]);
  });

  test("value column is NOT NULL boolean (absence = unknown, NOT 3-valued)", () => {
    const cols = getTableColumns(schema.listingAttributes);
    expect(cols.value.notNull).toBe(true);
    expect(cols.value.columnType).toBe("PgBoolean");
  });

  test("source defaults to 'ai'", () => {
    const cols = getTableColumns(schema.listingAttributes);
    expect((cols.source as unknown as { default: unknown }).default).toBe("ai");
  });
});

describe("schema: apartments", () => {
  test("table exists with geocoded address columns", () => {
    expect(schema.apartments).toBeDefined();
    const names = columnNames(getTableColumns(schema.apartments));
    for (const f of [
      "id",
      "place_id",
      "lat",
      "lon",
      "formatted_address",
      "street",
      "house_number",
      "neighborhood",
      "city",
      "rooms",
      "sqm",
      "floor",
      "price_nis_latest",
      "primary_listing_id",
      "first_seen_at",
      "last_seen_at",
    ]) {
      expect(names).toContain(f);
    }
  });
});

describe("schema: apartment_listings (M:N)", () => {
  test("composite PK + listing_id unique (1 listing → 1 apartment)", () => {
    const cfg = getTableConfig(schema.apartmentListings);
    expect(cfg.primaryKeys).toHaveLength(1);
    const pk = cfg.primaryKeys[0]!.columns.map((c) => c.name).sort();
    expect(pk).toEqual(["apartment_id", "listing_id"]);
    const listingUnique = cfg.indexes.find(
      (idx) =>
        idx.config.unique === true &&
        idx.config.columns.length === 1 &&
        (idx.config.columns[0] as IndexedColumn).name === "listing_id",
    );
    expect(listingUnique).toBeDefined();
  });

  test("FKs cascade", () => {
    const cfg = getTableConfig(schema.apartmentListings);
    expect(cfg.foreignKeys).toHaveLength(2);
    for (const fk of cfg.foreignKeys) {
      expect(fk.onDelete).toBe("cascade");
    }
  });
});

describe("schema: user_filters + user_filter_attributes", () => {
  test("user_filters keyed by user_id, with hot-path columns", () => {
    const cfg = getTableConfig(schema.userFilters);
    const cols = getTableColumns(schema.userFilters);
    expect(cols.userId.primary).toBe(true);
    const names = columnNames(cols);
    for (const f of [
      "price_min_nis",
      "price_max_nis",
      "rooms_min",
      "rooms_max",
      "sqm_min",
      "sqm_max",
      "wishes",
      "dealbreakers",
      "strict_unknowns",
      "daily_alert_cap",
      "max_age_hours",
      "is_active",
      "onboarded_at",
      "updated_at",
    ]) {
      expect(names).toContain(f);
    }
    // Replaced by user_filter_neighborhoods join table.
    expect(names).not.toContain("allowed_neighborhoods");
    expect(names).not.toContain("blocked_neighborhoods");
    // user_id FK cascades from user.id
    const userFk = cfg.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "user_id"),
    );
    expect(userFk).toBeDefined();
    expect(userFk!.onDelete).toBe("cascade");
  });

  test("user_filter_attributes composite PK on (user_id, key)", () => {
    const cfg = getTableConfig(schema.userFilterAttributes);
    expect(cfg.primaryKeys).toHaveLength(1);
    const pk = cfg.primaryKeys[0]!.columns.map((c) => c.name).sort();
    expect(pk).toEqual(["key", "user_id"]);
  });
});

describe("schema: user_filter_texts (embedded wishes/dealbreakers)", () => {
  test("table has user_id + kind + text + embedding columns", () => {
    expect(schema.userFilterTexts).toBeDefined();
    const names = columnNames(getTableColumns(schema.userFilterTexts));
    for (const f of ["id", "user_id", "kind", "text", "embedding", "created_at"]) {
      expect(names).toContain(f);
    }
  });

  test("embedding column is pgvector(1536)", () => {
    const cols = getTableColumns(schema.userFilterTexts);
    const embedding = cols.embedding as unknown as PgVector<never>;
    expect(embedding.columnType).toBe("PgVector");
    expect(embedding.dimensions).toBe(1536);
  });
});

describe("schema: sent_alerts", () => {
  test("composite PK on (user_id, apartment_id, destination) for per-channel dedup", () => {
    const cfg = getTableConfig(schema.sentAlerts);
    expect(cfg.primaryKeys).toHaveLength(1);
    const pk = cfg.primaryKeys[0]!.columns.map((c) => c.name).sort();
    expect(pk).toEqual(["apartment_id", "destination", "user_id"]);
  });

  test("both FKs cascade", () => {
    const cfg = getTableConfig(schema.sentAlerts);
    expect(cfg.foreignKeys.length).toBeGreaterThanOrEqual(2);
    for (const fk of cfg.foreignKeys) {
      expect(fk.onDelete).toBe("cascade");
    }
  });

  test("destination column exists with default 'email'", () => {
    const cols = getTableColumns(schema.sentAlerts);
    expect(cols.destination).toBeDefined();
    expect(cols.destination.notNull).toBe(true);
    expect((cols.destination as unknown as { default: unknown }).default).toBe("email");
  });
});

describe("schema: user_notification_destinations", () => {
  test("table exists with expected columns + 1:1 user PK", () => {
    expect(schema.userNotificationDestinations).toBeDefined();
    const cols = getTableColumns(schema.userNotificationDestinations);
    expect(cols.userId.primary).toBe(true);
    const names = columnNames(cols);
    for (const f of [
      "user_id",
      "email_enabled",
      "telegram_enabled",
      "telegram_chat_id",
      "telegram_linked_at",
      "updated_at",
    ]) {
      expect(names).toContain(f);
    }
  });

  test("email default true, telegram default false", () => {
    const cols = getTableColumns(schema.userNotificationDestinations);
    expect((cols.emailEnabled as unknown as { default: unknown }).default).toBe(true);
    expect((cols.telegramEnabled as unknown as { default: unknown }).default).toBe(false);
  });
});

describe("schema: telegram_link_tokens", () => {
  test("token PK + userId FK cascades", () => {
    expect(schema.telegramLinkTokens).toBeDefined();
    const cols = getTableColumns(schema.telegramLinkTokens);
    expect(cols.token.primary).toBe(true);
    const cfg = getTableConfig(schema.telegramLinkTokens);
    const userFk = cfg.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "user_id"),
    );
    expect(userFk).toBeDefined();
    expect(userFk!.onDelete).toBe("cascade");
  });
});

describe("schema: geocode_cache", () => {
  test("address_key is the primary key", () => {
    const cols = getTableColumns(schema.geocodeCache);
    expect(cols.addressKey.primary).toBe(true);
  });
});

describe("schema: neighborhoods (gov.il)", () => {
  test("neighborhood_filter_kind enum exposes allowed + blocked", () => {
    expect(schema.neighborhoodFilterKindEnum.enumValues).toEqual(["allowed", "blocked"]);
  });

  test("neighborhoods table has the expected columns and PK", () => {
    expect(schema.neighborhoods).toBeDefined();
    const cols = getTableColumns(schema.neighborhoods);
    expect(cols.id.primary).toBe(true);
    const names = columnNames(cols);
    for (const f of [
      "id",
      "city_code",
      "city_name_he",
      "name_he",
      "name_en",
      "center_lat",
      "center_lon",
      "google_place_id",
      "source",
      "updated_at",
    ]) {
      expect(names).toContain(f);
    }
  });

  test("user_filter_neighborhoods composite PK on (user_id, neighborhood_id, kind)", () => {
    const cfg = getTableConfig(schema.userFilterNeighborhoods);
    expect(cfg.primaryKeys).toHaveLength(1);
    const pk = cfg.primaryKeys[0]!.columns.map((c) => c.name).sort();
    expect(pk).toEqual(["kind", "neighborhood_id", "user_id"]);
  });

  test("user_filter_neighborhoods FKs cascade", () => {
    const cfg = getTableConfig(schema.userFilterNeighborhoods);
    expect(cfg.foreignKeys.length).toBeGreaterThanOrEqual(2);
    for (const fk of cfg.foreignKeys) {
      expect(fk.onDelete).toBe("cascade");
    }
  });

  test("apartments and listing_extractions carry a nullable neighborhood_id FK", () => {
    const apt = getTableColumns(schema.apartments);
    expect(columnNames(apt)).toContain("neighborhood_id");
    expect(apt.neighborhoodId.notNull).toBe(false);
    const ext = getTableColumns(schema.listingExtractions);
    expect(columnNames(ext)).toContain("neighborhood_id");
    expect(ext.neighborhoodId.notNull).toBe(false);
  });
});

describe("schema: preserved tables", () => {
  test("Better Auth tables are still exported with UUID defaults", () => {
    for (const table of [schema.user, schema.session, schema.account, schema.verification]) {
      expect(table).toBeDefined();
      const cols = getTableColumns(table);
      expect(cols.id.hasDefault).toBe(true);
    }
  });

  test("blockedAuthors and aiUsage still exported", () => {
    expect(schema.blockedAuthors).toBeDefined();
    expect(schema.aiUsage).toBeDefined();
  });
});

describe("schema: type exports compile", () => {
  test("new pipeline types resolve at the type level", () => {
    const _l: schema.Listing | null = null;
    const _nl: schema.NewListing | null = null;
    const _le: schema.ListingExtraction | null = null;
    const _la: schema.ListingAttribute | null = null;
    const _a: schema.Apartment | null = null;
    const _al: schema.ApartmentListing | null = null;
    const _uf: schema.UserFilter | null = null;
    const _ufa: schema.UserFilterAttribute | null = null;
    const _uft: schema.UserFilterText | null = null;
    const _sa: schema.SentAlert | null = null;
    const _und: schema.UserNotificationDestinations | null = null;
    const _tlt: schema.TelegramLinkToken | null = null;
    const _gc: schema.GeocodeCache | null = null;
    expect(
      [_l, _nl, _le, _la, _a, _al, _uf, _ufa, _uft, _sa, _und, _tlt, _gc].every((v) => v === null),
    ).toBe(true);
  });
});
