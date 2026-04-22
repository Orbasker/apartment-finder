-- Telegram per-user linking (idempotent).
-- Adds tables that map Telegram chats to Supabase users so the bot can
-- operate on the linked user's preferences/data instead of the admin's.

BEGIN;

CREATE TABLE IF NOT EXISTS "telegram_links" (
  "chat_id" text PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "telegram_links_user_id_idx"
  ON "telegram_links" ("user_id");

CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
  "token" text PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "telegram_link_tokens_user_id_idx"
  ON "telegram_link_tokens" ("user_id");

COMMIT;
