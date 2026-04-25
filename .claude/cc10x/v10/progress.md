# Progress

## Current Workflow
BUILD: Apartment data pipeline rebuild (multi-phase).

## Tasks
- P2: Shared extraction schema + extractor (pending) — packages/shared/src/extraction.ts, apps/web/src/pipeline/extract.ts
- P3: Queue + extract worker (pending)
- P4: Unification + worker (pending; includes HNSW index)
- P5: Collector simplification + judge rewire + cleanup (pending; addresses 40 legacy `listings` references)
- P6: UI rewire + admin merge queue (pending)
- (Deferred follow-up) Harden manual migrations: idempotency-guard `manual_gemini_model_swap.sql`; log Postgres NOTICEs in `apply-manual-migrations.ts`; add `apps/web/scripts/verify-schema.ts` chained into `db:push:auto`.

## Completed
- P1 Schema foundation (2026-04-25) — wf:wf-20260425T191719Z-2b090b5a — builder PASS (34/34 schema tests, live db:push), reviewer APPROVE (0 critical), hunter ISSUES_FOUND (0 critical, 3 HIGH pre-existing tooling deferred), verifier PASS (7/7 phase-exit checks reconciled).

## Verification
- **wf-20260425T191719Z-2b090b5a P1 Schema foundation: PASS — 7/7 phase-exit checks verified on a live Supabase Postgres**: typecheck schema-narrow ✓, db:push idempotency ✓, 6 pipeline tables present ✓, pgvector(768) enabled ✓, legacy listings dropped ✓, auth/preferences/aiUsage/monitoredGroups intact (ai_usage 614 rows preserved) ✓, schema test 34/34 ✓. Drizzle-kit second-pass FK-rebind quirk empirically reproduced and resolved during verification.

## Last Updated
2026-04-25
