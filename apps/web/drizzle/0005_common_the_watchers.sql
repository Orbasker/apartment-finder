-- Multi-city support: cities catalog + city_id everywhere + backfill of existing
-- user filter rows by Hebrew name match against the seed catalog. Idempotent so
-- it's safe to re-run (e.g. on dev DBs that partially applied an earlier draft).

-- 1. Catalog table.
CREATE TABLE IF NOT EXISTS "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_he" text NOT NULL,
	"name_en" text NOT NULL,
	"place_id" text NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lon" double precision NOT NULL,
	"bbox_north" double precision NOT NULL,
	"bbox_east" double precision NOT NULL,
	"bbox_south" double precision NOT NULL,
	"bbox_west" double precision NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_launch_ready" boolean DEFAULT false NOT NULL,
	"yad2_feed_url" text,
	"facebook_group_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cities_slug_unique" ON "cities" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cities_active_launch_ready_idx" ON "cities" USING btree ("is_active","is_launch_ready");
--> statement-breakpoint

-- 2. Seed the catalog. Existing rows refresh in place; new rows are inserted.
INSERT INTO "cities" (
	"id", "slug", "name_he", "name_en", "place_id",
	"center_lat", "center_lon",
	"bbox_north", "bbox_east", "bbox_south", "bbox_west",
	"is_active", "is_launch_ready", "yad2_feed_url", "facebook_group_urls"
) VALUES
	('tel-aviv',    'tel-aviv',    'תל אביב-יפו', 'Tel Aviv-Yafo', 'catalog:tel-aviv',    32.0853, 34.7818, 32.1460, 34.8510, 32.0290, 34.7420, true, true,  'https://gw.yad2.co.il/realestate-feed/rent/map?city=5000&property=1', '{}'::text[]),
	('jerusalem',   'jerusalem',   'ירושלים',     'Jerusalem',     'catalog:jerusalem',   31.7683, 35.2137, 31.8820, 35.2650, 31.7050, 35.1300, true, true,  'https://gw.yad2.co.il/realestate-feed/rent/map?city=3000&property=1', '{}'::text[]),
	('haifa',       'haifa',       'חיפה',        'Haifa',         'catalog:haifa',       32.7940, 34.9896, 32.8400, 35.0810, 32.7550, 34.9450, true, true,  'https://gw.yad2.co.il/realestate-feed/rent/map?city=4000&property=1', '{}'::text[]),
	('ramat-gan',   'ramat-gan',   'רמת גן',      'Ramat Gan',     'catalog:ramat-gan',   32.0684, 34.8248, 32.1020, 34.8600, 32.0450, 34.7900, true, false, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=8600&property=1', '{}'::text[]),
	('givatayim',   'givatayim',   'גבעתיים',     'Givatayim',     'catalog:givatayim',   32.0722, 34.8125, 32.0860, 34.8280, 32.0570, 34.7950, true, false, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=6300&property=1', '{}'::text[]),
	('herzliya',    'herzliya',    'הרצליה',      'Herzliya',      'catalog:herzliya',    32.1663, 34.8433, 32.2050, 34.8950, 32.1370, 34.7830, true, false, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=6400&property=1', '{}'::text[]),
	('petah-tikva', 'petah-tikva', 'פתח תקווה',   'Petah Tikva',   'catalog:petah-tikva', 32.0871, 34.8878, 32.1210, 34.9400, 32.0550, 34.8500, true, false, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=7900&property=1', '{}'::text[])
ON CONFLICT ("id") DO UPDATE SET
	"slug"                = EXCLUDED."slug",
	"name_he"             = EXCLUDED."name_he",
	"name_en"             = EXCLUDED."name_en",
	"place_id"            = EXCLUDED."place_id",
	"center_lat"          = EXCLUDED."center_lat",
	"center_lon"          = EXCLUDED."center_lon",
	"bbox_north"          = EXCLUDED."bbox_north",
	"bbox_east"           = EXCLUDED."bbox_east",
	"bbox_south"          = EXCLUDED."bbox_south",
	"bbox_west"           = EXCLUDED."bbox_west",
	"is_active"           = EXCLUDED."is_active",
	"is_launch_ready"     = EXCLUDED."is_launch_ready",
	"yad2_feed_url"       = EXCLUDED."yad2_feed_url",
	"facebook_group_urls" = EXCLUDED."facebook_group_urls",
	"updated_at"          = now();
--> statement-breakpoint

-- 3. Add nullable city_id columns to dependent tables. NOT NULL is enforced
-- later only on user_filter_* (after backfill). The other tables (apartments,
-- collection_runs, listings) keep city_id nullable per the schema.
ALTER TABLE "apartments"      ADD COLUMN IF NOT EXISTS "city_id" text;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN IF NOT EXISTS "city_id" text;--> statement-breakpoint
ALTER TABLE "listings"        ADD COLUMN IF NOT EXISTS "city_id" text;--> statement-breakpoint

-- 4. Add deferred-NOT-NULL columns to user_filter_*. Add nullable first, then
-- backfill, then enforce NOT NULL — otherwise ADD COLUMN fails on tables with
-- existing rows.
ALTER TABLE "user_filter_cities"        ADD COLUMN IF NOT EXISTS "city_id" text;--> statement-breakpoint
ALTER TABLE "user_filter_cities"        ADD COLUMN IF NOT EXISTS "name_en" text;--> statement-breakpoint
ALTER TABLE "user_filter_neighborhoods" ADD COLUMN IF NOT EXISTS "city_id" text;--> statement-breakpoint

-- 5. Backfill user_filter_cities by Hebrew name match against the catalog seed.
-- Matches "תל אביב" → "תל אביב-יפו" via prefix, exact matches the rest.
-- Existing rows pre-date the catalog and were keyed by Google place_id; we map
-- by display name since that's the only stable signal.
--
-- Also covers re-runs on partially applied DBs where an earlier draft set
-- city_id but left name_en null — without this, the SET NOT NULL on name_en
-- below would fail.
UPDATE "user_filter_cities" ufc
SET "city_id" = c."id",
    "name_en" = c."name_en"
FROM "cities" c
WHERE
  (
    ufc."city_id" IS NULL
    AND (
      c."name_he" = ufc."name_he"
      OR c."name_he" ILIKE ufc."name_he" || '%'
      OR ufc."name_he" ILIKE c."name_he" || '%'
    )
  )
  OR (
    ufc."city_id" = c."id"
    AND ufc."name_en" IS NULL
  );
--> statement-breakpoint

-- 6. Drop neighborhoods whose parent city couldn't be backfilled (city not in
-- catalog) so the upcoming composite FK has nothing to reject.
DELETE FROM "user_filter_neighborhoods" ufn
USING "user_filter_cities" ufc
WHERE ufn."user_id" = ufc."user_id"
  AND ufn."city_place_id" = ufc."place_id"
  AND ufc."city_id" IS NULL;
--> statement-breakpoint

-- 7. Drop unmappable city rows. Affected users will re-pick from the catalog
-- on next /filters or onboarding visit.
DELETE FROM "user_filter_cities" WHERE "city_id" IS NULL;
--> statement-breakpoint

-- 8. Backfill user_filter_neighborhoods.city_id from its parent user_filter_cities.
UPDATE "user_filter_neighborhoods" ufn
SET "city_id" = ufc."city_id"
FROM "user_filter_cities" ufc
WHERE ufn."user_id" = ufc."user_id"
  AND ufn."city_place_id" = ufc."place_id"
  AND ufn."city_id" IS NULL;
--> statement-breakpoint

-- 9. Any remaining unmatched neighborhoods are orphans (no parent city row).
DELETE FROM "user_filter_neighborhoods" WHERE "city_id" IS NULL;
--> statement-breakpoint

-- 10. Drop legacy constraints that referenced the old (user_id, place_id) shape.
ALTER TABLE "user_filter_neighborhoods" DROP CONSTRAINT IF EXISTS "user_filter_neighborhoods_city_fk";--> statement-breakpoint
ALTER TABLE "user_filter_cities"        DROP CONSTRAINT IF EXISTS "user_filter_cities_user_id_place_id_pk";--> statement-breakpoint

-- 11. Now that every row has city_id (and name_en), enforce NOT NULL.
ALTER TABLE "user_filter_cities"        ALTER COLUMN "city_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_filter_cities"        ALTER COLUMN "name_en" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_filter_neighborhoods" ALTER COLUMN "city_id" SET NOT NULL;--> statement-breakpoint

-- 12. Add new PK + FKs (idempotent).
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'user_filter_cities_user_id_city_id_pk') THEN
		ALTER TABLE "user_filter_cities" ADD CONSTRAINT "user_filter_cities_user_id_city_id_pk" PRIMARY KEY ("user_id","city_id");
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'apartments_city_id_cities_id_fk') THEN
		ALTER TABLE "apartments" ADD CONSTRAINT "apartments_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'collection_runs_city_id_cities_id_fk') THEN
		ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'listings_city_id_cities_id_fk') THEN
		ALTER TABLE "listings" ADD CONSTRAINT "listings_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'user_filter_cities_city_id_cities_id_fk') THEN
		ALTER TABLE "user_filter_cities" ADD CONSTRAINT "user_filter_cities_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'user_filter_neighborhoods_city_fk') THEN
		ALTER TABLE "user_filter_neighborhoods" ADD CONSTRAINT "user_filter_neighborhoods_city_fk" FOREIGN KEY ("user_id","city_id") REFERENCES "public"."user_filter_cities"("user_id","city_id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

-- 13. Indexes on the new city_id columns.
CREATE INDEX IF NOT EXISTS "apartments_city_idx"      ON "apartments"      USING btree ("city_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_runs_city_idx" ON "collection_runs" USING btree ("city_id","enqueued_at");
