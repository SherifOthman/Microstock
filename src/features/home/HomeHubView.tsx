import React from 'react';
import { db, useSqliteQuery } from '../../db';
import { AppLogo } from '../../components/icons/AppLogo';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { PLATFORMS_CONFIG } from '../../constants/platforms';
import { Button } from '../../components/ui/button';
import {
  Activity,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface HomeHubViewProps {
  onNavigate?: (tool: 'studio' | 'cleaner' | 'muter' | 'eps') => void;
  onOpenKeyRing?: () => void;
  onOpenTemplates?: () => void;
}

/**
 * Clean StockFlow Welcome & System Status Overview
 * Does NOT duplicate the Left App Rail navigation cards.
 */
export const HomeHubView: React.FC<HomeHubViewProps> = ({
  onOpenKeyRing,
  onOpenTemplates,
}) => {
  const { language } = useLanguage();

  const masterCount = useSqliteQuery(() => db.masterRecords.count(), [], 0) || 0;
  const keys = useSqliteQuery(() => db.apiKeys.toArray(), [], []) || [];
  const healthyKeys = keys.filter((k) => k.status === 'healthy');
  const totalRpm = healthyKeys.reduce((acc, k) => acc + (k.rpmLimit || 15), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5 py-2">
      {/* Welcome Hero Banner */}
      <div className="p-6 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          <AppLogo size={42} className="shrink-0" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                {language === 'ar' ? 'مرحباً بك في StockFlow' : 'Welcome to StockFlow'}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary border border-border text-muted-foreground">
                v2.4 Desktop
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
              {language === 'ar'
                ? 'استخدم القائمة الجانبية للتنقل بين أدوات تجهيز الملفات، تحويل الـ EPS، حذف صوت الفيديو، وتوليد الـ Metadata لمنصات الميكروستوك.'
                : 'Select a workspace from the left sidebar to sanitize batches, rasterize EPS vectors, strip audio tracks, or generate agency CSV metadata.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenKeyRing && (
            <Button variant="outline" size="sm" onClick={onOpenKeyRing} className="h-8 text-xs gap-1.5 cursor-pointer">
              <KeyRound className="w-3.5 h-3.5 text-primary" />
              <span>{language === 'ar' ? 'إدارة المفاتيح' : 'API Keys'}</span>
            </Button>
          )}
          {onOpenTemplates && (
            <Button variant="outline" size="sm" onClick={onOpenTemplates} className="h-8 text-xs gap-1.5 cursor-pointer">
              <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
              <span>{language === 'ar' ? 'مواصفات CSV' : 'CSV Specs'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Live Local Environment Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{language === 'ar' ? 'سجلات الاستوديو المحفوظة' : 'Indexed Studio Assets'}</span>
            <Database className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-foreground">
            {masterCount}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {language === 'ar' ? 'مخزنة محلياً في قاعدة بيانات SQLite' : 'Persisted locally in SQLite (WAL)'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{language === 'ar' ? 'مفاتيح API النشطة' : 'Active KeyRing Capacity'}</span>
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div dir="ltr" className="text-xl font-semibold font-mono tabular-nums text-foreground text-start">
            {healthyKeys.length}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              / {keys.length} {language === 'ar' ? 'مفتاح' : 'keys'} ({totalRpm} RPM)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {language === 'ar' ? 'تشفير محلي وتبديل تلقائي عند 429' : 'DPAPI encrypted with 429 auto-failover'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{language === 'ar' ? 'حالة محرك سطح المكتب' : 'Native Desktop Bridge'}</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-sm font-semibold text-foreground flex items-center gap-1.5 pt-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{language === 'ar' ? 'جاهز (Ghostscript + نظام الملفات)' : 'Online (FS + Ghostscript Pool)'}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {language === 'ar' ? 'معالجة محلية بالكامل 100%' : '100% local file system execution'}
          </p>
        </div>
      </div>

      {/* Supported Stock Agencies Bar */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-foreground">
            {language === 'ar' ? 'منصات التصدير المدعومة (CSV)' : 'Supported Stock Agencies'}
          </h2>
          <span dir="ltr" className="text-[11px] font-mono text-muted-foreground">
            RFC 4180 UTF-8
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          {Object.values(PLATFORMS_CONFIG).map((p: any) => (
            <div
              key={p.id}
              className="p-2.5 rounded-lg border border-border bg-secondary/40 flex items-center gap-2 min-w-0"
            >
              {getPlatformLogo(p.id, 18)}
              <span className="text-xs font-medium text-foreground truncate">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Production Pipeline Sequence */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <h2 className="text-xs font-semibold text-foreground">
          {language === 'ar' ? 'مسار العمل القياسي الموصى به' : 'Standard Production Workflow'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
            <span className="text-[10px] font-mono font-bold text-primary">STEP 01</span>
            <p className="font-semibold text-foreground">
              {language === 'ar' ? '1. منظم الملفات' : '1. File Cleaner'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {language === 'ar'
                ? 'تنظيف الأسماء وترقيم الدفعات وفحص الدقة.'
                : 'Sanitize names, check dimensions, and route into B01 folders.'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
            <span className="text-[10px] font-mono font-bold text-primary">STEP 02</span>
            <p className="font-semibold text-foreground">
              {language === 'ar' ? '2. محرك EPS / الصوت' : '2. EPS / Audio Prep'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {language === 'ar'
                ? 'توليد معاينات JPG للمتجهات أو كتم صوت الفيديوهات.'
                : 'Render 300 DPI JPG previews or strip audio tracks.'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
            <span className="text-[10px] font-mono font-bold text-primary">STEP 03</span>
            <p className="font-semibold text-foreground">
              {language === 'ar' ? '3. استوديو Metadata' : '3. Metadata Studio'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {language === 'ar'
                ? 'توليد العناوين والكلمات المفتاحية والتصنيفات.'
                : 'Auto-tag titles, descriptions, and ranked SEO keywords.'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
            <span className="text-[10px] font-mono font-bold text-primary">STEP 04</span>
            <p className="font-semibold text-foreground">
              {language === 'ar' ? '4. تصدير CSV' : '4. Agency CSV Export'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {language === 'ar'
                ? 'تصدير ملفات CSV مطابقة لكل وكالة بضغطة واحدة.'
                : 'Download compliant CSVs for all 6 stock agencies.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
