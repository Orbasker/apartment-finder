"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  createTelegramLinkAction,
  unlinkTelegramAction,
  type LinkStatus,
} from "./telegram-actions";

export function TelegramSection({ initial }: { initial: LinkStatus }) {
  const [status, setStatus] = useState<LinkStatus>(initial);
  const [pending, start] = useTransition();
  const [linkInfo, setLinkInfo] = useState<{
    deepLink: string | null;
    token: string;
    botUsername: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    start(async () => {
      setError(null);
      const result = await createTelegramLinkAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLinkInfo({
        deepLink: result.deepLink,
        token: result.token,
        botUsername: result.botUsername,
      });
    });
  }

  function unlink() {
    start(async () => {
      setError(null);
      await unlinkTelegramAction();
      setStatus({ linked: false });
      setLinkInfo(null);
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="font-medium">Telegram</h3>
        <p className="text-sm text-muted-foreground">
          Link Telegram to ask the bot about listings in natural language (&quot;3-room in florentin
          under 7500&quot;). The bot will only respond to linked chats; there&apos;s no broadcast or
          message from it otherwise.
        </p>
      </div>

      {status.linked ? (
        <div className="space-y-2">
          <p className="text-sm">
            ✓ Linked (chat ID <code className="text-xs">{status.chatId}</code>)
          </p>
          <Button type="button" variant="outline" disabled={pending} onClick={unlink}>
            {pending && <Spinner className="mr-2" />}
            Unlink
          </Button>
        </div>
      ) : linkInfo ? (
        <div className="space-y-2 text-sm">
          {linkInfo.deepLink ? (
            <p>
              Open this link on a device with Telegram installed to finish linking:{" "}
              <a
                className="font-medium underline"
                href={linkInfo.deepLink}
                target="_blank"
                rel="noreferrer"
              >
                {linkInfo.deepLink}
              </a>
            </p>
          ) : (
            <p className="text-muted-foreground">
              No bot username configured. Send{" "}
              <code className="text-xs">/start {linkInfo.token}</code> to the bot manually.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            This code expires in 15 minutes and can be used once.
          </p>
        </div>
      ) : (
        <Button type="button" disabled={pending} onClick={generate}>
          {pending && <Spinner className="mr-2" />}
          Generate link
        </Button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
