"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type DashboardJobId = "yad2" | "apify" | "adminCostSummary" | "aiTopPicks";

type DashboardJobActionResult = {
  job: DashboardJobId;
  ok: boolean;
  status: number;
  summary: string;
  payload: Record<string, unknown>;
};

const JOBS: Array<{
  id: DashboardJobId;
  title: string;
  description: string;
}> = [
  {
    id: "yad2",
    title: "Poll Yad2",
    description: "Fetch and process Yad2 listings immediately.",
  },
  {
    id: "apify",
    title: "Start Apify scan",
    description: "Kick off a Facebook groups run now, outside the normal schedule.",
  },
  {
    id: "adminCostSummary",
    title: "Send admin cost email",
    description: "Email the last 24h AI cost summary to ADMIN_SUMMARY_EMAILS.",
  },
  {
    id: "aiTopPicks",
    title: "AI top picks",
    description: "Rank recent listings with AI and send the top 5 by email and Telegram.",
  },
];

export function RunJobsCard() {
  const router = useRouter();
  const [running, setRunning] = useState<Set<DashboardJobId>>(new Set());
  const [results, setResults] = useState<
    Partial<Record<DashboardJobId, DashboardJobActionResult>>
  >({});

  async function run(job: DashboardJobId) {
    if (running.has(job)) return;
    setRunning((prev) => new Set(prev).add(job));
    try {
      const response = await fetch("/api/dashboard/run-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job }),
      });
      if (!response.ok) {
        throw new Error(`Job failed (HTTP ${response.status})`);
      }
      const result = (await response.json()) as DashboardJobActionResult;
      setResults((current) => ({ ...current, [job]: result }));
      if (result.ok) router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Job failed";
      setResults((current) => ({
        ...current,
        [job]: {
          job,
          ok: false,
          status: 500,
          summary: message,
          payload: { ok: false, error: message },
        },
      }));
    } finally {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(job);
        return next;
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run Jobs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Manual runs use the same server-side job code as cron. Yad2 and Apify bypass the
          normal schedule window when started here.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {JOBS.map((job) => {
            const result = results[job.id];
            const isRunning = running.has(job.id);

            return (
              <div key={job.id} className="rounded-md border p-4">
                <div className="space-y-1">
                  <h3 className="font-medium">{job.title}</h3>
                  <p className="text-sm text-muted-foreground">{job.description}</p>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button onClick={() => run(job.id)} disabled={isRunning}>
                    {isRunning && <Spinner className="mr-2" />}
                    {isRunning ? "Running…" : "Run now"}
                  </Button>
                </div>
                {result && (
                  <div className="mt-3 space-y-1">
                    <p
                      className={`text-sm ${result.ok ? "text-foreground" : "text-destructive"}`}
                    >
                      {result.summary}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      HTTP {result.status}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
