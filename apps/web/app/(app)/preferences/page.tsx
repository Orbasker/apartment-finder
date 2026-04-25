import { notFound } from "next/navigation";
import { getRequestUser } from "@/lib/supabase/server";
import { loadPreferences } from "@/preferences/store";
import { PreferencesForm } from "./form";
import { TelegramSection } from "./telegram-section";
import { getTelegramLinkStatus } from "./telegram-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function PreferencesPage() {
  const user = await getRequestUser();
  if (!user) notFound();
  const [prefs, telegramStatus] = await Promise.all([
    loadPreferences(user.id),
    getTelegramLinkStatus(),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These settings drive what the collector keeps and what the AI judge surfaces as an alert.
        </p>
      </div>
      <PreferencesForm initial={prefs} userEmail={user?.email ?? null} />
      <TelegramSection initial={telegramStatus} />
    </div>
  );
}
