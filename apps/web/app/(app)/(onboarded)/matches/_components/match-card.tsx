"use client";

import { useTranslations } from "next-intl";
import { Heart, ThumbsUp, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchFeedItem } from "@/matches/types";
import type { Annotation } from "@/matches/annotations";
import { MapTile } from "./map-tile";
import { AnnotationsRow } from "./annotations-row";

export type MatchCardProps = {
  item: MatchFeedItem;
  annotations: Annotation[];
  onPass: () => void;
  onSave: () => void;
  onLike: () => void;
  onOpen: () => void;
};

/**
 * Front of a swipe card: map hero, meta row, annotations, action bar. The
 * action-bar buttons are explicit (parity with swipe gestures) and stop drag
 * propagation so a tap on a button doesn't get interpreted as a swipe.
 */
export function MatchCard({ item, annotations, onPass, onSave, onLike, onOpen }: MatchCardProps) {
  const t = useTranslations("Matches.card");
  const sourceUrl = item.sourceUrl;
  return (
    <div
      dir="rtl"
      className="flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg"
    >
      <MapTile
        lat={item.lat}
        lon={item.lon}
        neighborhood={item.neighborhood}
        city={item.city}
        alt={item.formattedAddress ?? item.neighborhood ?? t("mapAlt")}
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen();
            }
          }}
          className="cursor-pointer rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-sm font-medium leading-snug">
            <Meta item={item} />
          </p>
          {item.formattedAddress ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{item.formattedAddress}</p>
          ) : null}
        </div>

        <AnnotationsRow annotations={annotations} />

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <ActionButton
            label={t("pass")}
            onClick={onPass}
            tone="pass"
            icon={<X className="h-5 w-5" aria-hidden />}
          />
          <ActionButton
            label={t("save")}
            onClick={onSave}
            tone="save"
            icon={<Heart className="h-5 w-5" aria-hidden />}
          />
          <ActionButton
            label={t("like")}
            onClick={onLike}
            tone="like"
            icon={<ThumbsUp className="h-5 w-5" aria-hidden />}
          />
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              onPointerDownCapture={(e) => e.stopPropagation()}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span>{t("openListing")}</span>
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  tone,
  icon,
}: {
  label: string;
  onClick: () => void;
  tone: "pass" | "save" | "like";
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDownCapture={(e) => e.stopPropagation()}
      aria-label={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "pass" && "border-rose-500/40 text-rose-300 hover:bg-rose-500/15",
        tone === "save" && "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15",
        tone === "like" && "border-sky-500/40 text-sky-300 hover:bg-sky-500/15",
      )}
    >
      {icon}
    </button>
  );
}

function Meta({ item }: { item: MatchFeedItem }) {
  const segments: string[] = [];
  if (item.priceNis != null) segments.push(`₪${item.priceNis.toLocaleString("he-IL")}`);
  if (item.rooms != null) segments.push(`${item.rooms} חדרים`);
  if (item.sqm != null) segments.push(`${item.sqm} מ"ר`);
  if (item.floor != null) segments.push(`קומה ${item.floor}`);
  if (item.neighborhood) segments.push(item.neighborhood);
  return <>{segments.join(" · ")}</>;
}
