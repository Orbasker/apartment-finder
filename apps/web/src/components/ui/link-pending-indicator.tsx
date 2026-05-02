"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/**
 * Renders a spinner only while its parent <Link> is transitioning to the
 * next route. Must be a descendant of a <Link> — useLinkStatus reads the
 * pending state from the nearest Link ancestor.
 */
export function LinkPendingIndicator({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className={cn("h-3.5 w-3.5", className)} />;
}
