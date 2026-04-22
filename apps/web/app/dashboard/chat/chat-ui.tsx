"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChatUI() {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-[50vh] space-y-3 rounded-md border p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {`Try: "what did you find in florentin today?" or "email me a summary after every run"`}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              {m.role === "user" ? "You" : "Agent"}
            </div>
            <div className="whitespace-pre-wrap text-sm">
              {m.parts.map((p, i) => {
                if (p.type === "text") return <span key={i}>{p.text}</span>;
                if (p.type.startsWith("tool-")) {
                  return (
                    <div
                      key={i}
                      className="my-1 rounded bg-muted p-2 font-mono text-xs text-muted-foreground"
                    >
                      → {p.type.replace(/^tool-/, "")}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {error && (
          <div className="text-xs text-destructive">
            Error: {error.message}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything…"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
