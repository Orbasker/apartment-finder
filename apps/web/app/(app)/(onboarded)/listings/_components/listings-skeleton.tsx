export function ListingsSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
      ))}
      <span className="sr-only">טוען…</span>
    </div>
  );
}
