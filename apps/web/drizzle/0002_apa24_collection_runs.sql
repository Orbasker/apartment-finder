-- APA-24: Add collection_runs audit table to track every collector run from
-- enqueue through completion. Each row represents one collection cycle
-- (yad2 poll or Apify run). The runId column has a UNIQUE constraint used
-- as the idempotency anchor in the webhook handler (UPDATE ... WHERE
-- webhookReceivedAt IS NULL RETURNING id returns 0 rows on replay).
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
	"error" text,
	CONSTRAINT "collection_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE INDEX "collection_runs_source_idx" ON "collection_runs" USING btree ("source","enqueued_at");