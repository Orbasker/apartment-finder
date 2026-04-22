# yad2-proxy

Tiny Node HTTPS proxy deployed to GCP Cloud Run in `me-west1` (Tel Aviv) so
outbound requests to Yad2 come from an Israeli IP. Vercel's serverless regions
are outside Israel and Yad2 blocks them.

## How it works

- `GET /fetch?url=<urlencoded-yad2-url>` — forwards a GET to the allowlisted
  Yad2 host with the same browser headers the scraper uses, streams the body
  and status back.
- `GET /healthz` — returns `ok`.
- Auth: caller must send `x-proxy-secret: <PROXY_SECRET>` header on `/fetch`.
- Allowlist: only `*.yad2.co.il` hosts are fetched.

## Deploy to Cloud Run (one time)

Set these shell vars first (pick your real project + region):

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=me-west1          # Tel Aviv
export SERVICE=yad2-proxy
export PROXY_SECRET=$(openssl rand -hex 32)   # save this — you need it in Vercel too
```

1. Enable the APIs (only needed once per project):

   ```bash
   gcloud config set project "$PROJECT_ID"
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

2. Deploy from this directory. Cloud Run's buildpacks use the `Dockerfile`
   automatically:

   ```bash
   cd services/yad2-proxy
   gcloud run deploy "$SERVICE" \
     --source . \
     --region "$REGION" \
     --platform managed \
     --allow-unauthenticated \
     --memory 256Mi \
     --cpu 1 \
     --min-instances 0 \
     --max-instances 2 \
     --concurrency 40 \
     --timeout 30s \
     --set-env-vars "PROXY_SECRET=$PROXY_SECRET"
   ```

   The first deploy takes ~2 min (Cloud Build packages the image into
   Artifact Registry, then Cloud Run rolls it out).

3. Grab the service URL:

   ```bash
   gcloud run services describe "$SERVICE" --region "$REGION" \
     --format='value(status.url)'
   # -> https://yad2-proxy-xxxx-zf.a.run.app
   ```

4. Smoke test:

   ```bash
   PROXY_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
   curl -s "$PROXY_URL/healthz"
   # -> ok

   curl -sD - \
     -H "x-proxy-secret: $PROXY_SECRET" \
     "$PROXY_URL/fetch?url=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("https://gw.yad2.co.il/realestate-feed/rent/map?region=3&property=1"))')" \
     | head -20
   # -> HTTP/2 200 with JSON body containing data.markers
   ```

5. Set the Vercel env vars (Project → Settings → Environment Variables):
   - `YAD2_PROXY_URL` = the `https://...run.app` URL from step 3
   - `YAD2_PROXY_SECRET` = the `$PROXY_SECRET` you generated

   Copy the same two values into your local `.env.local` if you want to test
   the poll job from your laptop.

6. Redeploy the Vercel app (or trigger a fresh cron run) — `fetchYad2Listings`
   picks up the proxy automatically when both env vars are set.

## Updating the proxy

Re-run step 2 (`gcloud run deploy ... --source .`). Cloud Run keeps the same
URL and rolls traffic to the new revision.

## Rotating the secret

```bash
NEW_SECRET=$(openssl rand -hex 32)
gcloud run services update "$SERVICE" --region "$REGION" \
  --set-env-vars "PROXY_SECRET=$NEW_SECRET"
# then update YAD2_PROXY_SECRET in Vercel + redeploy
```

## Cost

Cloud Run free tier covers ~2M requests/month. A poll every 30 min = ~1500
requests/month — effectively free.
