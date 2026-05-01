# Worker deployment — Cloud Run Worker Pool

The worker runs as a **Cloud Run Worker Pool** (always-on, no HTTP). One-time
setup below; after that, every push to `main` that touches `apps/worker/**`,
`packages/queue/**`, or `packages/shared/**` redeploys via
`.github/workflows/deploy-worker.yml`.

Region: `europe-west1` (Tier 1, ~30ms to Upstash `eu-central-1`).
Cost: ~$18/mo for 1 vCPU + 512 MiB always-on, single instance. (Worker Pool
floor — Cloud Run rejects anything smaller for always-allocated CPU.)

## One-time setup

Run from your laptop with `gcloud` authenticated as a project owner.

```bash
PROJECT_ID="$(gcloud config get-value project)"
REGION=europe-west1
AR_REPO=apartment-finder
WORKER_POOL=apartment-finder-worker

# 1. Enable APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# 2. Create Artifact Registry repo (one-time)
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="apartment-finder container images"

# 3. Create the 10 secrets in Secret Manager.
# Replace VALUE with the real value (or pipe from your local .env).
for SECRET in \
  REDIS_URL DATABASE_URL AI_GATEWAY_API_KEY GOOGLE_GEOCODING_API_KEY \
  RESEND_API_KEY COLLECTOR_WEBHOOK_SECRET BLOB_READ_WRITE_TOKEN \
  APIFY_TOKEN YAD2_PROXY_SECRET TELEGRAM_BOT_TOKEN
do
  gcloud secrets create "$SECRET" --replication-policy=automatic 2>/dev/null || true
  # then add a version:
  echo -n "VALUE_FOR_$SECRET" | gcloud secrets versions add "$SECRET" --data-file=-
done

# 4. Grant the GitHub Actions service account permission to:
#    - submit Cloud Build jobs
#    - push to Artifact Registry
#    - deploy Cloud Run Worker Pools
#    - act as the runtime service account (for --update-secrets)
GH_SA="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"  # the one in secrets.GCP_SA_KEY
RUNTIME_SA="${PROJECT_ID}-compute@developer.gserviceaccount.com"  # default Compute SA Cloud Run uses

for ROLE in \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/run.admin \
  roles/iam.serviceAccountUser
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$GH_SA" --role="$ROLE"
done

# 5. Grant the runtime SA permission to read secrets
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/secretmanager.secretAccessor

# 6. Set the GitHub Actions repo variables (non-secret env values for the worker)
gh variable set RESEND_FROM_EMAIL    --body "alerts@yourdomain.com"
gh variable set APP_PUBLIC_ORIGIN    --body "https://apartment-finder-eight.vercel.app"
gh variable set YAD2_PROXY_URL       --body "https://yad2-proxy-...run.app"
```

## First deploy

After the setup, kick the workflow:

```bash
gh workflow run deploy-worker.yml
gh run watch
```

Or just push any `apps/worker/**` change to `main`.

## Verify

```bash
# Check the worker pool exists and is running
gcloud beta run worker-pools describe "$WORKER_POOL" --region="$REGION" \
  --format='value(status.conditions)'

# Tail logs
gcloud beta run worker-pools logs tail "$WORKER_POOL" --region="$REGION"
```

Expected logs on healthy boot:

```
[af:worker:main] starting workers
[af:worker:main] [ready] queues=collect,ingest-raw,ingest-normalized,ingest-enrich,ingest-persist,ingest-notify
```

When a Vercel cron tick arrives:

```
[af:worker:collect] collect started runId=... source=yad2 cityId=tel-aviv
[af:worker:collect] collect completed runId=... receivedCount=200
```

## Troubleshooting

- **Worker won't start, env validation fails**: check Secret Manager values for
  literal `"` quotes. Same paste-bug as the original Vercel `REDIS_URL`. Strip
  them in the secret version, redeploy.
- **`PERMISSION_DENIED` deploying**: re-run step 4 of the setup; the GitHub
  Actions SA needs the four roles listed.
- **`PERMISSION_DENIED` reading secrets at runtime**: re-run step 5.
- **Image build OOM**: the Dockerfile is small; if Cloud Build runs out of
  memory, bump the build machine type in `apps/worker/cloudbuild.yaml` with
  `options: { machineType: E2_HIGHCPU_8 }`.

## Why a Worker Pool, not a Cloud Run Service

The worker is a long-running BullMQ consumer (BLPOP loop). Cloud Run _Services_
are HTTP-driven and would charge request-based always-allocated rates (~$30+/mo
for the same hardware). Worker Pools are billed per vCPU/memory-second of
runtime regardless of HTTP traffic — the right product for this workload. See
also [`AGENTS.md` → "Worker Deployment"].
