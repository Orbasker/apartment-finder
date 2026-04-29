"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search, X } from "lucide-react";
import {
  searchCitiesAction,
  type CityCandidate,
} from "../../app/(app)/(onboarded)/filters/city-search.action";
import {
  searchNeighborhoodsAction,
  type NeighborhoodCandidate,
} from "../../app/(app)/(onboarded)/filters/neighborhood-search.action";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import type { CitySelection, NeighborhoodSelection } from "@apartment-finder/shared";

type Props = {
  defaultCities: CitySelection[];
  defaultAllowed: NeighborhoodSelection[];
  defaultBlocked: NeighborhoodSelection[];
};

/** Single component owning the city → per-city neighborhoods state. Emits
 *  hidden inputs that the form action parses:
 *    - cities[]                  JSON-encoded CitySelection
 *    - allowedNeighborhoods[]    JSON-encoded NeighborhoodSelection
 *    - blockedNeighborhoods[]    JSON-encoded NeighborhoodSelection */
export function CityNeighborhoodsWizard({ defaultCities, defaultAllowed, defaultBlocked }: Props) {
  const tCity = useTranslations("Cities");
  const [cities, setCities] = useState<CitySelection[]>(defaultCities);
  const [allowed, setAllowed] = useState<NeighborhoodSelection[]>(defaultAllowed);
  const [blocked, setBlocked] = useState<NeighborhoodSelection[]>(defaultBlocked);

  const cityIds = useMemo(() => new Set(cities.map((c) => c.placeId)), [cities]);

  function addCity(c: CityCandidate) {
    if (cityIds.has(c.placeId)) return;
    setCities((prev) => [...prev, c]);
  }

  function removeCity(placeId: string) {
    setCities((prev) => prev.filter((c) => c.placeId !== placeId));
    setAllowed((prev) => prev.filter((n) => n.cityPlaceId !== placeId));
    setBlocked((prev) => prev.filter((n) => n.cityPlaceId !== placeId));
  }

  function addNeighborhood(
    kind: "allowed" | "blocked",
    city: CitySelection,
    candidate: NeighborhoodCandidate,
  ) {
    const selection: NeighborhoodSelection = {
      placeId: candidate.placeId,
      nameHe: candidate.nameHe,
      cityPlaceId: city.placeId,
      cityNameHe: city.nameHe,
    };
    const setter = kind === "allowed" ? setAllowed : setBlocked;
    setter((prev) =>
      prev.some((n) => n.placeId === selection.placeId) ? prev : [...prev, selection],
    );
  }

  function removeNeighborhood(kind: "allowed" | "blocked", placeId: string) {
    const setter = kind === "allowed" ? setAllowed : setBlocked;
    setter((prev) => prev.filter((n) => n.placeId !== placeId));
  }

  return (
    <div className="space-y-4">
      {/* Hidden inputs the action parses */}
      {cities.map((c) => (
        <input key={`city-${c.placeId}`} type="hidden" name="cities" value={JSON.stringify(c)} />
      ))}
      {allowed.map((n) => (
        <input
          key={`allowed-${n.placeId}`}
          type="hidden"
          name="allowedNeighborhoods"
          value={JSON.stringify(n)}
        />
      ))}
      {blocked.map((n) => (
        <input
          key={`blocked-${n.placeId}`}
          type="hidden"
          name="blockedNeighborhoods"
          value={JSON.stringify(n)}
        />
      ))}

      {cities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tCity("emptyState")}</p>
      ) : (
        <ul className="space-y-3">
          {cities.map((city) => (
            <li key={city.placeId} className="rounded-lg border bg-background p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{city.nameHe}</span>
                <button
                  type="button"
                  onClick={() => removeCity(city.placeId)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={tCity("removeCity")}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <NeighborhoodScopedPicker
                kind="allowed"
                city={city}
                selections={allowed.filter((n) => n.cityPlaceId === city.placeId)}
                onAdd={(c) => addNeighborhood("allowed", city, c)}
                onRemove={(id) => removeNeighborhood("allowed", id)}
              />
              <NeighborhoodScopedPicker
                kind="blocked"
                city={city}
                selections={blocked.filter((n) => n.cityPlaceId === city.placeId)}
                onAdd={(c) => addNeighborhood("blocked", city, c)}
                onRemove={(id) => removeNeighborhood("blocked", id)}
              />
            </li>
          ))}
        </ul>
      )}

      <CityAddPopover existingIds={cityIds} onAdd={addCity} />
    </div>
  );
}

