import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/supabase/server";
import { seedAlertEmailTargets } from "@/preferences/store";

const links = [
  { href: "/dashboard", label: "Listings" },
  { href: "/dashboard/preferences", label: "Preferences" },
  { href: "/dashboard/groups", label: "FB Groups" },
  { href: "/dashboard/stats", label: "Stats" },
  { href: "/dashboard/chat", label: "Chat" },
] as const;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  await seedAlertEmailTargets(user?.email);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center gap-6 border-b pb-4">
        <Link href="/dashboard" className="text-lg font-semibold">
          Apartment Finder
        </Link>
        <nav className="flex gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
