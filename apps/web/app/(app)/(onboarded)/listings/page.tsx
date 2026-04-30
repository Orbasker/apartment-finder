import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth-server";
import { getTranslations } from "next-intl/server";
import { parseListingsQuery } from "@/listings/url-state";
import { ListingsHeader } from "./_components/listings-header";
import { ListingsSkeleton } from "./_components/listings-skeleton";
import { ListingsResultSlot } from "./_components/listings-result-slot";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "רשימת דירות - Apartment Finder",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ListingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const query = parseListingsQuery(sp);
  const t = await getTranslations("Listings");

  return (
    <main className="flex w-full flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <ListingsHeader />

      <Suspense fallback={<ListingsSkeleton />}>
        <ListingsResultSlot userId={user.id} query={query} />
      </Suspense>
    </main>
  );
}
