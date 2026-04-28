"use client";

import Link, { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";

export function HeaderBrandLink() {
  return (
    <Link href="/" prefetch className="inline-flex items-center gap-2 text-lg font-semibold">
      <LinkPendingIndicator />
      Apartment Finder
    </Link>
  );
}

function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className="h-3 w-3" />;
}
