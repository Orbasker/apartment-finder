"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";

const FIRST_PROMPT =
  "שלום! בכמה שאלות נכין לך התראות מדויקות לדירות בתל אביב. נתחיל מהתקציב — מה הסכום המקסימלי שתסכים/י לשלם בחודש?";

export function OnboardingChat({ alreadyOnboarded }: { alreadyOnboarded: boolean }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat/onboarding" }),
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";
  const completed = messages.some((m) =>
    m.parts.some(
      (p) =>
        p.type?.startsWith("tool-completeOnboarding") &&
        // narrow to a "result" part with ok=true
        ((p as unknown as { state?: string }).state === "output-available" ||
          (p as unknown as { result?: { ok?: boolean } }).result?.ok === true),
    ),
  );

  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col rounded-lg border bg-card">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="שיחת אונבורדינג"
        className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4"
      >
        {messages.length === 0 && (
          <Bubble role="assistant">
            <p>{FIRST_PROMPT}</p>
            {alreadyOnboarded && (
              <p className="mt-2 text-xs text-muted-foreground">
                כבר השלמת אונבורדינג בעבר — אפשר להמשיך מכאן ולעדכן, או לערוך ישירות ב־
                <Link href="/filters" className="underline">
                  /filters
                </Link>
                .
              </p>
            )}
          </Bubble>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role}>
            {m.parts.map((part, idx) => {
              if (part.type === "text") {
                return (
                  <span key={idx} className="whitespace-pre-wrap">
                    {part.text}
                  </span>
                );
              }
              if (part.type?.startsWith("tool-")) {
                const toolName = part.type.slice("tool-".length);
                return (
                  <span
                    key={idx}
                    className="block text-xs text-muted-foreground"
                    aria-label={`tool ${toolName}`}
                  >
                    ✓ <bdi>{toolName}</bdi>
                  </span>
                );
              }
              return null;
            })}
          </Bubble>
        ))}
        {busy && (
          <Bubble role="assistant">
            <Spinner className="h-4 w-4" />
          </Bubble>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        {completed && (
          <div
            role="status"
            className="rounded-md border border-success/30 bg-success/10 p-3 text-sm"
          >
            🎉 סיימנו! ההתראות פעילות. אפשר לערוך בכל רגע ב־
            <Link href="/filters" className="underline">
              /filters
            </Link>
            .
          </div>
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t p-2 sm:p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="כתוב/י תשובה…"
          disabled={busy}
          className="h-11 text-base"
          enterKeyHint="send"
        />
        <Button type="submit" disabled={busy || !input.trim()} className="h-11 shrink-0 px-4">
          שלח
        </Button>
      </form>
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "assistant" | "user" | "system" | "data" | string;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  // In RTL, justify-start = right edge (user/outgoing); justify-end = left edge (assistant/incoming).
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
