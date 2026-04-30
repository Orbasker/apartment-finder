"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { triggerCollector } from "./actions";

type Run = {
  id: number;
  runId: string;
  source: string;
  status: string;
  enqueuedAt: string;
  collectedAt: string | null;
  webhookReceivedAt: string | null;
  receivedCount: number;
  inserted: number;
  skippedExisting: number;
  error: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  queued: "text-yellow-600",
  collecting: "text-blue-600",
  collected: "text-blue-800",
  ingesting: "text-purple-600",
  done: "text-green-600",
  completed: "text-green-600",
  failed: "text-red-600",
};

export default function CollectorsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/collection-runs");
      if (res.ok) setRuns(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchRuns();
    intervalRef.current = setInterval(fetchRuns, 3000);
    return () => clearInterval(intervalRef.current!);
  }, [fetchRuns]);

  function trigger(source: "yad2" | "facebook") {
    setError(null);
    startTransition(async () => {
      try {
        await triggerCollector(source);
        await fetchRuns();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Collectors — Admin</h1>

      <div className="flex gap-3">
        <button
          onClick={() => trigger("yad2")}
          disabled={isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "..." : "▶ Trigger Yad2"}
        </button>
        <button
          onClick={() => trigger("facebook")}
          disabled={isPending}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? "..." : "▶ Trigger Facebook"}
        </button>
        <button
          onClick={fetchRuns}
          className="rounded border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-x-auto rounded border text-sm">
        <table className="w-full">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              {["Source", "Status", "Enqueued", "Received", "Inserted", "Skipped", "Error"].map(
                (h) => (
                  <th key={h} className="px-3 py-2 text-start font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No runs yet
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{r.source}</td>
                <td className={`px-3 py-2 font-semibold ${STATUS_COLOR[r.status] ?? ""}`}>
                  {r.status}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(r.enqueuedAt).toLocaleTimeString()}
                </td>
                <td className="px-3 py-2">{r.receivedCount}</td>
                <td className="px-3 py-2">{r.inserted}</td>
                <td className="px-3 py-2">{r.skippedExisting}</td>
                <td className="px-3 py-2 max-w-xs truncate text-red-600">{r.error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Auto-refreshes every 3s</p>
    </div>
  );
}
