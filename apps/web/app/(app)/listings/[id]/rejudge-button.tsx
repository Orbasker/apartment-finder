"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { rejudgeListingAction, type RejudgeResult } from "./rejudge-action";

export function RejudgeButton({ listingId }: { listingId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RejudgeResult | null>(null);

  function run() {
    start(async () => {
      try {
        const res = await rejudgeListingAction(listingId);
        setResult(res);
        if (res.ok) router.refresh();
      } catch (err) {
        setResult({
          ok: false,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={run}>
        {pending && <Spinner className="mr-2 h-3 w-3" />}
        {pending ? "Judging…" : "Rejudge"}
      </Button>
      {result && (
        <p className={`text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {result.ok
            ? `Scored ${result.score} · ${result.decision}${result.escalated ? " (escalated)" : ""}`
            : result.error}
        </p>
      )}
    </div>
  );
}
