"use client";

import { useEffect, useRef } from "react";
import { createAuthClient } from "better-auth/react";
import { oneTapClient } from "better-auth/client/plugins";

export function GoogleOneTap({
  clientId,
  redirectTo = "/matches",
}: {
  clientId: string;
  redirectTo?: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!clientId) return;
    fired.current = true;

    const client = createAuthClient({
      plugins: [
        oneTapClient({
          clientId,
          autoSelect: false,
          cancelOnTapOutside: true,
          context: "signin",
        }),
      ],
    });

    void client
      .oneTap({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = redirectTo;
          },
        },
      })
      .catch((err: unknown) => {
        console.log("[google-one-tap] dismissed or unavailable", err);
      });
  }, [clientId, redirectTo]);

  return null;
}
