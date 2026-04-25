# Active Context

## Current Focus

Apartment data pipeline rebuild: collectors → shared AI extraction (with tri-state attributes) → cross-source unification → canonical apartments. Replaces flat `listings` table with `raw_posts` + `extractions` + `canonical_apartments` + supporting tables. QStash for async, pgvector for matching.

## Recent Changes

[BUILD-START: wf:wf-20260425T191719Z-2b090b5a]

- Merged `origin/main` (commit d869eaf): Better Auth replaced Supabase Auth.
- Branch renamed `basker-nexite/tyler-v2` → `basker-nexite/data-pipeline`.
- Plan written and approved by user at `/Users/orb/.claude/plans/system-instruction-you-are-working-zippy-fountain.md`.

## Next Steps

- Execute approved plan in phases: schema → shared extractor → queue + extract worker → unification → collector simplification + judge rewire → UI rewire + admin merge queue.

## Decisions

- Build clarification [extraction execution model]: Async via QStash (cheap, simple, retryable, fits Vercel).
- Build clarification [existing listings data]: Fresh start; drop the old table and rebuild from scratch.
- Build clarification [unification matching]: Enable pgvector from day one (better Hebrew/English text matching).
- Build clarification [tri-state attribute storage]: Hybrid — nullable boolean column per stable amenity on `extractions` + a JSONB `extras` for experimental attributes.
- Build clarification [Madlan]: Follow-up; new collector interface (`fetch → RawPost[]`) designed so Madlan slots in by adding one scraper file + one cron route. Not in this PR.
- Build clarification [phone extraction]: Include `phone_e164` on `extractions` for matching; revisit if PII concern surfaces.
- Build clarification [QStash account]: Assumed available; `QSTASH_TOKEN` and `QSTASH_CURRENT_SIGNING_KEY` are one-time env setup in Vercel.
- Build clarification [schema versioning re-extraction]: Manual (admin button) for now; auto-trigger deferred.

## Learnings

- **wf:wf-20260425T191719Z-2b090b5a Phase P1 (Schema foundation) PASS** — All 6 pipeline tables + 3 FK-rebound tables now live on Supabase Postgres. pgvector(768) enabled. Legacy `listings` dropped. ai_usage data (614 rows) preserved across the migration. Drizzle-kit second-pass FK-rebind quirk empirically confirmed: destructive resets + FK-rebound tables need TWO `db:push` invocations to apply. Verifier reproduced and resolved this during phase exit.
- Drizzle 0.36.4 ships first-class `vector(name, { dimensions })` in `drizzle-orm/pg-core` — no `customType` fallback needed for pgvector.
- `AMENITY_KEYS` (11 amenities, camelCase) maps cleanly to database `has_*` boolean columns mirrored on both `extractions` and `canonical_attributes`. Tests enforce `.toHaveLength(11)` to keep the two in sync.

## References

- Plan: /Users/orb/.claude/plans/system-instruction-you-are-working-zippy-fountain.md
- [cc10x-internal] memory_task_id: 6 wf:wf-20260425T191719Z-2b090b5a
- Workflow Artifact: .claude/cc10x/v10/workflows/wf-20260425T191719Z-2b090b5a.json

## Blockers

## Session Settings

AUTO_PROCEED: false

## Last Updated

2026-04-25
