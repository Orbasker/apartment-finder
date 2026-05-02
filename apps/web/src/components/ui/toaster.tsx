"use client";

import { Toaster as SonnerToaster } from "sonner";

type ToasterProps = {
  dir?: "ltr" | "rtl";
};

export function Toaster({ dir = "ltr" }: ToasterProps) {
  return (
    <SonnerToaster
      position={dir === "rtl" ? "top-left" : "top-right"}
      dir={dir}
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
    />
  );
}
