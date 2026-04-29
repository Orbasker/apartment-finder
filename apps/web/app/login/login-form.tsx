"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="var(--color-brand-google-blue)"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.55-5.17 3.55-8.87Z"
      />
      <path
        fill="var(--color-brand-google-green)"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="var(--color-brand-google-yellow)"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z"
      />
      <path
        fill="var(--color-brand-google-red)"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

type Step = "email" | "otp";

export function LoginForm({
  initialError = null,
  googleEnabled = false,
}: {
  initialError?: string | null;
  googleEnabled?: boolean;
} = {}) {
  const t = useTranslations("Login");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingAction, setPendingAction] = useState<"google" | "send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setPendingAction("send");
    setError(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (error) throw new Error(error.message ?? t("email.errorFallback"));
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingAction(null);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setPendingAction("verify");
    setError(null);
    try {
      const { error } = await authClient.signIn.emailOtp({ email, otp });
      if (error) throw new Error(error.message ?? t("otp.errorFallback"));
      window.location.href = "/matches";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPendingAction(null);
    }
  }

  async function signInWithGoogle() {
    setPendingAction("google");
    setError(null);
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/matches",
      });
      if (error) throw new Error(error.message ?? t("google.errorFallback"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPendingAction(null);
    }
  }

  const busy = pendingAction !== null;

  return (
    <>
      {pendingAction === "google" && (
        <div
          aria-live="polite"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
        >
          <Spinner className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">{t("google.redirecting")}</p>
        </div>
      )}
      <div className="space-y-4">
        {googleEnabled && step === "email" && (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full text-base"
              onClick={signInWithGoogle}
              disabled={busy}
            >
              {pendingAction === "google" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <GoogleIcon className="h-4 w-4" />
              )}
              {t("google.continueWith")}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">{t("divider")}</span>
              </div>
            </div>
          </>
        )}

        {step === "email" && (
          <form onSubmit={sendOtp} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email.label")}</Label>
              <Input
                id="email"
                type="email"
                required
                dir="ltr"
                className="h-11 text-base"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                enterKeyHint="send"
              />
            </div>
            <Button type="submit" disabled={busy || !email} className="h-11 w-full text-base">
              {pendingAction === "send" && <Spinner className="h-4 w-4" />}
              {pendingAction === "send" ? t("email.submitting") : t("email.submit")}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm">
                {t.rich("otp.sent", {
                  email,
                  addr: (chunks) => (
                    <strong className="text-foreground">
                      <bdi>{chunks}</bdi>
                    </strong>
                  ),
                })}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="otp">{t("otp.label")}</Label>
              <Input
                ref={otpRef}
                id="otp"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                required
                dir="ltr"
                maxLength={6}
                className="h-12 text-center text-2xl tracking-[0.5em]"
                value={otp}
                onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                enterKeyHint="done"
              />
            </div>
            <Button
              type="submit"
              disabled={busy || otp.length !== 6}
              className="h-11 w-full text-base"
            >
              {pendingAction === "verify" && <Spinner className="h-4 w-4" />}
              {pendingAction === "verify" ? t("otp.submitting") : t("otp.submit")}
            </Button>
            <button
              type="button"
              className="block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
              }}
              disabled={busy}
            >
              {t("otp.changeOrResend")}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