function CityAddPopover({
  existingIds,
  onAdd,
}: {
  existingIds: Set<string>;
  onAdd: (c: CityCandidate) => void;
}) {
  const t = useTranslations("Cities");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityCandidate[]>([]);
  const [isPending, startTransition] = useTransition();
  const triggerId = useId();

  function onQueryChange(next: string) {
    setQuery(next);
    if (!next.trim()) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const candidates = await searchCitiesAction(next);
      setResults(candidates);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            id={triggerId}
            variant="outline"
            size="sm"
            className="h-11 w-full justify-center gap-2 text-base font-normal sm:h-9 sm:text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addCity")}
          </Button>
        }
      />
      <PopoverContent className="w-[min(20rem,calc(100vw-1.5rem))] p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={onQueryChange}
            placeholder={t("searchPlaceholder")}
            autoFocus
          />
          <CommandList>
            {isPending && results.length === 0 && query.trim().length > 0 ? (
              <CommandEmpty>{t("loading")}</CommandEmpty>
            ) : query.trim().length === 0 ? (
              <CommandEmpty>{t("typeToSearch")}</CommandEmpty>
            ) : results.length === 0 ? (
              <CommandEmpty>{t("noResults")}</CommandEmpty>
            ) : (
              <CommandGroup>
                {results.map((r) => {
                  const already = existingIds.has(r.placeId);
                  return (
                    <CommandItem
                      key={r.placeId}
                      value={`${r.nameHe} ${r.placeId}`}
                      onSelect={() => {
                        if (!already) {
                          onAdd(r);
                          setOpen(false);
                          setQuery("");
                          setResults([]);
                        }
                      }}
                      disabled={already}
                    >
                      <span className="flex-1 font-medium">{r.nameHe}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function NeighborhoodScopedPicker({
  kind,
  city,
  selections,
  onAdd,
  onRemove,
}: {
  kind: "allowed" | "blocked";
  city: CitySelection;
  selections: NeighborhoodSelection[];
  onAdd: (c: NeighborhoodCandidate) => void;
  onRemove: (placeId: string) => void;
}) {
  const t = useTranslations("Neighborhoods");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NeighborhoodCandidate[]>([]);
  const [isPending, startTransition] = useTransition();
  const selectedIds = useMemo(() => new Set(selections.map((s) => s.placeId)), [selections]);

  function onQueryChange(next: string) {
    setQuery(next);
    if (!next.trim()) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const candidates = await searchNeighborhoodsAction(next, city.nameHe);
      setResults(candidates);
    });
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {kind === "allowed" ? t("allowedTitle") : t("blockedTitle")}
      </p>
      {selections.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selections.map((s) => (
            <li
              key={s.placeId}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-sm"
            >
              <span className="font-medium">{s.nameHe}</span>
              <button
                type="button"
                onClick={() => onRemove(s.placeId)}
                className="-me-1 ms-1 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={t("removeChip")}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 w-full justify-start text-sm font-normal text-muted-foreground sm:h-9"
            >
              <Search className="me-2 h-4 w-4" aria-hidden="true" />
              {t("searchPlaceholder")}
            </Button>
          }
        />
        <PopoverContent className="w-[min(20rem,calc(100vw-1.5rem))] p-0">
          <Command>
            <CommandInput
              value={query}
              onValueChange={onQueryChange}
              placeholder={t("searchPlaceholder")}
              autoFocus
            />
            <CommandList>
              {isPending && results.length === 0 && query.trim().length > 0 ? (
                <CommandEmpty>{t("loading")}</CommandEmpty>
              ) : query.trim().length === 0 ? (
                <CommandEmpty>{t("typeToSearch")}</CommandEmpty>
              ) : results.length === 0 ? (
                <CommandEmpty>{t("noResults")}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {results.map((r) => {
                    const already = selectedIds.has(r.placeId);
                    return (
                      <CommandItem
                        key={r.placeId}
                        value={`${r.nameHe} ${r.placeId}`}
                        onSelect={() => {
                          if (!already) {
                            onAdd(r);
                            setOpen(false);
                            setQuery("");
                            setResults([]);
                          }
                        }}
                        disabled={already}
                      >
                        <span className="flex-1 font-medium">{r.nameHe}</span>
                        <span className="text-xs text-muted-foreground">{r.cityNameHe}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
