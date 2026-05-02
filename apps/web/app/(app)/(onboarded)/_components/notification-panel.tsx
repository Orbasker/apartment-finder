"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bell, ChevronDown, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotifyChannel } from "@/matches/types";
import { markAllAlertsSeenAction } from "./notification-actions";

type SerializedItem = {
  apartmentId: number;
  sentAt: string;
  seenAt: string | null;
  channels: NotifyChannel[];
  neighborhood: string | null;
  city: string | null;
  formattedAddress: string | null;
  priceNis: number | null;
  rooms: number | null;
  sqm: number | null;
  sourceUrl: string | null;
};

type Props = {
  unreadCount: number;
  items: SerializedItem[];
};

export function NotificationPanel({ unreadCount: initialUnread, items }: Props) {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keep local count in sync with server-fetched data when the layout refreshes.
  useEffect(() => {
    setUnreadCount(initialUnread);
  }, [initialUnread]);

  // Refresh on tab regaining focus so the badge stays cheap-but-fresh.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [router]);

  // Lock body scroll + Esc to close + focus management.
  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleOpen() {
    setOpen(true);
    if (unreadCount > 0) {
      setUnreadCount(0);
      startTransition(async () => {
        await markAllAlertsSeenAction();
        router.refresh();
      });
    }
  }

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);
  const ariaLabel =
    unreadCount > 0 ? t("ariaLabelWithCount", { count: unreadCount }) : t("ariaLabel");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -end-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div
        id="notification-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogLabel")}
        tabIndex={-1}
        className={cn(
          "fixed z-50 flex flex-col bg-background shadow-xl outline-none transition-transform duration-200 ease-out",
          // Mobile: bottom sheet
          "inset-x-0 bottom-0 max-h-[80vh] rounded-t-xl border-t",
          open ? "translate-y-0" : "translate-y-full",
          // Desktop: right-edge side panel (RTL: start-0 = right)
          "sm:inset-y-0 sm:start-0 sm:bottom-auto sm:end-auto sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-t-0 sm:border-e",
          open
            ? "sm:translate-y-0 sm:translate-x-0"
            : "sm:translate-y-0 sm:rtl:translate-x-full sm:ltr:-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("close")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">{t("empty")}</div>
          ) : (
            <NotificationList items={items} onNavigate={() => setOpen(false)} />
          )}
        </div>

        <div className="border-t px-4 py-3 text-center">
          <Link
            href="/matches"
            onClick={() => setOpen(false)}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("viewAll")}
          </Link>
        </div>
      </div>
    </>
  );
}

function NotificationList({
  items,
  onNavigate,
}: {
  items: SerializedItem[];
  onNavigate: () => void;
}) {
  const t = useTranslations("Notifications");
  const groups = groupByBucket(items);
  const [collapsed, setCollapsed] = useState<Record<Bucket, boolean>>({
    lastHour: false,
    today: false,
    yesterday: false,
    week: false,
    older: false,
  });
  const bucketLabels: Record<Bucket, string> = {
    lastHour: t("buckets.lastHour"),
    today: t("buckets.today"),
    yesterday: t("buckets.yesterday"),
    week: t("buckets.week"),
    older: t("buckets.older"),
  };
  return (
    <ul className="divide-y">
      {groups.map((group) => {
        const isCollapsed = collapsed[group.bucket];
        return (
          <li key={group.bucket}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [group.bucket]: !c[group.bucket] }))}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center justify-between gap-2 bg-muted/40 px-4 py-1.5 text-start text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <span>{bucketLabels[group.bucket]}</span>
                <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] tabular-nums">
                  {group.items.length}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn("h-3.5 w-3.5 transition-transform", isCollapsed && "-rotate-90")}
              />
            </button>
            {!isCollapsed && (
              <ul>
                {group.items.map((item) => (
                  <NotificationRow key={item.apartmentId} item={item} onNavigate={onNavigate} />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NotificationRow({ item, onNavigate }: { item: SerializedItem; onNavigate: () => void }) {
  const t = useTranslations("Notifications");
  const isUnread = item.seenAt == null;
  const title = item.formattedAddress ?? formatPlace(item.neighborhood, item.city) ?? t("untitled");
  const meta = [
    item.priceNis != null ? `₪${item.priceNis.toLocaleString("he-IL")}` : null,
    item.rooms != null ? t("rooms", { value: item.rooms }) : null,
    item.sqm != null ? t("sqm", { value: item.sqm }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-stretch gap-1 hover:bg-muted/40">
      <Link
        href={`/matches?focus=${item.apartmentId}`}
        onClick={onNavigate}
        className="flex flex-1 items-start gap-3 px-4 py-3 text-start"
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full",
            isUnread ? "bg-primary" : "bg-transparent",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          {meta && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>
          )}
          <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTimeAgoHe(new Date(item.sentAt))}</span>
            {item.channels.length > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                {item.channels.map((c) => channelLabel(c)).join(" / ")}
              </span>
            )}
          </span>
        </span>
      </Link>
      {item.sourceUrl && (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("openListing")}
          className="inline-flex w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

type Bucket = "lastHour" | "today" | "yesterday" | "week" | "older";
type Group = { bucket: Bucket; items: SerializedItem[] };

function groupByBucket(items: SerializedItem[]): Group[] {
  const buckets: Record<Bucket, SerializedItem[]> = {
    lastHour: [],
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };
  const now = Date.now();
  const lastHourMark = now - 60 * 60 * 1000;
  const startOfToday = startOfDay(now).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
  for (const item of items) {
    const t = new Date(item.sentAt).getTime();
    if (t >= lastHourMark) buckets.lastHour.push(item);
    else if (t >= startOfToday) buckets.today.push(item);
    else if (t >= startOfYesterday) buckets.yesterday.push(item);
    else if (t >= startOfWeek) buckets.week.push(item);
    else buckets.older.push(item);
  }
  const order: Bucket[] = ["lastHour", "today", "yesterday", "week", "older"];
  return order.filter((b) => buckets[b].length > 0).map((b) => ({ bucket: b, items: buckets[b] }));
}

function startOfDay(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTimeAgoHe(date: Date): string {
  const diffSec = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return "לפני רגע";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `לפני ${diffHr} שעות`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `לפני ${diffDay} ימים`;
  const diffWk = Math.round(diffDay / 7);
  if (diffWk < 5) return `לפני ${diffWk} שבועות`;
  return date.toLocaleDateString("he-IL");
}

function formatPlace(neighborhood: string | null, city: string | null): string | null {
  const parts = [neighborhood, city].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function channelLabel(c: NotifyChannel): string {
  if (c === "email") return "📧";
  if (c === "telegram") return "TG";
  return c;
}
