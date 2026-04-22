# Apartment Finder

Single-user system that watches Yad2 (and later Facebook groups) for Tel Aviv apartments, filters with AI against your preferences, and pushes alerts to Telegram.

See [`SETUP.md`](./SETUP.md) for the full Phase 1 setup walkthrough — **start there**.

## Status

- ✅ Phase 1 scaffold (monorepo, Next.js, Drizzle schema, Yad2 scraper, rule filter, Telegram bot skeleton, cron route)
- ⏳ Phase 2 — AI judge via Vercel AI Gateway
- ⏳ Phase 3 — Facebook open groups via Apify
- ⏳ Phase 4 — Conversational Telegram agent + dashboard
- ⏳ Phase 5 — Closed groups Chrome extension
- ⏳ Phase 6 — Polish

## Stack

- **Monorepo:** Bun workspaces + Turbo
- **App:** Next.js 15 (App Router, RSC)
- **DB:** Supabase Postgres + Drizzle ORM
- **Scheduler:** Vercel Cron
- **AI:** Vercel AI Gateway + `ai` SDK (Claude Haiku 4.5 primary, Sonnet 4.6 escalation)
- **Telegram:** `grammy`
- **Email:** Resend (Phase 4)
- **FB groups:** Apify (Phase 3)
- **Closed groups:** Chrome extension (Phase 5)

## Layout

```
apartment-finder/
├── apps/web/                 # Next.js app (backend + dashboard)
│   ├── app/api/              # Route handlers (cron, webhooks, ingest)
│   ├── app/dashboard/        # Phase 4 — Next.js dashboard
│   └── src/
│       ├── pipeline/         # normalize, dedup, ruleFilter, notifier, judge (Phase 2)
│       ├── scrapers/yad2.ts
│       ├── integrations/     # telegram, apify (Phase 3), resend (Phase 4)
│       ├── db/               # Drizzle schema + client
│       ├── preferences/      # load/save prefs JSONB
│       └── lib/              # env, cronAuth, ai gateway (Phase 2)
└── packages/shared/          # Zod schemas shared with extension (Phase 5)
```

## Local dev

```bash
bun install
cp .env.example .env          # fill in DATABASE_URL + TELEGRAM_BOT_TOKEN at minimum
bun run db:push               # push Drizzle schema to your Supabase Postgres
bun run dev                   # Next.js dev server on :3000
```

Trigger the cron manually (no Vercel):

```bash
curl http://localhost:3000/api/cron/poll-yad2
```
