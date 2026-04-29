"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { links } from "./nav-links";
import { signOutAction } from "./profile-actions";

export function MobileNav({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const display = email ?? "מנותק/ת";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="פתח תפריט"
        aria-controls="mobile-nav-drawer"
        aria-expanded={open}
        className="sm:hidden"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 sm:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="תפריט ראשי"
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex w-[80%] max-w-xs flex-col border-e bg-background shadow-xl transition-transform duration-200 ease-out sm:hidden",
          open ? "translate-x-0" : "rtl:translate-x-full ltr:-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-base font-semibold">תפריט</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="סגור תפריט"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-1">
            {links.map((l) => {
              const isActive = pathname.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    prefetch
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center rounded-md px-3 py-3 text-base transition-colors",
                      isActive
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t p-3">
          <div className="mb-3 px-1">
            <p className="text-xs text-muted-foreground">מחובר/ת בתור</p>
            <p className="mt-0.5 truncate text-sm font-medium">
              <bdi>{display}</bdi>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await signOutAction();
              })
            }
            className="w-full text-destructive"
          >
            {pending && <Spinner className="h-4 w-4" />}
            {pending ? "מתנתק/ת…" : "התנתקות"}
          </Button>
        </div>
      </div>
    </>
  );
}
