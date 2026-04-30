# Google One Tap Sign-In — Design

**Date:** 2026-04-30
**Status:** Approved
**Scope:** Add Google One Tap sign-in to `/login` and `/` (home/landing).

## Goal

Reduce friction for users with an active Google session by showing Google's One Tap prompt on the public-facing pages. Users sign in with one click without leaving the page or going through a full OAuth redirect.

## Non-goals

- Removing the existing "Continue with Google" redirect button or email-OTP flow.
- Adding One Tap to deeper pages (every other page is gated by middleware; an authenticated user never sees an unauthenticated context there).
- Multi-language One Tap copy (Better Auth uses Google's native UI, which respects browser locale).

## Architecture

Three changes plus one new component:

1. **`src/lib/auth.ts`** — register Better Auth's `oneTap()` plugin alongside the existing `google` social provider. Reuses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Plugin only added when Google is configured.

2. **`src/lib/auth-client.ts`** — register `oneTapClient({ clientId })` plugin. Client ID is read from a public source (see "Client ID exposure" below).

3. **`app/_components/google-one-tap.tsx`** — new client component. On mount, calls `authClient.oneTap()`. On success, hard-redirects to a configurable target. Failures and dismissals are silently swallowed (console-logged only).

4. **Page wiring**:
   - `app/login/page.tsx` — render `<GoogleOneTap clientId={…} redirectTo="/matches" />` when Google is configured. Sits inside the existing `<Card>` flow.
   - `app/page.tsx` — render the same component only when `!authed && googleConfigured`. Authed users on the landing page never see the prompt.

## Data flow

1. Anonymous user lands on `/` or `/login`.
2. Server component checks: Google configured? (and on `/`: not already authed?). If yes, renders `<GoogleOneTap>`.
3. On mount, `authClient.oneTap()` is called. Better Auth loads Google's One Tap library and shows the prompt if the user has a Google session and the browser is FedCM-eligible.
4. User taps account → Google returns ID token → Better Auth verifies server-side → session cookie set → client redirects to `/matches`.
5. If user dismisses or prompt never appears → silent no-op. The existing UI (email OTP, "Continue with Google" button) remains the available path.

## Client ID exposure

Google's OAuth Client ID is public-by-design (it appears in URL params on every browser-based OAuth flow). Two viable strategies:

- **(Chosen)** Pass `clientId` from the server component as a prop. The login page already passes `googleEnabled`; we'll extend that to pass `googleClientId` (string or null). The home page does the same.
- (Rejected) Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Adds a redundant env var when the server already has `GOOGLE_CLIENT_ID`.

The `oneTapClient` plugin requires `clientId` at construction time. Since `auth-client.ts` is a module-level singleton, we'll read the Client ID from a small wrapper exposed by the server: a `getPublicGoogleClientId()` helper in `lib/auth.ts` that returns `e.GOOGLE_CLIENT_ID ?? null`. The server component calls it and passes the result to `<GoogleOneTap>`. Inside the client component, we'll lazy-construct an auth client instance that includes `oneTapClient({ clientId })` — or, if Better Auth's API supports it, call `authClient.oneTap({ clientId })` per-call. The actual mechanism will be confirmed against the plugin's runtime API during implementation.

## Server-side gating

| Page | Render `<GoogleOneTap>` when |
|---|---|
| `/login` | `isGoogleConfigured()` |
| `/` | `!authed && isGoogleConfigured()` |

Authed users on `/login` are out of scope (the existing app doesn't auto-redirect them; not changing here).

## Configuration prerequisite

A one-time change in Google Cloud Console:

- OAuth 2.0 Client ID → **Authorized JavaScript origins** must include all origins where One Tap is rendered:
  - `https://<production-domain>` (e.g., the Vercel production URL)
  - Any preview/staging origins where One Tap should also appear (optional)
  - `http://localhost:3000` for local dev

Without this, Google's One Tap script silently refuses to render the prompt. This is documented in this spec; no code change can satisfy it.

## Error handling

| Condition | Behavior |
|---|---|
| Google env vars missing | `<GoogleOneTap>` not rendered server-side. |
| User already authed (on `/`) | `<GoogleOneTap>` not rendered server-side. |
| One Tap dismissed | `console.log` only. UI unchanged. |
| One Tap rejected (FedCM ineligible, third-party cookies blocked, no Google session) | `console.log` only. UI unchanged. |
| Better Auth `onSuccess` fires | `window.location.href = redirectTo`. |

No user-visible error toasts. Dismissals are normal user behavior; surfacing them as errors would be noise.

## Testing (manual)

- Anonymous + Chrome with Google session, visit `/` → prompt appears, click → land on `/matches`.
- Anonymous + Chrome with Google session, visit `/login` → prompt appears, click → land on `/matches`.
- Incognito (no Google session) → no prompt on either page; existing flows work.
- Authed user visits `/` → no prompt; landing page renders authed CTAs as before.
- Third-party cookies blocked → no prompt; existing flows work.

No automated tests added — One Tap renders inside Google's iframe and isn't meaningfully unit-testable.

## Out-of-scope follow-ups

- Auto-redirecting authed users away from `/login`.
- Custom theming/positioning of the One Tap prompt.
- Telemetry around prompt impressions / dismissal rates.
