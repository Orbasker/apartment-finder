import { Skeleton } from "@/components/ui/skeleton";

export default function PreferencesLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-7 w-40" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <div className="space-y-3 rounded-md border p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-5 w-72" />
      </div>
      <Skeleton className="h-9 w-24" />
    </div>
  );
}
