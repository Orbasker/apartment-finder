CREATE TYPE "public"."collection_run_status" AS ENUM('queued', 'collecting', 'collected', 'ingesting', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "collection_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"source" "listing_source" NOT NULL,
	"status" "collection_run_status" DEFAULT 'queued' NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"collected_at" timestamp with time zone,
	"webhook_received_at" timestamp with time zone,
	"raw_blob_url" text,
	"received_count" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"skipped_existing" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "collection_runs_run_id_unique" ON "collection_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "collection_runs_source_idx" ON "collection_runs" USING btree ("source","enqueued_at");