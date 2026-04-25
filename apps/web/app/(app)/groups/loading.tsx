import { Skeleton } from "@/components/ui/skeleton";

export default function GroupsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-3/4" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border p-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
