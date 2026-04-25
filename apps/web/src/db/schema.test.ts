import { describe, expect, test } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, type IndexedColumn, type PgVector } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { AMENITY_KEYS } from "@apartment-finder/shared";

// ---------------------------------------------------------------------------
// P1 schema foundation — three-layer pipeline tables.
//
// These tests pin column names, FK behavior, and the pgvector(768) embedding.
// They do not connect to Postgres; they introspect the Drizzle definitions.
// Downstream callers (judge/dedup/etc.) intentionally break in P1; later phases
// rewire them onto canonical_apartments.
// ---------------------------------------------------------------------------

const expectedAmenityHasColumns = AMENITY_KEYS.map((key) => {
  // camelCase → snake_case `has_*`
  const snake = key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
  return `has_${snake}`;
});

function columnNames(table: ReturnType<typeof getTableColumns>) {
  return Object.values(table).map((col) => (col as { name: string }).name);
}

describe("schema: legacy listings table dropped", () => {
  test("listings table is no longer exported", () => {
    expect((schema as Record<string, unknown>).listings).toBeUndefined();
  });

  test("Listing/NewListing types are no longer exported as runtime symbols", () => {
    // Type aliases don't exist at runtime, but pre-P1 the module also exposed
    // a `listings` table. The export above being undefined is the primary check.
    expect((schema as Record<string, unknown>).listings).toBeUndefined();
  });
});

describe("schema: raw_posts", () => {
  test("table exists with correct snake_case name", () => {
    expect(schema.rawPosts).toBeDefined();
    expect(getTableName(schema.rawPosts)).toBe("raw_posts");
  });

  test("has all required columns", () => {
    const cols = columnNames(getTableColumns(schema.rawPosts));
    const expected = [
      "id",
      "source",
      "source_id",
      "url",
      "raw_json",
      "raw_text",
      "content_hash",
      "fetched_at",
      "posted_at",
      "source_group_url",
      "author_name",
      "author_profile",
      "extraction_status",
    ];
    for (const name of expected) {
      expect(cols).toContain(name);
    }
  });

  test("source, source_id, url, fetched_at, extraction_status are NOT NULL", () => {
    const cols = getTableColumns(schema.rawPosts);
    expect(cols.source.notNull).toBe(true);
    expect(cols.sourceId.notNull).toBe(true);
    expect(cols.url.notNull).toBe(true);
    expect(cols.fetchedAt.notNull).toBe(true);
    expect(cols.extractionStatus.notNull).toBe(true);
  });

  test("extraction_status defaults to 'pending'", () => {
    const cols = getTableColumns(schema.rawPosts);
    // Drizzle stores defaults on the column config as `default`.
    expect((cols.extractionStatus as unknown as { default: unknown }).default).toBe("pending");
  });

  test("has unique index on (source, source_id) plus the required indexes", () => {
    const cfg = getTableConfig(schema.rawPosts);
    const indexNames = cfg.indexes.map((idx) => idx.config.name);
    // unique index handled via uniqueIndex() also lives in cfg.indexes for drizzle ≥0.30.
    expect(cfg.indexes.some((idx) => idx.config.unique === true)).toBe(true);
    // We expect at least: unique(source,source_id), extraction_status, fetched_at desc, source.
    expect(indexNames.length).toBeGreaterThanOrEqual(4);
  });
});

describe("schema: extractions", () => {
  test("table exists", () => {
    expect(schema.extractions).toBeDefined();
    expect(getTableName(schema.extractions)).toBe("extractions");
  });

  test("has core fields and 11 nullable has_* booleans matching AMENITY_KEYS", () => {
    const cols = getTableColumns(schema.extractions);
    const names = columnNames(cols);

    // Core fields
    for (const f of [
      "id",
      "raw_post_id",
      "schema_version",
      "model",
      "price_nis",
      "rooms",
      "sqm",
      "floor",
      "street",
      "house_number",
      "neighborhood",
      "city",
      "condition",
      "is_agency",
      "phone_e164",
      "extras",
      "embedding",
      "extracted_at",
    ]) {
      expect(names).toContain(f);
    }

    // 11 has_* booleans, all nullable.
    expect(expectedAmenityHasColumns).toHaveLength(11);
    for (const hasCol of expectedAmenityHasColumns) {
      expect(names).toContain(hasCol);
      const col = Object.values(cols).find((c) => (c as { name: string }).name === hasCol) as
        | { notNull: boolean; columnType: string }
        | undefined;
      expect(col).toBeDefined();
      expect(col!.notNull).toBe(false);
      expect(col!.columnType).toBe("PgBoolean");
    }
  });

  test("raw_post_id is NOT NULL and references raw_posts.id with ON DELETE CASCADE", () => {
    const cfg = getTableConfig(schema.extractions);
    const cols = getTableColumns(schema.extractions);
    expect(cols.rawPostId.notNull).toBe(true);

    const fk = cfg.foreignKeys.find((f) => {
      const ref = f.reference();
      return ref.columns.some((c) => c.name === "raw_post_id");
    });
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("cascade");
    const ref = fk!.reference();
    expect(ref.foreignTable).toBe(schema.rawPosts);
  });

  test("schema_version is NOT NULL with default 1", () => {
    const cols = getTableColumns(schema.extractions);
    expect(cols.schemaVersion.notNull).toBe(true);
    expect((cols.schemaVersion as unknown as { default: unknown }).default).toBe(1);
  });

  test("embedding column is pgvector with 768 dimensions", () => {
    const cols = getTableColumns(schema.extractions);
    const embedding = cols.embedding as unknown as PgVector<never>;
    expect(embedding.columnType).toBe("PgVector");
    expect(embedding.dimensions).toBe(768);
  });

  test("has unique index on (raw_post_id, schema_version)", () => {
    const cfg = getTableConfig(schema.extractions);
    const uniques = cfg.indexes.filter((idx) => idx.config.unique === true);
    expect(uniques.length).toBeGreaterThanOrEqual(1);
    const cols = uniques[0]!.config.columns.map((c) => (c as IndexedColumn).name);
    expect(cols).toContain("raw_post_id");
    expect(cols).toContain("schema_version");
  });
});

