import type { ReactNode } from "react";
import { getCurrentUser, isAdmin } from "@/lib/supabase/server";
import { loadPreferences, seedAlertEmailTargets } from "@/preferences/store";
import { autoSubscribeToEnabledGroups } from "@/groups/subscriptions";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DashboardNav, HeaderBrandLink } from "./nav-links";
import { UserMenu } from "./user-menu";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user) {
    await Promise.all([
      loadPreferences(user.id),
      seedAlertEmailTargets(user.id, user.email),
      autoSubscribeToEnabledGroups(user.id),
    ]);
  }
  const admin = isAdmin(user);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center gap-6 border-b pb-4">
        <HeaderBrandLink />
        <DashboardNav showAdmin={admin} />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu email={user?.email ?? null} />
        </div>
      </header>
      {children}
    </div>
  );
}
