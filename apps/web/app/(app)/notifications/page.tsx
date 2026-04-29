import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { loadDestinations } from "@/notifications/destinations";
import { env } from "@/lib/env";
import { NotificationsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const destinations = await loadDestinations(user.id);
  const botUsername = env().NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">יעדי התראות</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          לאן לשלוח התראות על דירות חדשות. צריך להפעיל לפחות ערוץ אחד.
        </p>
      </header>

      <NotificationsForm
        email={user.email ?? null}
        emailEnabled={destinations.emailEnabled}
        telegramEnabled={destinations.telegramEnabled}
        telegramLinked={Boolean(destinations.telegramChatId)}
        telegramConfigured={Boolean(botUsername)}
      />
    </main>
  );
}
