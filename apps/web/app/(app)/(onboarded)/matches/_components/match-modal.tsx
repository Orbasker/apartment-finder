"use client";

import { useTranslations } from "next-intl";
import {
  APARTMENT_ATTRIBUTE_LABELS,
  FURNITURE_STATUS_LABELS,
  type ApartmentAttributeKey,
} from "@apartment-finder/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { USER_APARTMENT_STATUS_KINDS, type MatchFeedItem } from "@/matches/types";

type MatchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MatchFeedItem;
  /** External listing URL (raw page on the source site). */
  listingUrl: string | null;
  /** Source URL (post URL inside Yad2/FB). */
  sourceUrl: string | null;
  onChangeStatus: (status: MatchFeedItem["status"]) => void;
};

/**
 * Full-info dialog for a match. Mirrors the email's info table verbatim so
 * the user sees the same data they were alerted with, and adds a status
 * radio so a quick "I called them" can update without leaving the feed.
 */
export function MatchModal({
  open,
  onOpenChange,
  item,
  listingUrl,
  sourceUrl,
  onChangeStatus,
}: MatchModalProps) {
  const t = useTranslations("Matches.modal");
  const tStatus = useTranslations("Matches.statusLabels");
  const statusLabel: Record<MatchFeedItem["status"], string> = {
    new: tStatus("new"),
    interested: tStatus("interested"),
    contacted: tStatus("contacted"),
    visited: tStatus("visited"),
    rejected: tStatus("rejected"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-start" dir="rtl">
        <DialogTitle className="text-lg font-semibold">
          {item.formattedAddress ?? item.neighborhood ?? t("untitled")}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          <Meta item={item} />
        </DialogDescription>

        <InfoGrid item={item} />

        {item.matchedAttributes.length > 0 ? (
          <section>
            <h3 className="mb-1 text-sm font-medium">{t("matchedAttributes")}</h3>
            <p className="text-sm text-muted-foreground">
              {item.matchedAttributes.map((k) => APARTMENT_ATTRIBUTE_LABELS[k] ?? k).join(" · ")}
            </p>
          </section>
        ) : null}

        {item.unverifiedAttributes.length > 0 ? (
          <section>
            <h3 className="mb-1 text-sm font-medium">{t("unverifiedAttributes")}</h3>
            <p className="text-sm text-muted-foreground">
              {item.unverifiedAttributes.map((k) => APARTMENT_ATTRIBUTE_LABELS[k] ?? k).join(" · ")}
            </p>
          </section>
        ) : null}

        <fieldset className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{t("statusLegend")}</legend>
          <div className="flex flex-wrap gap-2 pt-1">
            {USER_APARTMENT_STATUS_KINDS.map((kind) => {
              const checked = item.status === kind;
              return (
                <label
                  key={kind}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                    checked ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value={kind}
                    checked={checked}
                    onChange={() => onChangeStatus(kind)}
                    className="sr-only"
                  />
                  {statusLabel[kind]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2 pt-1">
          {listingUrl ? (
            <a
              href={listingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("openListing")}
            </a>
          ) : null}
          {sourceUrl && sourceUrl !== listingUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
            >
              {t("openSource")}
            </a>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
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

function InfoGrid({ item }: { item: MatchFeedItem }) {
  const t = useTranslations("Matches.modal.infoLabels");
  const rows: Array<{ label: string; value: string | null }> = [];
  if (item.pricePerSqm != null)
    rows.push({ label: t("pricePerSqm"), value: `₪${item.pricePerSqm.toLocaleString("he-IL")}` });
  if (item.arnonaNis != null)
    rows.push({ label: t("arnona"), value: `₪${item.arnonaNis.toLocaleString("he-IL")}` });
  if (item.condition) rows.push({ label: t("condition"), value: item.condition });
  if (item.vaadBayitNis != null)
    rows.push({ label: t("vaadBayit"), value: `₪${item.vaadBayitNis.toLocaleString("he-IL")}` });
  if (item.entryDate) rows.push({ label: t("entryDate"), value: item.entryDate });
  if (item.balconySqm != null) rows.push({ label: t("balcony"), value: `${item.balconySqm} מ"ר` });
  if (item.totalFloors != null)
    rows.push({ label: t("totalFloors"), value: String(item.totalFloors) });
  if (item.furnitureStatus)
    rows.push({ label: t("furniture"), value: FURNITURE_STATUS_LABELS[item.furnitureStatus] });

  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-md bg-muted px-3 py-2">
          <p className="text-xs text-muted-foreground">{r.label}</p>
          <p className="mt-0.5 text-sm font-medium">{r.value}</p>
        </div>
      ))}
    </div>
  );
}

// Re-exported only so the modal compiles even if downstream callers want to
// reference the same key set. (Not intended for external import.)
export type { ApartmentAttributeKey };
