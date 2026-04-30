"use client";

import { useFormStatus } from "react-dom";
import {
  APARTMENT_ATTRIBUTE_KEYS,
  APARTMENT_ATTRIBUTE_LABELS,
  type ApartmentAttributeKey,
  type AttributeRequirement,
} from "@apartment-finder/shared";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { CityNeighborhoodsWizard } from "@/components/city-neighborhoods-wizard";
import { saveFiltersAction } from "./actions";
import type { StoredFilters } from "@/filters/store";

const REQUIREMENT_LABELS: Record<AttributeRequirement, string> = {
  required_true: "חובה כן",
  required_false: "חובה לא",
  preferred_true: "מועדף",
  dont_care: "לא משנה",
};

export function FiltersForm({ filters }: { filters: StoredFilters }) {
  const attrMap = new Map<ApartmentAttributeKey, AttributeRequirement>(
    filters.attributes.map((a) => [a.key, a.requirement]),
  );
  const tCities = useTranslations("Cities");

  return (
    <form action={saveFiltersAction} className="space-y-4 pb-24 sm:space-y-6">
      <Section title="תקציב חודשי (₪)">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="מינימום"
            name="priceMinNis"
            type="number"
            defaultValue={filters.priceMinNis}
          />
          <Field
            label="מקסימום"
            name="priceMaxNis"
            type="number"
            defaultValue={filters.priceMaxNis}
          />
        </div>
      </Section>

      <Section title="חדרים">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="מינימום"
            name="roomsMin"
            type="number"
            step="0.5"
            defaultValue={filters.roomsMin}
          />
          <Field
            label="מקסימום"
            name="roomsMax"
            type="number"
            step="0.5"
            defaultValue={filters.roomsMax}
          />
        </div>
      </Section>

      <Section title='גודל (מ"ר)'>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מינימום" name="sqmMin" type="number" defaultValue={filters.sqmMin} />
          <Field label="מקסימום" name="sqmMax" type="number" defaultValue={filters.sqmMax} />
        </div>
      </Section>

      <Section title={tCities("sectionTitle")} description={tCities("sectionDescription")}>
        <CityNeighborhoodsWizard
          defaultCities={filters.cities}
          defaultAllowed={filters.allowedNeighborhoods}
          defaultBlocked={filters.blockedNeighborhoods}
        />
      </Section>

      <Section title="מפרט מלא">
        <ul className="space-y-3">
          {APARTMENT_ATTRIBUTE_KEYS.map((key) => (
            <li key={key} className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">{APARTMENT_ATTRIBUTE_LABELS[key]}</div>
              <RequirementRadios
                name={`attr-${key}`}
                defaultValue={attrMap.get(key) ?? "dont_care"}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="רצונות" description="טקסט חופשי. לא חוסם התראות; מופיע במייל.">
        <Textarea
          name="wishes"
          defaultValue={filters.wishes.join("\n")}
          rows={4}
          placeholder="קרוב לפארק&#10;רחוב שקט"
        />
      </Section>

      <Section title="אסור שיהיה" description="טקסט חופשי. חוסם התראות שמתאימות סמנטית.">
        <Textarea
          name="dealbreakers"
          defaultValue={filters.dealbreakers.join("\n")}
          rows={4}
          placeholder="ליד תחנת רכבת רועשת&#10;קרוב לבר"
        />
      </Section>

      <Section title="הגדרות התראה">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="מקסימום התראות ביום"
              name="dailyAlertCap"
              type="number"
              min={0}
              defaultValue={filters.dailyAlertCap}
            />
            <Field
              label="גיל מודעה מקסימלי (שעות)"
              name="maxAgeHours"
              type="number"
              min={1}
              defaultValue={filters.maxAgeHours}
            />
          </div>
          <Toggle
            name="strictUnknowns"
            label="דרוש שיאוזכר במפורש"
            description="אם פעיל: דרישה כמו 'חובה מעלית' תיכשל גם כשהמודעה לא מזכירה מעלית כלל."
            defaultChecked={filters.strictUnknowns}
          />
          <Toggle
            name="notifyOnUnknownMustHave"
            label="הודע כשלא בטוח בדרישות חובה"
            description="אם פעיל: קבל התראה גם כשלא ברור אם דירה עומדת בדרישות החובה שלך. אם לא: דלג על דירות שלא בטוח בהן."
            defaultChecked={filters.notifyOnUnknownMustHave}
          />
          <Toggle name="isActive" label="התראות פעילות" defaultChecked={filters.isActive} />
        </div>
      </Section>

      <SubmitBar />
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <p className="pt-1 text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type FieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue"> & {
  label: string;
  name: string;
  defaultValue?: number | null;
};

function Field({ label, name, defaultValue, ...rest }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue ?? undefined}
        className="h-11 text-base"
        inputMode="numeric"
        dir="ltr"
        {...rest}
      />
    </div>
  );
}

function RequirementRadios({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: AttributeRequirement;
}) {
  const options: AttributeRequirement[] = [
    "required_true",
    "required_false",
    "preferred_true",
    "dont_care",
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((opt) => (
        <label
          key={opt}
          className="relative flex cursor-pointer items-center justify-center rounded-md border bg-background px-2 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
        >
          <input
            type="radio"
            name={name}
            value={opt}
            defaultChecked={defaultValue === opt}
            className="sr-only"
          />
          {REQUIREMENT_LABELS[opt]}
        </label>
      ))}
    </div>
  );
}

function Toggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-5 w-5 cursor-pointer rounded border-muted-foreground/40 accent-primary"
      />
      <div className="flex-1 space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </label>
  );
}

function SubmitBar() {
  const { pending } = useFormStatus();
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:pt-2">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-1 sm:px-0">
        <Button type="submit" disabled={pending} className="h-11 flex-1 text-base sm:flex-initial">
          {pending && <Spinner className="h-4 w-4" />}
          {pending ? "שומר…" : "שמירה"}
        </Button>
      </div>
    </div>
  );
}
