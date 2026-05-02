"use client";

import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/matches/annotations";
import type { MatchFeedItem } from "@/matches/types";
import { AnnotationsRow } from "./annotations-row";

export type KanbanCardProps = {
  item: MatchFeedItem;
  annotations: Annotation[];
  /** When true, attach drag handlers and a roledescription. */
  draggable?: boolean;
  /** Visual hint that this card is being dragged (parent owns dnd-kit refs). */
  isDragging?: boolean;
  /** When true, render a three-dot button that calls onMore. */
  showMoreButton?: boolean;
  onOpen: () => void;
  onMore?: () => void;
};

/**
 * Compact card used by the kanban board. Significantly tighter than the
 * swipe-feed card: no map hero, no action bar — address line, meta row, two
 * tiny annotation pills (price + freshness), optional more-button. Click
 * opens the modal; drag handlers come from dnd-kit on the wrapping element.
 */
export function KanbanCard({
  item,
  annotations,
  draggable = false,
  isDragging = false,
  showMoreButton = false,
  onOpen,
  onMore,
}: KanbanCardProps) {
  const t = useTranslations("Matches.board");
  // Keep only the two compact annotations from the spec.
  const compact = annotations.filter(
    (a) => a.kind === "price_vs_median" || a.kind === "fresh",
  );
  const titleLine =
    item.formattedAddress ?? item.neighborhood ?? item.city ?? "";

  return (
    <div
      dir="rtl"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-roledescription={draggable ? t("dragRoleDescription") : undefined}
      aria-label={t("openCard")}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-sm transition-shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      {titleLine ? (
        <p className="line-clamp-1 text-sm font-medium leading-tight">{titleLine}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        <Meta item={item} />
      </p>
      {compact.length > 0 ? <AnnotationsRow annotations={compact} /> : null}

      {showMoreButton && onMore ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
          onPointerDownCapture={(e) => e.stopPropagation()}
          aria-label={t("moveTo")}
          className="absolute end-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function Meta({ item }: { item: MatchFeedItem }) {
  const segments: string[] = [];
  if (item.priceNis != null) segments.push(`₪${item.priceNis.toLocaleString("he-IL")}`);
  if (item.rooms != null) segments.push(`${item.rooms} חדרים`);
  if (item.sqm != null) segments.push(`${item.sqm} מ"ר`);
  return <>{segments.join(" · ")}</>;
}
