"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  connectTelegramAction,
  disconnectTelegramAction,
  saveNotificationsAction,
} from "./actions";

type Props = {
  email: string | null;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  telegramLinked: boolean;
  telegramConfigured: boolean;
};

export function NotificationsForm(props: Props) {
  const [emailOn, setEmailOn] = useState(props.emailEnabled);
  const [telegramOn, setTelegramOn] = useState(props.telegramEnabled);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [pendingSave, startSave] = useTransition();
  const [pendingConnect, startConnect] = useTransition();
  const [pendingDisconnect, startDisconnect] = useTransition();

  const noChannel = !emailOn && !telegramOn;
  const telegramOnButUnlinked = telegramOn && !props.telegramLinked;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (noChannel) {
      setError("צריך להפעיל לפחות ערוץ אחד.");
      return;
    }
    if (telegramOnButUnlinked) {
      setError("הפעלת Telegram אבל החשבון עוד לא מחובר. לחצי על 'התחבר ל־Telegram' קודם.");
      return;
    }
    startSave(async () => {
      const fd = new FormData();
      if (emailOn) fd.set("email", "on");
      if (telegramOn) fd.set("telegram", "on");
      const result = await saveNotificationsAction(fd);
      if (!result.ok) {
        if (result.error === "no_channel") setError("צריך להפעיל לפחות ערוץ אחד.");
        else if (result.error === "telegram_not_linked")
          setError("Telegram עוד לא מחובר. לחצי על 'התחבר ל־Telegram' קודם.");
        else setError("שמירה נכשלה.");
        return;
      }
      setSuccess(true);
    });
  }

  function handleConnect() {
    setError(null);
    setConnectUrl(null);
    startConnect(async () => {
      const result = await connectTelegramAction();
      if (!result.ok) {
        setError("Telegram לא מוגדר במערכת כרגע.");
        return;
      }
      // Render the URL as an <a target="_blank"> so the actual navigation is a
      // direct user click. window.open() after `await` loses the click's user
      // activation and gets blocked by Safari/Firefox/Chrome popup blockers.
      setConnectUrl(result.url);
    });
  }

  function handleDisconnect() {
    setError(null);
    startDisconnect(async () => {
      try {
        await disconnectTelegramAction();
        setTelegramOn(false);
      } catch {
        setError("אי אפשר לנתק את Telegram כי זה הערוץ היחיד שמופעל. הפעילי קודם מייל.");
      }
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">מייל</CardTitle>
        </CardHeader>
        <CardContent>
          <Toggle
            checked={emailOn}
            onChange={setEmailOn}
            label="קבלת התראות במייל"
            description={props.email ? <bdi>{props.email}</bdi> : "אין מייל מחובר"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            checked={telegramOn}
            onChange={setTelegramOn}
            label="קבלת התראות ב־Telegram"
            description={
              props.telegramLinked ? "החשבון מחובר" : "צריך לחבר את החשבון לפני שזה יעבוד"
            }
          />
          {!props.telegramConfigured ? (
            <p className="text-xs text-muted-foreground">Telegram לא מוגדר במערכת כרגע.</p>
          ) : props.telegramLinked ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleDisconnect}
              loading={pendingDisconnect}
              className="h-11 w-full sm:w-auto"
            >
              {pendingDisconnect ? "מנתק…" : "נתק את Telegram"}
            </Button>
          ) : connectUrl ? (
            <a
              href={connectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 sm:w-auto"
            >
              פתח את Telegram להשלמת החיבור
            </a>
          ) : (
            <Button
              type="button"
              onClick={handleConnect}
              loading={pendingConnect}
              className="h-11 w-full sm:w-auto"
            >
              {pendingConnect ? "מכין קישור…" : "התחבר ל־Telegram"}
            </Button>
          )}
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-success">
          נשמר בהצלחה.
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:pt-2">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-1 sm:px-0">
          <Button
            type="submit"
            loading={pendingSave}
            disabled={noChannel || telegramOnButUnlinked}
            className="h-11 flex-1 text-base sm:flex-initial"
          >
            {pendingSave ? "שומר…" : "שמירה"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 cursor-pointer rounded border-muted-foreground/40 accent-primary"
      />
      <div className="flex-1 space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
      </div>
    </label>
  );
}
