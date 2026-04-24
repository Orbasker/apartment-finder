-- Swap legacy Anthropic Claude model IDs in stored user preferences to
-- google/gemini-2.5-flash. Idempotent: only rewrites rows whose ai.*Model
-- fields still point at anthropic/claude-*.

BEGIN;

UPDATE "preferences"
SET "data" = jsonb_set(
  "data",
  '{ai,primaryModel}',
  '"google/gemini-2.5-flash"'::jsonb,
  true
),
    "updated_at" = now()
WHERE "data" #>> '{ai,primaryModel}' LIKE 'anthropic/claude-%';

UPDATE "preferences"
SET "data" = jsonb_set(
  "data",
  '{ai,escalationModel}',
  '"google/gemini-2.5-flash"'::jsonb,
  true
),
    "updated_at" = now()
WHERE "data" #>> '{ai,escalationModel}' LIKE 'anthropic/claude-%';

COMMIT;
