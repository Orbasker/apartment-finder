-- BETTER AUTH UUID DEFAULTS - non-destructive, idempotent.
-- Repairs databases where Better Auth UUID primary keys were created without
-- DB-side defaults. Better Auth's Postgres adapter relies on these defaults for
-- internally-created rows such as OAuth state verification records.
DO $$
BEGIN
  IF to_regclass('public.user') IS NOT NULL THEN
    ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();
  END IF;

  IF to_regclass('public.session') IS NOT NULL THEN
    ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();
  END IF;

  IF to_regclass('public.account') IS NOT NULL THEN
    ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();
  END IF;

  IF to_regclass('public.verification') IS NOT NULL THEN
    ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();
  END IF;
END
$$;
