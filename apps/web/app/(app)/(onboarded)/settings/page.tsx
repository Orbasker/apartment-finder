import { getCurrentUser } from "@/lib/auth-server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { loadDestinations } from "@/notifications/destinations";
import { env } from "@/lib/env";
import { signOutAction } from "../../profile-actions";
import { NotificationsForm } from "../notifications/form";
import { restartOnboardingAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "הגדרות - Apartment Finder",
};

export default async function SettingsPage() {
  // Auth + onboarding gate enforced by (onboarded)/layout.tsx.
  const user = (await getCurrentUser())!;
  const destinations = await loadDestinations(user.id);
  const botUsername = env().NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">הגדרות</h1>
        <p className="mt-1 text-sm text-muted-foreground">חשבון, מראה, התראות ואפשרויות נוספות.</p>
      </header>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">חשבון</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">דוא״ל</span>
              <span className="font-medium">
                <bdi>{user.email ?? "-"}</bdi>
              </span>
            </div>
            <form action={signOutAction}>
              <FormSubmitButton variant="outline" size="sm">
                התנתקות
              </FormSubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">מראה</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">ערכת נושא</span>
            <ThemeToggle />
          </CardContent>
        </Card>
      </div>

      <section id="notifications" className="flex flex-col gap-3 scroll-mt-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">יעדי התראות</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            לאן לשלוח התראות על דירות חדשות. צריך להפעיל לפחות ערוץ אחד.
          </p>
        </div>
        <NotificationsForm
          email={user.email ?? null}
          emailEnabled={destinations.emailEnabled}
          telegramEnabled={destinations.telegramEnabled}
          telegramLinked={Boolean(destinations.telegramChatId)}
          telegramConfigured={Boolean(botUsername)}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">התחל מחדש</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            רוצה להגדיר את התנאים מחדש בעזרת השיחה? נאפס את סטטוס האונבורדינג ונחזיר אותך לצ׳אט.
            התנאים הנוכחיים יישמרו ואפשר לערוך אותם משם.
          </p>
          <form action={restartOnboardingAction}>
            <FormSubmitButton variant="outline" size="sm">
              התחל מחדש בצ׳אט
            </FormSubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
