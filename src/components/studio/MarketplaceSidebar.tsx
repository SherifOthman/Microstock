import React, { useState } from 'react';
import { SupportedPlatform } from '../../types';
import { PLATFORMS_CONFIG } from '../../constants/platforms';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip } from '../../components/ui/tooltip';
import {
  Info,
  Check,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { getPlatformLogo } from '../icons/StockLogos';
import { useStudioMarketplaceSettings } from '../../hooks/useStudioMarketplaceSettings';
import { PlatformConfigSection } from '../../features/studio/components/sidebar/PlatformConfigSection';

export interface MarketplaceSidebarProps {
  settings?: ReturnType<typeof useStudioMarketplaceSettings>;
  selectedPlatforms?: SupportedPlatform[];
  onTogglePlatform?: (pid: SupportedPlatform) => void;
  vecLicense?: 'pro' | 'free';
  setVecLicense?: (val: 'pro' | 'free') => void;
  freepikAiGenerated?: boolean;
  setFreepikAiGenerated?: (val: boolean) => void;
  freepikModel?: string;
  setFreepikModel?: (val: string) => void;
  customFreepikModel?: string;
  setCustomFreepikModel?: (val: string) => void;
  dtAiGenerated?: boolean;
  setDtAiGenerated?: (val: boolean) => void;
  dtEditorial?: boolean;
  setDtEditorial?: (val: boolean) => void;
  dtWel?: boolean;
  setDtWel?: (val: boolean) => void;
  dtPel?: boolean;
  setDtPel?: (val: boolean) => void;
  dtFree?: boolean;
  setDtFree?: (val: boolean) => void;
  dtSrel?: boolean;
  setDtSrel?: (val: boolean) => void;
  isDtLocked?: boolean;
  onUnlockDt?: () => void;
  onResetDt?: () => void;
  shutterEditorial?: boolean;
  setShutterEditorial?: (val: boolean) => void;
  shutterMature?: boolean;
  setShutterMature?: (val: boolean) => void;
  shutterIllustration?: boolean;
  setShutterIllustration?: (val: boolean) => void;
  isShutterLocked?: boolean;
  onUnlockShutter?: () => void;
  onResetShutter?: () => void;
  rfCountry?: string;
  setRfCountry?: (val: string) => void;
  userCustomPrompt?: string;
  setUserCustomPrompt?: (val: string) => void;
  healthyKeysCount: number;
  combinedRpm: number;
  onOpenKeyRing: () => void;
  onOpenTemplates: () => void;
}

export const MarketplaceSidebar: React.FC<MarketplaceSidebarProps> = (props) => {
  const { t, language } = useLanguage();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Normalize settings object from either direct settings prop or individual props
  const s = props.settings || {
    selectedPlatforms: props.selectedPlatforms || [],
    togglePlatform: props.onTogglePlatform || (() => {}),
    vecLicense: props.vecLicense || 'pro',
    setVecLicense: props.setVecLicense || (() => {}),
    freepikAiGenerated: props.freepikAiGenerated ?? true,
    setFreepikAiGenerated: props.setFreepikAiGenerated || (() => {}),
    freepikModel: props.freepikModel || 'Google Nano Banana',
    setFreepikModel: props.setFreepikModel || (() => {}),
    customFreepikModel: props.customFreepikModel || '',
    setCustomFreepikModel: props.setCustomFreepikModel || (() => {}),
    dtAiGenerated: props.dtAiGenerated ?? true,
    setDtAiGenerated: props.setDtAiGenerated || (() => {}),
    dtEditorial: props.dtEditorial ?? false,
    setDtEditorial: props.setDtEditorial || (() => {}),
    dtWel: props.dtWel ?? true,
    setDtWel: props.setDtWel || (() => {}),
    dtPel: props.dtPel ?? true,
    setDtPel: props.setDtPel || (() => {}),
    dtFree: props.dtFree ?? false,
    setDtFree: props.setDtFree || (() => {}),
    dtSrel: props.dtSrel ?? false,
    setDtSrel: props.setDtSrel || (() => {}),
    isDtLocked: props.isDtLocked ?? true,
    resetDtLicensing: props.onResetDt || (() => {}),
    shutterEditorial: props.shutterEditorial ?? false,
    setShutterEditorial: props.setShutterEditorial || (() => {}),
    shutterMature: props.shutterMature ?? false,
    setShutterMature: props.setShutterMature || (() => {}),
    shutterIllustration: props.shutterIllustration ?? false,
    setShutterIllustration: props.setShutterIllustration || (() => {}),
    isShutterLocked: props.isShutterLocked ?? true,
    resetShutterOptions: props.onResetShutter || (() => {}),
    rfCountry: props.rfCountry || 'US',
    setRfCountry: props.setRfCountry || (() => {}),
    userCustomPrompt: props.userCustomPrompt || '',
    setUserCustomPrompt: props.setUserCustomPrompt || (() => {}),
  };

  const selectedPlatforms = s.selectedPlatforms;
  const onTogglePlatform = s.togglePlatform;

  return (
    <>
      {/* Mobile Toggle Bar */}
      <div className="w-full lg:hidden flex items-center justify-between p-3 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-foreground" />
          <span className="font-semibold text-xs text-foreground">{t.marketplacesAndSettings}</span>
          <Badge variant="outline" className="text-[10px] py-0 font-mono">
            {(t.activeCount || '{count} active').replace('{count}', String(selectedPlatforms.length))}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="h-7 text-xs gap-1"
        >
          {isMobileOpen ? t.hide : t.configure}
          {isMobileOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Main Sidebar */}
      <aside
        className={`w-full lg:w-76 shrink-0 space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1 ${
          isMobileOpen ? 'block' : 'hidden lg:block'
        }`}
      >
        {/* Marketplaces Card */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs text-foreground">{t.marketplaces}</span>
              <Tooltip content="Choose target stock agencies. Data formats are automatically adapted on-the-fly.">
                <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
              </Tooltip>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">{selectedPlatforms.length}/6</span>
          </div>

          <div className="space-y-1.5">
            {Object.values(PLATFORMS_CONFIG).map((p: any) => {
              const isSelected = selectedPlatforms.includes(p.id);
              return (
                <div key={p.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => onTogglePlatform(p.id)}
                    className={`w-full p-2 rounded-lg border text-left transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-border bg-secondary/60 text-foreground font-medium'
                        : 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary/30'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="shrink-0">{getPlatformLogo(p.id, 18)}</div>
                      <span className="text-xs">{p.name}</span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                        isSelected ? 'bg-foreground text-background border-foreground' : 'border-border bg-card'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>

                  {/* Contextual Platform Options */}
                  {isSelected && (
                    <PlatformConfigSection
                      platformId={p.id}
                      settings={s}
                      onUnlockDt={props.onUnlockDt}
                      onUnlockShutter={props.onUnlockShutter}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Context Hint Prompt */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold text-xs text-foreground">
                {language === 'ar' ? 'توجيه إضافي للذكاء الاصطناعي' : 'AI Context Hint / Prompt'}
              </span>
            </div>
            {s.userCustomPrompt && (
              <button
                type="button"
                onClick={() => s.setUserCustomPrompt('')}
                className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {language === 'ar' ? 'مسح' : 'Clear'}
              </button>
            )}
          </div>
          <Textarea
            rows={2}
            value={s.userCustomPrompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => s.setUserCustomPrompt(e.target.value)}
            placeholder={t.contextHintPlaceholder || "e.g. '3D glass texture, minimalist, studio lighting'..."}
            className="text-xs bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 resize-none w-full shadow-2xs"
          />
          <p className="text-[10px] text-muted-foreground leading-normal">
            {language === 'ar'
              ? 'يُضاف هذا التوجيه تلقائياً إلى موجه التحليل البصري لجميع الملفات في هذه الجلسة.'
              : 'This hint is automatically appended to the vision prompt for all assets.'}
          </p>
        </div>

        {/* API Keys Status Widget */}
        <div className="p-3.5 bg-card rounded-xl border border-border flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground">{t.apiKeysWidget}</span>
            <p className="text-[11px] text-muted-foreground font-mono">
              {props.healthyKeysCount > 0
                ? (t.readyRpm || '{count} Ready ({rpm} RPM)').replace('{count}', String(props.healthyKeysCount)).replace('{rpm}', String(props.combinedRpm))
                : t.noActiveKeys}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={props.onOpenKeyRing} className="h-7 text-xs font-semibold">
            {t.manageKeys}
          </Button>
        </div>

        {/* Utilities Card */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-2 text-xs">
          <span className="font-semibold text-foreground block pb-1 border-b border-border">{t.utilities}</span>
          <button
            type="button"
            onClick={props.onOpenTemplates}
            className="w-full p-1.5 rounded-md text-left text-muted-foreground hover:text-foreground hover:bg-secondary/40 flex items-center gap-2 cursor-pointer transition"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t.csvSpecsSamples}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
