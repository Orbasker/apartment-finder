"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Annotation } from "@/matches/annotations";
import type { MatchFeedItem, UserApartmentStatusKind } from "@/matches/types";
import { toastError, toastInfo } from "@/lib/ui/toast";
import { setApartmentStatusAction } from "../actions";
import { decideSwipe, EXIT_OFFSET_PX, type SwipeDirection } from "../_lib/swipe";
import { MatchCard } from "./match-card";
import { MatchModal } from "./match-modal";

export type FeedDeckEntry = {
  item: MatchFeedItem;
  annotations: Annotation[];
};

type FeedDeckProps = {
  initialEntries: FeedDeckEntry[];
};

type ActedItem = {
  apartmentId: number;
  prevStatus: UserApartmentStatusKind;
  nextStatus: UserApartmentStatusKind;
};

/**
 * Owns the visible card stack, swipe gestures, and optimistic status updates.
 * Annotations are pre-computed on the server (functions can't cross the
 * server/client boundary), so each entry arrives as `{ item, annotations }`.
 * Failures roll back by re-inserting the entry at the head of the deck and
 * surfacing a small inline error pill — no toast lib dep introduced.
 */
export function FeedDeck({ initialEntries }: FeedDeckProps) {
  const t = useTranslations("Matches.feed");
  const [entries, setEntries] = useState<FeedDeckEntry[]>(initialEntries);
  const [history, setHistory] = useState<ActedItem[]>([]);
  const [modalEntry, setModalEntry] = useState<FeedDeckEntry | null>(null);
  const [exitDirection, setExitDirection] = useState<SwipeDirection | null>(null);
  const [modalPending, startModalTransition] = useTransition();

  const top = entries[0];
  const peek1 = entries[1];
  const peek2 = entries[2];

  const commitStatus = useCallback(
    async (entry: FeedDeckEntry, status: UserApartmentStatusKind, direction: SwipeDirection) => {
      setExitDirection(direction);
      const acted: ActedItem = {
        apartmentId: entry.item.apartmentId,
        prevStatus: entry.item.status,
        nextStatus: status,
      };
      setEntries((prev) => prev.filter((e) => e.item.apartmentId !== entry.item.apartmentId));
      setHistory((prev) => [...prev, acted]);

      const result = await setApartmentStatusAction({
        apartmentId: entry.item.apartmentId,
        status,
      });

      if (!result.ok) {
        toastError(t("errorStatus"));
        setEntries((prev) => [
          { item: { ...entry.item, status: acted.prevStatus }, annotations: entry.annotations },
          ...prev,
        ]);
        setHistory((prev) => prev.slice(0, -1));
      }
    },
    [t],
  );

  const onPass = useCallback(() => {
    if (top) void commitStatus(top, "rejected", "left");
  }, [top, commitStatus]);
  const onSave = useCallback(() => {
    if (top) void commitStatus(top, "interested", "right");
  }, [top, commitStatus]);
  const onLike = useCallback(() => {
    if (top) void commitStatus(top, "interested", "right");
  }, [top, commitStatus]);
  const onOpen = useCallback(() => {
    if (top) setModalEntry(top);
  }, [top]);

  const onUndo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last) return;
    const result = await setApartmentStatusAction({
      apartmentId: last.apartmentId,
      status: last.prevStatus,
    });
    if (!result.ok) {
      toastError(t("errorStatus"));
      return;
    }
    setHistory((prev) => prev.slice(0, -1));
    toastInfo(t("undoSuccess"));
  }, [history, t]);

  const onModalChangeStatus = useCallback(
    (status: UserApartmentStatusKind) => {
      if (!modalEntry) return;
      const prev = modalEntry.item.status;
      const updated: FeedDeckEntry = {
        item: { ...modalEntry.item, status },
        annotations: modalEntry.annotations,
      };
      setModalEntry(updated);
      setEntries((arr) =>
        arr.map((e) => (e.item.apartmentId === modalEntry.item.apartmentId ? updated : e)),
      );
      startModalTransition(async () => {
        const result = await setApartmentStatusAction({
          apartmentId: modalEntry.item.apartmentId,
          status,
        });
        if (!result.ok) {
          toastError(t("errorStatus"));
          const reverted: FeedDeckEntry = {
            item: { ...modalEntry.item, status: prev },
            annotations: modalEntry.annotations,
          };
          setModalEntry(reverted);
          setEntries((arr) =>
            arr.map((e) => (e.item.apartmentId === modalEntry.item.apartmentId ? reverted : e)),
          );
        }
      });
    },
    [modalEntry, t],
  );

  if (entries.length === 0) {
    return (
      <EmptyState
        title={t("emptyAllSwipedTitle")}
        body={t("emptyAllSwipedBody")}
        actionLabel={history.length > 0 ? t("undo") : null}
        onAction={history.length > 0 ? () => void onUndo() : null}
        secondaryHref="/filters"
        secondaryLabel={t("editFilters")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto h-[540px] w-full max-w-[480px] sm:h-[600px]">
        {peek2 ? <PeekCard offset={2} key={`peek2-${peek2.item.apartmentId}`} /> : null}
        {peek1 ? <PeekCard offset={1} key={`peek1-${peek1.item.apartmentId}`} /> : null}

        <AnimatePresence
          initial={false}
          custom={exitDirection}
          onExitComplete={() => setExitDirection(null)}
        >
          {top ? (
            <SwipeableCard
              key={top.item.apartmentId}
              entry={top}
              onPass={onPass}
              onSave={onSave}
              onLike={onLike}
              onOpen={onOpen}
              exitDirection={exitDirection}
            />
          ) : null}
        </AnimatePresence>
      </div>

      {modalEntry ? (
        <MatchModal
          open={modalEntry !== null}
          onOpenChange={(open) => !open && setModalEntry(null)}
          item={modalEntry.item}
          listingUrl={modalEntry.item.sourceUrl}
          sourceUrl={modalEntry.item.sourceUrl}
          onChangeStatus={onModalChangeStatus}
          statusPending={modalPending}
        />
      ) : null}
    </div>
  );
}

function PeekCard({ offset }: { offset: 1 | 2 }) {
  const scale = offset === 1 ? 0.95 : 0.9;
  const translateY = offset === 1 ? 12 : 24;
  return (
    <div
      aria-hidden
      className="absolute inset-0 hidden rounded-xl border bg-card shadow-md sm:block"
      style={{
        transform: `translateY(${translateY}px) scale(${scale})`,
        opacity: offset === 1 ? 0.7 : 0.4,
      }}
    />
  );
}

function SwipeableCard({
  entry,
  onPass,
  onSave,
  onLike,
  onOpen,
  exitDirection,
}: {
  entry: FeedDeckEntry;
  onPass: () => void;
  onSave: () => void;
  onLike: () => void;
  onOpen: () => void;
  exitDirection: SwipeDirection | null;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-15, 0, 15]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const dir = decideSwipe({
      offsetX: info.offset.x,
      offsetY: info.offset.y,
      velocityX: info.velocity.x,
      velocityY: info.velocity.y,
    });
    if (dir === "left") {
      onPass();
    } else if (dir === "right") {
      onSave();
    } else if (dir === "up") {
      onOpen();
    } else {
      x.set(0);
      y.set(0);
    }
  };

  const exitX =
    exitDirection === "left" ? -EXIT_OFFSET_PX : exitDirection === "right" ? EXIT_OFFSET_PX : 0;
  const exitY = exitDirection === "up" ? -EXIT_OFFSET_PX : 0;

  return (
    <motion.div
      drag
      dragElastic={0.6}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      style={{ x, y, rotate }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ x: exitX, y: exitY, opacity: 0, transition: { duration: 0.25 } }}
      className="absolute inset-0"
    >
      <MatchCard
        item={entry.item}
        annotations={entry.annotations}
        onPass={onPass}
        onSave={onSave}
        onLike={onLike}
        onOpen={onOpen}
      />
    </motion.div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  body: string;
  actionLabel: string | null;
  onAction: (() => void) | null;
  secondaryHref: "/filters";
  secondaryLabel: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center text-card-foreground">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {actionLabel}
          </button>
        ) : null}
        <Link
          href={secondaryHref}
          className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          {secondaryLabel}
        </Link>
      </div>
    </div>
  );
}
