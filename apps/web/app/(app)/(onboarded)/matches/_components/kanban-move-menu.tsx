"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { USER_APARTMENT_STATUS_KINDS, type UserApartmentStatusKind } from "@/matches/types";

type KanbanMoveMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: UserApartmentStatusKind;
  onSelect: (status: UserApartmentStatusKind) => void;
};

/**
 * Mobile bottom-sheet for "Move to..." — listed all statuses in the same
 * order as the kanban columns so users build muscle memory between the two
 * surfaces. The dialog primitive is reused from the swipe modal so we don't
 * pull in a fresh radix component just for this.
 */
export function KanbanMoveMenu({
  open,
  onOpenChange,
  currentStatus,
  onSelect,
}: KanbanMoveMenuProps) {
  const t = useTranslations("Matches.board");
  const tColumns = useTranslations("Matches.board.columns");
  const columnLabels: Record<UserApartmentStatusKind, string> = {
    new: tColumns("new"),
    interested: tColumns("interested"),
    contacted: tColumns("contacted"),
    visited: tColumns("visited"),
    rejected: tColumns("rejected"),
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-start" dir="rtl">
        <DialogTitle className="text-base font-semibold">{t("moveToTitle")}</DialogTitle>
        <ul className="flex flex-col gap-1 pt-1">
          {USER_APARTMENT_STATUS_KINDS.map((kind) => {
            const isCurrent = kind === currentStatus;
            return (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(kind);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                    isCurrent ? "border-foreground/40 bg-muted text-foreground" : "hover:bg-muted",
                  )}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <span>{columnLabels[kind]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-9 w-full items-center justify-center rounded-md border bg-background text-sm font-medium hover:bg-muted"
        >
          {t("cancel")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
