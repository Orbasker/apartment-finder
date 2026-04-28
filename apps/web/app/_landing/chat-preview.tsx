"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

type Msg = { role: "assistant" | "user"; text: string };

const SCRIPT: Msg[] = [
  {
    role: "assistant",
    text: "שלום! בכמה שאלות נכין לך התראות מדויקות. נתחיל מהתקציב — מה הסכום המקסימלי לחודש?",
  },
  { role: "user", text: "עד 8,000 ש״ח" },
  { role: "assistant", text: "מצוין. כמה חדרים? אפשר לציין טווח." },
  { role: "user", text: "2.5–3.5" },
  { role: "assistant", text: "אילו שכונות? אפשר לכתוב כמה." },
  { role: "user", text: "פלורנטין, נווה צדק, רוטשילד" },
  { role: "assistant", text: "מעולה. יש משהו שחובה שיהיה? (מעלית, מרפסת, חניה…)" },
  { role: "user", text: "מעלית או קומה נמוכה, מרפסת" },
  { role: "assistant", text: "✓ סיימנו. הגדרתי לך התראות. אעדכן ברגע שיש דירה מתאימה." },
];

export function ChatPreview() {
  const [shown, setShown] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let i = 0;
    let cancelled = false;

    function next() {
      if (cancelled || i >= SCRIPT.length) return;
      const m = SCRIPT[i];
      if (!m) return;
      const delay = m.role === "assistant" ? 700 : 500;
      setTyping(m.role === "assistant");
      setTimeout(() => {
        if (cancelled) return;
        setShown((prev) => [...prev, m]);
        setTyping(false);
        i += 1;
        const gap = m.role === "user" ? 600 : 1100;
        setTimeout(next, gap);
      }, delay);
    }

    const start = setTimeout(next, 400);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, []);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [shown, typing]);

  return (
    <div className="flex h-[420px] flex-col overflow-hidden rounded-lg border bg-card shadow-sm sm:h-[460px]">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="text-xs font-medium text-muted-foreground">צ׳אט אונבורדינג</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">demo</span>
      </div>
      <div ref={ref} className="flex-1 space-y-2.5 overflow-y-auto p-3 sm:p-4">
        {shown.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.text}
          </Bubble>
        ))}
        {typing && (
          <Bubble role="assistant">
            <Spinner className="h-3.5 w-3.5" />
          </Bubble>
        )}
      </div>
      <div className="border-t p-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
          <span className="opacity-60">כתוב/י תשובה…</span>
          <span className="ms-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px]">Enter</span>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "assistant" | "user"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[75%] ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
