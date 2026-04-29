"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { signOutAction } from "./profile-actions";

export function UserMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = email ? email.trim().charAt(0).toUpperCase() : "?";
  const display = email ?? "מנותק/ת";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border bg-background px-1.5 py-1 pe-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
        >
          {initial}
        </span>
        <span className="max-w-[10rem] truncate text-foreground">{display}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5 text-muted-foreground"
          fill="currentColor"
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-50 mt-2 w-64 overflow-hidden rounded-md border bg-background shadow-md"
        >
          <div className="border-b px-3 py-3">
            <p className="text-xs text-muted-foreground">מחובר/ת בתור</p>
            <p className="mt-0.5 truncate text-sm font-medium">
              <bdi>{display}</bdi>
            </p>
          </div>
          <div className="py-1">
            <Link
              href="/notifications"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-foreground hover:bg-muted"
            >
              <BellIcon className="h-4 w-4" />
              יעדי התראות
            </Link>
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await signOutAction();
                })
              }
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-destructive hover:bg-muted disabled:opacity-50"
            >
              {pending ? <Spinner className="h-4 w-4" /> : <LogoutIcon className="h-4 w-4" />}
              {pending ? "מתנתק/ת…" : "התנתקות"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
