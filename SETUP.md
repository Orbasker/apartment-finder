# Phase 1 Setup — What You Need To Do

Phase 1 gets Yad2 alerts flowing to Telegram. **No AI yet** (that's Phase 2). Below is everything you need to do outside of the code.

## 0. Make sure secrets stay out of git

`.env` is gitignored (check `.gitignore` — lines `.env` + `.env.*` with a `!.env.example` exception). Don't bypass it. Never paste real secrets into a chat, a commit message, or the README.

## 1. Install dependencies

```bash
bun install
```

## 2. Create Supabase Postgres (free tier — used as a hosted Postgres only)

Auth is handled by Better Auth, not Supabase. We just use Supabase for managed Postgres.

1. Go to https://supabase.com/dashboard/new
2. Create a new project. Save the DB password — you'll need it once.
3. Wait ~2 min for provisioning.
4. **Project Settings → Database → Connection string → URI**
   - Pick the **Transaction pooler** (port `6543`) — what serverless needs.
   - Copy the URL, replace `[YOUR-PASSWORD]` with your DB password.
   - This goes into `DATABASE_URL`.

## 2a. Set up Better Auth + Google OAuth

1. Generate a session secret:
   ```bash
   openssl rand -base64 32   # → BETTER_AUTH_SECRET
   ```
2. Set `BETTER_AUTH_URL` to the public origin (e.g. `http://localhost:3000` or `https://<your-host>`).
3. Create a Google OAuth client at https://console.cloud.google.com/apis/credentials:
   - Application type: **Web application**.
   - Authorized redirect URIs (add ALL hosts you sign in from):
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<your-vercel-host>/api/auth/callback/google`
   - Copy the Client ID + Client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Magic-link emails go through Resend (see Phase 4) — `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` are required for sign-in via email.

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
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL` (set to the deployed origin, e.g. `https://<your-host>`)
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
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

- [ ] Supabase Postgres created; `DATABASE_URL` in `.env` and Vercel
- [ ] Better Auth configured: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `.env` and Vercel; redirect URI added in Google Cloud Console
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

- [ ] Resend account + `RESEND_API_KEY` (for magic-link sign-in AND alert emails; verify your sending domain — magic links 403 from an unverified domain)
- [ ] `RESEND_FROM_EMAIL` set to a verified sender (e.g. `Apartment Finder <noreply@your-domain.com>`)

---

## Admin access (for `/admin`)

Admin role is the `role` column on the Better Auth `"user"` table (added by the `admin` plugin). Possible values: `"user"` (default) or `"admin"`. Server code checks via `isAdmin(user)` which compares `user.role === "admin"`.

**Promote a user to admin** — run against the Postgres DB (Supabase SQL editor or `psql $DATABASE_URL`):

```sql
update "user" set role = 'admin' where email = 'orbasker@gmail.com';
```

**Revoke admin:**

```sql
update "user" set role = 'user' where email = 'orbasker@gmail.com';
```

The change takes effect on the next request — Better Auth re-reads the user row on every `getSession()` call, deduped per render via React `cache()`.

---

## Better Auth cutover (one-time)

`apps/web/drizzle/manual_better_auth_reset.sql` truncates every user-scoped table (`preferences`, `feedback`, `sent_alerts`, `telegram_links`, `telegram_link_tokens`, `user_group_subscriptions`) and nulls `monitored_groups.added_by` so the new auth system starts from a clean slate. Users are NOT migrated — the admin re-onboards by signing in fresh with Google or magic link, then runs the promote SQL above.

The reset runs automatically as part of `bun run db:push`. It's idempotent (guarded by `to_regclass`) and re-runs are safe.

**Snapshot first.** This wipes user data. Take a Supabase DB backup before running the migration on an existing deploy.
