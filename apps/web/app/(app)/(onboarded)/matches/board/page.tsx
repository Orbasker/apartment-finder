import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import { MatchesTabs } from "../_components/matches-tabs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "דירות - לוח - Apartment Finder",
};

/**
 * Placeholder until PR4 (kanban board). Renders the tab header so navigation
 * is consistent and the typed-routes contract is satisfied.
 */
export default async function MatchesBoardPage() {
  const t = await getTranslations("Matches");
  return (
    <main className="flex w-full flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("title")}</h1>
      </header>
      <MatchesTabs active="board" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("board.comingSoonTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("board.comingSoonBody")}
        </CardContent>
      </Card>
    </main>
  );
}
