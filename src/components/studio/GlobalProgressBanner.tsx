import React, { useEffect, useState } from 'react';
import { batchQueueService, QueueState } from '../../services/queue/BatchQueueService';
import { Button } from '../ui/button';
import { Loader2, CheckCircle2, PauseCircle, RotateCcw, Clock } from 'lucide-react';

interface GlobalProgressBannerProps {
  queueState: QueueState;
  showProgressBar: boolean;
  isRunning?: boolean;
  onRetryFailed?: () => void;
  language?: 'ar' | 'en';
}

export const GlobalProgressBanner: React.FC<GlobalProgressBannerProps> = ({
  queueState,
  showProgressBar,
  isRunning = false,
  onRetryFailed,
  language,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(queueState.elapsedSeconds || 0);

  const resolvedLang: 'ar' | 'en' =
    language ||
    (typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en');
  const isAr = resolvedLang === 'ar';

  useEffect(() => {
    setElapsedSeconds(queueState.elapsedSeconds || 0);
  }, [queueState.elapsedSeconds]);

  useEffect(() => {
    return batchQueueService.subscribeTimer((secs) => {
      setElapsedSeconds(secs);
    });
  }, []);

  if (!showProgressBar || queueState.totalCount === 0) return null;

  const isResizing = queueState.status === 'resizing';
  const preparedCount = isResizing
    ? queueState.items.filter((i) => i.status !== 'resizing').length
    : queueState.processedCount;

  const progressPercent = Math.min(
    100,
    Math.round(
      ((isResizing ? preparedCount : queueState.processedCount + queueState.failedCount) /
        queueState.totalCount) *
        100
    )
  );

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const getStatusLabel = () => {
    if (isResizing) {
      return isAr ? 'جاري تجهيز المعاينات...' : 'Preparing Previews...';
    }
    if (queueState.status === 'running') {
      return isAr ? 'جاري معالجة الدفعة...' : 'Processing Batch...';
    }
    if (queueState.status === 'paused') {
      return isAr ? 'المعالجة متوقفة مؤقتاً' : 'Queue Paused';
    }
    if (queueState.processedCount === 0 && queueState.failedCount === 0) {
      return isAr ? 'جاهز للتوليد' : 'Ready to Generate';
    }
    return isAr ? 'اكتملت الدفعة' : 'Batch Complete';
  };

  return (
    <div className="p-3 bg-card rounded-xl border border-border space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {queueState.status === 'running' || isResizing ? (
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
          ) : queueState.status === 'paused' ? (
            <PauseCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}

          <span className="font-semibold text-foreground">{getStatusLabel()}</span>

          <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
            {isResizing
              ? isAr
                ? `تم تجهيز ${preparedCount}/${queueState.totalCount}`
                : `${preparedCount}/${queueState.totalCount} prepared`
              : isAr
              ? `اكتمل ${queueState.processedCount}/${queueState.totalCount}`
              : `${queueState.processedCount}/${queueState.totalCount} completed`}
          </span>

          {queueState.activeWorkers > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-primary">
              {isAr ? `· ${queueState.activeWorkers} نشط` : `· ${queueState.activeWorkers} active`}
            </span>
          )}

          {queueState.failedCount > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-destructive font-semibold">
              {isAr ? `· ${queueState.failedCount} فشل` : `· ${queueState.failedCount} failed`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {queueState.failedCount > 0 && onRetryFailed && (
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
            <span>{formatTime(elapsedSeconds)}</span>
            <span className="text-foreground font-semibold">({progressPercent}%)</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};
