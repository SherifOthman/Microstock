import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
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
  Cpu,
  Layers,
  Sliders,
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
  const isAr = language === 'ar';
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
    localAiAdapter.setConnectionStatus('untested');
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1200);
  };

  const handleModelChange = async (newModel: string) => {
    const updated = { ...config, modelId: newModel };
    setConfig(updated);
    await saveLocalAiConfig(updated);
  };

  const handleProfileChange = async (profile: LocalHardwareProfile) => {
    const updated = { ...config, hardwareProfile: profile };
    setConfig(updated);
    await saveLocalAiConfig(updated);
  };

  const handleTimeoutChange = async (seconds: number) => {
    const sanitized = Math.max(15, Math.min(600, seconds));
    const updated = { ...config, timeoutSeconds: sanitized };
    setConfig(updated);
    await saveLocalAiConfig(updated);
  };

  const handleResetDefaultUrl = async () => {
    const defaultUrl = 'http://127.0.0.1:1234/v1';
    const updated = { ...config, baseUrl: defaultUrl };
    setConfig(updated);
    await saveLocalAiConfig(updated);
    localAiAdapter.setConnectionStatus('untested');
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
      {/* Top Status & Test Bar */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900 dark:text-foreground">
                {isAr ? 'خادم LM Studio المحلي' : 'LM Studio Local Server'}
              </span>
              {testResult?.success ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isAr ? 'متصل' : 'Connected'} ({testResult.latencyMs}ms)
                </span>
              ) : testResult && !testResult.success ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-destructive font-semibold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {isAr ? 'غير متصل' : 'Offline'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-muted-foreground font-medium">
                  <Activity className="w-3.5 h-3.5" />
                  {isAr ? 'جاهز للاختبار' : 'Ready'}
                </span>
              )}
            </div>
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
                ? isAr ? 'جارٍ الاتصال...' : 'Testing...'
                : isAr ? 'اختبار الاتصال' : 'Test Connection'}
            </span>
          </Button>
        </div>
      </div>

      {/* Main Configuration Card (Strictly 4 Clean Controls) */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-xs space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* 1. Server URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 dark:text-foreground">
                {isAr ? 'عنوان الخادم (Server URL)' : 'Server URL'}
              </label>
              {config.baseUrl !== 'http://127.0.0.1:1234/v1' && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={handleResetDefaultUrl}
                  className="h-auto p-0 text-[10px] text-primary hover:underline font-mono cursor-pointer"
                >
                  {isAr ? 'استعادة الافتراضي' : 'Reset'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Input
                dir="ltr"
                value={config.baseUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="http://127.0.0.1:1234/v1"
                className="font-mono text-xs h-8.5 w-full bg-slate-50 dark:bg-background border-slate-200 dark:border-input focus:bg-white"
              />
              {saveSuccess && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono shrink-0">
                  {isAr ? 'تم الحفظ' : 'Saved'}
                </span>
              )}
            </div>
          </div>

          {/* 2. Model Identifier */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 dark:text-foreground flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{isAr ? 'معرّف النموذج (Model ID)' : 'Model Identifier'}</span>
              </label>
              {detectedModels.length > 0 && (
                <span className="text-[10px] font-mono text-slate-500 dark:text-muted-foreground shrink-0">
                  {detectedModels.length} {isAr ? 'مكتشف' : 'detected'}
                </span>
              )}
            </div>

            {detectedModels.length > 0 ? (
              <Select
                value={config.modelId}
                onValueChange={(val) => handleModelChange(val)}
              >
                <SelectTrigger className="w-full h-8.5 rounded-lg border border-slate-200 dark:border-input bg-slate-50 dark:bg-background px-3 py-1 text-xs font-mono text-foreground focus:bg-white">
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default / Loaded Model</SelectItem>
                  {detectedModels.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono text-xs">
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
                placeholder="default (or loaded model)"
                className="font-mono text-xs h-8.5 w-full bg-slate-50 dark:bg-background border-slate-200 dark:border-input focus:bg-white"
              />
            )}
          </div>

          {/* 3. Hardware Profile */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 dark:text-foreground flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{isAr ? 'ملف تعريف العتاد' : 'Hardware Profile'}</span>
              </label>
            </div>
            <Select
              value={config.hardwareProfile || 'auto'}
              onValueChange={(val: LocalHardwareProfile) => handleProfileChange(val)}
            >
              <SelectTrigger className="w-full h-8.5 rounded-lg border border-slate-200 dark:border-input bg-slate-50 dark:bg-background px-3 py-1 text-xs font-mono text-foreground focus:bg-white">
                <SelectValue placeholder="Select hardware profile..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {isAr
                    ? `تلقائي (${isDedicatedTier ? 'Dedicated GPU' : 'Integrated GPU'})`
                    : `Auto-Detect (${isDedicatedTier ? 'Dedicated GPU' : 'Integrated GPU'})`}
                </SelectItem>
                <SelectItem value="integrated">
                  {isAr ? 'وضع الكفاءة (Integrated GPU)' : 'Integrated GPU (Efficiency)'}
                </SelectItem>
                <SelectItem value="dedicated">
                  {isAr ? 'أداء عالي (Dedicated GPU)' : 'Dedicated GPU (High-Spec)'}
                </SelectItem>
              </SelectContent>
            </Select>
            <p
              data-testid="detected-gpu-subtitle"
              className="text-[10px] text-slate-500 dark:text-muted-foreground font-mono truncate"
              dir="ltr"
            >
              Detected: {cleanGpuName}
            </p>
          </div>

          {/* 4. Inference Timeout */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-800 dark:text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>{isAr ? 'مهلة المعالجة (ثوانٍ)' : 'Inference Timeout (Seconds)'}</span>
            </label>
            <Input
              type="number"
              dir="ltr"
              min={15}
              max={600}
              value={config.timeoutSeconds || 300}
              onChange={(e) => handleTimeoutChange(parseInt(e.target.value, 10) || 300)}
              className="font-mono text-xs h-8.5 w-full bg-slate-50 dark:bg-background border-slate-200 dark:border-input focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* Diagnostic Message (Only when test is performed) */}
      {testResult && !testResult.success && (
        <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'فشل الاتصال بالخادم المحلي' : 'Local Connection Failed'}</span>
          </div>
          <p className="font-mono text-[11px]">{testResult.error}</p>
        </div>
      )}

      {testResult && testResult.success && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {isAr
                ? `تم الاتصال بنجاح (${testResult.latencyMs}ms)`
                : `Connected Successfully (${testResult.latencyMs}ms)`}
            </span>
          </div>
          {testResult.detectedModels.length > 0 && (
            <span className="text-[11px] font-mono truncate" dir="ltr">
              {testResult.detectedModels.join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
