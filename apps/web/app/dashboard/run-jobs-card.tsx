"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  runDashboardJobAction,
  type DashboardJobActionResult,
  type DashboardJobId,
} from "./actions";

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
  const [pending, start] = useTransition();
  const [activeJob, setActiveJob] = useState<DashboardJobId | null>(null);
  const [results, setResults] = useState<Partial<Record<DashboardJobId, DashboardJobActionResult>>>({});

  function run(job: DashboardJobId) {
    start(async () => {
      setActiveJob(job);
      try {
        const result = await runDashboardJobAction(job);
        setResults((current) => ({ ...current, [job]: result }));
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
        setActiveJob(null);
      }
    });
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

        <div className="grid gap-3 md:grid-cols-3">
          {JOBS.map((job) => {
            const result = results[job.id];
            const isRunning = pending && activeJob === job.id;

            return (
              <div key={job.id} className="rounded-md border p-4">
                <div className="space-y-1">
                  <h3 className="font-medium">{job.title}</h3>
                  <p className="text-sm text-muted-foreground">{job.description}</p>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button onClick={() => run(job.id)} disabled={pending}>
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
