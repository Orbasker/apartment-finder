-- Region → City hierarchy. Yad2 only accepts a single `region` parameter
-- (1..7); markers within a region are routed to the right city by Hebrew
-- name match in the worker. This migration is purely additive — it leaves
-- cities.yad2_feed_url in place as a future per-city override hook (precise
-- topArea+area+city filters). Removal is tracked separately under APA-36.
--
-- Idempotent: safe to re-run on dev DBs that partially applied an earlier
-- draft (matches the pattern in 0005).

-- 1. Reference table for Yad2's 7 regions.
CREATE TABLE IF NOT EXISTS "yad2_regions" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_he" text NOT NULL,
	"name_en" text NOT NULL,
	"feed_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'yad2_regions_slug_unique') THEN
		ALTER TABLE "yad2_regions" ADD CONSTRAINT "yad2_regions_slug_unique" UNIQUE("slug");
	END IF;
END $$;
--> statement-breakpoint

-- 2. Seed all 7 Yad2 regions. Names + IDs probed against gw.yad2.co.il on
-- 2026-05-02 (see APA-35).
INSERT INTO "yad2_regions" ("id", "slug", "name_he", "name_en", "feed_url", "is_active") VALUES
	(1, 'sharon-center', 'מרכז והשרון',                'Center & Sharon',            'https://gw.yad2.co.il/realestate-feed/rent/map?region=1&property=1', true),
	(2, 'south',         'דרום',                        'South',                      'https://gw.yad2.co.il/realestate-feed/rent/map?region=2&property=1', true),
	(3, 'tel-aviv',      'תל אביב והסביבה',             'Tel Aviv & Surroundings',    'https://gw.yad2.co.il/realestate-feed/rent/map?region=3&property=1', true),
	(4, 'judea-samaria', 'יהודה, שומרון ובקעת הירדן',   'Judea, Samaria & Jordan V.', 'https://gw.yad2.co.il/realestate-feed/rent/map?region=4&property=1', true),
	(5, 'north-coast',   'מישור החוף הצפוני',           'Northern Coastal Plain',     'https://gw.yad2.co.il/realestate-feed/rent/map?region=5&property=1', true),
	(6, 'jerusalem',     'ירושלים והסביבה',             'Jerusalem & Surroundings',   'https://gw.yad2.co.il/realestate-feed/rent/map?region=6&property=1', true),
	(7, 'galilee',       'צפון ועמקים',                 'North & Valleys',            'https://gw.yad2.co.il/realestate-feed/rent/map?region=7&property=1', true)
ON CONFLICT ("id") DO UPDATE SET
	"slug"      = EXCLUDED."slug",
	"name_he"   = EXCLUDED."name_he",
	"name_en"   = EXCLUDED."name_en",
	"feed_url"  = EXCLUDED."feed_url",
	"is_active" = EXCLUDED."is_active";
--> statement-breakpoint

-- 3. Add region_id columns (nullable). Backfill happens after, via UPDATE.
ALTER TABLE "cities"          ADD COLUMN IF NOT EXISTS "region_id" integer;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN IF NOT EXISTS "region_id" integer;--> statement-breakpoint

-- 4. FKs (idempotent).
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'cities_region_id_yad2_regions_id_fk') THEN
		ALTER TABLE "cities" ADD CONSTRAINT "cities_region_id_yad2_regions_id_fk"
			FOREIGN KEY ("region_id") REFERENCES "public"."yad2_regions"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = 'public' AND c.conname = 'collection_runs_region_id_yad2_regions_id_fk') THEN
		ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_region_id_yad2_regions_id_fk"
			FOREIGN KEY ("region_id") REFERENCES "public"."yad2_regions"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

