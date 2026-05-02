"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/matches/annotations";
import type { MatchFeedItem, UserApartmentStatusKind } from "@/matches/types";
import { setApartmentStatusAction } from "../actions";
import { KanbanColumn } from "./kanban-column";
import { KanbanMoveMenu } from "./kanban-move-menu";
import { MatchModal } from "./match-modal";

export type KanbanEntry = {
  item: MatchFeedItem;
  annotations: Annotation[];
};

type ColumnsState = Record<UserApartmentStatusKind, KanbanEntry[]>;

const STATUS_ORDER: UserApartmentStatusKind[] = [
  "new",
  "interested",
  "contacted",
  "visited",
  "rejected",
];

const MOBILE_BREAKPOINT_PX = 768;

type KanbanBoardProps = {
  initialColumns: ColumnsState;
  totalEntries: number;
};

/**
 * Top-level kanban surface. Owns column state, optimistic moves, modal, and
 * the desktop/mobile mode switch. DnD is desktop-only; mobile uses a column
 * carousel + per-card "Move to" bottom sheet because kanban + DnD on a phone
 * is fiddly enough to be worse than the menu UX.
 */
export function KanbanBoard({ initialColumns, totalEntries }: KanbanBoardProps) {
  const t = useTranslations("Matches.board");
  const [columns, setColumns] = useState<ColumnsState>(initialColumns);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");
  const [modalEntry, setModalEntry] = useState<KanbanEntry | null>(null);
  const [moveMenuEntry, setMoveMenuEntry] = useState<KanbanEntry | null>(null);
  const isMobile = useIsMobile();

  const tColumns = useTranslations("Matches.board.columns");

  const findEntry = useCallback(
    (apartmentId: number): { entry: KanbanEntry; status: UserApartmentStatusKind } | null => {
      for (const status of STATUS_ORDER) {
        const entry = columns[status].find((e) => e.item.apartmentId === apartmentId);
        if (entry) return { entry, status };
      }
      return null;
    },
    [columns],
  );

  const moveCard = useCallback(
    async (apartmentId: number, target: UserApartmentStatusKind) => {
      setError(null);
      const located = findEntry(apartmentId);
      if (!located) return;
      const { entry, status: from } = located;
      if (from === target) return;
      const moved: KanbanEntry = {
        item: { ...entry.item, status: target },
        annotations: entry.annotations,
      };
      // Optimistic update: insert at the head of the target column so the most
      // recently touched card is the first thing the user sees on return.
      setColumns((prev) => ({
        ...prev,
        [from]: prev[from].filter((e) => e.item.apartmentId !== apartmentId),
        [target]: [moved, ...prev[target]],
      }));
      setAnnouncement(t("announceMoved", { column: tColumns(target) }));

      const result = await setApartmentStatusAction({ apartmentId, status: target });
      if (!result.ok) {
        setColumns((prev) => ({
          ...prev,
          [target]: prev[target].filter((e) => e.item.apartmentId !== apartmentId),
          [from]: [entry, ...prev[from]],
        }));
        setError(t("errorStatus"));
      }
    },
    [findEntry, t, tColumns],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const overId = String(over.id);
      if (!overId.startsWith("column:")) return;
      const target = overId.slice("column:".length) as UserApartmentStatusKind;
      const apartmentId = Number(String(active.id).slice("card:".length));
      if (!Number.isFinite(apartmentId)) return;
      void moveCard(apartmentId, target);
    },
    [moveCard],
  );

  const onModalChangeStatus = useCallback(
    async (status: UserApartmentStatusKind) => {
      if (!modalEntry) return;
      const updated: KanbanEntry = {
        item: { ...modalEntry.item, status },
        annotations: modalEntry.annotations,
      };
      setModalEntry(updated);
      await moveCard(modalEntry.item.apartmentId, status);
    },
    [modalEntry, moveCard],
  );

  if (totalEntries === 0) {
    return <EmptyAll />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-3">
        {isMobile ? (
          <CarouselView
            columns={columns}
            onOpenCard={setModalEntry}
            onCardMore={setMoveMenuEntry}
          />
        ) : (
          <DesktopView columns={columns} onOpenCard={setModalEntry} />
        )}

        {error ? (
          <div
            role="status"
            className="mx-auto w-full max-w-md rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
          >
            {error}
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {modalEntry ? (
          <MatchModal
            open={modalEntry !== null}
            onOpenChange={(open) => !open && setModalEntry(null)}
            item={modalEntry.item}
            listingUrl={modalEntry.item.sourceUrl}
            sourceUrl={modalEntry.item.sourceUrl}
            onChangeStatus={(s) => void onModalChangeStatus(s)}
          />
        ) : null}

        {moveMenuEntry ? (
          <KanbanMoveMenu
            open={moveMenuEntry !== null}
            onOpenChange={(open) => !open && setMoveMenuEntry(null)}
            currentStatus={moveMenuEntry.item.status}
            onSelect={(s) => void moveCard(moveMenuEntry.item.apartmentId, s)}
          />
        ) : null}
      </div>
    </DndContext>
  );
}

function DesktopView({
  columns,
  onOpenCard,
}: {
  columns: ColumnsState;
  onOpenCard: (entry: KanbanEntry) => void;
}) {
  // RTL: "new" should be rightmost. flex-row in dir=rtl renders the first
  // child on the right, so iterate in spec order and the visual end-result
  // matches the ticket.
  return (
    <div
      dir="rtl"
      className="flex gap-3 overflow-x-auto pb-2"
      role="group"
      aria-label="kanban"
    >
      {STATUS_ORDER.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          entries={columns[status]}
          enableDrag
          onOpenCard={onOpenCard}
        />
      ))}
    </div>
  );
}

