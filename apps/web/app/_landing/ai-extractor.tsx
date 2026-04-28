"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

const RAW_LISTING = `דירת 3 חדרים מהממת ברוטשילד, קומה 4 עם מעלית, 78 מ״ר, מרפסת שמש, ממוזגת, ריהוט מלא. כניסה מיידית. 7,800 ש״ח כולל ועד וארנונה. ללא תיווך.`;

type Extracted = {
  rooms: string;
  area: string;
  price: string;
  street: string;
  features: string[];
  noBroker: boolean;
};

const EXTRACTED: Extracted = {
  rooms: "3",
  area: "78 מ״ר",
  price: "₪7,800",
  street: "רוטשילד",
  features: ["מעלית", "מרפסת שמש", "מזגן", "מרוהטת"],
  noBroker: true,
};

export function AiExtractor() {
  const [stage, setStage] = useState<"idle" | "thinking" | "done">("idle");

  useEffect(() => {
    const a = setTimeout(() => setStage("thinking"), 600);
    const b = setTimeout(() => setStage("done"), 2400);
    const c = setTimeout(() => setStage("idle"), 7000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(c);
    };
  }, []);

  useEffect(() => {
    if (stage !== "idle") return;
    const t = setTimeout(() => setStage("thinking"), 400);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage !== "thinking") return;
    const t = setTimeout(() => setStage("done"), 1800);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage !== "done") return;
    const t = setTimeout(() => setStage("idle"), 4500);
    return () => clearTimeout(t);
  }, [stage]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <Header tone="muted">פוסט גולמי</Header>
        <p className="mt-3 text-sm leading-relaxed text-foreground/90">{RAW_LISTING}</p>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
          נסרק ממקור
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <Header tone="brain">
          <span className="inline-flex items-center gap-1.5">
            {stage === "thinking" ? (
              <>
                <Spinner className="h-3.5 w-3.5" /> מחלץ נתונים…
              </>
            ) : (
              <>
                <span
                  className="inline-flex h-1.5 w-1.5 rounded-full bg-accent"
                  aria-hidden="true"
                />
                מחלץ AI
              </>
            )}
          </span>
        </Header>
        <dl
          className={`mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm transition-opacity duration-500 ${
            stage === "done" ? "opacity-100" : "opacity-30 blur-[1px]"
          }`}
        >
          <Field
            label="חדרים"
            value={<bdi>{EXTRACTED.rooms}</bdi>}
            delay={0}
            active={stage === "done"}
          />
          <Field
            label="שטח"
            value={<bdi>{EXTRACTED.area}</bdi>}
            delay={80}
            active={stage === "done"}
          />
          <Field label="רחוב" value={EXTRACTED.street} delay={160} active={stage === "done"} />
          <Field
            label="מחיר"
            value={<bdi>{EXTRACTED.price}</bdi>}
            delay={240}
            active={stage === "done"}
          />
        </dl>
        <div
          className={`mt-3 flex flex-wrap gap-1.5 transition-opacity duration-500 ${
            stage === "done" ? "opacity-100" : "opacity-30 blur-[1px]"
          }`}
        >
          {EXTRACTED.features.map((f, i) => (
            <Tag key={f} delay={320 + i * 60} active={stage === "done"}>
              {f}
            </Tag>
          ))}
          {EXTRACTED.noBroker && (
            <Tag tone="success" delay={520} active={stage === "done"}>
              ללא תיווך
            </Tag>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ children, tone }: { children: React.ReactNode; tone: "muted" | "brain" }) {
  const c = tone === "brain" ? "text-accent" : "text-muted-foreground";
  return <div className={`text-xs font-semibold ${c}`}>{children}</div>;
}

function Field({
  label,
  value,
  delay,
  active,
}: {
  label: string;
  value: React.ReactNode;
  delay: number;
  active: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1 transition-all"
      style={{ transitionDelay: active ? `${delay}ms` : "0ms" }}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Tag({
  children,
  delay,
  active,
  tone = "default",
}: {
  children: React.ReactNode;
  delay: number;
  active: boolean;
  tone?: "default" | "success";
}) {
  const c =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : "border-border bg-muted text-foreground/80";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-2xs transition-all ${c} ${
        active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      }`}
      style={{ transitionDelay: active ? `${delay}ms` : "0ms" }}
    >
      {children}
    </span>
  );
}