-- 5. Indexes.
CREATE INDEX IF NOT EXISTS "cities_region_idx"          ON "cities"          USING btree ("region_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_runs_region_idx" ON "collection_runs" USING btree ("region_id","enqueued_at");--> statement-breakpoint

-- 6. Backfill region_id for cities seeded in 0005.
UPDATE "cities" SET "region_id" = 3 WHERE "id" IN ('tel-aviv','ramat-gan','givatayim','herzliya','petah-tikva') AND "region_id" IS NULL;--> statement-breakpoint
UPDATE "cities" SET "region_id" = 5 WHERE "id" = 'haifa'     AND "region_id" IS NULL;--> statement-breakpoint
UPDATE "cities" SET "region_id" = 6 WHERE "id" = 'jerusalem' AND "region_id" IS NULL;--> statement-breakpoint

-- 7. Seed dormant cities under each region. Approximate centers/bboxes; these
-- are not user-facing yet (is_launch_ready=false) and downstream features that
-- need precise geocoding will refine via a future ticket. Hebrew names match
-- exactly what Yad2 emits in marker.address.city.text (probed 2026-05-02) so
-- the worker's name-based router maps cleanly.
INSERT INTO "cities" (
	"id", "slug", "name_he", "name_en", "place_id",
	"center_lat", "center_lon",
	"bbox_north", "bbox_east", "bbox_south", "bbox_west",
	"is_active", "is_launch_ready", "region_id", "yad2_feed_url", "facebook_group_urls"
) VALUES
	-- Region 1: Sharon & Center
	('netanya',        'netanya',        'נתניה',         'Netanya',        'catalog:netanya',        32.3215, 34.8532, 32.3700, 34.8900, 32.2700, 34.8200, true, false, 1, NULL, '{}'::text[]),
	('rishon-lezion',  'rishon-lezion',  'ראשון לציון',   'Rishon LeZion',  'catalog:rishon-lezion',  31.9706, 34.7925, 32.0100, 34.8400, 31.9300, 34.7400, true, false, 1, NULL, '{}'::text[]),
	('raanana',        'raanana',        'רעננה',         'Raanana',        'catalog:raanana',        32.1839, 34.8709, 32.2100, 34.9000, 32.1600, 34.8400, true, false, 1, NULL, '{}'::text[]),
	('bnei-brak',      'bnei-brak',      'בני ברק',       'Bnei Brak',      'catalog:bnei-brak',      32.0837, 34.8338, 32.1000, 34.8500, 32.0700, 34.8200, true, false, 1, NULL, '{}'::text[]),
	('kfar-saba',      'kfar-saba',      'כפר סבא',       'Kfar Saba',      'catalog:kfar-saba',      32.1747, 34.9070, 32.2000, 34.9400, 32.1500, 34.8800, true, false, 1, NULL, '{}'::text[]),
	('givat-shmuel',   'givat-shmuel',   'גבעת שמואל',    'Givat Shmuel',   'catalog:givat-shmuel',   32.0775, 34.8488, 32.0900, 34.8600, 32.0700, 34.8400, true, false, 1, NULL, '{}'::text[]),
	-- Region 2: South
	('beer-sheva',     'beer-sheva',     'באר שבע',       'Beer Sheva',     'catalog:beer-sheva',     31.2518, 34.7913, 31.3000, 34.8500, 31.2100, 34.7300, true, false, 2, NULL, '{}'::text[]),
	('ashkelon',       'ashkelon',       'אשקלון',        'Ashkelon',       'catalog:ashkelon',       31.6688, 34.5715, 31.7000, 34.6100, 31.6300, 34.5300, true, false, 2, NULL, '{}'::text[]),
	('ashdod',         'ashdod',         'אשדוד',         'Ashdod',         'catalog:ashdod',         31.7920, 34.6497, 31.8300, 34.6900, 31.7500, 34.6100, true, false, 2, NULL, '{}'::text[]),
	('eilat',          'eilat',          'אילת',          'Eilat',          'catalog:eilat',          29.5577, 34.9519, 29.5900, 34.9900, 29.5200, 34.9100, true, false, 2, NULL, '{}'::text[]),
	('kiryat-gat',     'kiryat-gat',     'קרית גת',       'Kiryat Gat',     'catalog:kiryat-gat',     31.6100, 34.7642, 31.6400, 34.7900, 31.5800, 34.7400, true, false, 2, NULL, '{}'::text[]),
	-- Region 3: Tel Aviv extras (TA + Ramat Gan + Givatayim + Herzliya + Petah Tikva already in 0005)
	('holon',          'holon',          'חולון',         'Holon',          'catalog:holon',          32.0117, 34.7752, 32.0400, 34.8100, 31.9900, 34.7500, true, false, 3, NULL, '{}'::text[]),
	('bat-yam',        'bat-yam',        'בת ים',         'Bat Yam',        'catalog:bat-yam',        32.0231, 34.7503, 32.0400, 34.7700, 32.0100, 34.7400, true, false, 3, NULL, '{}'::text[]),
	('azor',           'azor',           'אזור',          'Azor',           'catalog:azor',           32.0250, 34.8044, 32.0350, 34.8150, 32.0150, 34.7950, true, false, 3, NULL, '{}'::text[]),
	-- Region 4: Judea, Samaria & Jordan Valley
	('ariel',          'ariel',          'אריאל',         'Ariel',          'catalog:ariel',          32.1043, 35.1675, 32.1200, 35.1900, 32.0900, 35.1500, true, false, 4, NULL, '{}'::text[]),
	('givat-zeev',     'givat-zeev',     'גבעת זאב',      'Givat Zeev',     'catalog:givat-zeev',     31.8568, 35.1707, 31.8700, 35.1900, 31.8400, 35.1500, true, false, 4, NULL, '{}'::text[]),
	('maale-adumim',   'maale-adumim',   'מעלה אדומים',   'Maale Adumim',   'catalog:maale-adumim',   31.7770, 35.2986, 31.7900, 35.3200, 31.7600, 35.2800, true, false, 4, NULL, '{}'::text[]),
	('beitar-illit',   'beitar-illit',   'ביתר עילית',    'Beitar Illit',   'catalog:beitar-illit',   31.6964, 35.1158, 31.7100, 35.1300, 31.6800, 35.1000, true, false, 4, NULL, '{}'::text[]),
	-- Region 5: Northern Coastal Plain (Haifa already in 0005)
	('hadera',         'hadera',         'חדרה',          'Hadera',         'catalog:hadera',         32.4365, 34.9196, 32.4700, 34.9500, 32.4000, 34.8900, true, false, 5, NULL, '{}'::text[]),
	('nahariya',       'nahariya',       'נהריה',         'Nahariya',       'catalog:nahariya',       33.0085, 35.0950, 33.0400, 35.1200, 32.9800, 35.0700, true, false, 5, NULL, '{}'::text[]),
	('kiryat-motzkin', 'kiryat-motzkin', 'קרית מוצקין',   'Kiryat Motzkin', 'catalog:kiryat-motzkin', 32.8366, 35.0824, 32.8500, 35.0950, 32.8200, 35.0700, true, false, 5, NULL, '{}'::text[]),
	('kiryat-bialik',  'kiryat-bialik',  'קרית ביאליק',   'Kiryat Bialik',  'catalog:kiryat-bialik',  32.8278, 35.0860, 32.8400, 35.1000, 32.8100, 35.0700, true, false, 5, NULL, '{}'::text[]),
	('kiryat-ata',     'kiryat-ata',     'קרית אתא',      'Kiryat Ata',     'catalog:kiryat-ata',     32.8060, 35.1059, 32.8200, 35.1200, 32.7900, 35.0900, true, false, 5, NULL, '{}'::text[]),
	('kiryat-yam',     'kiryat-yam',     'קרית ים',       'Kiryat Yam',     'catalog:kiryat-yam',     32.8454, 35.0673, 32.8600, 35.0800, 32.8300, 35.0500, true, false, 5, NULL, '{}'::text[]),
	('nesher',         'nesher',         'נשר',           'Nesher',         'catalog:nesher',         32.7700, 35.0405, 32.7800, 35.0500, 32.7600, 35.0300, true, false, 5, NULL, '{}'::text[]),
	('akko',           'akko',           'עכו',           'Akko',           'catalog:akko',           32.9281, 35.0820, 32.9400, 35.0950, 32.9100, 35.0700, true, false, 5, NULL, '{}'::text[]),
	-- Region 6: Jerusalem extras (Jerusalem already in 0005)
	('bet-shemesh',    'bet-shemesh',    'בית שמש',       'Bet Shemesh',    'catalog:bet-shemesh',    31.7457, 34.9886, 31.7700, 35.0200, 31.7200, 34.9500, true, false, 6, NULL, '{}'::text[]),
	('mevaseret-zion', 'mevaseret-zion', 'מבשרת ציון',    'Mevaseret Zion', 'catalog:mevaseret-zion', 31.7933, 35.1493, 31.8050, 35.1600, 31.7800, 35.1350, true, false, 6, NULL, '{}'::text[]),
	('abu-ghosh',      'abu-ghosh',      'אבו גוש',       'Abu Ghosh',      'catalog:abu-ghosh',      31.8061, 35.1123, 31.8150, 35.1200, 31.7950, 35.1050, true, false, 6, NULL, '{}'::text[]),
	-- Region 7: North & Valleys
	('karmiel',        'karmiel',        'כרמיאל',        'Karmiel',        'catalog:karmiel',        32.9171, 35.2950, 32.9300, 35.3100, 32.9000, 35.2750, true, false, 7, NULL, '{}'::text[]),
	('afula',          'afula',          'עפולה',         'Afula',          'catalog:afula',          32.6066, 35.2900, 32.6300, 35.3100, 32.5900, 35.2700, true, false, 7, NULL, '{}'::text[]),
	('tiberias',       'tiberias',       'טבריה',         'Tiberias',       'catalog:tiberias',       32.7959, 35.5310, 32.8200, 35.5500, 32.7700, 35.5100, true, false, 7, NULL, '{}'::text[]),
	('nof-hagalil',    'nof-hagalil',    'נצרת עילית / נוף הגליל', 'Nof HaGalil', 'catalog:nof-hagalil', 32.7104, 35.3173, 32.7300, 35.3400, 32.6900, 35.2900, true, false, 7, NULL, '{}'::text[]),
	('maalot-tarshiha','maalot-tarshiha','מעלות תרשיחא',  'Maalot-Tarshiha','catalog:maalot-tarshiha',33.0131, 35.2730, 33.0250, 35.2900, 33.0000, 35.2550, true, false, 7, NULL, '{}'::text[]),
	('harish',         'harish',         'חריש',          'Harish',         'catalog:harish',         32.4633, 35.0414, 32.4750, 35.0550, 32.4500, 35.0250, true, false, 7, NULL, '{}'::text[])
ON CONFLICT ("id") DO UPDATE SET
	"slug"            = EXCLUDED."slug",
	"name_he"         = EXCLUDED."name_he",
	"name_en"         = EXCLUDED."name_en",
	"region_id"       = EXCLUDED."region_id",
	"is_active"       = EXCLUDED."is_active",
	"is_launch_ready" = EXCLUDED."is_launch_ready",
	"updated_at"      = now();
