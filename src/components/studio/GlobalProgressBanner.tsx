import React from 'react';
import { QueueState } from '../../services/queue/BatchQueueService';
import { Loader2, Check, RotateCcw } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

interface GlobalProgressBannerProps {
  queueState: QueueState;
  showProgressBar: boolean;
  isRunning: boolean;
  onRetryFailed?: () => void;
}

export const GlobalProgressBanner: React.FC<GlobalProgressBannerProps> = ({
  queueState,
  showProgressBar,
  isRunning,
  onRetryFailed,
}) => {
  if (queueState.totalCount === 0 || !showProgressBar) {
    return null;
  }

  const rawPercent = queueState.totalCount > 0
    ? (queueState.processedCount / queueState.totalCount) * 100
    : 0;
  const clampedPercent = Math.min(100, Math.max(0, rawPercent));
  const displayPercent = Math.round(clampedPercent);

  return (
    <div className="p-3 bg-card rounded-xl border border-border space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground" />}
          {queueState.status === 'completed' && <Check className="w-3.5 h-3.5 text-foreground" />}
          <span className="font-medium text-foreground">
            Processing: {queueState.processedCount}/{queueState.totalCount} completed ({displayPercent}%)
          </span>
          {queueState.failedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Badge variant="destructive" className="py-0 text-[10px]">
                {queueState.failedCount} failed
              </Badge>
              {onRetryFailed && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onRetryFailed}
                  className="h-6 text-[10px] px-2 gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Retry Failed
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          {queueState.activeWorkers > 0 && (
            <span>
              {queueState.activeWorkers} active {queueState.activeWorkers === 1 ? 'worker' : 'workers'}
            </span>
          )}
          {queueState.elapsedSeconds > 0 && (
            <span>
              {Math.floor(queueState.elapsedSeconds / 60)}:
              {String(queueState.elapsedSeconds % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>
      <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-300 rounded-full"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
};
