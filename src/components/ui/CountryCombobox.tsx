import React, { useState, useMemo } from 'react';
import { COUNTRIES } from '../../constants/countries';
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
import { useLanguage } from '../../context/LanguageContext';

export interface CountryComboboxProps {
  value: string; // Country code, e.g. 'EG', 'US', or ''
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
}

const ARABIC_COUNTRY_FALLBACKS: Record<string, string> = {
  US: 'الولايات المتحدة',
  GB: 'المملكة المتحدة',
  EG: 'مصر',
  SA: 'المملكة العربية السعودية',
  AE: 'الإمارات العربية المتحدة',
  KW: 'الكويت',
  QA: 'قطر',
  BH: 'البحرين',
  OM: 'عُمان',
  JO: 'الأردن',
  LB: 'لبنان',
  MA: 'المغرب',
  DZ: 'الجزائر',
  TN: 'تونس',
  IQ: 'العراق',
  SY: 'سوريا',
  PS: 'فلسطين',
  SD: 'السودان',
  LY: 'ليبيا',
  YE: 'اليمن',
  TR: 'تركيا',
  DE: 'ألمانيا',
  FR: 'فرنسا',
  IT: 'إيطاليا',
  ES: 'إسبانيا',
  CA: 'كندا',
  AU: 'أستراليا',
  JP: 'اليابان',
  CN: 'الصين',
  IN: 'الهند',
  BR: 'البرازيل',
  NL: 'هولندا',
  CH: 'سويسرا',
  SE: 'السويد',
};

let arRegionDisplayNames: Intl.DisplayNames | null = null;
try {
  if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    arRegionDisplayNames = new Intl.DisplayNames(['ar'], { type: 'region' });
  }
} catch {
  arRegionDisplayNames = null;
}

export function getLocalizedCountryName(code: string, englishName: string, language: 'en' | 'ar'): string {
  if (language !== 'ar') return englishName;
  const upper = code.toUpperCase();
  if (ARABIC_COUNTRY_FALLBACKS[upper]) {
    return ARABIC_COUNTRY_FALLBACKS[upper];
  }
  if (arRegionDisplayNames) {
    try {
      const translated = arRegionDisplayNames.of(upper);
      if (translated && translated !== upper) {
        return translated;
      }
    } catch {
      // fallback to English name
    }
  }
  return englishName;
}

/**
 * Official shadcn/ui Combobox pattern (Popover + Command + cmdk)
 * Localizes country display names to Arabic when language === 'ar' while keeping
 * the underlying exported value strictly the English ISO code (e.g., 'US', 'EG').
 */
export const CountryCombobox: React.FC<CountryComboboxProps> = ({
  value,
  onChange,
  placeholder = '--Country--',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const { language, isRtl } = useLanguage();

  const localizedCountries = useMemo(() => {
    return COUNTRIES.map((c) => ({
      ...c,
      displayName: getLocalizedCountryName(c.code, c.name, language),
    }));
  }, [language]);

  const selectedCountry = useMemo(() => {
    if (!value || value.toLowerCase() === 'none') return null;
    return localizedCountries.find((c) => c.code.toUpperCase() === value.toUpperCase()) || null;
  }, [value, localizedCountries]);

  return (
    <div className={cn('relative w-full', className)} dir={isRtl ? 'rtl' : 'ltr'}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between text-xs px-2.5 font-normal bg-background border-border hover:bg-secondary/50 shadow-2xs"
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              {selectedCountry ? (
                <>
                  <Badge
                    variant="outline"
                    className="px-1 py-0 h-4 text-[9px] font-mono font-bold bg-primary/10 text-primary border-primary/30 shrink-0"
                  >
                    {selectedCountry.code}
                  </Badge>
                  <span className="truncate font-medium text-foreground">
                    {selectedCountry.displayName}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground font-mono text-[11px]">{placeholder}</span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 text-muted-foreground ms-1">
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
                  aria-label="Clear Country"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          dir={isRtl ? 'rtl' : 'ltr'}
          className="w-72 p-0 shadow-lg border-border"
          align={isRtl ? 'end' : 'start'}
        >
          <Command
            dir={isRtl ? 'rtl' : 'ltr'}
            filter={(itemValue, search) => {
              const q = search.trim().toLowerCase();
              if (!q) return 1;
              const target = itemValue.toLowerCase();
              if (target.startsWith(q)) return 2;
              if (target.includes(q)) return 1;
              return 0;
            }}
          >
            <CommandInput
              placeholder={
                language === 'ar'
                  ? 'ابحث عن الدولة بالعربية أو الكود (مثل مصر، EG)...'
                  : "Search country or code (e.g. 'Egypt', 'EG')..."
              }
              className="h-8 text-xs text-start"
            />
            <CommandList className="max-h-60 overflow-y-auto text-xs">
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                {language === 'ar' ? 'لم يتم العثور على دولة.' : 'No country found.'}
              </CommandEmpty>

              {/* 123RF Optional Empty Country Option */}
              <CommandGroup>
                <CommandItem
                  value="-- none empty optional بدون دولة اختياري --"
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="flex items-center justify-between text-xs cursor-pointer py-1.5 px-2 text-amber-600 dark:text-amber-400 font-medium"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 opacity-70 shrink-0" />
                    <span>
                      {language === 'ar' ? '-- بدون تحديد (اختياري) --' : '-- None / Empty (Optional) --'}
                    </span>
                  </div>
                  {(!value || value.toLowerCase() === 'none') && (
                    <Check className="w-3.5 h-3.5 text-primary ms-auto" />
                  )}
                </CommandItem>
              </CommandGroup>

              {/* 249 ISO Countries */}
              <CommandGroup heading={language === 'ar' ? 'الدول (ISO)' : 'Countries'}>
                {localizedCountries.map((country) => {
                  const isSelected = selectedCountry?.code === country.code;
                  return (
                    <CommandItem
                      key={country.code}
                      value={`${country.displayName} ${country.name} ${country.code}`}
                      onSelect={() => {
                        // Underlying exported value remains the exact English ISO code
                        onChange(country.code);
                        setOpen(false);
                      }}
                      className="flex items-center justify-between text-xs cursor-pointer py-1.5 px-2"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-1 rounded shrink-0">
                          {country.code}
                        </span>
                        <span className="truncate">{country.displayName}</span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 ms-auto" />
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
