import type { ReactNode } from "react";
import { getRequestUser, isAdmin } from "@/lib/supabase/server";
import { seedAlertEmailTargets } from "@/preferences/store";
import { autoSubscribeToEnabledGroups } from "@/groups/subscriptions";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DashboardNav, HeaderBrandLink } from "./nav-links";
import { UserMenu } from "./user-menu";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getRequestUser();
  if (user) {
    await Promise.all([
      seedAlertEmailTargets(user.id, user.email),
      autoSubscribeToEnabledGroups(user.id),
    ]);
  }
  const admin = isAdmin(user);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b pb-3 sm:mb-6 sm:gap-6 sm:pb-4">
        <HeaderBrandLink />
        <div className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
          <div className="px-4 sm:px-0">
            <DashboardNav showAdmin={admin} />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu email={user?.email ?? null} />
        </div>
      </header>
      {children}
    </div>
  );
}
