import React from 'react';
import { db, useSqliteQuery, getAppSettings } from '../../db';
import { AppLogo } from '../../components/icons/AppLogo';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { PLATFORMS_CONFIG } from '../../constants/platforms';
import { Button } from '../../components/ui/button';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  FileSpreadsheet,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { TrackerAnalyticsCharts } from '../tracker/TrackerAnalyticsCharts';

export interface HomeHubViewProps {
  onNavigate?: (tool: 'tracker' | 'studio' | 'cleaner' | 'muter' | 'eps' | 'ftp') => void;
  onOpenKeyRing?: () => void;
  onOpenTemplates?: () => void;
}

/**
 * Clean StockFlow System Status & Workflow Overview
 */
export const HomeHubView: React.FC<HomeHubViewProps> = ({
  onNavigate,
  onOpenKeyRing,
  onOpenTemplates,
}) => {
  const { language } = useLanguage();

  const masterRecords = useSqliteQuery(() => db.masterRecords.toArray(), [], []) || [];
  const masterCount = masterRecords.length;
  const trackerStats = useSqliteQuery(() => db.tracker.getStats(), [masterCount], undefined);
  const keys = useSqliteQuery(() => db.apiKeys.toArray(), [], []) || [];
  const appSettings = useSqliteQuery(() => getAppSettings(), [], null);

  const isLocalAi = appSettings?.aiExecutionMode === 'local';
  const localModelName = appSettings?.localAiConfig?.modelId?.trim() || 'LM Studio (Local VLM)';
  const healthyKeys = keys.filter((k) => k.status === 'healthy');
  const totalRpm = healthyKeys.reduce((acc, k) => acc + (k.rpmLimit || 15), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-3.5">
      {/* Compact Top Status Bar */}
      <div className="px-4 py-3 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AppLogo size={32} className="shrink-0" />
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-semibold tracking-tight text-foreground">
              StockFlow
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary border border-border text-muted-foreground">
              v2.4 Desktop
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenKeyRing && (
            <Button variant="outline" size="sm" onClick={onOpenKeyRing} className="h-8 text-xs gap-1.5 cursor-pointer">
              {isLocalAi ? <Cpu className="w-3.5 h-3.5 text-primary" /> : <KeyRound className="w-3.5 h-3.5 text-primary" />}
              <span>{language === 'ar' ? 'إعدادات الذكاء والمفاتيح' : 'AI & API Keys'}</span>
            </Button>
          )}
          {onOpenTemplates && (
            <Button variant="outline" size="sm" onClick={onOpenTemplates} className="h-8 text-xs gap-1.5 cursor-pointer">
              <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
              <span>{language === 'ar' ? 'قوالب CSV' : 'CSV Templates'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Live Local Environment Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{language === 'ar' ? 'سجلات الاستوديو المحفوظة' : 'Indexed Studio Assets'}</span>
            <Database className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums text-foreground">
            {masterCount}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {language === 'ar' ? 'مخزنة محلياً في SQLite' : 'Persisted locally in SQLite (WAL)'}
          </p>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {isLocalAi
                ? language === 'ar' ? 'محرك الذكاء المحلي' : 'Local AI Engine'
                : language === 'ar' ? 'مفاتيح API النشطة' : 'Cloud KeyRing Capacity'}
            </span>
            {isLocalAi ? <Cpu className="w-3.5 h-3.5 text-primary" /> : <Activity className="w-3.5 h-3.5 text-primary" />}
          </div>
          {isLocalAi ? (
            <>
              <div dir="ltr" className="text-sm font-semibold font-mono text-foreground truncate text-start pt-0.5">
                {localModelName}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {language === 'ar' ? 'طابور تسلسلي (1 تلو الآخر) · 45+ كلمة' : 'Strict 1-by-1 queue · 45+ keywords'}
              </p>
            </>
          ) : (
            <>
              <div dir="ltr" className="text-lg font-semibold font-mono tabular-nums text-foreground text-start">
                {healthyKeys.length}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  / {keys.length} {language === 'ar' ? 'مفتاح' : 'keys'} ({totalRpm} RPM)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {language === 'ar' ? 'تشفير محلي وتبديل تلقائي عند 429' : 'DPAPI encrypted · 429 auto-failover'}
              </p>
            </>
          )}
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{language === 'ar' ? 'حالة محرك سطح المكتب' : 'Native Desktop Bridge'}</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-sm font-semibold text-foreground flex items-center gap-1.5 pt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>{language === 'ar' ? 'متصل (نظام الملفات + Ghostscript)' : 'Online (FS + Ghostscript Pool)'}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {language === 'ar' ? 'معالجة محلية بالكامل 100%' : '100% local file system execution'}
          </p>
        </div>
      </div>

      {/* Master Brain: Microstock Distribution Tracker Banner */}
      <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-foreground">
                {language === 'ar'
                  ? 'متتبع التوزيع المركزي (Master Vault)'
                  : 'Microstock Distribution Tracker (Master Brain)'}
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-semibold">
                {language === 'ar' ? 'نسخ احتياطي فوري (WAL)' : 'Event-Driven Hot Backup'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {language === 'ar'
                ? 'استيراد ذري آمن (نسخ فقط)، منع التكرار بـ SHA-256، سلات تصدير (Pending Upload)، وتتبع الحالة عبر 6 وكالات.'
                : 'Copy-only atomic ingestion, SHA-256 deduplication, Export Baskets (Pending Upload), and 6-agency lifecycle reconciliation.'}
            </p>
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => onNavigate?.('tracker')}
          className="h-8 text-xs gap-1.5 cursor-pointer shrink-0"
        >
          <Database className="w-3.5 h-3.5" />
          <span>{language === 'ar' ? 'فتح متتبع التوزيع' : 'Open Distribution Tracker'}</span>
        </Button>
      </div>

      {/* Live 6-Agency Distribution & Portfolio Analytics Charts */}
      <TrackerAnalyticsCharts
        records={masterRecords}
        stats={trackerStats}
        onSelectAgency={() => onNavigate?.('tracker')}
        onSelectStatusFilter={() => onNavigate?.('tracker')}
      />

      {/* Recommended Production Pipeline Sequence */}
      <div className="p-3.5 rounded-xl border border-border bg-card space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-foreground">
            {language === 'ar' ? 'مسار العمل القياسي' : 'Production Pipeline'}
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {language === 'ar' ? 'اضغط للانتقال السريع' : 'Click any step to open'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <button
            type="button"
            onClick={() => onNavigate?.('cleaner')}
            className="p-3 rounded-lg bg-secondary/40 hover:bg-secondary/80 border border-border space-y-1 text-start transition cursor-pointer"
          >
            <span className="text-[10px] font-mono font-bold text-primary block">STEP 01</span>
            <p className="font-semibold text-foreground">
              {language === 'ar' ? '1. منظم الملفات' : '1. File Cleaner'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {language === 'ar'
                ? 'فصل دفعات الأصلي (Real) عن AI وترقيم مجلدات B01.'
                : 'Isolate Real vs AI batches and route into B01 folders.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('eps')}
            className="p-3 rounded-lg bg-secondary/40 hover:bg-secondary/80 border border-border space-y-1 text-start transition cursor-pointer"
          >
            <span className="text-[10px] font-mono font-bold text-primary block">STEP 02</span>
            <p className="font-semibold text-foreground">
              {language === 'ar' ? '2. محرك EPS / الصوت' : '2. EPS / Audio Prep'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {language === 'ar'
                ? 'توليد معاينات JPG بدقة 300 DPI أو كتم صوت الفيديوهات.'
                : 'Render 300 DPI JPG previews or strip video audio.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('studio')}
            className="p-3 rounded-lg bg-secondary/40 hover:bg-secondary/80 border border-border space-y-1 text-start transition cursor-pointer"
          >
            <span className="text-[10px] font-mono font-bold text-primary block">STEP 03</span>
            <p className="font-semibold text-foreground">
              {language === 'ar' ? '3. استوديو Metadata' : '3. Metadata Studio'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {language === 'ar'
                ? 'توليد العناوين والوصف و 45+ كلمة مفتاحية مرتبة.'
                : 'Generate titles, descriptions, and 45+ ranked keywords.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onOpenTemplates ? onOpenTemplates() : onNavigate?.('studio')}
            className="p-3 rounded-lg bg-secondary/40 hover:bg-secondary/80 border border-border space-y-1 text-start transition cursor-pointer"
          >
            <span className="text-[10px] font-mono font-bold text-primary block">STEP 04</span>
            <p className="font-semibold text-foreground">
              {language === 'ar' ? '4. تصدير CSV' : '4. Agency CSV Export'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {language === 'ar'
                ? 'تصدير ملفات CSV مطابقة للمنصات الست بضغطة واحدة.'
                : 'Export compliant CSVs for all 6 stock agencies.'}
            </p>
          </button>
        </div>
      </div>

      {/* Supported Stock Agencies Bar */}
      <div className="p-3.5 rounded-xl border border-border bg-card space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-foreground">
            {language === 'ar' ? 'منصات التصدير المدعومة (CSV)' : 'Supported Stock Agencies'}
          </h2>
          <span dir="ltr" className="text-[11px] font-mono text-muted-foreground">
            UTF-8 (No BOM) · Auto-Split
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {Object.values(PLATFORMS_CONFIG).map((p: any) => (
            <button
              key={p.id}
              type="button"
              onClick={onOpenTemplates}
              className="p-2 rounded-lg border border-border bg-secondary/40 hover:bg-secondary/80 flex items-center gap-2 min-w-0 transition cursor-pointer text-start"
            >
              <span className="shrink-0">{getPlatformLogo(p.id, 16)}</span>
              <div className="min-w-0">
                <span className="text-xs font-medium text-foreground truncate block">{p.name}</span>
                <span dir="ltr" className="text-[10px] font-mono text-muted-foreground truncate block">
                  {p.id === 'dreamstime' ? 'images / videos' : p.filenameSuffix}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

