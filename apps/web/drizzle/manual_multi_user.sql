-- Multi-user migration (idempotent).
-- Run via `bun run db:manual` or implicitly via `bun run db:push` / `db:push:auto`.
-- Safe to re-run and safe on a fresh database (skips tables that don't exist yet).
--
-- Prereq for upgrading a pre-existing single-user deploy: at least one user in
-- auth.users with app_metadata.is_admin = true. Bootstrap admin first
-- (see SETUP.md). On a fresh DB with no data, no admin is required — all
-- sections become no-ops and drizzle-kit push creates tables from scratch.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Resolve the admin user id. NULL on a fresh DB; each section below only
--    backfills when it actually has legacy rows to update.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id uuid;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    SELECT id INTO admin_id
    FROM auth.users
    WHERE (raw_app_meta_data->>'is_admin')::boolean = true
    ORDER BY created_at
    LIMIT 1;
  END IF;

  PERFORM set_config(
    'app.admin_user_id',
    COALESCE(admin_id::text, ''),
    true
  );
END
$$;

-- ---------------------------------------------------------------------------
-- 1. preferences: legacy id=1 singleton → per-user (PK = user_id)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id text := current_setting('app.admin_user_id', true);
  pk_name text;
BEGIN
  IF to_regclass('public.preferences') IS NULL THEN
    RETURN;
  END IF;

  -- Only migrate if the legacy `id` column still exists. On a DB that's either
  -- fresh or already migrated, `id` is absent and we skip everything.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'preferences' AND column_name = 'id'
  ) THEN
    RETURN;
  END IF;

  IF admin_id IS NULL OR admin_id = '' THEN
    RAISE EXCEPTION 'preferences migration requires an admin user in auth.users with app_metadata.is_admin = true. Promote one first (see SETUP.md).';
  END IF;

  ALTER TABLE preferences ADD COLUMN IF NOT EXISTS user_id uuid;
  UPDATE preferences SET user_id = admin_id::uuid WHERE user_id IS NULL;
  ALTER TABLE preferences ALTER COLUMN user_id SET NOT NULL;

  SELECT conname INTO pk_name FROM pg_constraint
  WHERE conrelid = 'public.preferences'::regclass AND contype = 'p';
  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE preferences DROP CONSTRAINT %I', pk_name);
  END IF;

  ALTER TABLE preferences DROP COLUMN IF EXISTS id;
  ALTER TABLE preferences ADD PRIMARY KEY (user_id);
END
$$;

-- ---------------------------------------------------------------------------
-- 2. feedback: PK (listing_id) → PK (listing_id, user_id)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id text := current_setting('app.admin_user_id', true);
  pk_name text;
BEGIN
  IF to_regclass('public.feedback') IS NULL THEN
    RETURN;
  END IF;

  -- Already-migrated DB has user_id; fresh DB has no table at all (handled above).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'user_id'
  ) THEN
    RETURN;
  END IF;

  IF admin_id IS NULL OR admin_id = '' THEN
    RAISE EXCEPTION 'feedback migration requires an admin user (see SETUP.md).';
  END IF;

  ALTER TABLE feedback ADD COLUMN user_id uuid;
  UPDATE feedback SET user_id = admin_id::uuid WHERE user_id IS NULL;
  ALTER TABLE feedback ALTER COLUMN user_id SET NOT NULL;

  SELECT conname INTO pk_name FROM pg_constraint
  WHERE conrelid = 'public.feedback'::regclass AND contype = 'p';
  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE feedback DROP CONSTRAINT %I', pk_name);
  END IF;

  ALTER TABLE feedback ADD PRIMARY KEY (listing_id, user_id);
END
$$;

-- ---------------------------------------------------------------------------
-- 3. sent_alerts: PK (listing_id, channel) → PK (listing_id, channel, user_id)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id text := current_setting('app.admin_user_id', true);
  pk_name text;
BEGIN
  IF to_regclass('public.sent_alerts') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sent_alerts' AND column_name = 'user_id'
  ) THEN
    RETURN;
  END IF;

  IF admin_id IS NULL OR admin_id = '' THEN
    RAISE EXCEPTION 'sent_alerts migration requires an admin user (see SETUP.md).';
  END IF;

  ALTER TABLE sent_alerts ADD COLUMN user_id uuid;
  UPDATE sent_alerts SET user_id = admin_id::uuid WHERE user_id IS NULL;
  ALTER TABLE sent_alerts ALTER COLUMN user_id SET NOT NULL;

  SELECT conname INTO pk_name FROM pg_constraint
  WHERE conrelid = 'public.sent_alerts'::regclass AND contype = 'p';
  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sent_alerts DROP CONSTRAINT %I', pk_name);
  END IF;

  ALTER TABLE sent_alerts ADD PRIMARY KEY (listing_id, channel, user_id);
END
$$;

-- ---------------------------------------------------------------------------
-- 4. monitored_groups: attribution + backfill
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id text := current_setting('app.admin_user_id', true);
BEGIN
  IF to_regclass('public.monitored_groups') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE monitored_groups ADD COLUMN IF NOT EXISTS added_by uuid;

  IF admin_id IS NOT NULL AND admin_id <> '' THEN
    UPDATE monitored_groups SET added_by = admin_id::uuid WHERE added_by IS NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. listings: source_group_url column + index + backfill from raw_json
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.listings') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_group_url text;

  CREATE INDEX IF NOT EXISTS listings_source_group_url_idx
    ON listings (source_group_url);

  UPDATE listings
  SET source_group_url = raw_json->>'groupUrl'
  WHERE source_group_url IS NULL
    AND source LIKE 'fb_%'
    AND raw_json->>'groupUrl' IS NOT NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. user_group_subscriptions: per-user catalog subscriptions + admin backfill
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id text := current_setting('app.admin_user_id', true);
BEGIN
  CREATE TABLE IF NOT EXISTS user_group_subscriptions (
    user_id uuid NOT NULL,
    group_url text NOT NULL,
    subscribed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, group_url)
  );

  IF to_regclass('public.monitored_groups') IS NOT NULL
     AND admin_id IS NOT NULL AND admin_id <> '' THEN
    INSERT INTO user_group_subscriptions (user_id, group_url)
    SELECT admin_id::uuid, url
    FROM monitored_groups
    WHERE enabled = true
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

COMMIT;
