import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth-server";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HeaderBrandLink, PrimaryNav } from "./nav-links";
import { UserMenu } from "./user-menu";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b pb-3 sm:mb-6 sm:gap-6 sm:pb-4">
        <HeaderBrandLink />
        <PrimaryNav />
        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu email={user?.email ?? null} />
        </div>
      </header>
      {children}
    </div>
  );
}
