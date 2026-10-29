import React from 'react';
import { QueueState } from '../../../services/queue/BatchQueueService';
import { Badge } from '../../../components/ui/badge';
import { Clock, Flame, Loader2, XCircle } from 'lucide-react';

interface Props {
  queueState: QueueState;
}

export const BatchProgressBar: React.FC<Props> = ({ queueState }) => {
  const { totalCount, processedCount, failedCount, activeWorkers, elapsedSeconds, status } = queueState;

  if (totalCount === 0) return null;

  const percent = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  // Calculate ETA
  let etaText = '--';
  if (processedCount > 0 && processedCount < totalCount) {
    const avgSec = elapsedSeconds / processedCount;
    const remaining = totalCount - processedCount;
    const etaSec = Math.round(remaining * avgSec);
    const m = Math.floor(etaSec / 60);
    const s = etaSec % 60;
    etaText = `${m}m ${s < 10 ? '0' : ''}${s}s`;
  } else if (processedCount === totalCount && totalCount > 0) {
    etaText = 'Done';
  }

  const elapsedM = Math.floor(elapsedSeconds / 60);
  const elapsedS = elapsedSeconds % 60;
  const elapsedText = `${elapsedM}:${elapsedS < 10 ? '0' : ''}${elapsedS}`;

  return (
    <div className="p-3 bg-card rounded-xl border border-border space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
          <span className="font-medium text-foreground">
            {percent}% ({processedCount}/{totalCount})
          </span>
          {failedCount > 0 && (
            <Badge variant="destructive" className="gap-1 py-0 text-[10px]">
              <XCircle className="w-2.5 h-2.5" /> {failedCount} failed
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 text-muted-foreground font-mono text-[11px]">
          {activeWorkers > 0 && (
            <Badge variant="secondary" className="gap-1 font-mono text-[10px] text-primary">
              <Flame className="w-2.5 h-2.5" /> {activeWorkers} active
            </Badge>
          )}
          <span>Elapsed: {elapsedText}</span>
          <span>ETA: {etaText}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden flex">
        <div
          className="bg-primary h-full transition-all duration-300 rounded-full"
          style={{ width: `${percent}%` }}
        />
        {failedCount > 0 && (
          <div
            className="bg-destructive h-full transition-all duration-300"
            style={{ width: `${(failedCount / totalCount) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
};
