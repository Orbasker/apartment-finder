import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth-server";
import { loadFilters } from "@/filters/store";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "דירות - Apartment Finder",
};

export default async function MatchesPage() {
  const t = await getTranslations("Matches");
  const user = (await getCurrentUser())!;
  const filters = await loadFilters(user.id);
  const cityLabel =
    filters.cities.length > 0 ? filters.cities.map((city) => city.nameHe).join(", ") : t("anyCity");

  return (
    <main className="flex w-full flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("searchTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-muted-foreground">{t("citiesLabel")}</div>
            <div className="mt-1 font-medium">{cityLabel}</div>
          </div>
          <Link
            href="/filters"
            className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            {t("editCity")}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("comingSoonTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t("comingSoonBody")}</CardContent>
      </Card>
    </main>
  );
}
