import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { loadFilters } from "@/filters/store";
import { OnboardingChat } from "./chat-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "אונבורדינג — Apartment Finder",
};

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const filters = await loadFilters(user.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">בואו נכין לך התראות</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          כמה שאלות קצרות ותתחיל/י לקבל התראות על דירות שמתאימות לך. תוכל/י לערוך הכול בכל רגע ב־
          <a href="/filters" className="underline">
            /filters
          </a>
          .
        </p>
      </header>
      <OnboardingChat alreadyOnboarded={Boolean(filters.onboardedAt)} />
    </div>
  );
}
