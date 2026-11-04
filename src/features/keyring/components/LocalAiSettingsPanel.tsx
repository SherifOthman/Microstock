import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Server,
  Activity,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  Cpu,
  Layers,
  HelpCircle,
  Sliders,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { getLocalAiConfig, saveLocalAiConfig } from '../../../db';
import {
  localAiAdapter,
  LocalConnectionTestResult,
  resolveHardwareProfileSpec,
  sanitizeGpuRendererString,
} from '../../../services/providers/localAi';
import { LocalAiConfig, LocalHardwareProfile } from '../../../types';

export const LocalAiSettingsPanel: React.FC = () => {
  const { language } = useLanguage();
  const [config, setConfig] = useState<LocalAiConfig>({
    baseUrl: 'http://127.0.0.1:1234/v1',
    modelId: 'default',
    timeoutSeconds: 300,
    hardwareProfile: 'auto',
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<LocalConnectionTestResult | null>(null);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = await getLocalAiConfig();
      if (mounted) {
        setConfig({
          ...saved,
          hardwareProfile: saved.hardwareProfile || 'auto',
        });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const resolvedProfile = resolveHardwareProfileSpec(config.hardwareProfile || 'auto');
  const isDedicatedTier = resolvedProfile.effectiveTier === 'dedicated';
  const cleanGpuName = sanitizeGpuRendererString(resolvedProfile.detectedGpuName);

  const handleUrlChange = async (newUrl: string) => {
    const updated = { ...config, baseUrl: newUrl };
    setConfig(updated);
    await saveLocalAiConfig(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1200);
  };

  const handleModelChange = async (newModel: string) => {
    const updated = { ...config, modelId: newModel };
    setConfig(updated);
    await saveLocalAiConfig(updated);
  };

  const handleTimeoutChange = async (seconds: number) => {
    const updated = { ...config, timeoutSeconds: seconds };
    setConfig(updated);
    await saveLocalAiConfig(updated);
  };

  const handleHardwareProfileChange = async (profile: LocalHardwareProfile) => {
    const updated = { ...config, hardwareProfile: profile };
    setConfig(updated);
    await saveLocalAiConfig(updated);
  };

  const handleResetDefaultUrl = async () => {
    const updated = { ...config, baseUrl: 'http://127.0.0.1:1234/v1' };
    setConfig(updated);
    await saveLocalAiConfig(updated);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await localAiAdapter.testConnection(config.baseUrl, config.modelId);
      setTestResult(result);
      if (result.success && result.detectedModels.length > 0) {
        setDetectedModels(result.detectedModels);
        if (config.modelId === 'default' && result.activeModel) {
          handleModelChange(result.activeModel);
        }
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        detectedModels: [],
        error: err.message || 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Top Telemetry & Status Bar */}
      <div className="p-3.5 rounded-xl border border-border bg-secondary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-foreground">
                {language === 'ar' ? 'خادم LM Studio المحلي' : 'LM Studio Local Server'}
              </span>
              {testResult?.success ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-500 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'متصل' : 'Connected'} ({testResult.latencyMs}ms)
                </span>
              ) : testResult && !testResult.success ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-destructive font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'غير متصل' : 'Offline'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                  <Activity className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'جاهز للاختبار' : 'Ready'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {language === 'ar'
                ? 'طابور تسلسلي (1 تلو الآخر) · 4 مجموعات كلمات مفتاحية (45–49 كلمة) + استكمال نصي سريع.'
                : 'Strict 1-by-1 queue · 4-bucket keyword schema (45–49 tags) + fast text-only top-up.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <Button
            size="sm"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="h-8 gap-1.5 text-xs font-semibold cursor-pointer"
          >
            {isTesting ? (
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Activity className="w-3.5 h-3.5" />
            )}
            <span>
              {isTesting
                ? language === 'ar'
                  ? 'جارٍ الاتصال...'
                  : 'Testing...'
                : language === 'ar'
                ? 'اختبار الاتصال'
                : 'Test Connection'}
            </span>
          </Button>
        </div>
      </div>

      {/* Main Configuration Card (Strict 2x2 Aligned Grid) */}
      <div className="p-3.5 rounded-xl border border-border bg-secondary/20 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Base URL Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between h-4.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5 truncate">
                <span>{language === 'ar' ? 'عنوان الخادم (Base URL)' : 'Server Base URL'}</span>
                <Tooltip
                  content={
                    language === 'ar'
                      ? 'العنوان الافتراضي لـ LM Studio Local Server هو http://127.0.0.1:1234/v1'
                      : 'Default endpoint for LM Studio Local Server is http://127.0.0.1:1234/v1'
                  }
                >
                  <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help shrink-0" />
                </Tooltip>
              </label>

              {config.baseUrl !== 'http://127.0.0.1:1234/v1' && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={handleResetDefaultUrl}
                  className="h-auto p-0 text-[10px] text-primary hover:underline font-mono cursor-pointer"
                >
                  {language === 'ar' ? 'استعادة الافتراضي' : 'Reset'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Input
                dir="ltr"
                value={config.baseUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="http://127.0.0.1:1234/v1"
                className="font-mono text-xs h-8.5 w-full bg-background"
              />
              {saveSuccess && (
                <span className="text-[11px] text-emerald-500 font-mono shrink-0">
                  {language === 'ar' ? 'تم الحفظ' : 'Saved'}
                </span>
              )}
            </div>
          </div>

          {/* Model ID / Detected Model */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between h-4.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5 truncate">
                <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{language === 'ar' ? 'معرّف النموذج (Model ID)' : 'Model Identifier'}</span>
              </label>
              {detectedModels.length > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {detectedModels.length} {language === 'ar' ? 'نماذج مكتشفة' : 'detected'}
                </span>
              )}
            </div>

            {detectedModels.length > 0 ? (
              <Select
                value={config.modelId}
                onValueChange={(val) => handleModelChange(val)}
              >
                <SelectTrigger className="w-full h-8.5 rounded-md border border-input bg-background px-3 py-1 text-xs font-mono text-foreground">
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default / Loaded Model</SelectItem>
                  {detectedModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                dir="ltr"
                value={config.modelId}
                onChange={(e) => handleModelChange(e.target.value)}
                placeholder="e.g. lfm3-vl-2b or default"
                className="font-mono text-xs h-8.5 w-full bg-background"
              />
            )}
          </div>
        </div>

        {/* Auto-Scaling Hardware Profile & Timeout Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-border/60">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between h-4.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5 truncate">
                <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{language === 'ar' ? 'ملف الأداء' : 'Hardware Profile'}</span>
              </label>
            </div>

            <Select
              value={config.hardwareProfile || 'auto'}
              onValueChange={(val) => handleHardwareProfileChange(val as LocalHardwareProfile)}
            >
              <SelectTrigger
                data-testid="local-hardware-profile-select"
                className="w-full h-8.5 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {language === 'ar'
                    ? `تلقائي (${isDedicatedTier ? 'كرت مستقل · 512px · 82% JPG' : 'كرت مدمج · 384px · 72% JPG'})`
                    : `Auto-Detect (${isDedicatedTier ? 'Dedicated GPU · 512px · 82% JPG' : 'Integrated GPU · 384px · 72% JPG'})`}
                </SelectItem>
                <SelectItem value="integrated">
                  {language === 'ar'
                    ? 'وضع الكفاءة (Integrated GPU — 384px · 72% JPG)'
                    : 'Integrated GPU (Efficiency Mode — 384px · 72% JPG)'}
                </SelectItem>
                <SelectItem value="dedicated">
                  {language === 'ar'
                    ? 'وضع الأداء العالي (Dedicated GPU — 512px · 82% JPG)'
                    : 'Dedicated GPU (High-Spec Mode — 512px · 82% JPG)'}
                </SelectItem>
              </SelectContent>
            </Select>
            <p
              data-testid="detected-gpu-subtitle"
              className="text-[10px] text-muted-foreground font-mono truncate"
              dir="ltr"
            >
              Detected: {cleanGpuName}
            </p>
          </div>

          {/* Timeout Seconds */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between h-4.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5 truncate">
                <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{language === 'ar' ? 'مهلة المعالجة (ثانية)' : 'Inference Timeout (Seconds)'}</span>
              </label>
            </div>
            <Input
              type="number"
              dir="ltr"
              min={15}
              max={600}
              value={config.timeoutSeconds || 300}
              onChange={(e) => handleTimeoutChange(parseInt(e.target.value, 10) || 300)}
              className="font-mono text-xs h-8.5 w-full bg-background"
            />
            <p className="text-[10px] text-muted-foreground truncate">
              {language === 'ar'
                ? 'القيمة الافتراضية 300 ثانية تمنع الإلغاء المبكر للمعالجة'
                : 'Default 300s prevents premature aborts'}
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic LM Studio Tuning Checklist */}
      <div
        data-testid="lfm3-tuning-checklist"
        className="p-3.5 rounded-xl border border-primary/25 bg-primary/5 space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              {language === 'ar'
                ? 'إعدادات LM Studio الموصى بها لنموذج LFM3-VL-2B'
                : 'LM Studio Optimal Setup Checklist (LFM3-VL-2B)'}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono bg-background border-primary/30 text-primary">
            {isDedicatedTier
              ? language === 'ar'
                ? 'وضع الأداء العالي (Dedicated GPU)'
                : 'High-Spec Mode (Dedicated GPU)'
              : language === 'ar'
              ? 'وضع الكفاءة (Integrated GPU)'
              : 'Efficiency Mode (Integrated GPU)'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
          <div className="p-2 rounded-lg bg-background/80 border border-border flex items-start gap-2">
            <Sliders className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground block" dir="ltr">
                {isDedicatedTier ? 'Context Length: 8192' : 'Context Length: 4096'}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {isDedicatedTier
                  ? language === 'ar'
                    ? 'تبويب Load — مساحة سياق موسعة لكروت الشاشة المستقلة'
                    : 'Load Tab — expanded context for dedicated VRAM'
                  : language === 'ar'
                  ? 'تبويب Load — يمنع امتلاء الذاكرة المشتركة'
                  : 'Load Tab — prevents shared RAM overflow'}
              </span>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-background/80 border border-border flex items-start gap-2">
            <Sliders className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground block" dir="ltr">
                {isDedicatedTier ? 'Eval Batch Size: 2048 (Fast Prefill)' : 'Eval Batch Size: 512'}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {isDedicatedTier
                  ? language === 'ar'
                    ? 'تبويب Load — أقصى سرعة لقراءة الصور'
                    : 'Load Tab — maximizes vision prefill speed'
                  : language === 'ar'
                  ? 'تبويب Load — يمنع تجمّد الكرت المدمج'
                  : 'Load Tab — smoother prefill on integrated GPUs'}
              </span>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-background/80 border border-border flex items-start gap-2">
            <Sliders className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground block" dir="ltr">
                {isDedicatedTier ? 'Parallel: 1-2' : 'Parallel: 1'}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {isDedicatedTier
                  ? language === 'ar'
                    ? 'تبويب Server — يدعم معالجة متوازية سريعة'
                    : 'Server Tab — supports high-throughput slots'
                  : language === 'ar'
                  ? 'تبويب Server — يوفر 75% من ذاكرة KV'
                  : 'Server Tab — saves 75% KV cache memory'}
              </span>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-background/80 border border-border flex items-start gap-2">
            <Sliders className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground block" dir="ltr">
                GPU Offload: Max (24)
              </span>
              <span className="text-muted-foreground text-[10px]">
                {language === 'ar' ? 'تبويب Load — تسريع كامل لجميع الطبقات' : 'Load Tab — offloads all 24 model layers'}
              </span>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-background/80 border border-border flex items-start gap-2">
            <Sliders className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground block" dir="ltr">
                Enable Thinking: OFF
              </span>
              <span className="text-muted-foreground text-[10px]">
                {language === 'ar' ? 'تبويب Inference — يمنع استهلاك التوكنز' : 'Inference Tab — skips reasoning delay'}
              </span>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-background/80 border border-border flex items-start gap-2">
            <Sliders className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground block" dir="ltr">
                Flash Attention: ON
              </span>
              <span className="text-muted-foreground text-[10px]">
                {language === 'ar' ? 'تبويب Load — يقلل استهلاك ذاكرة الفيديو' : 'Load Tab — reduces vision KV memory footprint'}
              </span>
            </div>
          </div>
        </div>

        {/* Specific Green Badge / Note for Auto-Injected StockFlow Parameters */}
        <div
          data-testid="auto-injected-sampling-note"
          className="px-2.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-[11px]"
        >
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>
              {language === 'ar'
                ? 'يتم حقن إعدادات التوليد تلقائياً بواسطة StockFlow في كل طلب:'
                : 'Injected automatically by StockFlow on every request:'}
            </span>
          </div>
          <Badge
            variant="outline"
            dir="ltr"
            className="text-[10px] font-mono bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          >
            Temperature: 0.1 · Repeat Penalty: 1.04
          </Badge>
        </div>
      </div>

      {/* Diagnostic / Error Message Box */}
      {testResult && !testResult.success && (
        <div className="p-3.5 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{language === 'ar' ? 'فشل الاتصال بالخادم المحلي' : 'Local Connection Failed'}</span>
          </div>
          <p className="font-mono text-[11px]">{testResult.error}</p>
        </div>
      )}

      {/* Success Diagnostic Box */}
      {testResult && testResult.success && (
        <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {language === 'ar'
                ? `الاتصال ناجح (${testResult.latencyMs}ms)`
                : `Connected Successfully (${testResult.latencyMs}ms latency)`}
            </span>
          </div>
          {testResult.detectedModels.length > 0 && (
            <span className="text-[11px] font-mono truncate" dir="ltr">
              {testResult.detectedModels.join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Strict Privacy & Isolation Notice */}
      <div className="p-3 rounded-xl border border-border bg-secondary/10 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">
            {language === 'ar' ? 'عزل كامل بنسبة 100%:' : '100% Strict Local Isolation:'}{' '}
          </span>
          {language === 'ar'
            ? 'عند تفعيل الخادم المحلي، يتم إيقاف جميع مفاتيح السحابة تماماً ولن يتم إرسال أي صور أو بيانات إلى الإنترنت.'
            : 'When Local AI Server is active, all Cloud KeyRing keys are completely bypassed. Zero images or metadata leave your local machine.'}
        </div>
      </div>
    </div>
  );
};

