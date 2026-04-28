# AGENTS.md

Living documentation for AI agents and contributors working on this repo. Reflects the **current** state — keep this file updated as you change the system.

## Product

Hebrew-only Tel Aviv apartment finder. Users define their preferences via a conversational chat (or edit form), and get **instant email alerts** the moment a new listing matches. No browse UI, no admin panel — chat + email only.

The system is multi-user with [Better Auth](https://better-auth.dev) (email-OTP via Resend, optional Google OAuth). Each user has their own filter set; matching is filter-only (no AI judging/scoring).

## Non-negotiable conventions

- **Hebrew-only**, RTL. `<html lang="he" dir="rtl">`. Use Tailwind v4 logical classes (`ms-*` / `me-*` / `ps-*` / `pe-*`, `start-*` / `end-*`) — never the LTR-physical (`ml-*`, `mr-*`).
- **Mobile-first**. Design for ~375px viewport first; scale up via `sm:`/`md:`/`lg:` modifiers. Tap targets ≥ 44px. Single-column at base.
- **Bidi safety**: wrap numerics/Latin inside Hebrew copy in `<bdi>` (e.g. `<bdi>₪7,500</bdi>`).
- **All outbound email goes through React Email.** Never construct raw HTML strings inline in `auth.ts`, `notify.ts`, or anywhere else. Add a component under `apps/web/src/emails/<Name>.tsx` using `@react-email/components` (`Html`, `Body`, `Container`, `Section`, `Heading`, `Text`, `Button`, `Preview`, etc.), then `await render(<Component {...props} />)` from `@react-email/render` at the call site and pass both `html` and `text` (with `{ plainText: true }`) to `resend.emails.send`. Always set `<Html lang="he" dir="rtl">` and wrap numerics/Latin in `<bdi>`. Preview each new template with `bun run email:dev`.
- **No backward compatibility**. Schema is fresh, migrations don't preserve legacy data, drop-and-recreate is OK.
- Default to **no comments**. Only document non-obvious WHY.

## High-level flow

```
                        ┌─────────────────────┐
                        │ collectors (Yad2,   │
                        │ Apify→Facebook)     │
                        └──────────┬──────────┘
                                   │
                          bulk INSERT INTO listings
                                   │  (status=pending)
                                   ▼
                        ┌─────────────────────┐
                        │ processListing(id)  │  inline, concurrency=4
                        │  ├─ extract (LLM)   │
                        │  ├─ geocode (Google)│  + geocode_cache
                        │  ├─ embed (1536d)   │
                        │  ├─ persist + KV    │
                        │  ├─ unify (4-step)  │  → apartments
                        │  ├─ match (SQL+JS)  │
                        │  └─ notify (Resend) │  + sent_alerts dedup
                        └─────────────────────┘
```

User side:

```
   /onboarding (chat)    →  user_filters + user_filter_attributes
   /filters (form)       →  same tables (edit later)
   email alert on match  ←  sent_alerts dedup + dailyAlertCap
```

## Tech stack

- **Next.js 15.5** App Router, React 19, TypeScript strict
- **Tailwind v4** (`@tailwindcss/postcss`)
- **Better Auth 1.6** with Drizzle adapter (UUID PKs)
- **Drizzle ORM 0.36** + `postgres` driver
- **Postgres** on Supabase (pgvector ≥ 0.5 required for HNSW)
- **AI Gateway** (`@ai-sdk/gateway`) → Gemini 2.5 Flash + `gemini-embedding-001`
- **AI SDK 5** (`ai`) — `generateObject`, `embed`, `streamText`. `@ai-sdk/react@2` for `useChat` (pinned to v2 to match `ai@5`; v3 transitively pulls in `ai@6` which has incompatible types)
- **Resend 6** for outbound email (sign-in OTP + match alerts) + **React Email** (`@react-email/components`, `@react-email/render`) for every template — see `apps/web/src/emails/`
- **Apify** for Facebook group scraping
- **Yad2 proxy** (`services/yad2-proxy/`) for Israeli-IP egress; Yad2 blocks Vercel IPs
- **Bun 1.3** workspace, **Turbo 2.9**, **vitest** for tests, **knip** for dead-code

## Repo layout

```
apps/
  web/                          Next.js app
    app/                        App Router routes
      (app)/                    Auth-gated layout group
        page.tsx                Status home (redirects to /onboarding if onboardedAt is null)
        layout.tsx              Header (brand + nav + user menu)
        nav-links.tsx           HeaderBrandLink + PrimaryNav (Hebrew)
        user-menu.tsx           Profile dropdown + sign-out
        profile-actions.ts      Server action for sign-out
        onboarding/             Hebrew chat-based filter setup
          page.tsx              Server shell + intro
          chat-ui.tsx           useChat client (mobile-first bubbles)
        filters/                Form-based filter editor
          page.tsx              Server shell, loads filters
          form.tsx              Client form (RTL, mobile-first, sticky submit)
          actions.ts            saveFiltersAction (server action)
      login/                    Email-OTP + Google sign-in (Hebrew, two-step, mobile-first)
      api/
        auth/[...all]/          better-auth routes
        chat/onboarding/        Streaming chat endpoint (streamText + tools)
        cron/poll-yad2/         Cron handler — fetch + process inline
        cron/poll-apify/        Cron handler — kicks off Apify run
        webhooks/apify/         Receives Apify completion, processes dataset
    drizzle/                    Migrations (single 0000_*.sql init)
    src/
      db/
        index.ts                getDb()
        schema.ts               Single source of truth for tables
        schema.test.ts
      filters/store.ts          loadFilters / upsertFilters / setAttribute /
                                  replaceAttributes / addText / replaceTexts /
                                  markOnboarded / countActive
      onboarding/
        agent.ts                ONBOARDING_MODEL + ONBOARDING_SYSTEM (Hebrew prompt)
        tools.ts                buildOnboardingTools(userId) — 10 tools the
                                  chat agent calls to upsert filters
      emails/                   React Email templates (RTL Hebrew, mobile-
                                  friendly card layout, plain-text fallback).
                                  All outbound email MUST go through here.
        MatchAlert.tsx          New-apartment match alert
        MatchAlert.test.tsx     Render-output assertions
        SignInCode.tsx          Email-OTP code (used by auth.ts)
      ingestion/                Collect → extract → ... → notify
        extract.ts              Gemini extraction
        geocode.ts              Google Geocoding + geocode_cache
        embed.ts                gemini-embedding-001 @ 1536 dims
        unify.ts                find-or-create apartment
        match.ts                SQL prefilter + attribute + dealbreaker
        notify.ts               Resend HTML alert (RTL Hebrew)
        insert.ts               bulkInsertListings()
        pipeline.ts             processListing() orchestrator
      jobs/cron.ts              runYad2PollJob() / runApifyPollJob()
      scrapers/yad2.ts          Yad2 fetch + normalize
      integrations/apify.ts     Apify run + dataset fetch
      lib/
        auth.ts                 better-auth setup
        auth-server.ts          getCurrentUser, isAdmin
        auth-client.ts          client-side hooks
        gateway.ts              model() + textEmbeddingModel()
        env.ts                  zod-validated env
        log.ts                  createLogger, withApiLog
        schedule.ts             cron schedule helpers (Asia/Jerusalem)
        cronAuth.ts             verifyCronRequest
        appOrigin.ts            resolveAppPublicOrigin
        utils.ts                cn() helper
        contentHash.ts          sha256 helper
        aiUsage.ts              recordAiUsage + cost estimate
      components/ui/            shadcn-style primitives (Button, Card, etc.)
    middleware.ts               Auth gate (redirects to /login)
    drizzle.config.ts
    vercel.json                 Cron config
packages/
  shared/                       @apartment-finder/shared
    src/
      filters.ts                FiltersSchema, APARTMENT_ATTRIBUTE_KEYS, labels
      listing.ts                NormalizedListingSchema, ListingSource
      extraction.ts             ExtractionSchema (structured + attributes[])
      index.ts
services/
  yad2-proxy/                   Cloud Run proxy in me-west1 for Yad2 egress
vitest.config.ts                Path alias `@` → apps/web/src
knip.json
turbo.json
```

## Database schema (current)

Single `0000_*.sql` migration (drizzle-generated, hand-extended with `CREATE EXTENSION vector` + HNSW indexes).

### Enums

| Enum                      | Values                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listing_source`          | `yad2`, `facebook`                                                                                                                                                                                                                               |
| `listing_status`          | `pending`, `extracted`, `geocoded`, `embedded`, `unified`, `failed`                                                                                                                                                                              |
| `apartment_attribute_key` | 17 keys: `elevator`, `parking`, `balcony`, `air_conditioning`, `furnished`, `renovated`, `pet_friendly`, `safe_room`, `storage`, `accessible`, `bars`, `ground_floor`, `roof_access`, `shared_apartment`, `garden`, `pool`, `solar_water_heater` |
| `attribute_requirement`   | `required_true`, `required_false`, `preferred_true`, `dont_care`                                                                                                                                                                                 |
| `attribute_source`        | `ai`, `user`, `manual`                                                                                                                                                                                                                           |
| `filter_text_kind`        | `wish`, `dealbreaker`                                                                                                                                                                                                                            |

### Tables

- **`listings`** — per-source observation. Unique `(source, source_id)`. `status` advances through the pipeline.
- **`listing_extractions`** — AI-extracted structured fields per listing+schema_version. Includes `embedding vector(1536)` (HNSW index, cosine ops). Geocoded fields (`place_id`, `lat`, `lon`, `geocode_confidence`).
- **`listing_attributes`** — KV booleans, **NOT NULL value** (absence-of-row = unknown). PK `(listing_id, key)`.
- **`apartments`** — canonical entity with Google `place_id` + lat/lon + latest price/rooms/sqm.
- **`apartment_listings`** — M:N linking apartments to listings, with `confidence` and `matched_by` (`place_id` / `geo_radius` / `embedding` / `created`). Unique on `listing_id` (one listing → one apartment).
- **`user_filters`** — one row per user. Hot-path columns (price/rooms/sqm), text arrays for neighborhoods/wishes/dealbreakers, `strict_unknowns`, `daily_alert_cap`, `is_active`.
- **`user_filter_attributes`** — normalized per-attribute requirements. PK `(user_id, key)`.
- **`user_filter_texts`** — embedded wishes/dealbreakers. `vector(1536)` with HNSW. Cosine-compared against listing embedding at match time.
- **`sent_alerts`** — outbox dedup. PK `(user_id, apartment_id)`.
- **`geocode_cache`** — keyed by normalized address string. Cuts Google Geocoding spend ~60%.
- **`ai_usage`** — token + cost telemetry per AI call.
- **`blocked_authors`** — anti-spam list (FB profiles).
- Better-Auth tables: **`user`**, **`session`**, **`account`**, **`verification`** (UUID PKs with DB-side defaults).

## Ingestion pipeline (per listing)

Implemented inline in cron + webhook handlers with concurrency=4. `maxDuration=300`.

1. **extract** (`ingestion/extract.ts`) — Gemini 2.5 Flash via `generateObject`. Returns `{ structured fields, attributes: [{key, value: bool}] }`. Unknown attributes are simply absent.
2. **geocode** (`ingestion/geocode.ts`) — Google Geocoding (`language=he&region=il`) with `geocode_cache` lookup/write.
3. **embed** (`ingestion/embed.ts`) — `gemini-embedding-001` with `providerOptions.google.outputDimensionality=1536`. Embeds composed text: `${neighborhood} ${street} ${rooms} ${sqm} ${description}`.
4. **persist** — write `listing_extractions` + `listing_attributes` rows.
5. **unify** (`ingestion/unify.ts`) — priority match:
   1. exact `place_id` (confidence 0.95)
   2. lat/lon ≤ 25m + |rooms| ≤ 0.5 + sqm within 15% (0.85)
   3. embedding cosine ≥ 0.92 within ±200m bbox (0.70)
   4. create new apartment (1.0)
6. **match** (`ingestion/match.ts`) — SQL prefilter on `user_filters` (price/rooms/sqm/neighborhoods, all-active only). Per-candidate: load `user_filter_attributes`, run `checkAttributeRequirements` (strictUnknowns honored). Then dealbreaker cosine ≤ 0.35 → fail.
7. **notify** (`ingestion/notify.ts`) — Resend HTML email (Hebrew RTL, `<bdi>` for numerics, matched-attribute summary, "מידע נוסף על הנכס" data table from the primary listing's extraction). Enforces `sent_alerts` dedup + per-user `daily_alert_cap`.

## Pages

| Path          | Auth     | Purpose                                                                                                                                                                                                                  |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`      | public   | Hebrew sign-in (Google OAuth + 6-digit email OTP via Resend, two-step UI).                                                                                                                                               |
| `/`           | required | Status home. Redirects to `/onboarding` when `user_filters.onboarded_at` is null; otherwise shows alert status + links.                                                                                                  |
| `/onboarding` | required | Conversational chat agent (Hebrew, mobile-first). Walks user through ≥3 filters via 10 tools, then calls `completeOnboarding` to set `onboarded_at`.                                                                     |
| `/filters`    | required | Form-based filter editor. Save action upserts `user_filters`, replaces `user_filter_attributes` row-by-row, replaces `user_filter_texts` (and re-embeds wishes/dealbreakers). Submitting also marks onboarding complete. |

The onboarding chat route is `POST /api/chat/onboarding` — `streamText` with the `ONBOARDING_SYSTEM` prompt, tools from `buildOnboardingTools(userId)`, capped at 8 steps (`stopWhen: stepCountIs(8)`).

## Auth

`apps/web/src/lib/auth.ts`:

- Better Auth 1.6 + Drizzle adapter
- 6-digit email OTP (5-min expiry) via Resend, rendered from `src/emails/SignInCode.tsx`
- Google OAuth (`socialProviders.google`)
- `admin` plugin + `nextCookies` plugin
- `middleware.ts` redirects unauthed users to `/login`

## Cron jobs

`apps/web/vercel.json`:

- `/api/cron/poll-yad2` — `0 5,9,13,17,20 * * *`
- `/api/cron/poll-apify` — `0 12 * * *`

Apify webhooks hit `/api/webhooks/apify` directly.

Both authenticated via `Authorization: Bearer $CRON_SECRET` (`verifyCronRequest`).

## Environment variables

See `.env.example` for the full list. Required for full pipeline:

- `DATABASE_URL` (Supabase Postgres with pgvector)
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (Google OAuth)
- `AI_GATEWAY_API_KEY` (Gemini extraction + embeddings)
- `GOOGLE_GEOCODING_API_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `CRON_SECRET`
- `APIFY_TOKEN`, `APIFY_WEBHOOK_SECRET`, `APP_PUBLIC_ORIGIN`, `FACEBOOK_GROUP_URLS` (comma-separated)
- `YAD2_PROXY_URL`, `YAD2_PROXY_SECRET` (Cloud Run proxy)

## Local dev

```bash
bun install
cp .env.example .env       # fill values
bun run db:push            # apply schema (drizzle-kit push, drops + recreates)
bun --filter @apartment-finder/web dev   # start Next.js
```

## CI

```bash
bun run ci   # = format:check + lint + typecheck + knip + vitest
```

CI runs from repo root via Bun + Turbo.

## Tests

70 vitest tests, no live DB:

- `db/schema.test.ts` — pin enums, tables, FKs, indexes, dimensions.
- `ingestion/match.test.ts` — `checkAttributeRequirements` matrix.
- `ingestion/unify.test.ts` — haversine + vector literal.
- `lib/{schedule,aiUsage,contentHash}.test.ts`.
- `scrapers/yad2.test.ts` — mocked fetch.
- `packages/shared/src/extraction.test.ts`.

Add tests for pure logic when changing it. DB-touching code stays integration-tested manually for now.

## In progress

All planned MVP PRs (#56 demolition → #62 schema → #63 ingestion → #64 onboarding → #65 React Email → #66 polish) are merged. Current branch ships email-OTP sign-in, the React Email convention, and the `db:reset` script.

## Accessibility notes

- Skip-to-content link in `app/layout.tsx` (visible on keyboard focus only). Auth layout has `<main id="main-content">` as the target.
- Onboarding chat container has `role="log"` + `aria-live="polite"` so screen readers announce new turns.
- Errors in the chat use `role="alert"`; the completion banner uses `role="status"`.
- Sign-in OTP email is Hebrew RTL (rendered from `apps/web/src/emails/SignInCode.tsx`).
- All buttons have explicit `type="button"` (defaults would submit forms accidentally).
- Inputs use `<Label>` siblings; numeric fields force `dir="ltr"` so digits render LTR inside the RTL page.

## Things deferred

- **Vercel Workflow** for the per-listing pipeline. Today the cron handler runs everything inline with concurrency=4. Fine at MVP scale; revisit if budgets get tight.
- **Browse UI** is intentionally absent. Don't add one without product approval.
- **Telegram / browser extension / admin panel** — all removed in PR1; do not bring back.
- **AI judging / scoring** — removed; matching is filter-only.