describe("schema: canonical_apartments", () => {
  test("table exists with required columns", () => {
    expect(schema.canonicalApartments).toBeDefined();
    expect(getTableName(schema.canonicalApartments)).toBe("canonical_apartments");
    const names = columnNames(getTableColumns(schema.canonicalApartments));
    for (const f of [
      "id",
      "primary_address",
      "street",
      "house_number",
      "city",
      "neighborhood",
      "rooms",
      "sqm",
      "match_key",
      "created_at",
      "last_seen_at",
    ]) {
      expect(names).toContain(f);
    }
  });

  test("created_at and last_seen_at are NOT NULL", () => {
    const cols = getTableColumns(schema.canonicalApartments);
    expect(cols.createdAt.notNull).toBe(true);
    expect(cols.lastSeenAt.notNull).toBe(true);
  });

  test("has match_key index", () => {
    const cfg = getTableConfig(schema.canonicalApartments);
    expect(
      cfg.indexes.some((idx) =>
        idx.config.columns.some((c) => (c as IndexedColumn).name === "match_key"),
      ),
    ).toBe(true);
  });
});

describe("schema: canonical_attributes", () => {
  test("table exists with canonical_id PK and 11 has_* booleans", () => {
    expect(schema.canonicalAttributes).toBeDefined();
    expect(getTableName(schema.canonicalAttributes)).toBe("canonical_attributes");

    const cols = getTableColumns(schema.canonicalAttributes);
    expect(cols.canonicalId.primary).toBe(true);

    const names = columnNames(cols);
    for (const hasCol of expectedAmenityHasColumns) {
      expect(names).toContain(hasCol);
    }
    expect(names).toContain("extras");
    expect(names).toContain("last_merged_at");
  });

  test("canonical_id references canonical_apartments with ON DELETE CASCADE", () => {
    const cfg = getTableConfig(schema.canonicalAttributes);
    const fk = cfg.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "canonical_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("cascade");
    expect(fk!.reference().foreignTable).toBe(schema.canonicalApartments);
  });
});

describe("schema: apartment_sources", () => {
  test("composite PK on (canonical_id, extraction_id)", () => {
    expect(schema.apartmentSources).toBeDefined();
    const cfg = getTableConfig(schema.apartmentSources);
    expect(cfg.primaryKeys).toHaveLength(1);
    const pkColumns = cfg.primaryKeys[0]!.columns.map((c) => c.name).sort();
    expect(pkColumns).toEqual(["canonical_id", "extraction_id"]);
  });

  test("FKs cascade on delete", () => {
    const cfg = getTableConfig(schema.apartmentSources);
    expect(cfg.foreignKeys).toHaveLength(2);
    for (const fk of cfg.foreignKeys) {
      expect(fk.onDelete).toBe("cascade");
    }
  });

  test("confidence and merged_at are NOT NULL", () => {
    const cols = getTableColumns(schema.apartmentSources);
    expect(cols.confidence.notNull).toBe(true);
    expect(cols.mergedAt.notNull).toBe(true);
  });
});

