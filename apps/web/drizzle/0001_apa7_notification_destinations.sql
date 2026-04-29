CREATE TYPE "public"."notification_destination" AS ENUM('email', 'telegram');--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notification_destinations" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"telegram_enabled" boolean DEFAULT false NOT NULL,
	"telegram_chat_id" text,
	"telegram_linked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sent_alerts" ADD COLUMN "destination" "notification_destination" DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "sent_alerts" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "sent_alerts" DROP CONSTRAINT "sent_alerts_user_id_apartment_id_pk";--> statement-breakpoint
ALTER TABLE "sent_alerts" ADD CONSTRAINT "sent_alerts_user_id_apartment_id_destination_pk" PRIMARY KEY("user_id","apartment_id","destination");--> statement-breakpoint
ALTER TABLE "sent_alerts" DROP COLUMN "resend_message_id";--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_destinations" ADD CONSTRAINT "user_notification_destinations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_user_expires_idx" ON "telegram_link_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_notification_destinations_telegram_chat_unique" ON "user_notification_destinations" USING btree ("telegram_chat_id") WHERE "user_notification_destinations"."telegram_chat_id" IS NOT NULL;
