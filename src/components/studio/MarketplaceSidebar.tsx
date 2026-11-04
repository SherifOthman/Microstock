import React, { useState } from 'react';
import { useSqliteQuery, getAiExecutionMode } from '../../db';
import { SupportedPlatform } from '../../types';
import { PLATFORMS_CONFIG } from '../../constants/platforms';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip } from '../../components/ui/tooltip';
import {
  Check,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  FileText,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
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

const PLATFORM_LIMIT_SUMMARY: Record<string, { en: string; ar: string }> = {
  adobe: { en: '199c · 25 tags (SEO)', ar: '199 حرف · 25 كلمة (SEO)' },
  shutterstock: { en: '200c · 50 tags', ar: '200 حرف · 50 كلمة' },
  freepik: { en: '100c · 50 tags', ar: '100 حرف · 50 كلمة' },
  vecteezy: { en: '199c · 49 tags', ar: '199 حرف · 49 كلمة' },
  dreamstime: { en: '70c · Dual CSV', ar: '70 حرف · ملفان CSV' },
  '123rf': { en: '200c · 50 tags', ar: '200 حرف · 50 كلمة' },
};

export const MarketplaceSidebar: React.FC<MarketplaceSidebarProps> = (props) => {
  const { t, language } = useLanguage();
  const aiMode = useSqliteQuery(() => getAiExecutionMode(), [], "cloud");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('stock_studio_inspector_collapsed') === 'true';
  });

  const toggleDesktopCollapse = () => {
    setIsDesktopCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('stock_studio_inspector_collapsed', String(next));
      return next;
    });
  };

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
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
            ({selectedPlatforms.length}/6)
          </span>
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

      {/* Collapsed Desktop Inspector Strip */}
      {isDesktopCollapsed && (
        <aside className="hidden lg:flex flex-col items-center gap-2 p-2 bg-card rounded-xl border border-border shrink-0 h-full">
          <Tooltip content={language === 'ar' ? 'توسيع إعدادات المنصات' : 'Expand Inspector'} side={language === 'ar' ? 'left' : 'right'}>
            <button
              type="button"
              onClick={toggleDesktopCollapse}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4 rtl:rotate-180" />
            </button>
          </Tooltip>
          <div className="w-6 border-t border-border" />
          <div className="flex flex-col items-center gap-1.5">
            {Object.values(PLATFORMS_CONFIG).map((p: any) => {
              const isSelected = selectedPlatforms.includes(p.id);
              return (
                <Tooltip
                  key={p.id}
                  content={`${p.name} (${
                    isSelected
                      ? language === 'ar'
                        ? 'مفعّل'
                        : 'Active'
                      : language === 'ar'
                      ? 'متوقف'
                      : 'Off'
                  })`}
                  side={language === 'ar' ? 'left' : 'right'}
                >
                  <button
                    type="button"
                    onClick={() => onTogglePlatform(p.id)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border transition cursor-pointer ${
                      isSelected
                        ? 'bg-secondary border-primary/50 opacity-100'
                        : 'border-transparent opacity-40 hover:opacity-80'
                    }`}
                  >
                    {getPlatformLogo(p.id, 18)}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </aside>
      )}

      {/* Main Inspector Sidebar */}
      <aside
        className={`w-full lg:w-72 shrink-0 space-y-3 lg:h-full lg:overflow-y-auto lg:pe-1 ${
          isMobileOpen ? 'block' : isDesktopCollapsed ? 'hidden' : 'hidden lg:block'
        }`}
      >
        {/* Target Agencies Panel */}
        <div className="p-3 bg-card rounded-xl border border-border space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="font-semibold text-xs text-foreground">{t.marketplaces}</span>
            <div className="flex items-center gap-1.5">
              <span dir="ltr" className="text-[11px] text-muted-foreground font-mono tabular-nums">
                {selectedPlatforms.length}/6
              </span>
              <Tooltip content={language === 'ar' ? 'طي اللوحة' : 'Collapse Inspector'} side={language === 'ar' ? 'right' : 'left'}>
                <button
                  type="button"
                  onClick={toggleDesktopCollapse}
                  className="hidden lg:flex w-6 h-6 rounded-md items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer"
                >
                  <PanelLeftClose className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="space-y-1.5">
            {Object.values(PLATFORMS_CONFIG).map((p: any) => {
              const isSelected = selectedPlatforms.includes(p.id);
              const limitObj = PLATFORM_LIMIT_SUMMARY[p.id];
              const limitText = limitObj ? (language === 'ar' ? limitObj.ar : limitObj.en) : '';
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border transition-colors ${
                    isSelected
                      ? 'border-border bg-secondary/50'
                      : 'border-transparent hover:bg-secondary/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onTogglePlatform(p.id)}
                    className="w-full px-2.5 py-2 text-start flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`shrink-0 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-55'}`}>
                        {getPlatformLogo(p.id, 18)}
                      </div>
                      <div className="min-w-0">
                        <div className={`text-xs truncate ${isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                          {p.name}
                        </div>
                        <div
                          dir={language === 'ar' ? 'rtl' : 'ltr'}
                          className="text-[10px] font-mono text-muted-foreground/80 tabular-nums text-start"
                        >
                          {limitText}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition shrink-0 ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border bg-background'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>

                  {isSelected && (
                    <div className="px-2.5 pb-2.5">
                      <PlatformConfigSection
                        platformId={p.id}
                        settings={s}
                        onUnlockDt={props.onUnlockDt}
                        onUnlockShutter={props.onUnlockShutter}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Context Hint (No AI buzzword in header) */}
        <div className="p-3 bg-card rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-xs text-foreground">{t.aiContextHint}</span>
            </div>
            {s.userCustomPrompt && (
              <button
                type="button"
                onClick={() => s.setUserCustomPrompt('')}
                className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {t.clear}
              </button>
            )}
          </div>
          <Textarea
            rows={2}
            value={s.userCustomPrompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => s.setUserCustomPrompt(e.target.value)}
            placeholder={t.contextHintPlaceholder}
            className="text-xs bg-secondary/60 border border-border text-foreground resize-none w-full text-start"
          />
        </div>

        {/* API KeyRing & CSV Specs Footer */}
        <div className="p-3 bg-card rounded-xl border border-border space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-foreground block">{t.apiKeysWidget}</span>
              <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                {aiMode === 'local'
                  ? (language === 'ar' ? 'خادم محلي (LM Studio)' : 'Local AI (LM Studio)')
                  : props.healthyKeysCount > 0
                  ? t.readyRpm
                      .replace('{count}', String(props.healthyKeysCount))
                      .replace('{rpm}', String(props.combinedRpm))
                  : t.noActiveKeys}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={props.onOpenKeyRing} className="h-7 text-xs font-semibold cursor-pointer">
              {t.manageKeys}
            </Button>
          </div>

          <div className="pt-2 border-t border-border">
            <button
              type="button"
              onClick={props.onOpenTemplates}
              className="w-full py-1.5 px-2 rounded-md text-start text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-between gap-2 cursor-pointer transition"
            >
              <span className="flex items-center gap-2 truncate">
                <BookOpen className="w-3.5 h-3.5 shrink-0 text-primary" />
                <span className="truncate">{t.csvSpecsSamples}</span>
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
