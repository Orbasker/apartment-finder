"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function FeedbackButtons({
  listingId,
  initial,
}: {
  listingId: number;
  initial: number | null;
}) {
  const [current, setCurrent] = useState<number | null>(initial);
  const [pendingRating, setPendingRating] = useState<1 | -1 | null>(null);
  const [pending, start] = useTransition();

  function submit(rating: 1 | -1) {
    start(async () => {
      setPendingRating(rating);
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ listingId, rating }),
        });
        if (res.ok) setCurrent(rating);
      } finally {
        setPendingRating(null);
      }
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
        {pendingRating === 1 ? (
          <Spinner className="mr-2 h-3 w-3" />
        ) : (
          <span className="mr-1">👍</span>
        )}
        Good match
      </Button>
      <Button
        variant={current === -1 ? "destructive" : "outline"}
        size="sm"
        disabled={pending}
        onClick={() => submit(-1)}
      >
        {pendingRating === -1 ? (
          <Spinner className="mr-2 h-3 w-3" />
        ) : (
          <span className="mr-1">👎</span>
        )}
        Not for me
      </Button>
    </div>
  );
}
