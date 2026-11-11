"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogModel } from "@/lib/ai-catalog";
import { isRecommendedModel } from "@/lib/famous-models";
import { ModelDetailRow } from "@/components/settings/model-details";

/**
 * Compact model picker for dropdowns: the trigger shows only the selected
 * model's name (+ star), the popover lists full details per model.
 */
export function ModelPicker({
  models,
  value,
  onChange,
  placeholder = "Select model",
  className,
}: {
  models: CatalogModel[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-muted/40",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{selected.name}</span>
                {isRecommendedModel(selected.id) && (
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Recommended model" />
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-0 sm:w-96">
        <Command>
          <CommandInput placeholder="Type to search models…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No models match.</CommandEmpty>
            <CommandGroup>
              {models.map((model) => {
                const active = model.id === value;
                return (
                  <CommandItem
                    key={model.id}
                    value={`${model.name} ${model.id}`}
                    onSelect={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    className="items-start gap-2 py-2"
                  >
                    <Check
                      className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium leading-tight">{model.name}</span>
                        {model.tier === "pro" && (
                          <Badge variant="outline" className="px-1 py-0 text-[9px] text-muted-foreground">
                            pro
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/70">
                        {model.id}
                      </span>
                      <ModelDetailRow model={model} />
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
