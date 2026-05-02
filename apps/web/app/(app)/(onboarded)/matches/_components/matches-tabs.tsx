import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

type Tab = "feed" | "board";

/**
 * Top tabs for the matches surface. Single source of truth for the labels;
 * the active tab is highlighted but kept rendered so PR4's `/matches/board`
 * landing has a stable header. Server component — no client interactivity.
 */
export async function MatchesTabs({ active }: { active: Tab }) {
  const t = await getTranslations("Matches");
  const tabs: Array<{ key: Tab; href: "/matches" | "/matches/board"; label: string }> = [
    { key: "feed", href: "/matches", label: t("tabs.feed") },
    { key: "board", href: "/matches/board", label: t("tabs.board") },
  ];
  return (
    <nav aria-label={t("tabs.aria")} className="flex gap-2 border-b">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative -mb-px inline-flex h-10 items-center justify-center rounded-t-md px-4 text-sm font-medium transition-colors",
              isActive
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
