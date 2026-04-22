import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/supabase/server";
import { seedAlertEmailTargets } from "@/preferences/store";
import { DashboardNav, HeaderBrandLink } from "./nav-links";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  await seedAlertEmailTargets(user?.email);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center gap-6 border-b pb-4">
        <HeaderBrandLink />
        <DashboardNav />
      </header>
      {children}
    </div>
  );
}
