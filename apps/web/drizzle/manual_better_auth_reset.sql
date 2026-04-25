-- BETTER AUTH RESET — destructive, idempotent.
-- One-shot migration for the Supabase Auth → Better Auth cutover. Truncates
-- every user-scoped table since users are not migrated; the admin re-onboards
-- by signing in fresh. Safe to re-run (guarded by to_regclass).
DO $$
BEGIN
  IF to_regclass('public.preferences') IS NOT NULL THEN
    TRUNCATE preferences, feedback, sent_alerts,
             telegram_links, telegram_link_tokens,
             user_group_subscriptions
      RESTART IDENTITY;
  END IF;

  IF to_regclass('public.monitored_groups') IS NOT NULL THEN
    UPDATE monitored_groups SET added_by = NULL;
  END IF;

  -- Better Auth tables: empty on first push, get truncated on re-runs.
  -- Quoting "user" is required (reserved word in Postgres).
  IF to_regclass('public.user') IS NOT NULL THEN
    TRUNCATE "user", "session", "account", "verification" CASCADE;
  END IF;
END
$$;

-- After admin's first sign-in, run manually (NOT part of db:push):
--   UPDATE "user" SET role = 'admin' WHERE email = 'orbasker@gmail.com';
