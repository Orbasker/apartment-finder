-- PIPELINE RESET — destructive, idempotent.
-- Replaces the flat `listings` ingestion with a three-layer pipeline:
--   raw_posts → extractions → canonical_apartments
-- The system is not yet live, so dropping legacy data is intentional.
-- judgments / feedback / sent_alerts have their FK rebound from listing_id
-- to canonical_id, so they restart empty and Drizzle re-creates them with
-- the new shape on the next `db:push`.
--
-- Safe to re-run: every drop is guarded by IF EXISTS, and the extension
-- creation is IF NOT EXISTS. Order: extension first so columns of type
-- vector(768) can be created when Drizzle runs after this script.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  -- Drop legacy + about-to-be-rebuilt tables. CASCADE handles the FKs that
  -- judgments/feedback/sent_alerts had pointing at listings.
  IF to_regclass('public.listings') IS NOT NULL THEN
    DROP TABLE listings CASCADE;
  END IF;
  IF to_regclass('public.judgments') IS NOT NULL THEN
    DROP TABLE judgments CASCADE;
  END IF;
  IF to_regclass('public.sent_alerts') IS NOT NULL THEN
    DROP TABLE sent_alerts CASCADE;
  END IF;
  IF to_regclass('public.feedback') IS NOT NULL THEN
    DROP TABLE feedback CASCADE;
  END IF;
END
$$;
