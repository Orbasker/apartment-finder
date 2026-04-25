import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import type { ParsedListingFilters } from "./filter-params";

type Props = {
  action?: string;
  values: ParsedListingFilters;
  hasActiveFilters: boolean;
  prefsSeeded?: boolean;
};

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm";

export function ListingsFiltersBar({
  action = "/",
  values,
  hasActiveFilters,
  prefsSeeded = false,
}: Props) {
  return (
    <form method="get" action={action} className="space-y-3 rounded-lg border bg-card p-3 sm:p-4">
      {prefsSeeded && (
        <p className="text-xs text-muted-foreground">
          Pre-filled from your saved preferences —{" "}
          <Link href="/preferences" className="underline hover:text-foreground">
            edit preferences
          </Link>
          .
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Search</span>
          <Input
            type="search"
            name="q"
            placeholder="text, neighborhood, street, author…"
            defaultValue={values.search ?? ""}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Neighborhood</span>
          <Input
            name="neighborhood"
            placeholder="e.g. Florentin"
            defaultValue={values.neighborhood ?? ""}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Min ₪</span>
            <Input
              type="number"
              inputMode="numeric"
              name="minPrice"
              min={0}
              step={100}
              defaultValue={values.minPriceNis ?? ""}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Max ₪</span>
            <Input
              type="number"
              inputMode="numeric"
              name="maxPrice"
              min={0}
              step={100}
              defaultValue={values.maxPriceNis ?? ""}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Min rooms</span>
            <Input
              type="number"
              inputMode="decimal"
              name="minRooms"
              min={0}
              step={0.5}
              defaultValue={values.minRooms ?? ""}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Max rooms</span>
            <Input
              type="number"
              inputMode="decimal"
              name="maxRooms"
              min={0}
              step={0.5}
              defaultValue={values.maxRooms ?? ""}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Decision</span>
          <select name="decision" defaultValue={values.decision ?? ""} className={selectClass}>
            <option value="">Any</option>
            <option value="alert">Alert</option>
            <option value="unsure">Unsure</option>
            <option value="skip">Skip</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Source</span>
          <select name="source" defaultValue={values.source ?? ""} className={selectClass}>
            <option value="">Any</option>
            <option value="yad2">Yad2</option>
            <option value="fb_apify">FB (Apify)</option>
            <option value="fb_ext">FB (extension)</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Min score</span>
          <Input
            type="number"
            inputMode="numeric"
            name="minScore"
            min={0}
            max={100}
            step={1}
            defaultValue={values.minScore ?? ""}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Time window</span>
          <select
            name="hoursAgo"
            defaultValue={values.hoursAgo != null ? String(values.hoursAgo) : ""}
            className={selectClass}
          >
            <option value="">All time</option>
            <option value="24">Last 24h</option>
            <option value="72">Last 3 days</option>
            <option value="168">Last 7 days</option>
            <option value="720">Last 30 days</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Per page</span>
          <select name="limit" defaultValue={String(values.limit)} className={selectClass}>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit">Apply filters</Button>
        {hasActiveFilters && (
          <Link
            href={action}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Reset
          </Link>
        )}
      </div>
    </form>
  );
}
