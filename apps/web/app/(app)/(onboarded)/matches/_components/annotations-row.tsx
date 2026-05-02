"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/matches/annotations";

/**
 * Renders the small "decision-helpful" pills produced by `buildAnnotations`.
 * Returns null when there's nothing to show so the card collapses cleanly.
 */
export function AnnotationsRow({ annotations }: { annotations: Annotation[] }) {
  if (annotations.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {annotations.map((a, i) => (
        <Pill key={i} annotation={a} />
      ))}
    </div>
  );
}

type Tone = "green" | "amber" | "blue" | "neutral";

function Pill({ annotation }: { annotation: Annotation }) {
  const t = useTranslations("Matches.annotations");

  let label = "";
  let tone: Tone = "neutral";
  switch (annotation.kind) {
    case "price_vs_median": {
      const abs = Math.abs(Math.round(annotation.deltaNis)).toLocaleString("he-IL");
      if (annotation.deltaNis < 0) {
        label = t("priceBelowMedian", { delta: abs });
        tone = "green";
      } else {
        label = t("priceAboveMedian", { delta: abs });
        tone = "neutral";
      }
      break;
    }
    case "distance_to_center":
      label = t("walkMinutes", { mins: annotation.walkMinutes });
      tone = "neutral";
      break;
    case "must_have_coverage":
      label = t("mustHaveCoverage", {
        matched: annotation.matched,
        total: annotation.total,
      });
      tone = annotation.matched < annotation.total ? "amber" : "neutral";
      break;
    case "fresh":
      label =
        annotation.ageMinutes < 60
          ? t("freshMinutes", { mins: annotation.ageMinutes })
          : t("freshHours", { hours: Math.round(annotation.ageMinutes / 60) });
      tone = "blue";
      break;
  }

  return (
    <span
      data-kind={annotation.kind}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium leading-5",
        tone === "green" && "bg-emerald-500/15 text-emerald-300",
        tone === "amber" && "bg-amber-500/15 text-amber-300",
        tone === "blue" && "bg-sky-500/15 text-sky-300",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
