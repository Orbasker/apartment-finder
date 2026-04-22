# Phase 1 Setup — What You Need To Do

Phase 1 gets Yad2 alerts flowing to Telegram. **No AI yet** (that's Phase 2). Below is everything you need to do outside of the code.

## 0. Make sure secrets stay out of git

`.env` is gitignored (check `.gitignore` — lines `.env` + `.env.*` with a `!.env.example` exception). Don't bypass it. Never paste real secrets into a chat, a commit message, or the README.

## 1. Install dependencies

```bash
bun install
```

## 2. Create Supabase project (free tier)

1. Go to https://supabase.com/dashboard/new
2. Create a new project. Save the DB password — you'll need it once.
3. Wait ~2 min for provisioning.
4. In the dashboard:
   - **Project Settings → Database → Connection string → URI**
     - Pick the **Transaction pooler** (port `6543`) — this is what serverless needs.
     - Copy the URL, replace `[YOUR-PASSWORD]` with your DB password.
     - This goes into `DATABASE_URL`.
   - **Project Settings → API**
     - `Project URL` → `SUPABASE_URL`
     - `anon public` key → `SUPABASE_ANON_KEY`
     - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` (never expose this to the browser)

## 3. Create the Telegram bot

1. On Telegram, open **@BotFather**.
2. Send `/newbot`. Pick a name and a username (must end in `bot`).
3. BotFather replies with the bot token → `TELEGRAM_BOT_TOKEN`.
4. (Optional for now) Set a description: `/setdescription`.

Generate random secrets for the other two Telegram vars:

```bash
# macOS
openssl rand -hex 32   # use for TELEGRAM_WEBHOOK_SECRET
openssl rand -hex 32   # use for CRON_SECRET (reuse for Vercel too)
```

## 4. Create `.env` locally

```bash
cp .env.example .env
```

Fill in **at minimum**:

- `DATABASE_URL` (Supabase pooler)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `CRON_SECRET`

Leave the AI Gateway / Apify / Resend vars empty for now.

## 5. Push the DB schema

```bash
bun run db:push
```

This creates all the tables in `apps/web/src/db/schema.ts` in your Supabase Postgres. You can verify in Supabase → **Table Editor**.

## 6. Local smoke test

```bash
bun run dev
```

Then in another terminal:

```bash
# Trigger the Yad2 poll manually:
curl -s http://localhost:3000/api/cron/poll-yad2 | jq
```

You should see a JSON response like `{ "ok": true, "fetched": 40, "inserted": 40, "passed": 12, ... }`.

**Note:** alerts won't fire yet because no chat_id is registered. Keep reading.

## 7. Deploy to Vercel

1. Push this repo to GitHub (create a new private repo).
2. https://vercel.com/new → import the repo.
3. **⚠️ Root Directory: `apps/web`** (monorepo — Next.js lives in `apps/web`, not the repo root). If you skip this, the build fails with `Error: No Next.js version detected`. You can change it later under Project Settings → General → Root Directory. **Framework preset:** Next.js. **Build command:** leave default. **Install command:** leave default — Vercel detects `bun.lock` and uses `bun install` automatically.
4. **Environment Variables** — add all of these from your `.env`:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `CRON_SECRET`
5. Deploy.

**Cron jobs** are defined in `apps/web/vercel.json` and are picked up automatically on deploy (Pro plan).

## 8. Wire Telegram to your deployed webhook

After Vercel gives you a production URL, use the stable production domain from the dashboard, not localhost and not a preview deployment URL.

```bash
BOT=<your TELEGRAM_BOT_TOKEN>
URL=https://<your-vercel-url>/api/telegram/webhook
SECRET=<your TELEGRAM_WEBHOOK_SECRET>

curl -s "https://api.telegram.org/bot$BOT/setWebhook" \
  --data-urlencode "url=$URL" \
  --data-urlencode "secret_token=$SECRET"
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`.

You can also run:

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
  bun run telegram:webhook --url https://<your-production-domain>.vercel.app
```

Then verify with `getWebhookInfo`: `url` should be populated and `last_error_message` should be absent.

## 9. Register your chat for alerts

1. Open your bot on Telegram.
2. Send `/start`.
3. The bot replies with your chat_id and saves it to the `preferences` table.
4. From now on, every matching Yad2 listing within the last 24h posts here.

Verify with `/ping` → bot replies `pong`.

## 10. Seed your preferences

Right now the bot uses the defaults in `packages/shared/src/preferences.ts`:

```
budget.maxNis: 8000
rooms: { min: 2, max: 4 }
allowedNeighborhoods: []       ← empty = accepts any TA neighborhood
blockedNeighborhoods: []
maxAgeHours: 24
```

To tune without the dashboard (which lands in Phase 4), open Supabase → Table Editor → `preferences` row `id=1` → edit the `data` JSONB directly. Or give me your numbers and I'll seed them via a script.

---

## Checklist you're looking for

**Before we move to Phase 2, I need from you:**

- [ ] Supabase project created; `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env` and Vercel
- [ ] Telegram bot created via BotFather; `TELEGRAM_BOT_TOKEN` in `.env` and Vercel
- [ ] `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET` generated (`openssl rand -hex 32`), in `.env` and Vercel
- [ ] Repo pushed to GitHub (private)
- [ ] Vercel project linked; env vars set; deploy succeeded
- [ ] Telegram webhook set via `setWebhook` curl
- [ ] `/start` sent to the bot; chat registered
- [ ] Your real apartment preferences (budget, rooms, neighborhoods, deal-breakers) sent back to me so I can seed them

**Phase 2 will additionally need:**

- [ ] `AI_GATEWAY_API_KEY` (Vercel dashboard → AI Gateway → create key)
- [ ] Anthropic credits added to the Gateway (so Haiku/Sonnet calls work)

**Phase 3 will additionally need:**

- [ ] Apify account + `APIFY_TOKEN`
- [ ] 5–10 Facebook group URLs to monitor
- [ ] `APIFY_WEBHOOK_SECRET` (random string you choose and paste into the actor config)

**Phase 4 will additionally need:**

- [ ] Resend account + `RESEND_API_KEY` (for email alerts; verify your sending domain if going to prod)
- [ ] Supabase Auth: enable Magic Link provider; add your email to the allowlist (Authentication → Providers → Email + Authentication → Users)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in `.env` and Vercel (same values as the server-side ones — the `NEXT_PUBLIC_` prefix just ships them to the browser for the login page)

---

## Admin access (for `/dashboard/admin`)

Admin role is stored in `auth.users.raw_app_meta_data.is_admin`. Supabase exposes this as
`user.app_metadata.is_admin` and does not let clients modify it, so it's safe to use for gating.

**Promote a user to admin** — Supabase Dashboard → SQL editor:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
where email = 'orbasker@gmail.com';
```

**Revoke admin:**

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'is_admin'
where email = 'orbasker@gmail.com';
```

Users need to sign out/in (or let their JWT refresh) for the change to take effect.

Alternative: Supabase Dashboard → Authentication → Users → click user → edit `app_metadata` JSON.

---

## Multi-user migration (one-time, when upgrading an existing single-user deploy)

This migration changes primary keys on `preferences`, `feedback`, and `sent_alerts` to be per-user, and adds a `monitored_groups.added_by` column plus a new `user_group_subscriptions` table. Because the PK changes are destructive, you cannot just run `db:push` — the existing data has to be backfilled to the admin user first.

**Order matters. Do this in one session.**

1. **Promote the admin** (see "Admin access" above) so `auth.users` has at least one user with `raw_app_meta_data.is_admin = true`.
2. **Open Supabase SQL editor** and paste the entire contents of `apps/web/drizzle/0003_multi_user.sql`. Run it. This:
   - resolves the admin user id from `auth.users`
   - drops the old single-row PKs and adds `user_id` columns
   - backfills every existing `preferences` / `feedback` / `sent_alerts` row to the admin user
   - adds the new composite PKs and FKs
   - adds `monitored_groups.added_by`, `listings.source_group_url` + index
   - creates `user_group_subscriptions` with a row per existing enabled group, subscribing the admin
3. **Sync the rest of the schema:**
   ```bash
   bun run db:push
   ```
   This is a no-op if the SQL above completed, but it keeps Drizzle's internal state consistent with the TypeScript schema.
4. Sign out of the dashboard and back in so the admin's JWT picks up `app_metadata.is_admin`.

**What this does NOT migrate:** historical Facebook-sourced listings won't have `source_group_url` populated unless their `raw_json` had a `groupUrl` field at ingest time (the migration populates it from there). New FB posts ingested after the migration write the column directly.

**Telegram still talks only to the admin.** The bot reads/writes admin preferences and sends alerts to the admin chat. Per-user Telegram is a later phase.
