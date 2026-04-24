import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { env } from "@/lib/env";

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
 * Cookie-only user read — no network call to Supabase auth. Trustable within
 * routes gated by middleware (which already ran `auth.getUser()` on the way in
 * and rejected unauthenticated requests). Use on hot paths like server actions
 * where shaving the auth round-trip matters. Falls back to `getCurrentUser`
 * when the cookie session is missing.
 */
export const getRequestUser = cache(async () => {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) return session.user;
    return await getCurrentUser();
  } catch {
    return null;
  }
});

export function isAdmin(user: User | null | undefined): boolean {
  return user?.app_metadata?.is_admin === true;
}

export async function getCurrentAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  return isAdmin(user) ? user : null;
}
