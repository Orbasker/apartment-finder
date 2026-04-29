"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { pickCityAction } from "./city-pick.action";
import { pickNeighborhoodAction } from "./neighborhood-pick.action";

type NeighborhoodCandidate = {
  placeId: string;
  nameHe: string;
  cityPlaceId: string;
  cityNameHe: string;
};
type CityCandidate = { placeId: string; nameHe: string };
type ChipKind = "allowed" | "blocked";

const FIRST_PROMPT =
  "שלום! בכמה שאלות נכין לך התראות מדויקות לדירות. נתחיל - באיזו עיר את/ה מחפש/ת דירה?";

export function OnboardingChat({ alreadyOnboarded }: { alreadyOnboarded: boolean }) {
  const [input, setInput] = useState("");
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [pickedCityIds, setPickedCityIds] = useState<Set<string>>(new Set());
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat/onboarding" }),
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const onPickNeighborhood = useCallback(
    async (candidate: NeighborhoodCandidate, kind: ChipKind) => {
      if (pickedIds.has(candidate.placeId)) return;
      setPickedIds((prev) => new Set(prev).add(candidate.placeId));
      const result = await pickNeighborhoodAction(candidate, kind);
      if (!result.ok) {
        setPickedIds((prev) => {
          const next = new Set(prev);
          next.delete(candidate.placeId);
          return next;
        });
        return;
      }
      const verb = kind === "allowed" ? "בחרתי" : "לחסום";
      sendMessage({ text: `${verb} ${candidate.nameHe} (${candidate.cityNameHe})` });
    },
    [pickedIds, sendMessage],
  );

  const onPickCity = useCallback(
    async (city: CityCandidate) => {
      if (pickedCityIds.has(city.placeId)) return;
      setPickedCityIds((prev) => new Set(prev).add(city.placeId));
      const result = await pickCityAction(city);
      if (!result.ok) {
        setPickedCityIds((prev) => {
          const next = new Set(prev);
          next.delete(city.placeId);
          return next;
        });
        return;
      }
      sendMessage({
        text: `נבחרה העיר ${city.nameHe} (place_id: ${city.placeId}). העבר/י לחיפוש שכונות בעיר זו.`,
      });
    },
    [pickedCityIds, sendMessage],
  );

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
                כבר השלמת אונבורדינג בעבר - אפשר להמשיך מכאן ולעדכן, או לערוך ישירות ב־
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
                const result = readToolResult(part);
                if (toolName === "searchCity" && result) {
                  const candidates = readCityCandidates(result);
                  if (candidates.length > 0) {
                    return (
                      <CityChips
                        key={idx}
                        candidates={candidates}
                        pickedIds={pickedCityIds}
                        onPick={onPickCity}
                      />
                    );
                  }
                }
                if (toolName === "searchNeighborhoods" && result) {
                  const candidates = readNeighborhoodCandidates(result);
                  const kind: ChipKind = result.kind === "blocked" ? "blocked" : "allowed";
                  if (candidates.length > 0) {
                    return (
                      <NeighborhoodChips
                        key={idx}
                        candidates={candidates}
                        kind={kind}
                        pickedIds={pickedIds}
                        onPick={onPickNeighborhood}
                      />
                    );
                  }
                }
                if (toolName === "setNotificationDestinations" && result) {
                  const url =
                    typeof result.telegramConnectUrl === "string"
                      ? result.telegramConnectUrl
                      : null;
                  if (url) return <TelegramConnect key={idx} url={url} />;
                }
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

function readToolResult(part: unknown): Record<string, unknown> | null {
  // AI SDK v5 surfaces the tool result on the part as either `output` or
  // `result` depending on the streaming version. Probe both.
  if (!part || typeof part !== "object") return null;
  const p = part as { state?: string; output?: unknown; result?: unknown };
  if (p.state && p.state !== "output-available") return null;
  const value = p.output ?? p.result;
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readNeighborhoodCandidates(result: Record<string, unknown>): NeighborhoodCandidate[] {
  const raw = result.candidates;
  if (!Array.isArray(raw)) return [];
  const out: NeighborhoodCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (
      typeof c.placeId === "string" &&
      typeof c.nameHe === "string" &&
      typeof c.cityPlaceId === "string" &&
      typeof c.cityNameHe === "string"
    ) {
      out.push({
        placeId: c.placeId,
        nameHe: c.nameHe,
        cityPlaceId: c.cityPlaceId,
        cityNameHe: c.cityNameHe,
      });
    }
  }
  return out;
}

function readCityCandidates(result: Record<string, unknown>): CityCandidate[] {
  const raw = result.candidates;
  if (!Array.isArray(raw)) return [];
  const out: CityCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.placeId === "string" && typeof c.nameHe === "string") {
      out.push({ placeId: c.placeId, nameHe: c.nameHe });
    }
  }
  return out;
}

function NeighborhoodChips({
  candidates,
  kind,
  pickedIds,
  onPick,
}: {
  candidates: NeighborhoodCandidate[];
  kind: ChipKind;
  pickedIds: Set<string>;
  onPick: (candidate: NeighborhoodCandidate, kind: ChipKind) => void;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="שכונות לבחירה">
      {candidates.map((c) => {
        const picked = pickedIds.has(c.placeId);
        return (
          <li key={c.placeId}>
            <button
              type="button"
              onClick={() => onPick(c, kind)}
              disabled={picked}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition disabled:cursor-default ${
                picked
                  ? "border-success bg-success/10 text-foreground"
                  : "bg-background text-foreground hover:bg-accent"
              }`}
              aria-pressed={picked}
            >
              <span className="font-medium">{c.nameHe}</span>
              <span className="text-muted-foreground">· {c.cityNameHe}</span>
              <span aria-hidden="true">{picked ? "✓" : "+"}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TelegramConnect({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-4 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
        <path d="M22 3 2.5 10.5l5.7 1.9 2.2 7.1 3.7-3.4 5.4 4 2.5-17.1ZM9.4 13.7l8.5-5.4-6.7 6.4-.3 3.6-1.5-4.6Z" />
      </svg>
      התחבר ל־Telegram
    </a>
  );
}

function CityChips({
  candidates,
  pickedIds,
  onPick,
}: {
  candidates: CityCandidate[];
  pickedIds: Set<string>;
  onPick: (city: CityCandidate) => void;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="ערים לבחירה">
      {candidates.map((c) => {
        const picked = pickedIds.has(c.placeId);
        return (
          <li key={c.placeId}>
            <button
              type="button"
              onClick={() => onPick(c)}
              disabled={picked}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition disabled:cursor-default ${
                picked
                  ? "border-success bg-success/10 text-foreground"
                  : "bg-background text-foreground hover:bg-accent"
              }`}
              aria-pressed={picked}
            >
              <span className="font-medium">{c.nameHe}</span>
              <span aria-hidden="true">{picked ? "✓" : "+"}</span>
            </button>
          </li>
        );
      })}
    </ul>
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
