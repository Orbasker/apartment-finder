"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { UserApartmentStatusKind } from "@/matches/types";
import type { KanbanEntry } from "./kanban-board";
import { KanbanCard } from "./kanban-card";

type KanbanColumnProps = {
  status: UserApartmentStatusKind;
  entries: KanbanEntry[];
  enableDrag: boolean;
  onOpenCard: (entry: KanbanEntry) => void;
  onCardMore?: (entry: KanbanEntry) => void;
  /** Extra class for layout (e.g. carousel snap). */
  className?: string;
};

export function KanbanColumn({
  status,
  entries,
  enableDrag,
  onOpenCard,
  onCardMore,
  className,
}: KanbanColumnProps) {
  const t = useTranslations("Matches.board");
  const tColumns = useTranslations("Matches.board.columns");
  const columnLabels: Record<UserApartmentStatusKind, string> = {
    new: tColumns("new"),
    interested: tColumns("interested"),
    contacted: tColumns("contacted"),
    visited: tColumns("visited"),
    rejected: tColumns("rejected"),
  };
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });

  return (
    <section
      ref={setNodeRef}
      data-status={status}
      className={cn(
        "flex h-full min-h-[320px] w-[280px] shrink-0 flex-col rounded-lg border bg-muted/40 p-2 transition-colors",
        isOver && "border-foreground/60 bg-muted",
        className,
      )}
    >
      <header className="flex items-center justify-between px-2 py-1.5">
        <h2 className="text-sm font-medium">{columnLabels[status]}</h2>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
          {entries.length}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1">
        {entries.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t("emptyColumn")}</p>
        ) : (
          entries.map((entry) =>
            enableDrag ? (
              <DraggableCard
                key={entry.item.apartmentId}
                entry={entry}
                onOpen={() => onOpenCard(entry)}
              />
            ) : (
              <KanbanCard
                key={entry.item.apartmentId}
                item={entry.item}
                annotations={entry.annotations}
                showMoreButton={onCardMore != null}
                onOpen={() => onOpenCard(entry)}
                onMore={onCardMore ? () => onCardMore(entry) : undefined}
              />
            ),
          )
        )}
      </div>
    </section>
  );
}

function DraggableCard({ entry, onOpen }: { entry: KanbanEntry; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card:${entry.item.apartmentId}`,
    data: { apartmentId: entry.item.apartmentId, currentStatus: entry.item.status },
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard
        item={entry.item}
        annotations={entry.annotations}
        draggable
        isDragging={isDragging}
        onOpen={onOpen}
      />
    </div>
  );
}
