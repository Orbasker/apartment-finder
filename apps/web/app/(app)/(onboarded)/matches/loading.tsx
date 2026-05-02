import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}
