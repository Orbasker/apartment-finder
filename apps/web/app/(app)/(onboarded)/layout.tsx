import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { loadFilters } from "@/filters/store";
import { HeaderBrandLink, SidebarNav } from "../nav-links";
import { UserMenu } from "../user-menu";
import { MobileNav } from "../mobile-nav";

export default async function OnboardedLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const filters = await loadFilters(user.id);
  if (!filters.onboardedAt) redirect("/onboarding");

  const email = user.email ?? null;

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
        <MobileNav email={email} />
        <HeaderBrandLink />
      </header>

      <aside
        aria-label="ניווט צד"
        className="hidden md:fixed md:inset-y-0 md:start-0 md:z-30 md:flex md:w-64 md:flex-col md:gap-6 md:border-e md:bg-card md:p-4"
      >
        <div className="px-2 pt-1">
          <HeaderBrandLink />
        </div>
        <SidebarNav />
        <div className="mt-auto border-t pt-4">
          <UserMenu email={email} />
        </div>
      </aside>

      <main
        id="main-content"
        className="px-4 py-4 sm:px-6 sm:py-6 md:ms-64 md:px-8 md:py-8"
      >
        {children}
      </main>
    </div>
  );
}
