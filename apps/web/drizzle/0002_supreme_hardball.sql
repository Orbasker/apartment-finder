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
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_feature_idx" ON "ai_usage" USING btree ("feature");