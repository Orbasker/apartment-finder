import { getCurrentUser } from "@/lib/auth-server";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "רשימת דירות - Apartment Finder",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Auth + onboarding already enforced by (onboarded)/layout.tsx.
  // Awaiting these here keeps the route dynamic and ready for Phase 2 wiring.
  await getCurrentUser();
  await searchParams;
  const t = await getTranslations("Listings");

  return (
    <main className="flex w-full flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="text-sm text-muted-foreground">
        {/* Phase 3 replaces this with the real header + view */}
        טוען…
      </div>
    </main>
  );
}
