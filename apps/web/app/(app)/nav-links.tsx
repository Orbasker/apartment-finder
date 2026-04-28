"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const links = [
  { href: "/", label: "בית" },
  { href: "/filters", label: "סינונים" },
  { href: "/onboarding", label: "צ׳אט" },
] as const;

export function HeaderBrandLink() {
  return (
    <Link href="/" prefetch className="inline-flex items-center gap-2 text-lg font-semibold">
      <LinkPendingIndicator />
      Apartment Finder
    </Link>
  );
}

export function PrimaryNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-3 whitespace-nowrap text-sm sm:gap-4">
      {links.map((l) => {
        const isActive = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
              isActive
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LinkPendingIndicator />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className="h-3 w-3" />;
}
