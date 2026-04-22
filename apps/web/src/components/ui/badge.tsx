import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "muted" | "destructive" | "success";
}) {
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground",
    muted: "bg-muted text-muted-foreground",
    destructive: "bg-destructive text-white",
    success: "bg-emerald-600 text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