function CarouselView({
  columns,
  onOpenCard,
  onCardMore,
}: {
  columns: ColumnsState;
  onOpenCard: (entry: KanbanEntry) => void;
  onCardMore: (entry: KanbanEntry) => void;
}) {
  const t = useTranslations("Matches.board");
  const tColumns = useTranslations("Matches.board.columns");
  const [activeIdx, setActiveIdx] = useState(0);
  const goPrev = () => setActiveIdx((i) => Math.max(0, i - 1));
  const goNext = () => setActiveIdx((i) => Math.min(STATUS_ORDER.length - 1, i + 1));

  return (
    <div dir="rtl" className="flex flex-col gap-2">
      <nav className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={activeIdx === 0}
          aria-label={t("prevColumn")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {STATUS_ORDER.map((status, i) => (
            <button
              key={status}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                i === activeIdx
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
              aria-current={i === activeIdx ? "true" : undefined}
            >
              <span>{tColumns(status)}</span>
              <span className="rounded-full bg-background/30 px-1.5 text-[10px] leading-4">
                {columns[status].length}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={activeIdx === STATUS_ORDER.length - 1}
          aria-label={t("nextColumn")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </nav>
      <div className="px-1">
        <KanbanColumn
          key={STATUS_ORDER[activeIdx]}
          status={STATUS_ORDER[activeIdx]!}
          entries={columns[STATUS_ORDER[activeIdx]!]}
          enableDrag={false}
          onOpenCard={onOpenCard}
          onCardMore={onCardMore}
          className="w-full"
        />
      </div>
    </div>
  );
}

function EmptyAll() {
  const t = useTranslations("Matches.board");
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center text-card-foreground">
      <h2 className="text-base font-semibold">{t("emptyAllTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("emptyAllBody")}</p>
      <Link
        href="/filters"
        className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
      >
        {t("editFilters")}
      </Link>
    </div>
  );
}

function useIsMobile(): boolean {
  // Default to desktop on first render so SSR + hydration agree; the effect
  // flips to mobile on the next paint when the viewport is narrow. Misclassed
  // first paint is acceptable — only the layout differs, no DnD wiring runs
  // until interaction.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

