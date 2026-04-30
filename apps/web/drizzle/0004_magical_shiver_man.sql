CREATE TABLE "cities" (
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
ALTER TABLE "user_filter_neighborhoods" DROP CONSTRAINT "user_filter_neighborhoods_city_fk";
--> statement-breakpoint
ALTER TABLE "user_filter_cities" DROP CONSTRAINT "user_filter_cities_user_id_place_id_pk";--> statement-breakpoint
ALTER TABLE "apartments" ADD COLUMN "city_id" text;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "city_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "city_id" text;--> statement-breakpoint
ALTER TABLE "user_filter_cities" ADD COLUMN "city_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user_filter_cities" ADD COLUMN "name_en" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user_filter_neighborhoods" ADD COLUMN "city_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user_filter_cities" ADD CONSTRAINT "user_filter_cities_user_id_city_id_pk" PRIMARY KEY("user_id","city_id");--> statement-breakpoint
INSERT INTO "cities" (
	"id",
	"slug",
	"name_he",
	"name_en",
	"place_id",
	"center_lat",
	"center_lon",
	"bbox_north",
	"bbox_east",
	"bbox_south",
	"bbox_west",
	"is_active",
	"is_launch_ready",
	"yad2_feed_url",
	"facebook_group_urls"
) VALUES
	('tel-aviv', 'tel-aviv', 'תל אביב-יפו', 'Tel Aviv-Yafo', 'catalog:tel-aviv', 32.0853, 34.7818, 32.1460, 34.8510, 32.0290, 34.7420, true, true, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=5000&property=1', '{}'::text[]),
	('jerusalem', 'jerusalem', 'ירושלים', 'Jerusalem', 'catalog:jerusalem', 31.7683, 35.2137, 31.8820, 35.2650, 31.7050, 35.1300, true, true, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=3000&property=1', '{}'::text[]),
	('haifa', 'haifa', 'חיפה', 'Haifa', 'catalog:haifa', 32.7940, 34.9896, 32.8400, 35.0810, 32.7550, 34.9450, true, true, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=4000&property=1', '{}'::text[]),
	('ramat-gan', 'ramat-gan', 'רמת גן', 'Ramat Gan', 'catalog:ramat-gan', 32.0684, 34.8248, 32.1020, 34.8600, 32.0450, 34.7900, true, false, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=8600&property=1', '{}'::text[]),
	('givatayim', 'givatayim', 'גבעתיים', 'Givatayim', 'catalog:givatayim', 32.0722, 34.8125, 32.0860, 34.8280, 32.0570, 34.7950, true, false, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=6300&property=1', '{}'::text[]),
	('herzliya', 'herzliya', 'הרצליה', 'Herzliya', 'catalog:herzliya', 32.1663, 34.8433, 32.2050, 34.8950, 32.1370, 34.7830, true, false, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=6400&property=1', '{}'::text[]),
	('petah-tikva', 'petah-tikva', 'פתח תקווה', 'Petah Tikva', 'catalog:petah-tikva', 32.0871, 34.8878, 32.1210, 34.9400, 32.0550, 34.8500, true, false, 'https://gw.yad2.co.il/realestate-feed/rent/map?city=7900&property=1', '{}'::text[])
ON CONFLICT ("id") DO UPDATE SET
	"slug" = EXCLUDED."slug",
	"name_he" = EXCLUDED."name_he",
	"name_en" = EXCLUDED."name_en",
	"place_id" = EXCLUDED."place_id",
	"center_lat" = EXCLUDED."center_lat",
	"center_lon" = EXCLUDED."center_lon",
	"bbox_north" = EXCLUDED."bbox_north",
	"bbox_east" = EXCLUDED."bbox_east",
	"bbox_south" = EXCLUDED."bbox_south",
	"bbox_west" = EXCLUDED."bbox_west",
	"is_active" = EXCLUDED."is_active",
	"is_launch_ready" = EXCLUDED."is_launch_ready",
	"yad2_feed_url" = EXCLUDED."yad2_feed_url",
	"facebook_group_urls" = EXCLUDED."facebook_group_urls",
	"updated_at" = now();--> statement-breakpoint
CREATE UNIQUE INDEX "cities_slug_unique" ON "cities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cities_active_launch_ready_idx" ON "cities" USING btree ("is_active","is_launch_ready");--> statement-breakpoint
ALTER TABLE "apartments" ADD CONSTRAINT "apartments_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_filter_cities" ADD CONSTRAINT "user_filter_cities_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_filter_neighborhoods" ADD CONSTRAINT "user_filter_neighborhoods_city_fk" FOREIGN KEY ("user_id","city_id") REFERENCES "public"."user_filter_cities"("user_id","city_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apartments_city_idx" ON "apartments" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "collection_runs_city_idx" ON "collection_runs" USING btree ("city_id","enqueued_at");
