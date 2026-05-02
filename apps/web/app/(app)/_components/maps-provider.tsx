"use client";

import type { ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";

export function MapsProvider({ children, apiKey }: { children: ReactNode; apiKey: string }) {
  if (!apiKey) return <>{children}</>;
  return (
    <APIProvider apiKey={apiKey} libraries={["marker"]} language="iw" region="IL">
      {children}
    </APIProvider>
  );
}
