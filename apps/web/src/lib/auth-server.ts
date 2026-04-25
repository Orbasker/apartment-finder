import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const result = await auth.api.getSession({ headers: await headers() });
    if (!result?.user) return null;
    const u = result.user as { id: string; email: string; name?: string | null; role?: string };
    return {
      id: u.id,
      email: u.email,
      name: u.name ?? null,
      role: u.role ?? "user",
    };
  } catch {
    return null;
  }
});

export function isAdmin(u: { role?: string } | null | undefined): boolean {
  return u?.role === "admin";
}

export async function getCurrentAdmin(): Promise<CurrentUser | null> {
  const u = await getCurrentUser();
  return isAdmin(u) ? u : null;
}
