/**
 * Heights are tuned to match the rendered row/card heights so the
 * Suspense fallback doesn't cause a layout shift when data lands.
 * - Desktop table row: ~44px (px-3 py-3 with 14px text → ~44px)
 * - Mobile card: ~88px (3 stacked rows of text + p-3)
 */
export function ListingsSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="hidden overflow-hidden rounded-md border bg-background sm:block">
        <div className="h-9 border-b bg-muted/40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse border-b bg-muted/30 last:border-b-0" />
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-md border bg-muted/30" />
        ))}
      </div>
      <span className="sr-only">טוען…</span>
    </div>
  );
}
