"use client";

import { createContext, useContext, type ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";

const MapsApiAvailableContext = createContext(false);

export function useMapsApiAvailable() {
  return useContext(MapsApiAvailableContext);
}

export function MapsProvider({ children, apiKey }: { children: ReactNode; apiKey: string }) {
  if (!apiKey) {
    return (
      <MapsApiAvailableContext.Provider value={false}>{children}</MapsApiAvailableContext.Provider>
    );
  }
  return (
    <MapsApiAvailableContext.Provider value={true}>
      <APIProvider apiKey={apiKey} libraries={["marker"]} language="iw" region="IL">
        {children}
      </APIProvider>
    </MapsApiAvailableContext.Provider>
  );
}
