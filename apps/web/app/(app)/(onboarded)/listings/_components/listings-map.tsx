"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Map, AdvancedMarker, useMap, type MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { MatchedListing } from "@/listings/types";
import { cn } from "@/lib/utils";
import { formatPrice } from "../_lib/format";
import { useListingsQuery } from "../_hooks/use-listings-query";
import { useMapsApiAvailable } from "../../../_components/maps-provider";

const TEL_AVIV_CENTER = { lat: 32.0853, lng: 34.7818 };
const TEL_AVIV_ZOOM = 12;
// Demo Map ID enables AdvancedMarker without a Cloud-styled custom Map ID.
// Swap for a project-owned Map ID once we add branded styling.
const MAP_ID = "DEMO_MAP_ID";
const FIT_BOUNDS_PADDING = 56;
const VIEWPORT_DEBOUNCE_MS = 250;

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
  const [selected, setSelected] = useState<MatchedListing | null>(null);
  const untitledTitle = tableT("cell.untitled");

  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    if (!selected) return;
    if (!rows.some((row) => row.id === selected.id)) {
      setSelected(null);
    }
  }, [rows, selected]);

  const mapsAvailable = useMapsApiAvailable();

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

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCameraChanged = useCallback(
    (ev: MapCameraChangedEvent) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        const lat = Number(ev.detail.center.lat.toFixed(5));
        const lng = Number(ev.detail.center.lng.toFixed(5));
        const zoom = Number(ev.detail.zoom.toFixed(2));
        const current = queryRef.current;
        const latChanged = current.lat === null || Math.abs(current.lat - lat) > 0.00001;
        const lngChanged = current.lng === null || Math.abs(current.lng - lng) > 0.00001;
        const zoomChanged = current.zoom === null || Math.abs(current.zoom - zoom) > 0.01;
        if (latChanged || lngChanged || zoomChanged) {
          setQuery({ lat, lng, zoom }, { history: "replace", resetPage: false });
        }
      }, VIEWPORT_DEBOUNCE_MS);
    },
    [setQuery],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const initialCenter =
    query.lat !== null && query.lng !== null ? { lat: query.lat, lng: query.lng } : TEL_AVIV_CENTER;
  const initialZoom = query.zoom ?? TEL_AVIV_ZOOM;
  const shouldFitBoundsOnLoad = query.lat === null || query.lng === null || query.zoom === null;

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

      <div className="h-[calc(100dvh-14rem)] sm:h-[34rem]">
        {mapsAvailable ? (
          <Map
            defaultCenter={initialCenter}
            defaultZoom={initialZoom}
            mapId={MAP_ID}
            gestureHandling="greedy"
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl={false}
            clickableIcons={false}
            onCameraChanged={handleCameraChanged}
            style={{ width: "100%", height: "100%" }}
          >
            {rows.map((row) => {
              if (row.lat === null || row.lon === null) return null;
              return (
                <ListingMarker
                  key={row.id}
                  row={row}
                  locale={locale}
                  summary={formatSummary(row)}
                  source={sourceLabel(row)}
                  untitledTitle={untitledTitle}
                  unknownLabel={t("unknown")}
                  onSelect={setSelected}
                />
              );
            })}
            {shouldFitBoundsOnLoad ? <FitBoundsOnLoad rows={rows} /> : null}
          </Map>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <p>{t("unavailable")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuery({ view: "table" }, { history: "push", resetPage: false })}
            >
              {t("switchToTable")}
            </Button>
          </div>
        )}
      </div>

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

function ListingMarker({
  row,
  locale,
  summary,
  source,
  untitledTitle,
  unknownLabel,
  onSelect,
}: {
  row: MatchedListing;
  locale: string;
  summary: string;
  source: string | null;
  untitledTitle: string;
  unknownLabel: string;
  onSelect: (row: MatchedListing) => void;
}) {
  const lat = row.lat;
  const lng = row.lon;
  if (lat === null || lng === null) return null;

  return (
    <AdvancedMarker
      position={{ lat, lng }}
      onClick={() => onSelect(row)}
      className="group relative flex flex-col items-center"
    >
      <div className="pointer-events-none absolute bottom-full z-30 mb-2 hidden w-64 rounded-md border bg-card p-3 text-start text-sm text-foreground shadow-lg group-focus-within:block group-hover:block">
        <p className="font-medium" dir="rtl">
          {row.formattedAddress ?? untitledTitle}
        </p>
        <p className="mt-1 font-semibold tabular-nums">{formatPrice(row.priceNis, locale)}</p>
        <p className="mt-1 text-xs text-muted-foreground" dir="rtl">
          {summary}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{source ?? unknownLabel}</p>
      </div>
      <div
        className="flex min-h-11 min-w-20 items-center justify-center rounded-full border-2 border-background bg-success px-3 text-sm font-semibold tabular-nums text-success-foreground shadow-lg ring-2 ring-background transition-transform hover:scale-105"
        aria-label={row.formattedAddress ?? untitledTitle}
      >
        {formatPrice(row.priceNis, locale)}
      </div>
    </AdvancedMarker>
  );
}

function FitBoundsOnLoad({ rows }: { rows: MatchedListing[] }) {
  const map = useMap();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!map || ranRef.current) return;
    let north = -Infinity;
    let south = Infinity;
    let east = -Infinity;
    let west = Infinity;
    let any = false;
    for (const row of rows) {
      if (row.lat === null || row.lon === null) continue;
      any = true;
      north = Math.max(north, row.lat);
      south = Math.min(south, row.lat);
      east = Math.max(east, row.lon);
      west = Math.min(west, row.lon);
    }
    if (!any) {
      ranRef.current = true;
      return;
    }
    map.fitBounds({ north, south, east, west }, FIT_BOUNDS_PADDING);
    ranRef.current = true;
  }, [map, rows]);

  return null;
}
