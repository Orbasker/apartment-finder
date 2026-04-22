CREATE TABLE "blocked_authors" (
	"profile_url" text PRIMARY KEY NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"listing_id" integer PRIMARY KEY NOT NULL,
	"rating" smallint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judgments" (
	"listing_id" integer PRIMARY KEY NOT NULL,
	"score" integer,
	"decision" text,
	"reasoning" text,
	"red_flags" jsonb,
	"positive_signals" jsonb,
	"model" text,
	"judged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"price_nis" integer,
	"rooms" real,
	"sqm" integer,
	"floor" integer,
	"neighborhood" text,
	"street" text,
	"posted_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_agency" boolean,
	"author_name" text,
	"author_profile" text,
	"raw_json" jsonb,
	"text_hash" text,
	CONSTRAINT "listings_source_unique" PRIMARY KEY("source","source_id")
);
--> statement-breakpoint
CREATE TABLE "monitored_groups" (
	"url" text PRIMARY KEY NOT NULL,
	"label" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_patches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_call_id" text NOT NULL,
	"patch" jsonb NOT NULL,
	"chat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sent_alerts" (
	"listing_id" integer NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sent_alerts_listing_id_channel_pk" PRIMARY KEY("listing_id","channel")
);
