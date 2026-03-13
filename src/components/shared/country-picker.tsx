"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { COUNTRIES, findCountryByCode } from "@/lib/constants/countries";
import { FlagImage } from "@/components/shared/flag-image";

type CountryPickerProps = {
  value?: string;
  onChange: (code: string | undefined) => void;
  placeholder?: string;
  className?: string;
};

export function CountryPicker({
  value,
  onChange,
  placeholder = "Select country",
  className,
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? findCountryByCode(value) : undefined;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                <FlagImage code={selected.code} size={16} />
                <span className="truncate">{selected.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command
            filter={(value, search) => {
              const country = findCountryByCode(value);
              if (!country) return 0;
              const q = search.toLowerCase();
              if (country.code.toLowerCase() === q) return 1;
              if (country.name.toLowerCase().includes(q)) return 1;
              if (country.aliases.some((a) => a.toLowerCase().includes(q))) return 1;
              return 0;
            }}
          >
            <CommandInput placeholder="Search countries..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={country.code}
                    onSelect={() => {
                      onChange(country.code === value ? undefined : country.code);
                      setOpen(false);
                    }}
                  >
                    <FlagImage code={country.code} size={16} className="mr-2 shrink-0" />
                    <span className="truncate">{country.name}</span>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4 shrink-0",
                        value === country.code ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onChange(undefined)}
          aria-label="Clear nationality"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
