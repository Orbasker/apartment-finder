import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase not configured yet (Phase 1 deploys), allow access — dashboard is single-user.
  if (!supabaseUrl || !supabaseAnon) return NextResponse.next();

  const cookieUpdates: Array<{
    name: string;
    value: string;
    options: Parameters<NextResponse["cookies"]["set"]>[2];
  }> = [];
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all) => {
        for (const { name, value, options } of all) {
          cookieUpdates.push({ name, value, options });
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (path.startsWith("/dashboard/admin") && user.app_metadata?.is_admin !== true) {
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Forward the validated user to server components via request headers so they
  // don't need to call supabase.auth.getSession() (which logs an "insecure"
  // warning) or re-run the full getUser() network round-trip.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", user.id);
  if (user.email) requestHeaders.set("x-user-email", user.email);
  if (user.app_metadata?.is_admin === true) {
    requestHeaders.set("x-user-is-admin", "1");
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { name, value, options } of cookieUpdates) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|auth|login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
