import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 0 1 8-8" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
    </svg>
  );
}
