import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${url.origin}${next}`);
  }

  const supabaseUrl = env().SUPABASE_URL;
  const supabaseAnon = env().SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.redirect(
      `${url.origin}/login?error=${encodeURIComponent("Supabase not configured")}`,
    );
  }

  // Build the redirect response *first* so session cookies set during the
  // PKCE exchange are written onto the response the browser actually receives.
  // Otherwise the cookies set via next/headers can be dropped on a fresh
  // NextResponse.redirect, causing the dashboard to bounce back to /login on
  // first login and only succeed on the second attempt.
  const response = NextResponse.redirect(`${url.origin}${next}`);

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return parseRequestCookies(req.headers.get("cookie"));
      },
      setAll(all) {
        for (const { name, value, options } of all) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return response;
}

function parseRequestCookies(header: string | null): { name: string; value: string }[] {
  if (!header) return [];
  return header.split(";").flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    const eq = trimmed.indexOf("=");
    if (eq === -1) return [{ name: trimmed, value: "" }];
    return [
      {
        name: trimmed.slice(0, eq),
        value: decodeURIComponent(trimmed.slice(eq + 1)),
      },
    ];
  });
}
