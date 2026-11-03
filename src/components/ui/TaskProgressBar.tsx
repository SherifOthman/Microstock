import React, { useEffect, useState } from 'react';
import { Button } from './button';
import { Loader2, CheckCircle2, PauseCircle, RotateCcw, Clock, AlertCircle } from 'lucide-react';

export interface TaskProgressBarProps {
  status: 'idle' | 'running' | 'resizing' | 'completed' | 'paused' | 'error';
  currentCount: number;
  totalCount: number;
  title?: string;
  statusLabel?: string;
  elapsedSeconds?: number;
  activeWorkers?: number;
  failedCount?: number;
  onRetryFailed?: () => void;
  language?: 'ar' | 'en' | string;
  className?: string;
}

export const TaskProgressBar: React.FC<TaskProgressBarProps> = ({
  status,
  currentCount,
  totalCount,
  title,
  statusLabel,
  elapsedSeconds: initialElapsedSeconds,
  activeWorkers,
  failedCount = 0,
  onRetryFailed,
  language,
  className = '',
}) => {
  const [timerSeconds, setTimerSeconds] = useState(initialElapsedSeconds || 0);

  const resolvedLang =
    language === 'ar' || (typeof document !== 'undefined' && document.documentElement.lang === 'ar')
      ? 'ar'
      : 'en';
  const isAr = resolvedLang === 'ar';

  const isRunning = status === 'running' || status === 'resizing';

  // Local auto-incrementing stopwatch if no external elapsedSeconds is managed
  useEffect(() => {
    if (typeof initialElapsedSeconds === 'number') {
      setTimerSeconds(initialElapsedSeconds);
      return;
    }

    if (!isRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, initialElapsedSeconds]);

  if (totalCount === 0 || (status === 'idle' && currentCount === 0 && failedCount === 0)) {
    return null;
  }

  const progressPercent = Math.min(100, Math.max(0, Math.round((currentCount / totalCount) * 100)));

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const getDefaultStatusLabel = () => {
    if (status === 'running') return isAr ? 'جاري المعالجة...' : 'Processing...';
    if (status === 'resizing') return isAr ? 'جاري الفحص والتجهيز...' : 'Preparing Previews...';
    if (status === 'paused') return isAr ? 'المعالجة متوقفة مؤقتاً' : 'Paused';
    if (status === 'error') return isAr ? 'حدث خطأ في المعالجة' : 'Processing Error';
    if (currentCount >= totalCount) return isAr ? 'اكتملت المعالجة بنجاح' : 'Complete';
    return isAr ? 'جاهز للمعالجة' : 'Ready';
  };

  const label = statusLabel || title || getDefaultStatusLabel();

  return (
    <div className={`p-3 bg-card rounded-xl border border-border space-y-2 shrink-0 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
          ) : status === 'paused' ? (
            <PauseCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : status === 'error' && failedCount > 0 ? (
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}

          <span className="font-semibold text-foreground">{label}</span>

          <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
            {isAr
              ? `تم ${currentCount}/${totalCount}`
              : `${currentCount}/${totalCount} completed`}
          </span>

          {typeof activeWorkers === 'number' && activeWorkers > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-primary">
              {isAr ? `· ${activeWorkers} نشط` : `· ${activeWorkers} active`}
            </span>
          )}

          {failedCount > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-destructive font-semibold">
              {isAr ? `· ${failedCount} متعثر` : `· ${failedCount} failed`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {failedCount > 0 && onRetryFailed && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isRunning}
              onClick={onRetryFailed}
              className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{isAr ? 'إعادة المحاولة' : 'Retry Failed'}</span>
            </Button>
          )}

          <div
            dir="ltr"
            className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-muted-foreground"
          >
            <Clock className="w-3 h-3" />
            <span>{formatTime(timerSeconds)}</span>
            <span className="text-foreground font-semibold">({progressPercent}%)</span>
          </div>
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            status === 'error' && failedCount === totalCount
              ? 'bg-destructive'
              : currentCount >= totalCount
              ? 'bg-emerald-500'
              : 'bg-primary'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};
