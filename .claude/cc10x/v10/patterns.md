# Patterns

## User Standards
- Use **Bun** as the package manager (not npm/pnpm/yarn).
- Stack: Next.js 15 + Supabase Postgres + Drizzle ORM + Vercel AI Gateway + TypeScript + Zod.
- Admin email is `orbasker@gmail.com` (used for bootstrap SQL, seeds, tests).
- Unified CI script: `bun run ci` (typecheck + tests + knip + prettier — added in commit bbbbd18).

## Common Gotchas
- Drizzle migrations live in `apps/web/drizzle/`. Manual destructive resets follow the `manual_better_auth_reset.sql` pattern: `DO $$ ... $$` block, idempotent with `to_regclass(...)` guards, safe to re-run on `db:push`.
- Auth helpers moved from `lib/supabase/server.ts` (deleted) to `lib/auth-server.ts`: `getCurrentUser()`, `getCurrentAdmin()`, `isAdmin()`.
- `AMENITY_KEYS` (11 amenities) is defined in `packages/shared/src/preferences.ts:6` for user *preferences*. The new pipeline reuses this constant for *extraction* schema so both ends share one source of truth.
- Vercel AI Gateway is configured via `AI_GATEWAY_API_KEY` env in `apps/web/src/lib/gateway.ts`; cost is tracked per-feature via `recordAiUsage()` in `apps/web/src/lib/aiUsage.ts`.
- Vercel function timeout is 60s default (300s for some webhooks). Cron handlers must enqueue work asynchronously rather than process inline batches.
- **drizzle-kit push + destructive `DROP TABLE … CASCADE` + FK rebind needs TWO push invocations.** First push prints CREATE statements but doesn't fully apply FK-rebound tables (e.g., `judgments`/`feedback`/`sent_alerts` after rebind to `canonical_id`). Second push completes. Workaround/long-term: add `apps/web/scripts/verify-schema.ts` chained into `db:push:auto` that does `to_regclass()` checks on every declared table, OR pass `drizzle-kit push --force` for non-interactive destructive applies. (Confirmed by P1 builder + verifier on 2026-04-25.)
- **Manual SQL idempotency under `apply-manual-migrations.ts`**: every `manual_*.sql` MUST guard DML with `to_regclass(...) IS NOT NULL` checks because the script runs every file every time. `manual_pipeline_reset.sql` (P1) and `manual_better_auth_reset.sql` (post-merge surgical fix) do this; `manual_gemini_model_swap.sql` does NOT (pre-existing — would crash on a fresh DB where `preferences` doesn't exist yet). [Deferred]: harden `manual_gemini_model_swap.sql` with a `to_regclass` guard.
- **`apply-manual-migrations.ts:53` has `onnotice: () => {}`** — silently swallows ALL Postgres NOTICE messages. Replace with `(n) => console.log('  NOTICE:', n.message)` when investigating push quirks. [Deferred]: change the onnotice callback to log notices.
- **Audit-trail FK columns** (e.g., `merge_candidates.reviewed_by` → `user.id`) intentionally omit `onDelete: 'cascade'` so deleting a reviewer doesn't erase the audit record. Default `NO ACTION` is correct here; consider `{ onDelete: 'set null' }` if "reviewer left org" is a use case.
- **Project-wide convention: `bigserial` PK paired with `integer` FK columns** — pre-existing pattern from legacy schema, carried over. Postgres allows the implicit cast but caps FKs at ~2.1B rows. Revisit if any table approaches that scale.
- **`extractions.embedding vector(768)` has no HNSW/IVFFlat index** in P1. Sequential-scan cosine search will be slow at scale. Tracked for **P4** (where the index will go into a new `manual_pipeline_indexes.sql` since drizzle-orm v0.36 doesn't yet represent HNSW indexes natively).

## Project SKILL_HINTS

## Last Updated
2026-04-25
