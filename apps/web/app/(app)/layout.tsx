import type { ReactNode } from "react";
import { getCurrentUser, isAdmin } from "@/lib/supabase/server";
import { loadPreferences, seedAlertEmailTargets } from "@/preferences/store";
import { autoSubscribeToEnabledGroups } from "@/groups/subscriptions";
import { DashboardNav, HeaderBrandLink } from "./nav-links";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user) {
    await loadPreferences(user.id);
    await seedAlertEmailTargets(user.id, user.email);
    await autoSubscribeToEnabledGroups(user.id);
  }
  const admin = isAdmin(user);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center gap-6 border-b pb-4">
        <HeaderBrandLink />
        <DashboardNav showAdmin={admin} />
      </header>
      {children}
    </div>
  );
}
