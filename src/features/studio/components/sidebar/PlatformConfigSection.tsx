import React from 'react';
import { SupportedPlatform } from '../../../../types';
import { useLanguage } from '../../../../context/LanguageContext';
import { Input } from '../../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Checkbox } from '../../../../components/ui/checkbox';
import { CountryCombobox } from '../../../../components/ui/CountryCombobox';
import { Lock, Unlock } from 'lucide-react';
import { useStudioMarketplaceSettings } from '../../../../hooks/useStudioMarketplaceSettings';

export const FREEPIK_AI_MODELS = [
  'Google Nano Banana',
  'Midjourney 6',
  'Flux 1.1 Pro',
  'DALL-E 3',
  'Stable Diffusion 3.5',
  'Leonardo Phoenix',
  'Ideogram 2.0',
  'Adobe Firefly 3',
  'Other',
] as const;

export interface PlatformConfigSectionProps {
  platformId: SupportedPlatform;
  settings: ReturnType<typeof useStudioMarketplaceSettings> | any;
  onUnlockDt?: () => void;
  onUnlockShutter?: () => void;
}

export const PlatformConfigSection: React.FC<PlatformConfigSectionProps> = React.memo(({
  platformId,
  settings: s,
  onUnlockDt,
  onUnlockShutter,
}) => {
  const { t, language } = useLanguage();

  if (platformId === 'vecteezy') {
    return (
      <div className="pt-2 border-t border-border/70 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t.VecteezyLicense}</span>
        <div className="flex gap-1 bg-background p-0.5 rounded-md border border-border">
          {(['pro', 'free'] as const).map((lic) => (
            <button
              key={lic}
              type="button"
              onClick={() => s.setVecLicense(lic)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase cursor-pointer transition ${
                s.vecLicense === lic
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {lic === 'pro' ? t.proLicense : t.freeLicense}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (platformId === 'freepik') {
    return (
      <div className="pt-2 border-t border-border/70 space-y-2 text-xs">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-muted-foreground font-medium">{t.markAsAi}</span>
          <Checkbox
            checked={s.freepikAiGenerated}
            onCheckedChange={(c: boolean) => s.setFreepikAiGenerated(!!c)}
          />
        </label>
        {s.freepikAiGenerated && (
          <div className="space-y-1.5">
            <span className="text-muted-foreground block text-[11px]">{t.aiModelUsed}</span>
            <Select value={s.freepikModel} onValueChange={s.setFreepikModel}>
              <SelectTrigger className="h-7 text-[11px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                {FREEPIK_AI_MODELS.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m === 'Other' ? (language === 'ar' ? 'أخرى (مخصص)' : 'Other') : m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {s.freepikModel === 'Other' && (
              <Input
                placeholder={t.enterModelName}
                value={s.customFreepikModel}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => s.setCustomFreepikModel(e.target.value)}
                className="h-7 text-xs bg-background"
              />
            )}
          </div>
        )}
      </div>
    );
  }

  if (platformId === 'dreamstime') {
    return (
      <div className="pt-2 border-t border-border/70 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={s.dtAiGenerated}
              onCheckedChange={(c: boolean) => s.setDtAiGenerated(!!c)}
            />
            <span className="text-foreground font-medium text-[11px]">{t.aiContentAndCategory}</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={s.dtEditorial}
              onCheckedChange={(c: boolean) => s.setDtEditorial(!!c)}
            />
            <span className="text-muted-foreground text-[11px]">{t.editorialContent}</span>
          </label>
        </div>

        <div className="pt-1.5 border-t border-border/60 space-y-1.5">
          <div className="flex items-center justify-between">
            <span dir="ltr" className="text-[10px] font-mono text-muted-foreground">W-EL / P-EL</span>
            {s.isDtLocked ? (
              <button
                type="button"
                onClick={onUnlockDt}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Lock className="w-2.5 h-2.5" />
                <span>{t.CustomizeLicensing}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (s.setIsDtLocked) s.setIsDtLocked(true);
                    localStorage.setItem('stock_dt_locked', JSON.stringify(true));
                  }}
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline cursor-pointer"
                >
                  <Unlock className="w-2.5 h-2.5" />
                  <span>{t.lockDefaults}</span>
                </button>
                <button
                  type="button"
                  onClick={s.resetDtLicensing}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                >
                  {t.resetSafeDefaults}
                </button>
              </div>
            )}
          </div>

          <div className={`grid grid-cols-2 gap-1.5 ${s.isDtLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={s.dtWel} disabled={s.isDtLocked} onCheckedChange={(c: boolean) => s.setDtWel(!!c)} />
              <span dir="ltr" className="text-[11px] font-mono">W-EL (1)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={s.dtPel} disabled={s.isDtLocked} onCheckedChange={(c: boolean) => s.setDtPel(!!c)} />
              <span dir="ltr" className="text-[11px] font-mono">P-EL (1)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={s.dtFree} disabled={s.isDtLocked} onCheckedChange={(c: boolean) => s.setDtFree(!!c)} />
              <span className="text-[11px] font-mono text-muted-foreground">
                {language === 'ar' ? 'مجاني (0)' : 'Free (0)'}
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={s.dtSrel} disabled={s.isDtLocked} onCheckedChange={(c: boolean) => s.setDtSrel(!!c)} />
              <span dir="ltr" className="text-[11px] font-mono text-muted-foreground">SR-EL (0)</span>
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (platformId === 'shutterstock') {
    return (
      <div className="pt-2 border-t border-border/70 space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-mono">{t.shutterstockOptions}</span>
          {s.isShutterLocked ? (
            <button
              type="button"
              onClick={onUnlockShutter}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Lock className="w-2.5 h-2.5" />
              <span>{t.customizeOptions}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (s.setIsShutterLocked) s.setIsShutterLocked(true);
                  localStorage.setItem('stock_shutter_locked', JSON.stringify(true));
                }}
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline cursor-pointer"
              >
                <Unlock className="w-2.5 h-2.5" />
                <span>{t.lockDefaults}</span>
              </button>
              <button
                type="button"
                onClick={s.resetShutterOptions}
                className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                {t.resetSafeDefaults}
              </button>
            </div>
          )}
        </div>

        <div className={`space-y-1.5 ${s.isShutterLocked ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={s.shutterIllustration}
                disabled={s.isShutterLocked}
                onCheckedChange={(c: boolean) => s.setShutterIllustration(!!c)}
              />
              <span className="text-[11px]">{t.illustrationClipArt}</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={s.shutterEditorial}
                disabled={s.isShutterLocked}
                onCheckedChange={(c: boolean) => s.setShutterEditorial(!!c)}
              />
              <span className="text-[11px]">{t.editorialContent}</span>
            </label>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={s.shutterMature}
              disabled={s.isShutterLocked}
              onCheckedChange={(c: boolean) => s.setShutterMature(!!c)}
            />
            <span className="text-[11px] text-muted-foreground">{t.matureContent}</span>
          </label>
        </div>
      </div>
    );
  }

  if (platformId === '123rf') {
    return (
      <div className="pt-2 border-t border-border/70 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground shrink-0 text-[11px]">{t.countryCode}</span>
        <div className="w-36">
          <CountryCombobox value={s.rfCountry} onChange={s.setRfCountry} placeholder={t.selectCountry} />
        </div>
      </div>
    );
  }

  return null;
});

PlatformConfigSection.displayName = 'PlatformConfigSection';
