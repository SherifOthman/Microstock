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
  ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { getLocalAiConfig, saveLocalAiConfig } from '../../../db';
import { localAiAdapter, LocalConnectionTestResult } from '../../../services/providers/localAi';
import { LocalAiConfig } from '../../../types';

export const LocalAiSettingsPanel: React.FC = () => {
  const { language } = useLanguage();
  const [config, setConfig] = useState<LocalAiConfig>({
    baseUrl: 'http://127.0.0.1:1234/v1',
    modelId: 'default',
    timeoutSeconds: 300,
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
        setConfig(saved);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
    <div className="space-y-4">
      {/* Top Telemetry & Status Bar */}
      <div className="p-3.5 rounded-xl border border-border bg-secondary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
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
                ? 'واجهة OpenAI REST متوافقة تماماً تعمل محلياً على جهازك دون اتصال سحابي.'
                : 'Fully OpenAI-compatible REST server running privately on your local GPU/CPU.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <Button
            size="sm"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="gap-1.5 text-xs font-semibold cursor-pointer"
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

      {/* Main Configuration Card */}
      <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-4">
        {/* Base URL Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <span>{language === 'ar' ? 'عنوان الخادم (Base URL)' : 'Server Base URL'}</span>
              <Tooltip
                content={
                  language === 'ar'
                    ? 'العنوان الافتراضي لـ LM Studio Local Server هو http://127.0.0.1:1234/v1'
                    : 'Default endpoint for LM Studio Local Server is http://127.0.0.1:1234/v1'
                }
              >
                <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
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
                {language === 'ar' ? 'استعادة الافتراضي' : 'Reset to 127.0.0.1:1234'}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Input
              dir="ltr"
              value={config.baseUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="http://127.0.0.1:1234/v1"
              className="font-mono text-xs h-9 bg-background"
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
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span>{language === 'ar' ? 'معرّف النموذج (Model ID)' : 'Model Identifier'}</span>
            </label>
            {detectedModels.length > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {detectedModels.length} {language === 'ar' ? 'نماذج مكتشفة' : 'models detected'}
              </span>
            )}
          </div>

          {detectedModels.length > 0 ? (
            <Select
              value={config.modelId}
              onValueChange={(val) => handleModelChange(val)}
            >
              <SelectTrigger className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-mono text-foreground">
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
              placeholder="e.g. lfm-3-vl-2b, qwen2.5-vl-7b-instruct, or default"
              className="font-mono text-xs h-9 bg-background"
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            {language === 'ar'
              ? 'اتركه على "default" أو اسم النموذج المحمّل حالياً في LM Studio.'
              : 'Set to "default" or the model identifier currently loaded in LM Studio.'}
          </p>
        </div>

        {/* Timeout Seconds */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span>{language === 'ar' ? 'مهلة المعالجة لكل صورة (ثانية)' : 'Inference Timeout (Seconds)'}</span>
          </label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              dir="ltr"
              min={15}
              max={600}
              value={config.timeoutSeconds || 300}
              onChange={(e) => handleTimeoutChange(parseInt(e.target.value, 10) || 300)}
              className="font-mono text-xs h-9 w-28 bg-background"
            />
            <span className="text-[11px] text-muted-foreground">
              {language === 'ar'
                ? 'المهلة الافتراضية 300 ثانية (5 دقائق) موصى بها لمعالجة CPU المحلية دون إجهاض.'
                : 'Default 300s (5 min) recommended for local CPU inference to prevent premature aborts.'}
            </span>
          </div>
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
          <div className="text-[11px] text-muted-foreground border-t border-destructive/20 pt-2 space-y-1">
            <p className="font-medium text-foreground">
              {language === 'ar' ? 'خطوات التحقق السريعة:' : 'Quick Troubleshooting Checklist:'}
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>{language === 'ar' ? 'تأكد من فتح تطبيق LM Studio.' : 'Make sure LM Studio is open.'}</li>
              <li>
                {language === 'ar'
                  ? 'انتقل إلى تبويب "Local Server" (أيقونة <-> على اليسار).'
                  : 'Navigate to the "Developer / Local Server" tab (<-> icon on the left).'}
              </li>
              <li>
                {language === 'ar'
                  ? 'اضغط على زر "Start Server" وتأكد من أن المنفذ هو 1234.'
                  : 'Click "Start Server" and verify the port is 1234.'}
              </li>
              <li>
                {language === 'ar'
                  ? 'تأكد من تحميل نموذج رؤية متعدد الوسائط (مثل LFM3-VL أو Qwen2.5-VL).'
                  : 'Ensure a Vision model (such as LFM3-VL-2B or Qwen-VL) is loaded in memory.'}
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Success Diagnostic Box */}
      {testResult && testResult.success && (
        <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {language === 'ar'
                ? `الاتصال ناجح (${testResult.latencyMs}ms)`
                : `Connected Successfully (${testResult.latencyMs}ms latency)`}
            </span>
          </div>
          {testResult.detectedModels.length > 0 && (
            <p className="text-[11px] font-mono">
              {language === 'ar' ? 'النماذج المتاحة:' : 'Available Models:'}{' '}
              {testResult.detectedModels.join(', ')}
            </p>
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
            ? 'عند تفعيل الخادم المحلي، يتم إيقاف جميع مفاتيح السحابة تماماً ولن يتم إرسال أي صور أو بيانات إلى الإنترنت. لا توجد حدود RPM أو حصص يومية.'
            : 'When Local AI Server is active, all Cloud KeyRing keys are completely bypassed. Zero images or metadata leave your local machine. No rate limits or daily quotas apply.'}
        </div>
      </div>
    </div>
  );
};
