"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function FeedbackButtons({
  listingId,
  initial,
}: {
  listingId: number;
  initial: number | null;
}) {
  const [current, setCurrent] = useState<number | null>(initial);
  const [pending, start] = useTransition();

  function submit(rating: 1 | -1) {
    start(async () => {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, rating }),
      });
      if (res.ok) setCurrent(rating);
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        variant={current === 1 ? "default" : "outline"}
        size="sm"
        disabled={pending}
        onClick={() => submit(1)}
      >
        👍 Good match
      </Button>
      <Button
        variant={current === -1 ? "destructive" : "outline"}
        size="sm"
        disabled={pending}
        onClick={() => submit(-1)}
      >
        👎 Not for me
      </Button>
    </div>
  );
}