describe("schema: merge_candidates", () => {
  test("table exists with required columns", () => {
    expect(schema.mergeCandidates).toBeDefined();
    const names = columnNames(getTableColumns(schema.mergeCandidates));
    for (const f of [
      "id",
      "extraction_id",
      "canonical_id",
      "score",
      "status",
      "reviewed_by",
      "reviewed_at",
      "created_at",
    ]) {
      expect(names).toContain(f);
    }
  });

  test("status defaults to 'pending' and is NOT NULL", () => {
    const cols = getTableColumns(schema.mergeCandidates);
    expect(cols.status.notNull).toBe(true);
    expect((cols.status as unknown as { default: unknown }).default).toBe("pending");
  });

  test("reviewed_by FKs to user.id (nullable)", () => {
    const cfg = getTableConfig(schema.mergeCandidates);
    const cols = getTableColumns(schema.mergeCandidates);
    expect(cols.reviewedBy.notNull).toBe(false);

    const fk = cfg.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "reviewed_by"),
    );
    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(schema.user);
  });

  test("has status index", () => {
    const cfg = getTableConfig(schema.mergeCandidates);
    expect(
      cfg.indexes.some((idx) =>
        idx.config.columns.some((c) => (c as IndexedColumn).name === "status"),
      ),
    ).toBe(true);
  });
});

describe("schema: judgments rebound to canonical_id", () => {
  test("primary key column is canonical_id (not listing_id)", () => {
    const cols = getTableColumns(schema.judgments);
    expect(cols.canonicalId).toBeDefined();
    expect(cols.canonicalId.primary).toBe(true);
    expect((cols as Record<string, unknown>).listingId).toBeUndefined();
  });

  test("canonical_id references canonical_apartments with ON DELETE CASCADE", () => {
    const cfg = getTableConfig(schema.judgments);
    const fk = cfg.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "canonical_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("cascade");
    expect(fk!.reference().foreignTable).toBe(schema.canonicalApartments);
  });
});

describe("schema: feedback rebound to canonical_id", () => {
  test("composite PK is (canonical_id, user_id)", () => {
    const cfg = getTableConfig(schema.feedback);
    expect(cfg.primaryKeys).toHaveLength(1);
    const pkColumns = cfg.primaryKeys[0]!.columns.map((c) => c.name).sort();
    expect(pkColumns).toEqual(["canonical_id", "user_id"]);
  });

  test("canonical_id and user_id both cascade on delete", () => {
    const cfg = getTableConfig(schema.feedback);
    expect(cfg.foreignKeys.length).toBeGreaterThanOrEqual(2);
    for (const fk of cfg.foreignKeys) {
      expect(fk.onDelete).toBe("cascade");
    }
  });
});

describe("schema: sent_alerts rebound to canonical_id", () => {
  test("composite PK is (canonical_id, channel, user_id)", () => {
    const cfg = getTableConfig(schema.sentAlerts);
    expect(cfg.primaryKeys).toHaveLength(1);
    const pkColumns = cfg.primaryKeys[0]!.columns.map((c) => c.name).sort();
    expect(pkColumns).toEqual(["canonical_id", "channel", "user_id"]);
  });

  test("user_id cascades on delete via FK to user.id", () => {
    const cfg = getTableConfig(schema.sentAlerts);
    const userFk = cfg.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "user_id"),
    );
    expect(userFk).toBeDefined();
    expect(userFk!.onDelete).toBe("cascade");
    expect(userFk!.reference().foreignTable).toBe(schema.user);
  });
});

describe("schema: preserved tables intact", () => {
  test("Better Auth tables are still exported", () => {
    expect(schema.user).toBeDefined();
    expect(schema.session).toBeDefined();
    expect(schema.account).toBeDefined();
    expect(schema.verification).toBeDefined();
  });

  test("preferences/aiUsage/monitoredGroups/etc. still exported", () => {
    expect(schema.preferences).toBeDefined();
    expect(schema.aiUsage).toBeDefined();
    expect(schema.monitoredGroups).toBeDefined();
    expect(schema.userGroupSubscriptions).toBeDefined();
    expect(schema.telegramLinks).toBeDefined();
    expect(schema.telegramLinkTokens).toBeDefined();
    expect(schema.pendingPatches).toBeDefined();
    expect(schema.blockedAuthors).toBeDefined();
  });
});

describe("schema: type exports", () => {
  test("new pipeline types are referenceable at the type level", () => {
    // This is a type-level smoke test; we just instantiate empty objects with the
    // declared shapes to force the compiler to resolve them. If a type export is
    // missing, `bun run typecheck` will fail.
    const _r: schema.RawPost | null = null;
    const _nr: schema.NewRawPost | null = null;
    const _e: schema.Extraction | null = null;
    const _ne: schema.NewExtraction | null = null;
    const _c: schema.CanonicalApartment | null = null;
    const _nc: schema.NewCanonicalApartment | null = null;
    const _ca: schema.CanonicalAttributes | null = null;
    const _nca: schema.NewCanonicalAttributes | null = null;
    const _as: schema.ApartmentSource | null = null;
    const _nas: schema.NewApartmentSource | null = null;
    const _mc: schema.MergeCandidate | null = null;
    const _nmc: schema.NewMergeCandidate | null = null;
    expect(
      [_r, _nr, _e, _ne, _c, _nc, _ca, _nca, _as, _nas, _mc, _nmc].every((v) => v === null),
    ).toBe(true);
  });
});
