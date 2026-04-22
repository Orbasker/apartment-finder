"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import {
  AMENITY_KEYS,
  AMENITY_LABELS,
  type AmenityKey,
  type AmenityPreference,
  type Preferences,
} from "@apartment-finder/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { savePreferencesAction } from "./actions";

const AMENITY_STATES: { value: AmenityPreference; label: string; tone: string }[] = [
  { value: "any", label: "Any", tone: "bg-muted text-muted-foreground" },
  { value: "preferred", label: "Preferred", tone: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  { value: "required", label: "Required", tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  { value: "avoid", label: "Avoid", tone: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200" },
];

export function PreferencesForm({
  initial,
  userEmail,
}: {
  initial: Preferences;
  userEmail: string | null;
}) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<
    { kind: "ok" | "err"; msg: string } | null
  >(null);

  function save() {
    start(async () => {
      setStatus(null);
      try {
        await savePreferencesAction(prefs);
        setStatus({ kind: "ok", msg: "Saved." });
      } catch (err) {
        setStatus({
          kind: "err",
          msg: err instanceof Error ? err.message : "Error",
        });
      }
    });
  }

  const amenitySummary = AMENITY_KEYS.reduce(
    (acc, key) => {
      const state = prefs.amenities[key] ?? "any";
      if (state !== "any") acc[state] += 1;
      return acc;
    },
    { preferred: 0, required: 0, avoid: 0 } as Record<
      Exclude<AmenityPreference, "any">,
      number
    >,
  );

  return (
    <form
      className="space-y-6 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Section
        title="Budget"
        description="We'll only surface listings that fit this range; flexibility lets the AI stretch slightly if a listing is otherwise a strong match."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Min rent"
            suffix="₪ / mo"
            help="Filters out spam and bait listings"
            value={prefs.budget.minNis ?? 0}
            onChange={(v) =>
              setPrefs({ ...prefs, budget: { ...prefs.budget, minNis: v } })
            }
          />
          <NumberField
            label="Max rent"
            suffix="₪ / mo"
            value={prefs.budget.maxNis}
            onChange={(v) =>
              setPrefs({ ...prefs, budget: { ...prefs.budget, maxNis: v } })
            }
          />
          <NumberField
            label="Flexibility"
            suffix="%"
            help="Allow going above max if the match is strong"
            value={prefs.budget.flexibilityPct}
            onChange={(v) =>
              setPrefs({
                ...prefs,
                budget: { ...prefs.budget, flexibilityPct: v },
              })
            }
          />
        </div>
      </Section>

      <Section
        title="Size"
        description="Rooms and square meters. Size filters are optional — leave blank to ignore."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <RangeInputs
            label="Rooms"
            min={prefs.rooms.min}
            max={prefs.rooms.max}
            step={0.5}
            onChange={(min, max) =>
              setPrefs({
                ...prefs,
                rooms: { min: min ?? 0, max: max ?? 0 },
              })
            }
          />
          <RangeInputs
            label="Square meters"
            min={prefs.sizeSqm?.min ?? null}
            max={prefs.sizeSqm?.max ?? null}
            optional
            onChange={(min, max) => {
              const next = { min: min ?? undefined, max: max ?? undefined };
              setPrefs({
                ...prefs,
                sizeSqm:
                  next.min == null && next.max == null ? undefined : next,
              });
            }}
          />
        </div>
      </Section>

      <Section
        title="Freshness"
        description="Only consider listings posted recently."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Max age"
            suffix="hours"
            value={prefs.maxAgeHours}
            onChange={(v) => setPrefs({ ...prefs, maxAgeHours: v })}
          />
        </div>
      </Section>

      <Section
        title="Neighborhoods"
        description="Press enter or comma to add. Leave allowed empty to consider any neighborhood."
      >
        <ChipsInput
          label="Allowed"
          placeholder="e.g. Florentin, Shapira"
          value={prefs.allowedNeighborhoods}
          onChange={(v) => setPrefs({ ...prefs, allowedNeighborhoods: v })}
          tone="positive"
        />
        <ChipsInput
          label="Blocked"
          placeholder="Neighborhoods we should skip"
          value={prefs.blockedNeighborhoods}
          onChange={(v) => setPrefs({ ...prefs, blockedNeighborhoods: v })}
          tone="negative"
        />
      </Section>

      <Section
        title="Requirements"
        description="Free-text signals used by the AI judge when scoring each listing."
      >
        <ChipsInput
          label="Hard requirements"
          placeholder="Must-have conditions (e.g. washer on-site)"
          value={prefs.hardRequirements}
          onChange={(v) => setPrefs({ ...prefs, hardRequirements: v })}
          tone="positive"
        />
        <ChipsInput
          label="Nice-to-haves"
          placeholder="Bonus points if present"
          value={prefs.niceToHaves}
          onChange={(v) => setPrefs({ ...prefs, niceToHaves: v })}
          tone="neutral"
        />
        <ChipsInput
          label="Deal breakers"
          placeholder="Auto-reject if listed"
          value={prefs.dealBreakers}
          onChange={(v) => setPrefs({ ...prefs, dealBreakers: v })}
          tone="negative"
        />
      </Section>

      <Section
        title="Amenities"
        description={
          <>
            Tap a chip to set how the AI should weigh each amenity.{" "}
            <strong>Required</strong> blocks alerts unless the feature is
            present; <strong>Avoid</strong> demotes or skips listings that
            mention it.
          </>
        }
        aside={
          <div className="flex flex-wrap gap-2 text-xs">
            <SummaryPill tone="emerald">
              {amenitySummary.required} required
            </SummaryPill>
            <SummaryPill tone="sky">
              {amenitySummary.preferred} preferred
            </SummaryPill>
            <SummaryPill tone="rose">
              {amenitySummary.avoid} avoid
            </SummaryPill>
          </div>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {AMENITY_KEYS.map((key) => (
            <AmenityRow
              key={key}
              amenityKey={key}
              value={prefs.amenities[key] ?? "any"}
              onChange={(v) =>
                setPrefs({
                  ...prefs,
                  amenities: { ...prefs.amenities, [key]: v },
                })
              }
            />
          ))}
        </div>
      </Section>

      <Section
        title="AI scoring"
        description="Minimum AI score required before a listing triggers an alert."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Score threshold"
            suffix="/ 100"
            value={prefs.ai.scoreThreshold}
            onChange={(v) =>
              setPrefs({
                ...prefs,
                ai: { ...prefs.ai, scoreThreshold: v },
              })
            }
          />
        </div>
      </Section>

      <Section
        title="Email alerts"
        description="Listing alerts and run summaries use the same target list. Your account email is used by default until you change it."
      >
        <ChipsInput
          label="Target emails"
          placeholder={userEmail ?? "you@example.com"}
          value={prefs.alerts.email.targets}
          onChange={(targets) =>
            setPrefs({
              ...prefs,
              alerts: {
                ...prefs.alerts,
                email: {
                  ...prefs.alerts.email,
                  targets: targets.map((s) => s.trim().toLowerCase()),
                },
              },
            })
          }
          tone="neutral"
          validate={(v) => /.+@.+\..+/.test(v)}
        />

        <div className="space-y-2">
          <ToggleRow
            label="Send listing alert emails"
            description="Email me each time a listing passes the score threshold."
            checked={prefs.alerts.email.enabled}
            onChange={(checked) =>
              setPrefs({
                ...prefs,
                alerts: {
                  ...prefs.alerts,
                  email: { ...prefs.alerts.email, enabled: checked },
                },
              })
            }
          />
          <ToggleRow
            label="Send a summary after every run"
            description="One digest email summarising every collection run."
            checked={prefs.alerts.email.runSummaryEnabled}
            onChange={(checked) =>
              setPrefs({
                ...prefs,
                alerts: {
                  ...prefs.alerts,
                  email: {
                    ...prefs.alerts.email,
                    runSummaryEnabled: checked,
                  },
                },
              })
            }
          />
          <ToggleRow
            label="Send daily top-picks email"
            description="Once a day, email the highest-scoring recent listings."
            checked={prefs.alerts.email.topPicksEnabled}
            onChange={(checked) =>
              setPrefs({
                ...prefs,
                alerts: {
                  ...prefs.alerts,
                  email: {
                    ...prefs.alerts.email,
                    topPicksEnabled: checked,
                  },
                },
              })
            }
          />
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 rounded-md border bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
        {status && (
          <span
            className={cn(
              "text-sm",
              status.kind === "ok"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            {status.msg}
          </span>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Spinner className="mr-2" />}
          {pending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-background shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h3 className="font-semibold leading-none">{title}</h3>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {aside}
      </header>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  help,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  help?: string;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type="number"
          inputMode="numeric"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className={suffix ? "pr-16" : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function RangeInputs({
  label,
  min,
  max,
  step,
  optional,
  onChange,
}: {
  label: string;
  min: number | null;
  max: number | null;
  step?: number;
  optional?: boolean;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const placeholder = optional ? "Any" : undefined;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          step={step}
          placeholder={placeholder}
          value={min ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            onChange(v, max);
          }}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="number"
          inputMode="numeric"
          step={step}
          placeholder={placeholder}
          value={max ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            onChange(min, v);
          }}
        />
      </div>
    </div>
  );
}

type ChipTone = "positive" | "negative" | "neutral";

const CHIP_TONES: Record<ChipTone, string> = {
  positive:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  negative:
    "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  neutral: "bg-muted text-foreground",
};

function ChipsInput({
  label,
  value,
  onChange,
  placeholder,
  tone = "neutral",
  validate,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  tone?: ChipTone;
  validate?: (v: string) => boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function commit(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const invalid = validate ? parts.filter((p) => !validate(p)) : [];
    if (invalid.length > 0) {
      setError(`Invalid: ${invalid.join(", ")}`);
      return;
    }
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft("");
    setError(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5 shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
        )}
      >
        {value.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
              CHIP_TONES[tone],
            )}
          >
            {item}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${item}`}
              className="-mr-0.5 rounded-sm opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={value.length === 0 ? placeholder : undefined}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => draft && commit(draft)}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AmenityRow({
  amenityKey,
  value,
  onChange,
}: {
  amenityKey: AmenityKey;
  value: AmenityPreference;
  onChange: (next: AmenityPreference) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <span className="text-sm">{AMENITY_LABELS[amenityKey]}</span>
      <div
        role="radiogroup"
        aria-label={AMENITY_LABELS[amenityKey]}
        className="inline-flex overflow-hidden rounded-md border"
      >
        {AMENITY_STATES.map((state) => {
          const active = value === state.value;
          return (
            <button
              key={state.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(state.value)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? state.tone
                  : "bg-background text-muted-foreground hover:bg-muted",
                "border-r last:border-r-0",
              )}
            >
              {state.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="flex w-full items-start justify-between gap-4 rounded-md border bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-background shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function SummaryPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "emerald" | "sky" | "rose";
}) {
  const tones: Record<string, string> = {
    emerald:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    sky: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
    rose: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
