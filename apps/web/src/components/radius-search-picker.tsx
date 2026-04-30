"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Search, X } from "lucide-react";
import {
  searchRadiusPointsAction,
  type RadiusCandidate,
} from "../../app/(app)/(onboarded)/filters/radius-search.action";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RadiusSelection } from "@apartment-finder/shared";

type Props = {
  defaultRadius: RadiusSelection | null;
};

const DEFAULT_RADIUS_KM = 1;

export function RadiusSearchPicker({ defaultRadius }: Props) {
  const t = useTranslations("RadiusSearch");
  const [selected, setSelected] = useState<RadiusSelection | null>(defaultRadius);
  const radiusKm = selected?.radiusKm ?? DEFAULT_RADIUS_KM;
  const label = selected?.label ?? t("savedPointLabel");

  return (
    <div className="space-y-3">
      {selected ? (
        <>
          <input type="hidden" name="radiusLabel" value={label} />
          <input type="hidden" name="centerLat" value={selected.centerLat} />
          <input type="hidden" name="centerLon" value={selected.centerLon} />
        </>
      ) : null}

      {selected ? (
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                <bdi>{label}</bdi>
              </div>
              <div className="mt-2 max-w-36 space-y-1.5">
                <Label htmlFor="radiusKm">{t("radiusLabel")}</Label>
                <Input
                  key={`${selected.centerLat}:${selected.centerLon}`}
                  id="radiusKm"
                  name="radiusKm"
                  type="number"
                  min={0.1}
                  step={0.1}
                  inputMode="decimal"
                  dir="ltr"
                  defaultValue={radiusKm}
                  className="h-11 text-base"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("clear")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("emptyState")}</p>
      )}

      <RadiusPointPopover
        onSelect={(candidate) =>
          setSelected({
            centerLat: candidate.lat,
            centerLon: candidate.lon,
            radiusKm: selected?.radiusKm ?? DEFAULT_RADIUS_KM,
            label: candidate.nameHe,
          })
        }
      />
    </div>
  );
}

function RadiusPointPopover({ onSelect }: { onSelect: (candidate: RadiusCandidate) => void }) {
  const t = useTranslations("RadiusSearch");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RadiusCandidate[]>([]);
  const [isPending, startTransition] = useTransition();
  const triggerId = useId();

  function onQueryChange(next: string) {
    setQuery(next);
    if (!next.trim()) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const candidates = await searchRadiusPointsAction(next);
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
            <Search className="h-4 w-4" aria-hidden="true" />
            {t("searchButton")}
          </Button>
        }
      />
      <PopoverContent className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
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
                {results.map((r) => (
                  <CommandItem
                    key={r.placeId}
                    value={`${r.nameHe} ${r.addressHe ?? ""} ${r.placeId}`}
                    onSelect={() => {
                      onSelect(r);
                      setOpen(false);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        <bdi>{r.nameHe}</bdi>
                      </span>
                      {r.addressHe ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          <bdi>{r.addressHe}</bdi>
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
