import React, { useState, useMemo } from 'react';
import { COUNTRIES, CountryOption } from '../../constants/countries';
import { Button } from './button';
import { Badge } from './badge';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';
import { ChevronDown, Check, X, Globe } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CountryComboboxProps {
  value: string; // Country code, e.g. 'EG' or ''
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Official shadcn/ui Combobox pattern (Popover + Command + cmdk)
 * Fully supports RTL (dir="rtl" / dir="ltr"), instant typing, first-letter search,
 * and 123RF empty/unspecified optional country support.
 */
export const CountryCombobox: React.FC<CountryComboboxProps> = ({
  value,
  onChange,
  placeholder = '--Country--',
  className = '',
}) => {
  const [open, setOpen] = useState(false);

  // Selected country object
  const selectedCountry = useMemo(() => {
    if (!value || value.toLowerCase() === 'none') return null;
    return COUNTRIES.find((c) => c.code.toUpperCase() === value.toUpperCase()) || null;
  }, [value]);

  return (
    <div className={cn('relative w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between text-xs px-2.5 font-normal bg-card border-border hover:bg-secondary/40 shadow-xs"
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              {selectedCountry ? (
                <>
                  <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] font-mono font-bold bg-primary/10 text-primary border-primary/30 shrink-0">
                    {selectedCountry.code}
                  </Badge>
                  <span className="truncate font-medium text-foreground">{selectedCountry.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground font-mono text-[11px]">{placeholder}</span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 text-muted-foreground ml-1">
              {selectedCountry && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onChange('');
                    }
                  }}
                  className="hover:text-destructive p-0.5 rounded cursor-pointer transition"
                  title="Clear Country (None)"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-72 p-0 shadow-lg border-border" align="start">
          <Command
            filter={(itemValue, search) => {
              const q = search.trim().toLowerCase();
              if (!q) return 1;
              const target = itemValue.toLowerCase();
              // Prioritize startsWith (first letter or prefix)
              if (target.startsWith(q)) return 2;
              if (target.includes(q)) return 1;
              return 0;
            }}
          >
            <CommandInput
              placeholder="Search country or letter (e.g. 'e', 'EG')..."
              className="h-8 text-xs"
            />
            <CommandList className="max-h-60 overflow-y-auto text-xs">
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground font-mono">
                No country found.
              </CommandEmpty>

              {/* 123RF Optional Empty Country Option */}
              <CommandGroup>
                <CommandItem
                  value="-- none empty optional --"
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="flex items-center justify-between text-xs cursor-pointer py-1.5 px-2 text-amber-500/90 dark:text-amber-400 font-medium"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 opacity-70 shrink-0" />
                    <span>-- None / Empty (Optional) --</span>
                  </div>
                  {(!value || value.toLowerCase() === 'none') && (
                    <Check className="w-3.5 h-3.5 text-primary ml-auto" />
                  )}
                </CommandItem>
              </CommandGroup>

              {/* 249 ISO Countries */}
              <CommandGroup heading="Countries">
                {COUNTRIES.map((country) => {
                  const isSelected = selectedCountry?.code === country.code;
                  // Value combines name and code so typing either 'e', 'egypt', or 'eg' matches seamlessly!
                  return (
                    <CommandItem
                      key={country.code}
                      value={`${country.name} ${country.code}`}
                      onSelect={() => {
                        onChange(country.code);
                        setOpen(false);
                      }}
                      className="flex items-center justify-between text-xs cursor-pointer py-1.5 px-2"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded shrink-0">
                          {country.code}
                        </span>
                        <span className="truncate">{country.name}</span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-auto" />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
