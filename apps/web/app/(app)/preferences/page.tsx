import { getCurrentUser } from "@/lib/supabase/server";
import { loadPreferences } from "@/preferences/store";
import { PreferencesForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const prefs = await loadPreferences();
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-xl font-semibold">Preferences</h2>
      <PreferencesForm initial={prefs} userEmail={user?.email ?? null} />
    </div>
  );
}
