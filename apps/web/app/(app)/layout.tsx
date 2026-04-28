import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth-server";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HeaderBrandLink, PrimaryNav } from "./nav-links";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const email = user?.email ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 flex items-center gap-3 border-b pb-3 sm:mb-6 sm:gap-6 sm:pb-4">
        <MobileNav email={email} />
        <HeaderBrandLink />
        <div className="hidden sm:block">
          <PrimaryNav />
        </div>
        <div className="ms-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <div className="hidden sm:block">
            <UserMenu email={email} />
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
