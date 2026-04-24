"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const baseLinks = [
  { href: "/", label: "Listings" },
  { href: "/preferences", label: "Preferences" },
  { href: "/groups", label: "FB Groups" },
  { href: "/chat", label: "Chat" },
] as const;

const adminLink = { href: "/admin", label: "Admin" } as const;

export function DashboardNav({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();
  const links = showAdmin ? [...baseLinks, adminLink] : baseLinks;
  return (
    <nav className="flex gap-4">
      {links.map((l) => {
        const isActive =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
            className={cn(
              "inline-flex items-center gap-1.5 text-sm transition-colors",
              isActive
                ? "font-medium text-foreground"
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

export function HeaderBrandLink() {
  return (
    <Link
      href="/"
      prefetch
      className="inline-flex items-center gap-2 text-lg font-semibold"
    >
      <LinkPendingIndicator />
      Apartment Finder
    </Link>
  );
}
