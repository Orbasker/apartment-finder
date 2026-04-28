---
name: debug
description: Debug runtime issues in the apartment-finder app by correlating Vercel logs, .env credentials, and live database records. Use when the user asks "why is X broken", "why didn't Y happen", "investigate this bug", "debug this in prod/staging", or describes unexpected behavior in a deployed environment that the source code alone can't explain.
allowed-tools: Read, Bash, Grep, Glob
---

# Debug — apartment-finder

The user has asked a question about live behavior. The source code may not be enough — you need **evidence** from Vercel logs and the production database. Follow this flow.

## 0. Restate and form a hypothesis

Before touching tools, write one sentence:

- **Symptom**: what the user observed (e.g. "alert email never arrived", "scrape job marked failed", "user sees 500 on /api/listings/123").
- **Suspect surfaces**: which subsystems could produce that symptom (Resend? Apify webhook? Drizzle query? Better Auth?).

If the symptom is vague ("it's broken"), ask one clarifying question first — environment (prod/staging/local), timestamp, user/listing ID — then proceed.

## 1. Pick your sources

For each hypothesis, pick the minimal evidence that proves or disproves it.

| Source | When to use |
|---|---|
| **Vercel logs** | Runtime errors, 4xx/5xx, cron job output, webhook handlers, function timeouts. |
| **.env** | You need a credential to query a managed service (DB, Resend, Apify). Never use it to "test" — just to read state. |
| **Database** | Verify a row exists / has expected state, check timestamps, joins, FKs, embeddings. |
| **Source code** | Always read the handler before blaming infra — bug is usually in code, not platform. |

Read code **first** for the suspect path, then confirm with logs/DB.

## 2. Vercel logs

### 2a. Ensure the project is linked

```bash
ls .vercel/project.json
```

- **Exists** → linked, proceed.
- **Missing** → stop and ask the user:
  > "I need to link this directory to its Vercel project to read logs. Want me to run `vercel link`? You'll need to pick the scope (`orb`/team) and the existing `apartment-finder` project — do **not** create a new one."

  Only run `vercel link` after the user confirms. Never run `vercel link --yes` blindly — it can create a fresh project.

### 2b. Find the right deployment

```bash
vercel ls --json | head -20            # recent deployments
vercel inspect <deployment-url>        # detail on one
```

For prod runtime logs, use the production alias (e.g. `apartment-finder.vercel.app`) or a specific deployment URL.

### 2c. Read logs

```bash
# Runtime logs for a specific deployment, no follow:
vercel logs <deployment-url> --output raw

# Filter by path / status / function (server-side):
vercel logs <deployment-url> --output raw | grep -E "(ERROR|api/alerts|api/apify-webhook)"
```

Notes:
- `vercel logs` only retains the last ~hour of runtime logs by default. If the symptom is older, ask the user for a deployment URL near the incident time.
- Cron logs appear under the cron path (e.g. `/api/cron/scrape`). Always check `CRON_SECRET` 401s if a cron is "silently not running".

## 3. Reading .env safely

```bash
# Never cat the whole file to chat. Read only the keys you need:
grep -E "^DATABASE_URL=" .env
```

Rules:
- **Never echo full secret values** in your output. When you must show one for context, mask: `postgresql://USER:****@host:6543/postgres`.
- **Never write secrets to a file** that isn't `.env` itself.
- Use the value only in piped, in-process commands (`psql "$DATABASE_URL" -c "..."`). Don't `export` it into a shell that lingers.

If `.env` is missing, ask the user — they may have it in 1Password or a different workspace.

## 4. Database queries

Use Drizzle as the source of truth for schema. Inspect first:

```bash
ls apps/web/src/db/schema.ts apps/web/drizzle/
```

Read `apps/web/src/db/schema.ts` to learn exact table/column names before composing SQL — names you guess from memory are usually wrong.

### Safe query pattern

```bash
# Source DATABASE_URL into the psql call only (do not export to the parent shell):
DATABASE_URL=$(grep -E "^DATABASE_URL=" .env | cut -d= -f2- | tr -d '"') \
  psql "$DATABASE_URL" -c "SELECT id, status, created_at FROM listings WHERE id = '...' LIMIT 5;"
```

Rules:
- **`SELECT` only by default.** Never `UPDATE`/`DELETE`/`ALTER`/`DROP` without the user explicitly authorizing the exact statement.
- Always `LIMIT` reads (default 50). The DB has hundreds of thousands of rows in some tables.
- For embeddings columns, project them out (`SELECT id, listing_id, ... FROM …`) — don't dump the vector.
- Prefer parameterized values over string-concatenated SQL when the input came from the user.

If the schema file references a table you can't find, run:

```bash
psql "$DATABASE_URL" -c "\dt"
```

## 5. Correlate

Lay the evidence side by side:

- **Code**: what *should* happen on this path (file:line).
- **Logs**: what the runtime *actually* did (timestamp, request id, error message).
- **DB**: the resulting state (or the absent state).

The bug lives at the first divergence. State the root cause as one sentence, citing the specific evidence (`apps/web/.../alerts.ts:142` + log line + DB row).

## 6. Report

Reply to the user with:

1. **Root cause** — one sentence.
2. **Evidence** — code ref, log excerpt (redact PII / secrets), DB row.
3. **Suggested fix** — code change OR config/env change OR data repair. Do **not** apply the fix yet unless the user asked for a fix; this skill is for diagnosis.

If the evidence is insufficient (e.g. logs rolled off, project not linked), say so explicitly and list what you'd need to continue.

## Hard rules

- Never run destructive commands (`vercel rm`, `vercel project rm`, SQL DML/DDL, `rm`) without explicit per-command approval.
- Never paste secrets, full DB rows containing PII, or session tokens into the user-visible response.
- Never `vercel link --yes` or `vercel deploy` from this skill — diagnosis only.
- If a clarifying question would save a 5-minute investigation, ask it.
