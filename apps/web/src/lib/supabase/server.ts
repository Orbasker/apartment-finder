import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function getSupabaseServerClient() {
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
}

export async function getCurrentUser() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
