"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import maplibregl, { type LngLatBoundsLike } from "maplibre-gl";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { MatchedListing } from "@/listings/types";
import { cn } from "@/lib/utils";
import { formatPrice } from "../_lib/format";
import { useListingsQuery } from "../_hooks/use-listings-query";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const TEL_AVIV_CENTER: [number, number] = [34.7818, 32.0853];
const TEL_AVIV_ZOOM = 12;

export function ListingsMap({
  rows,
  noLocationCount,
}: {
  rows: MatchedListing[];
  noLocationCount: number;
}) {
  const t = useTranslations("Listings.map");
  const tableT = useTranslations("Listings.table");
  const sourceT = useTranslations("Listings.source");
  const locale = useLocale();
  const { query, setQuery } = useListingsQuery();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<MatchedListing | null>(null);
  const untitledTitle = tableT("cell.untitled");
  const queryRef = useRef(query);
  const rowsRef = useRef(rows);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const formatSummary = useCallback(
    (row: MatchedListing): string => {
      const parts = [
        row.rooms != null ? tableT("cell.rooms", { value: row.rooms }) : null,
        row.sqm != null ? tableT("cell.sqm", { value: row.sqm }) : null,
        row.neighborhood,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : t("unknown");
    },
    [tableT, t],
  );

  const sourceLabel = useCallback(
    (row: MatchedListing): string | null => {
      if (row.source === "yad2") return sourceT("yad2");
      if (row.source === "facebook") return sourceT("facebook");
      return null;
    },
    [sourceT],
  );

  const openListing = useCallback((row: MatchedListing) => {
    setSelected(row);
  }, []);
  const openListingRef = useRef(openListing);

  useEffect(() => {
    openListingRef.current = openListing;
  }, [openListing]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialQuery = queryRef.current;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center:
        initialQuery.lat !== null && initialQuery.lng !== null
          ? [initialQuery.lng, initialQuery.lat]
          : TEL_AVIV_CENTER,
      zoom: initialQuery.zoom ?? TEL_AVIV_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      "top-left",
    );

    const syncViewport = () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const lat = Number(center.lat.toFixed(5));
        const lng = Number(center.lng.toFixed(5));
        const roundedZoom = Number(zoom.toFixed(2));
        const currentQuery = queryRef.current;
        const latChanged = currentQuery.lat === null || Math.abs(currentQuery.lat - lat) > 0.00001;
        const lngChanged = currentQuery.lng === null || Math.abs(currentQuery.lng - lng) > 0.00001;
        const zoomChanged =
          currentQuery.zoom === null || Math.abs(currentQuery.zoom - roundedZoom) > 0.01;

        if (latChanged || lngChanged || zoomChanged) {
          setQuery({ lat, lng, zoom: roundedZoom }, { history: "replace", resetPage: false });
        }
      }, 250);
    };

    map.on("moveend", syncViewport);

    map.on("load", () => {
      replaceMarkers(map, rowsRef.current, markersRef, {
        locale,
        untitledTitle,
        unknownLabel: t("unknown"),
        sourceLabel,
        summaryLabel: formatSummary,
        openListingRef,
      });

      if (initialQuery.lat === null || initialQuery.lng === null || initialQuery.zoom === null) {
        fitRows(map, rowsRef.current);
      }
    });

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      clearMarkers(markersRef);
      map.remove();
      mapRef.current = null;
    };
  }, [formatSummary, locale, setQuery, sourceLabel, t, untitledTitle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    replaceMarkers(map, rows, markersRef, {
      locale,
      untitledTitle,
      unknownLabel: t("unknown"),
      sourceLabel,
      summaryLabel: formatSummary,
      openListingRef,
    });
  }, [formatSummary, locale, rows, sourceLabel, t, untitledTitle]);

  const selectedSummary = selected ? formatSummary(selected) : null;
  const selectedSource = selected ? sourceLabel(selected) : null;

  return (
    <section className="relative -mx-4 flex min-h-[calc(100dvh-14rem)] flex-col overflow-hidden border-y bg-muted sm:mx-0 sm:min-h-[34rem] sm:rounded-md sm:border">
      {noLocationCount > 0 ? (
        <div className="absolute start-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-md border bg-card p-3 text-sm shadow-sm">
          <p className="text-foreground">
            {t.rich("missingLocation", {
              count: noLocationCount,
              countTag: (chunks) => <bdi>{chunks}</bdi>,
            })}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setQuery({ view: "table" }, { history: "push", resetPage: false })}
          >
            {t("switchToTable")}
          </Button>
        </div>
      ) : null}

      <div ref={mapContainerRef} className="min-h-[calc(100dvh-14rem)] flex-1 sm:min-h-[34rem]" />

      {selected ? (
        <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-md border-t bg-card p-4 shadow-lg sm:inset-x-auto sm:bottom-3 sm:start-3 sm:w-80 sm:rounded-md sm:border">
          <button
            type="button"
            className="absolute end-3 top-3 flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label={t("close")}
            onClick={() => setSelected(null)}
          >
            ×
          </button>
          <div className="pe-10">
            <p className="font-medium">
              <bdi>{selected.formattedAddress ?? tableT("cell.untitled")}</bdi>
            </p>
            <p className="mt-1 font-medium tabular-nums">
              <bdi>{formatPrice(selected.priceNis, locale)}</bdi>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <bdi>{selectedSummary}</bdi>
            </p>
            <p
              className={cn(
                "mt-1 text-xs text-muted-foreground",
                selectedSource ? undefined : "hidden",
              )}
            >
              {selectedSource}
            </p>
            <Link
              href={`/listings/${selected.id}`}
              className="mt-3 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {t("details")}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function clearMarkers(markersRef: MutableRefObject<maplibregl.Marker[]>) {
  for (const marker of markersRef.current) marker.remove();
  markersRef.current = [];
}

function replaceMarkers(
  map: maplibregl.Map,
  rows: MatchedListing[],
  markersRef: MutableRefObject<maplibregl.Marker[]>,
  options: {
    locale: string;
    untitledTitle: string;
    unknownLabel: string;
    sourceLabel: (row: MatchedListing) => string | null;
    summaryLabel: (row: MatchedListing) => string;
    openListingRef: MutableRefObject<(row: MatchedListing) => void>;
  },
) {
  clearMarkers(markersRef);

  markersRef.current = rows
    .map((row) => {
      if (row.lat === null || row.lon === null) return null;

      const wrap = document.createElement("div");
      wrap.dir = "rtl";
      wrap.className = "group relative flex flex-col items-center";

      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "flex min-h-11 min-w-20 items-center justify-center rounded-full border-2 border-background bg-success px-3 text-sm font-semibold tabular-nums text-success-foreground shadow-lg ring-2 ring-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
      button.setAttribute("aria-label", row.formattedAddress ?? options.untitledTitle);
      button.textContent = formatPrice(row.priceNis, options.locale);

      const card = document.createElement("div");
      card.className =
        "pointer-events-none absolute bottom-full z-30 mb-2 hidden w-64 rounded-md border bg-card p-3 text-start text-sm text-foreground shadow-lg group-focus-within:block group-hover:block";

      const title = document.createElement("p");
      title.className = "font-medium";
      title.textContent = row.formattedAddress ?? options.untitledTitle;

      const price = document.createElement("p");
      price.className = "mt-1 font-semibold tabular-nums";
      price.textContent = formatPrice(row.priceNis, options.locale);

      const summary = document.createElement("p");
      summary.className = "mt-1 text-xs text-muted-foreground";
      summary.textContent = options.summaryLabel(row);

      const source = document.createElement("p");
      source.className = "mt-1 text-xs text-muted-foreground";
      source.textContent = options.sourceLabel(row) ?? options.unknownLabel;

      card.append(title, price, summary, source);
      wrap.append(card, button);

      const lngLat = new maplibregl.LngLat(row.lon, row.lat);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.openListingRef.current(row);
      });

      return new maplibregl.Marker({ element: wrap, anchor: "bottom" })
        .setLngLat(lngLat)
        .addTo(map);
    })
    .filter((marker): marker is maplibregl.Marker => marker !== null);
}

function fitRows(map: maplibregl.Map, rows: MatchedListing[]) {
  if (rows.length === 0) {
    map.setCenter(TEL_AVIV_CENTER);
    map.setZoom(TEL_AVIV_ZOOM);
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  for (const row of rows) {
    if (row.lat !== null && row.lon !== null) {
      bounds.extend([row.lon, row.lat]);
    }
  }

  if (bounds.isEmpty()) {
    map.setCenter(TEL_AVIV_CENTER);
    map.setZoom(TEL_AVIV_ZOOM);
    return;
  }

  map.fitBounds(bounds as LngLatBoundsLike, {
    padding: 56,
    maxZoom: 15,
    duration: 0,
  });
}
