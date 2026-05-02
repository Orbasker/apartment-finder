CREATE TYPE "public"."user_apartment_status_kind" AS ENUM('new', 'interested', 'contacted', 'visited', 'rejected');--> statement-breakpoint
CREATE TABLE "user_apartment_status" (
	"user_id" uuid NOT NULL,
	"apartment_id" integer NOT NULL,
	"status" "user_apartment_status_kind" DEFAULT 'new' NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_apartment_status_user_id_apartment_id_pk" PRIMARY KEY("user_id","apartment_id")
);
--> statement-breakpoint
ALTER TABLE "sent_alerts" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_apartment_status" ADD CONSTRAINT "user_apartment_status_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_apartment_status" ADD CONSTRAINT "user_apartment_status_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_apartment_status_user_status_idx" ON "user_apartment_status" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sent_alerts_user_unseen_idx" ON "sent_alerts" USING btree ("user_id") WHERE "sent_alerts"."seen_at" IS NULL;