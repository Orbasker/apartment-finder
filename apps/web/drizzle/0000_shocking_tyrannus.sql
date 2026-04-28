CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."apartment_attribute_key" AS ENUM('elevator', 'parking', 'balcony', 'air_conditioning', 'furnished', 'renovated', 'pet_friendly', 'safe_room', 'storage', 'accessible', 'bars', 'ground_floor', 'roof_access', 'shared_apartment', 'garden', 'pool', 'solar_water_heater');--> statement-breakpoint
CREATE TYPE "public"."attribute_requirement" AS ENUM('required_true', 'required_false', 'preferred_true', 'dont_care');--> statement-breakpoint
CREATE TYPE "public"."attribute_source" AS ENUM('ai', 'user', 'manual');--> statement-breakpoint
CREATE TYPE "public"."filter_text_kind" AS ENUM('wish', 'dealbreaker');--> statement-breakpoint
CREATE TYPE "public"."listing_source" AS ENUM('yad2', 'facebook');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('pending', 'extracted', 'geocoded', 'embedded', 'unified', 'failed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"provider_model" text,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"reasoning_tokens" integer,
	"cached_input_tokens" integer,
	"estimated_cost_usd" real NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apartment_listings" (
	"apartment_id" integer NOT NULL,
	"listing_id" integer NOT NULL,
	"confidence" real NOT NULL,
	"matched_by" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apartment_listings_apartment_id_listing_id_pk" PRIMARY KEY("apartment_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "apartments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"place_id" text,
	"lat" double precision,
	"lon" double precision,
	"formatted_address" text,
	"street" text,
	"house_number" text,
	"neighborhood" text,
	"city" text,
	"rooms" real,
	"sqm" integer,
	"floor" integer,
	"price_nis_latest" integer,
	"primary_listing_id" integer,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_authors" (
	"profile_url" text PRIMARY KEY NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"address_key" text PRIMARY KEY NOT NULL,
	"place_id" text,
	"lat" double precision,
	"lon" double precision,
	"formatted_address" text,
	"street" text,
	"house_number" text,
	"neighborhood" text,
	"city" text,
	"confidence" text,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_attributes" (
	"listing_id" integer NOT NULL,
	"key" "apartment_attribute_key" NOT NULL,
	"value" boolean NOT NULL,
	"source" "attribute_source" DEFAULT 'ai' NOT NULL,
	CONSTRAINT "listing_attributes_listing_id_key_pk" PRIMARY KEY("listing_id","key")
);
--> statement-breakpoint
CREATE TABLE "listing_extractions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"price_nis" integer,
	"rooms" real,
	"sqm" integer,
	"floor" integer,
	"raw_address" text,
	"street" text,
	"house_number" text,
	"neighborhood" text,
	"city" text,
	"place_id" text,
	"lat" double precision,
	"lon" double precision,
	"geocode_confidence" text,
	"description" text,
	"condition" text,
	"is_agency" boolean,
	"phone_e164" text,
	"arnona_nis" integer,
	"vaad_bayit_nis" integer,
	"entry_date" text,
	"balcony_sqm" integer,
	"total_floors" integer,
	"furniture_status" text,
	"extras" jsonb,
	"embedding" vector(1536),
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" "listing_source" NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"raw_text" text,
	"raw_json" jsonb,
	"content_hash" text NOT NULL,
	"posted_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_name" text,
	"author_profile" text,
	"source_group_url" text,
	"status" "listing_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"retries" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sent_alerts" (
	"user_id" uuid NOT NULL,
	"apartment_id" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resend_message_id" text,
	CONSTRAINT "sent_alerts_user_id_apartment_id_pk" PRIMARY KEY("user_id","apartment_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_filter_attributes" (
	"user_id" uuid NOT NULL,
	"key" "apartment_attribute_key" NOT NULL,
	"requirement" "attribute_requirement" NOT NULL,
	CONSTRAINT "user_filter_attributes_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "user_filter_texts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "filter_text_kind" NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_filters" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"price_min_nis" integer,
	"price_max_nis" integer,
	"rooms_min" real,
	"rooms_max" real,
	"sqm_min" integer,
	"sqm_max" integer,
	"allowed_neighborhoods" text[] DEFAULT '{}'::text[] NOT NULL,
	"blocked_neighborhoods" text[] DEFAULT '{}'::text[] NOT NULL,
	"wishes" text[] DEFAULT '{}'::text[] NOT NULL,
	"dealbreakers" text[] DEFAULT '{}'::text[] NOT NULL,
	"strict_unknowns" boolean DEFAULT true NOT NULL,
	"daily_alert_cap" integer DEFAULT 20 NOT NULL,
	"max_age_hours" integer DEFAULT 48 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apartment_listings" ADD CONSTRAINT "apartment_listings_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apartment_listings" ADD CONSTRAINT "apartment_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_attributes" ADD CONSTRAINT "listing_attributes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_extractions" ADD CONSTRAINT "listing_extractions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_alerts" ADD CONSTRAINT "sent_alerts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_alerts" ADD CONSTRAINT "sent_alerts_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_filter_attributes" ADD CONSTRAINT "user_filter_attributes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_filter_texts" ADD CONSTRAINT "user_filter_texts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_filters" ADD CONSTRAINT "user_filters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_feature_idx" ON "ai_usage" USING btree ("feature");--> statement-breakpoint
CREATE UNIQUE INDEX "apartment_listings_listing_unique" ON "apartment_listings" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "apartments_place_id_idx" ON "apartments" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "apartments_geo_idx" ON "apartments" USING btree ("lat","lon");--> statement-breakpoint
CREATE INDEX "listing_attributes_key_value_idx" ON "listing_attributes" USING btree ("key","value");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_extractions_unique" ON "listing_extractions" USING btree ("listing_id","schema_version");--> statement-breakpoint
CREATE INDEX "listing_extractions_place_id_idx" ON "listing_extractions" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "listing_extractions_geo_idx" ON "listing_extractions" USING btree ("lat","lon");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_unique" ON "listings" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "listings_status_idx" ON "listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "listings_posted_at_idx" ON "listings" USING btree ("posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sent_alerts_sent_at_idx" ON "sent_alerts" USING btree ("sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_filter_attributes_req_idx" ON "user_filter_attributes" USING btree ("key","requirement");--> statement-breakpoint
CREATE INDEX "listing_extractions_embedding_hnsw" ON "listing_extractions" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "user_filter_texts_embedding_hnsw" ON "user_filter_texts" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "user_filter_texts_user_kind_idx" ON "user_filter_texts" USING btree ("user_id","kind");