-- Multi-user migration.
-- Run this ONCE in Supabase SQL editor BEFORE `bun run db:push`.
-- `db:push` cannot do this safely because it would drop+recreate PKs and lose data.
--
-- Prereq: at least one user must exist in auth.users with app_metadata.is_admin = true.
-- Bootstrap admin first (see SETUP.md), then run this migration.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Resolve the admin user id for backfilling existing data.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id
  FROM auth.users
  WHERE (raw_app_meta_data->>'is_admin')::boolean = true
  ORDER BY created_at
  LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin user found. Promote a user first: update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, ''{}''::jsonb) || ''{"is_admin": true}''::jsonb where email = ''<your email>''';
  END IF;

  -- Stash on a temp setting so later statements can reference it.
  PERFORM set_config('app.admin_user_id', admin_id::text, true);
END
$$;

-- ---------------------------------------------------------------------------
-- 1. preferences: id=1 singleton → per-user (PK = user_id)
-- ---------------------------------------------------------------------------
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE preferences
SET user_id = current_setting('app.admin_user_id')::uuid
WHERE user_id IS NULL;

ALTER TABLE preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE preferences DROP CONSTRAINT IF EXISTS preferences_pkey;
ALTER TABLE preferences DROP COLUMN IF EXISTS id;
ALTER TABLE preferences ADD PRIMARY KEY (user_id);

-- ---------------------------------------------------------------------------
-- 2. feedback: PK (listing_id) → PK (listing_id, user_id)
-- ---------------------------------------------------------------------------
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE feedback
SET user_id = current_setting('app.admin_user_id')::uuid
WHERE user_id IS NULL;

ALTER TABLE feedback ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_pkey;
ALTER TABLE feedback ADD PRIMARY KEY (listing_id, user_id);

-- ---------------------------------------------------------------------------
-- 3. sent_alerts: PK (listing_id, channel) → PK (listing_id, channel, user_id)
-- ---------------------------------------------------------------------------
ALTER TABLE sent_alerts ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE sent_alerts
SET user_id = current_setting('app.admin_user_id')::uuid
WHERE user_id IS NULL;

ALTER TABLE sent_alerts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sent_alerts DROP CONSTRAINT IF EXISTS sent_alerts_pkey;
ALTER TABLE sent_alerts ADD PRIMARY KEY (listing_id, channel, user_id);

-- ---------------------------------------------------------------------------
-- 4. monitored_groups: add attribution column
-- ---------------------------------------------------------------------------
ALTER TABLE monitored_groups
  ADD COLUMN IF NOT EXISTS added_by uuid;

-- Backfill: every existing group is attributed to the admin.
UPDATE monitored_groups
SET added_by = current_setting('app.admin_user_id')::uuid
WHERE added_by IS NULL;

-- ---------------------------------------------------------------------------
-- 5. listings: source_group_url for per-user FB filtering
-- ---------------------------------------------------------------------------
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_group_url text;

CREATE INDEX IF NOT EXISTS listings_source_group_url_idx
  ON listings (source_group_url);

-- Backfill source_group_url from raw_json for FB rows where present.
UPDATE listings
SET source_group_url = raw_json->>'groupUrl'
WHERE source_group_url IS NULL
  AND source LIKE 'fb_%'
  AND raw_json->>'groupUrl' IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. user_group_subscriptions: per-user catalog subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_group_subscriptions (
  user_id uuid NOT NULL,
  group_url text NOT NULL,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_url)
);

-- Backfill: admin subscribes to every currently-enabled group.
INSERT INTO user_group_subscriptions (user_id, group_url)
SELECT current_setting('app.admin_user_id')::uuid, url
FROM monitored_groups
WHERE enabled = true
ON CONFLICT DO NOTHING;

COMMIT;
