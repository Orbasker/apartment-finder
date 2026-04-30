"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export const links = [
  { href: "/matches", label: "דירות" },
  { href: "/listings", label: "רשימה" },
  { href: "/filters", label: "תנאים" },
  { href: "/settings", label: "הגדרות" },
] as const;

export function HeaderBrandLink() {
  return (
    <Link
      href="/matches"
      prefetch
      className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight"
    >
      <LinkPendingIndicator />
      Apartment Finder
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="ניווט ראשי" className="flex flex-col gap-1 text-sm">
      {links.map((l) => {
        const isActive = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 transition-colors",
              isActive
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
