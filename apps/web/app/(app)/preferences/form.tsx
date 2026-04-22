"use client";

import { useState, useTransition } from "react";
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
import { savePreferencesAction } from "./actions";

const AMENITY_STATES: AmenityPreference[] = [
  "any",
  "preferred",
  "required",
  "avoid",
];

const AMENITY_STATE_LABELS: Record<AmenityPreference, string> = {
  any: "Any",
  preferred: "Preferred",
  required: "Required",
  avoid: "Avoid",
};

export function PreferencesForm({
  initial,
  userEmail,
}: {
  initial: Preferences;
  userEmail: string | null;
}) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function save() {
    start(async () => {
      setStatus(null);
      try {
        await savePreferencesAction(prefs);
        setStatus("Saved.");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Min rent (₪/mo) — filters spam / bait">
          <Input
            type="number"
            value={prefs.budget.minNis ?? 0}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                budget: { ...prefs.budget, minNis: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="Max rent (₪/mo)">
          <Input
            type="number"
            value={prefs.budget.maxNis}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                budget: { ...prefs.budget, maxNis: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="Flexibility (%)">
          <Input
            type="number"
            value={prefs.budget.flexibilityPct}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                budget: {
                  ...prefs.budget,
                  flexibilityPct: Number(e.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="Rooms min">
          <Input
            type="number"
            step="0.5"
            value={prefs.rooms.min}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                rooms: { ...prefs.rooms, min: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="Rooms max">
          <Input
            type="number"
            step="0.5"
            value={prefs.rooms.max}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                rooms: { ...prefs.rooms, max: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="Min size (sqm)">
          <Input
            type="number"
            value={prefs.sizeSqm?.min ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : undefined;
              const next = { ...(prefs.sizeSqm ?? {}), min: v };
              setPrefs({
                ...prefs,
                sizeSqm:
                  next.min == null && next.max == null ? undefined : next,
              });
            }}
          />
        </Field>
        <Field label="Max size (sqm)">
          <Input
            type="number"
            value={prefs.sizeSqm?.max ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : undefined;
              const next = { ...(prefs.sizeSqm ?? {}), max: v };
              setPrefs({
                ...prefs,
                sizeSqm:
                  next.min == null && next.max == null ? undefined : next,
              });
            }}
          />
        </Field>
        <Field label="Max age (hours)">
          <Input
            type="number"
            value={prefs.maxAgeHours}
            onChange={(e) =>
              setPrefs({ ...prefs, maxAgeHours: Number(e.target.value) })
            }
          />
        </Field>
      </div>

      <ListField
        label="Allowed neighborhoods (comma-separated)"
        value={prefs.allowedNeighborhoods}
        onChange={(v) => setPrefs({ ...prefs, allowedNeighborhoods: v })}
      />
      <ListField
        label="Blocked neighborhoods"
        value={prefs.blockedNeighborhoods}
        onChange={(v) => setPrefs({ ...prefs, blockedNeighborhoods: v })}
      />
      <ListField
        label="Hard requirements"
        value={prefs.hardRequirements}
        onChange={(v) => setPrefs({ ...prefs, hardRequirements: v })}
      />
      <ListField
        label="Nice-to-haves"
        value={prefs.niceToHaves}
        onChange={(v) => setPrefs({ ...prefs, niceToHaves: v })}
      />
      <ListField
        label="Deal-breakers"
        value={prefs.dealBreakers}
        onChange={(v) => setPrefs({ ...prefs, dealBreakers: v })}
      />

      <div className="space-y-3 rounded-md border p-4">
        <div>
          <h3 className="font-medium">Amenities</h3>
          <p className="text-sm text-muted-foreground">
            The AI judge uses these when scoring each listing. &quot;Required&quot; will
            block alerts unless the feature is present; &quot;Avoid&quot; will demote or
            skip listings that mention it.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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
      </div>

      <Field label="AI score threshold for alerts">
        <Input
          type="number"
          value={prefs.ai.scoreThreshold}
          onChange={(e) =>
            setPrefs({
              ...prefs,
              ai: { ...prefs.ai, scoreThreshold: Number(e.target.value) },
            })
          }
        />
      </Field>

      <div className="space-y-4 rounded-md border p-4">
        <div>
          <h3 className="font-medium">Email alerts</h3>
          <p className="text-sm text-muted-foreground">
            Listing alerts and run summaries use the same target list. Your account
            email is used by default until you change it.
          </p>
        </div>

        <Field label="Target emails (comma-separated)">
          <Input
            type="text"
            value={prefs.alerts.email.targets.join(", ")}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                alerts: {
                  ...prefs.alerts,
                  email: {
                    ...prefs.alerts.email,
                    targets: e.target.value
                      .split(",")
                      .map((s) => s.trim().toLowerCase())
                      .filter(Boolean),
                  },
                },
              })
            }
            placeholder={userEmail ?? "you@example.com, teammate@example.com"}
          />
        </Field>

        <CheckboxField
          label="Send listing alert emails"
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

        <CheckboxField
          label="Send a summary email after every run"
          checked={prefs.alerts.email.runSummaryEnabled}
          onChange={(checked) =>
            setPrefs({
              ...prefs,
              alerts: {
                ...prefs.alerts,
                email: { ...prefs.alerts.email, runSummaryEnabled: checked },
              },
            })
          }
        />

        <CheckboxField
          label="Send daily top-picks email"
          checked={prefs.alerts.email.topPicksEnabled}
          onChange={(checked) =>
            setPrefs({
              ...prefs,
              alerts: {
                ...prefs.alerts,
                email: { ...prefs.alerts.email, topPicksEnabled: checked },
              },
            })
          }
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner className="mr-2" />}
          {pending ? "Saving…" : "Save"}
        </Button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
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
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-sm">{AMENITY_LABELS[amenityKey]}</span>
      <select
        className="rounded-md border bg-background px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as AmenityPreference)}
      >
        {AMENITY_STATES.map((state) => (
          <option key={state} value={state}>
            {AMENITY_STATE_LABELS[state]}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
