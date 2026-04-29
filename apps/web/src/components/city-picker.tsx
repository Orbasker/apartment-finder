"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { X, Search } from "lucide-react";
import { searchCitiesAction, type CityCandidate } from "../../app/(app)/filters/city-search.action";
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
import type { CitySelection } from "@apartment-finder/shared";

type Props = {
  /** Form field name. Hidden inputs render the JSON-encoded selection per pick. */
  name: string;
  defaultSelections: CitySelection[];
};

export function CityPicker({ name, defaultSelections }: Props) {
  const t = useTranslations("Cities");
  const [selections, setSelections] = useState<CitySelection[]>(defaultSelections);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityCandidate[]>([]);
  const [isPending, startTransition] = useTransition();
  const triggerId = useId();

  const selectedIds = useMemo(() => new Set(selections.map((s) => s.placeId)), [selections]);

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

  function add(candidate: CityCandidate) {
    if (selectedIds.has(candidate.placeId)) return;
    setSelections((prev) => [...prev, candidate]);
    setQuery("");
    setResults([]);
  }

  function remove(placeId: string) {
    setSelections((prev) => prev.filter((s) => s.placeId !== placeId));
  }

  return (
    <div className="space-y-2">
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
                onClick={() => remove(s.placeId)}
                className="-me-1 ms-1 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={t("removeChip")}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <input type="hidden" name={name} value={JSON.stringify(s)} />
            </li>
          ))}
        </ul>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              id={triggerId}
              variant="outline"
              size="sm"
              className="h-11 w-full justify-start text-base font-normal text-muted-foreground sm:h-9 sm:text-sm"
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
                          if (!already) add(r);
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
    </div>
  );
}
