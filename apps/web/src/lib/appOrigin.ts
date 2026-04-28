import { env } from "@/lib/env";

/**
 * Origin (scheme + host[:port], no path) that external services (e.g. Apify webhooks)
 * must use to reach this app. Override with APP_PUBLIC_ORIGIN when developing locally
 * behind localhost - use a tunnel or your deployed URL.
 */
export function resolveAppPublicOrigin(fallbackOrigin: string): string {
  const configured = env().APP_PUBLIC_ORIGIN;
  const raw = (configured ?? fallbackOrigin).trim();
  return raw.replace(/\/+$/, "");
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    const h = hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return true;
  }
}
