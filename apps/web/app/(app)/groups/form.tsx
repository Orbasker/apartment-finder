"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  addGroupAction,
  removeGroupAction,
  toggleGroupCatalogAction,
  toggleSubscriptionAction,
} from "./actions";

type Row = {
  url: string;
  label: string | null;
  enabled: boolean;
  subscribed: boolean;
};
type RowAction = {
  url: string;
  kind: "subscribe" | "catalog" | "remove";
};

export function GroupsForm({ initial, isAdmin }: { initial: Row[]; isAdmin: boolean }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  const [addingPending, setAddingPending] = useState(false);
  const [rowAction, setRowAction] = useState<RowAction | null>(null);

  function add() {
    if (!url.trim()) return;
    setAddingPending(true);
    start(async () => {
      try {
        await addGroupAction({ url: url.trim(), label: label.trim() || null });
        setRows([
          ...rows,
          { url: url.trim(), label: label.trim() || null, enabled: true, subscribed: true },
        ]);
        setUrl("");
        setLabel("");
      } finally {
        setAddingPending(false);
      }
    });
  }

  function toggleSubscribed(groupUrl: string, next: boolean) {
    setRowAction({ url: groupUrl, kind: "subscribe" });
    start(async () => {
      try {
        await toggleSubscriptionAction(groupUrl, next);
        setRows(rows.map((r) => (r.url === groupUrl ? { ...r, subscribed: next } : r)));
      } finally {
        setRowAction(null);
      }
    });
  }

  function toggleCatalog(groupUrl: string, next: boolean) {
    setRowAction({ url: groupUrl, kind: "catalog" });
    start(async () => {
      try {
        await toggleGroupCatalogAction(groupUrl, next);
        setRows(rows.map((r) => (r.url === groupUrl ? { ...r, enabled: next } : r)));
      } finally {
        setRowAction(null);
      }
    });
  }

  function remove(groupUrl: string) {
    setRowAction({ url: groupUrl, kind: "remove" });
    start(async () => {
      try {
        await removeGroupAction(groupUrl);
        setRows(rows.filter((r) => r.url !== groupUrl));
      } finally {
        setRowAction(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Group URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button
          onClick={add}
          disabled={pending}
          className="w-full sm:col-span-2 sm:w-auto md:col-span-1"
        >
          {addingPending && <Spinner className="mr-2" />}
          {addingPending ? "Adding…" : "Add"}
        </Button>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => {
          const actingOn = rowAction?.url === r.url ? rowAction : null;
          return (
            <li
              key={r.url}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-3"
            >
              {actingOn?.kind === "subscribe" ? (
                <Spinner className="h-4 w-4 text-muted-foreground" />
              ) : (
                <input
                  type="checkbox"
                  title="Subscribe to alerts from this group"
                  checked={r.subscribed}
                  disabled={pending || !r.enabled}
                  onChange={(e) => toggleSubscribed(r.url, e.target.checked)}
                />
              )}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.label ?? r.url}</span>
                  {!r.enabled && <Badge variant="muted">disabled</Badge>}
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs text-muted-foreground underline"
                >
                  {r.url}
                </a>
              </div>
              {isAdmin && (
                <>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    {actingOn?.kind === "catalog" ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <input
                        type="checkbox"
                        title="Catalog enabled"
                        checked={r.enabled}
                        disabled={pending}
                        onChange={(e) => toggleCatalog(r.url, e.target.checked)}
                      />
                    )}
                    enabled
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(r.url)}
                    disabled={pending}
                  >
                    {actingOn?.kind === "remove" && <Spinner className="mr-2 h-3 w-3" />}
                    {actingOn?.kind === "remove" ? "Removing…" : "Remove"}
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { Label };
