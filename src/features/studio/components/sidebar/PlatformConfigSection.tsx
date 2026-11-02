import React, { useState } from 'react';
import { useLanguage } from '../../../../context/LanguageContext';
import { FREEPIK_BASE_MODELS } from '../../../../constants/metadataLimits';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Switch } from '../../../../components/ui/switch';
import { Input } from '../../../../components/ui/input';
import { Tooltip } from '../../../../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { Info, Lock, RotateCcw } from 'lucide-react';
import { CountryCombobox } from '../../../../components/ui/CountryCombobox';

interface PlatformConfigProps {
  platformId: string;
  settings: any;
  onUnlockDt?: () => void;
  onUnlockShutter?: () => void;
}

export const PlatformConfigSection: React.FC<PlatformConfigProps> = React.memo(({
  platformId,
  settings,
  onUnlockDt,
  onUnlockShutter,
}) => {
  const { t } = useLanguage();
  const [dtAdvancedOpen, setDtAdvancedOpen] = useState(false);
  const [shutterAdvancedOpen, setShutterAdvancedOpen] = useState(false);

  if (platformId === 'vecteezy') {
    return (
      <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground font-medium">{t.license}:</span>
            <Tooltip content="Pro (Default) or Free license column for Vecteezy contributors.">
              <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
            </Tooltip>
          </div>
          <div className="w-28">
            <Select value={settings.vecLicense} onValueChange={(val) => settings.setVecLicense(val as 'pro' | 'free')}>
              <SelectTrigger className="h-7 text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                <SelectItem value="pro" className="text-xs">{t.proDefault}</SelectItem>
                <SelectItem value="free" className="text-xs">{t.freeLicense}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground font-mono">
          Direct Web Upload Parity (No Hydration Needed)
        </div>
      </div>
    );
  }

  if (platformId === 'freepik') {
    return (
      <div className="p-2.5 ms-3 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-foreground font-medium">{t.aiGenerated}</span>
            <Tooltip content="Check if your files are AI generated (Freepik requires Prompt & Base Model).">
              <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
            </Tooltip>
          </div>
          <Switch
            checked={settings.freepikAiGenerated}
            onCheckedChange={settings.setFreepikAiGenerated}
            aria-label="Toggle Freepik AI Generated"
          />
        </div>
        {settings.freepikAiGenerated ? (
          <>
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground font-medium">{t.baseModel}:</span>
              </div>
              <div className="w-44 sm:w-48">
                <Select value={settings.freepikModel} onValueChange={settings.setFreepikModel}>
                  <SelectTrigger className="h-7 text-xs bg-card"><SelectValue placeholder="Base model" /></SelectTrigger>
                  <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                    {FREEPIK_BASE_MODELS.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {settings.freepikModel === 'Other' && (
              <Input
                placeholder="Enter custom model name..."
                value={settings.customFreepikModel}
                onChange={(e) => settings.setCustomFreepikModel(e.target.value)}
                className="h-7 text-xs"
              />
            )}
            <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground space-y-0.5">
              <p>• Max 49 keywords (Freepik appends _ai_generated)</p>
              <p>• Titles auto-cleansed (spaces instead of hyphens)</p>
              <p>• Prompt & Model included for AI compliance</p>
            </div>
          </>
        ) : (
          <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground space-y-0.5">
            <p className="text-foreground/90 font-medium">• {t.standardPhotoVector}</p>
            <p>• Prompt & Model columns left empty</p>
          </div>
        )}
      </div>
    );
  }

  if (platformId === 'dreamstime') {
    return (
      <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-foreground font-medium">{t.aiGenerated}</span>
          <Switch checked={settings.dtAiGenerated} onCheckedChange={settings.setDtAiGenerated} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-medium">{t.editorial}</span>
          <Switch checked={settings.dtEditorial} onCheckedChange={settings.setDtEditorial} />
        </div>
        <div className="pt-1.5 border-t border-border/50">
          <button
            type="button"
            onClick={() => setDtAdvancedOpen(!dtAdvancedOpen)}
            className="flex items-center justify-between w-full text-[11px] text-muted-foreground hover:text-foreground cursor-pointer py-1"
          >
            <span className="font-semibold text-foreground/80">{t.advancedLicensing}</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {dtAdvancedOpen ? '▲' : '▼ (W-EL & P-EL)'}
            </span>
          </button>
          {dtAdvancedOpen && (
            <div className="space-y-2 pt-1.5 pl-1 animate-in fade-in-50 duration-150">
              <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-border/40">
                {settings.isDtLocked ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onUnlockDt}
                    className="h-6 px-2 text-[10px] gap-1 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                  >
                    <Lock className="w-2.5 h-2.5" />
                    <span>{t.unlockToEdit}</span>
                  </Button>
                ) : (
                  <Badge variant="outline" className="h-5 px-1.5 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono">
                    Unlocked
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={settings.resetDtLicensing}
                  className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>{t.resetToDefaults}</span>
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{t.welExtended}</span>
                <Switch checked={settings.dtWel} onCheckedChange={settings.setDtWel} disabled={settings.isDtLocked} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{t.pelExtended}</span>
                <Switch checked={settings.dtPel} onCheckedChange={settings.setDtPel} disabled={settings.isDtLocked} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{t.freeImages}</span>
                <Switch checked={settings.dtFree} onCheckedChange={settings.setDtFree} disabled={settings.isDtLocked} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{t.srelTransfers}</span>
                <Switch checked={settings.dtSrel} onCheckedChange={settings.setDtSrel} disabled={settings.isDtLocked} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (platformId === 'shutterstock') {
    return (
      <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
        <button
          type="button"
          onClick={() => setShutterAdvancedOpen(!shutterAdvancedOpen)}
          className="flex items-center justify-between w-full text-[11px] text-muted-foreground hover:text-foreground cursor-pointer py-1"
        >
          <span className="font-semibold text-foreground/80">{t.shutterstockAdvanced}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {shutterAdvancedOpen ? '▲' : '▼ (no / no / no)'}
          </span>
        </button>
        {shutterAdvancedOpen && (
          <div className="space-y-2 pt-1.5 pl-1 animate-in fade-in-50 duration-150 border-t border-border/40 mt-1">
            <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-border/40">
              {settings.isShutterLocked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onUnlockShutter}
                  className="h-6 px-2 text-[10px] gap-1 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                >
                  <Lock className="w-2.5 h-2.5" />
                  <span>{t.unlockToEdit}</span>
                </Button>
              ) : (
                <Badge variant="outline" className="h-5 px-1.5 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono">
                  Unlocked
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={settings.resetShutterOptions}
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>{t.resetToDefaults}</span>
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{t.editorial}</span>
              <Switch checked={settings.shutterEditorial} onCheckedChange={settings.setShutterEditorial} disabled={settings.isShutterLocked} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{t.matureContent}</span>
              <Switch checked={settings.shutterMature} onCheckedChange={settings.setShutterMature} disabled={settings.isShutterLocked} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{t.illustration}</span>
              <Switch checked={settings.shutterIllustration} onCheckedChange={settings.setShutterIllustration} disabled={settings.isShutterLocked} />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (platformId === '123rf') {
    return (
      <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground font-medium shrink-0">{t.rfCountry}:</span>
          <div className="flex-1 max-w-[200px]">
            <CountryCombobox
              value={settings.rfCountry}
              onChange={settings.setRfCountry}
              placeholder="--Country--"
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
});

PlatformConfigSection.displayName = 'PlatformConfigSection';
