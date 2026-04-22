import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadPreferences } from "@/preferences/store";
import { PreferencesForm } from "./form";
import { TelegramSection } from "./telegram-section";
import { getTelegramLinkStatus } from "./telegram-actions";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const [prefs, telegramStatus] = await Promise.all([
    loadPreferences(user.id),
    getTelegramLinkStatus(),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-xl font-semibold">Preferences</h2>
      <PreferencesForm initial={prefs} userEmail={user?.email ?? null} />
      <TelegramSection initial={telegramStatus} />
    </div>
  );
}
