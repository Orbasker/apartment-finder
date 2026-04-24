import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { env } from "@/lib/env";

/**
 * Minimal user shape populated either from middleware-forwarded request
 * headers (hot path) or from a full `auth.getUser()` fallback. Only the
 * fields the dashboard actually consumes are carried through.
 */
export type RequestUser = {
  id: string;
  email: string | null;
  app_metadata: { is_admin: boolean };
};

/** One client + auth round-trip per incoming request (dedupes layout + pages). */
export const getSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();
  const url = env().SUPABASE_URL;
  const anon = env().SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY not set");
  }
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(all) {
        for (const { name, value, options } of all) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
});

export const getCurrentUser = cache(async () => {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
});

/**
 * Header-based user read — no network call and no `getSession()` cookie read
 * (which logs a noisy "insecure" warning). Trustable within routes gated by
 * middleware, which validated the user via `auth.getUser()` and forwarded the
 * resolved id/email/admin-flag as request headers. Falls back to
 * `getCurrentUser()` for routes not covered by the middleware matcher.
 */
export const getRequestUser = cache(async (): Promise<RequestUser | null> => {
  try {
    const h = await headers();
    const id = h.get("x-user-id");
    if (id) {
      return {
        id,
        email: h.get("x-user-email"),
        app_metadata: { is_admin: h.get("x-user-is-admin") === "1" },
      };
    }
    const user = await getCurrentUser();
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? null,
      app_metadata: { is_admin: user.app_metadata?.is_admin === true },
    };
  } catch {
    return null;
  }
});

export function isAdmin(user: User | RequestUser | null | undefined): boolean {
  return (user?.app_metadata as { is_admin?: unknown } | undefined)?.is_admin === true;
}

export async function getCurrentAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  return isAdmin(user) ? user : null;
}
