import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadPreferences } from "@/preferences/store";
import { PreferencesForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const prefs = await loadPreferences(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These settings drive what the collector keeps and what the AI judge
          surfaces as an alert.
        </p>
      </div>
      <PreferencesForm initial={prefs} userEmail={user?.email ?? null} />
    </div>
  );
}
