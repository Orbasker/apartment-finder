"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGroupAction, removeGroupAction, toggleGroupAction } from "./actions";

type Row = { url: string; label: string | null; enabled: boolean };

export function GroupsForm({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!url.trim()) return;
    start(async () => {
      await addGroupAction({ url: url.trim(), label: label.trim() || null });
      setRows([...rows, { url: url.trim(), label: label.trim() || null, enabled: true }]);
      setUrl("");
      setLabel("");
    });
  }

  function remove(groupUrl: string) {
    start(async () => {
      await removeGroupAction(groupUrl);
      setRows(rows.filter((r) => r.url !== groupUrl));
    });
  }

  function toggle(groupUrl: string, next: boolean) {
    start(async () => {
      await toggleGroupAction(groupUrl, next);
      setRows(rows.map((r) => (r.url === groupUrl ? { ...r, enabled: next } : r)));
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Group URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={add} disabled={pending}>Add</Button>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.url} className="flex items-center gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) => toggle(r.url, e.target.checked)}
            />
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
            <Button variant="ghost" size="sm" onClick={() => remove(r.url)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { Label };
