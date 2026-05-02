"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapPin } from "lucide-react";

/**
 * Same vector-tile stack as `/listings` (maplibre-gl + OpenFreeMap "liberty"),
 * locked to a non-interactive single-marker view so the surrounding card stays
 * draggable. No API token needed.
 *
 * Design notes that matter for "why isn't the map rendering":
 *   - Fixed pixel height (not aspect-ratio). aspect-ratio derives height from
 *     resolved width, which is unreliable inside a transformed framer-motion
 *     container during the entry animation — maplibre measures 0 then bails.
 *   - The map is created inside requestAnimationFrame so the initial mount has
 *     committed layout before WebGL reads the container size.
 *   - ResizeObserver tracks the container so the canvas keeps up with viewport
 *     changes and the framer-motion exit animation.
 */
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_ZOOM = 14;
const MAP_HEIGHT_PX = 240;

type MapTileProps = {
  lat: number | null;
  lon: number | null;
  neighborhood: string | null;
  city: string | null;
  alt: string;
};

export function MapTile({ lat, lon, neighborhood, city, alt }: MapTileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (lat == null || lon == null) return;
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let cancelled = false;
    let map: maplibregl.Map | null = null;
    let ro: ResizeObserver | null = null;

    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        map = new maplibregl.Map({
          container,
          style: MAP_STYLE,
          center: [lon, lat],
          zoom: DEFAULT_ZOOM,
          interactive: false,
          attributionControl: { compact: true },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[matches:map-tile] failed to create maplibre map", err);
        return;
      }
      mapRef.current = map;

      map.on("error", (e) => {
        // eslint-disable-next-line no-console
        console.warn("[matches:map-tile] maplibre runtime error", e?.error ?? e);
      });

      map.on("load", () => {
        if (!map) return;
        const el = document.createElement("div");
        el.className =
          "h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.25)]";
        el.setAttribute("aria-hidden", "true");
        markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
        map.resize();
      });

      ro = new ResizeObserver(() => {
        mapRef.current?.resize();
      });
      ro.observe(container);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lon]);

  if (lat == null || lon == null) {
    return <NeighborhoodPlate neighborhood={neighborhood} city={city} />;
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-md bg-muted"
      style={{ height: MAP_HEIGHT_PX }}
      role="img"
      aria-label={alt}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function NeighborhoodPlate({
  neighborhood,
  city,
}: {
  neighborhood: string | null;
  city: string | null;
}) {
  const parts = [city, neighborhood].filter(Boolean) as string[];
  const label = parts.length > 0 ? parts.join(" · ") : "—";
  return (
    <div
      className="relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-md bg-gradient-to-br from-zinc-800 via-zinc-900 to-black text-zinc-100"
      style={{ height: MAP_HEIGHT_PX }}
      role="img"
      aria-label={label}
    >
      <MapPin className="h-6 w-6 text-zinc-400" aria-hidden />
      <span className="px-4 text-center text-base font-medium tracking-tight sm:text-lg">
        {label}
      </span>
    </div>
  );
}
