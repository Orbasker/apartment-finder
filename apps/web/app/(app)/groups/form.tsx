"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { addGroupAction, removeGroupAction, toggleGroupAction } from "./actions";

type Row = { url: string; label: string | null; enabled: boolean };
type RowAction = { url: string; kind: "toggle" | "remove" };

export function GroupsForm({ initial }: { initial: Row[] }) {
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
        setRows([...rows, { url: url.trim(), label: label.trim() || null, enabled: true }]);
        setUrl("");
        setLabel("");
      } finally {
        setAddingPending(false);
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

  function toggle(groupUrl: string, next: boolean) {
    setRowAction({ url: groupUrl, kind: "toggle" });
    start(async () => {
      try {
        await toggleGroupAction(groupUrl, next);
        setRows(rows.map((r) => (r.url === groupUrl ? { ...r, enabled: next } : r)));
      } finally {
        setRowAction(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Group URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={add} disabled={pending}>
          {addingPending && <Spinner className="mr-2" />}
          {addingPending ? "Adding…" : "Add"}
        </Button>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => {
          const toggling = rowAction?.url === r.url && rowAction.kind === "toggle";
          const removing = rowAction?.url === r.url && rowAction.kind === "remove";
          return (
            <li key={r.url} className="flex items-center gap-3 rounded-md border p-3">
              {toggling ? (
                <Spinner className="h-4 w-4 text-muted-foreground" />
              ) : (
                <input
                  type="checkbox"
                  checked={r.enabled}
                  disabled={pending}
                  onChange={(e) => toggle(r.url, e.target.checked)}
                />
              )}
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">{r.label ?? r.url}</div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs text-muted-foreground underline"
                >
                  {r.url}
                </a>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(r.url)}
                disabled={pending}
              >
                {removing && <Spinner className="mr-2 h-3 w-3" />}
                {removing ? "Removing…" : "Remove"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { Label };
