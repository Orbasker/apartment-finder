"use client";

import { Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import { useMapsApiAvailable } from "../../../_components/maps-provider";

const DEFAULT_ZOOM = 14;
const MAP_HEIGHT_PX = 240;
// Demo Map ID enables AdvancedMarker without requiring a custom Cloud-styled
// Map ID. Swap for a project-owned Map ID when we add custom styling.
const MAP_ID = "DEMO_MAP_ID";

type MapTileProps = {
  lat: number | null;
  lon: number | null;
  neighborhood: string | null;
  city: string | null;
  alt: string;
};

export function MapTile({ lat, lon, neighborhood, city, alt }: MapTileProps) {
  const mapsAvailable = useMapsApiAvailable();
  if (lat == null || lon == null || !mapsAvailable) {
    return <NeighborhoodPlate neighborhood={neighborhood} city={city} />;
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-md bg-muted"
      style={{ height: MAP_HEIGHT_PX }}
      role="img"
      aria-label={alt}
    >
      <Map
        defaultCenter={{ lat, lng: lon }}
        defaultZoom={DEFAULT_ZOOM}
        mapId={MAP_ID}
        gestureHandling="none"
        disableDefaultUI
        clickableIcons={false}
        className="h-full w-full"
      >
        <AdvancedMarker position={{ lat, lng: lon }}>
          <div
            className="h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.25)]"
            aria-hidden
          />
        </AdvancedMarker>
      </Map>
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
