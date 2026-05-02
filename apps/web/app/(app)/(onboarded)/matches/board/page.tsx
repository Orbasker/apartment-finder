import { getCurrentUser } from "@/lib/auth-server";
import { loadFilters } from "@/filters/store";
import { getMatchBoard, loadMedianContext } from "@/matches/store";
import { buildAnnotations } from "@/matches/annotations";
import { getTranslations } from "next-intl/server";
import { MatchesTabs } from "../_components/matches-tabs";
import { KanbanBoard, type KanbanEntry } from "../_components/kanban-board";
import type { UserApartmentStatusKind } from "@/matches/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "דירות - לוח - Apartment Finder",
};

const STATUS_ORDER: UserApartmentStatusKind[] = [
  "new",
  "interested",
  "contacted",
  "visited",
  "rejected",
];

export default async function MatchesBoardPage() {
  const t = await getTranslations("Matches");
  const user = (await getCurrentUser())!;
  const [filters, board] = await Promise.all([loadFilters(user.id), getMatchBoard(user.id)]);

  const cityIds = filters.cities.map((c) => c.cityId);
  const median = await loadMedianContext(cityIds);

  const annotationContext = {
    median,
    center:
      filters.radius != null
        ? { lat: filters.radius.centerLat, lon: filters.radius.centerLon }
        : null,
    userAttrs: filters.attributes,
  };

  const initialColumns: Record<UserApartmentStatusKind, KanbanEntry[]> = {
    new: [],
    interested: [],
    contacted: [],
    visited: [],
    rejected: [],
  };
  for (const status of STATUS_ORDER) {
    initialColumns[status] = board[status].map((item) => ({
      item,
      annotations: buildAnnotations(item, annotationContext),
    }));
  }

  const totalEntries = STATUS_ORDER.reduce((acc, s) => acc + initialColumns[s].length, 0);

  return (
    <main className="flex w-full flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("title")}</h1>
      </header>
      <MatchesTabs active="board" />
      <KanbanBoard initialColumns={initialColumns} totalEntries={totalEntries} />
    </main>
  );
}
