import React from 'react';
import { QueueState } from '../../../services/queue/BatchQueueService';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  StopCircle,
  Trash2,
} from 'lucide-react';

interface Props {
  queueState: QueueState;
  isAiGenerated: boolean;
  onToggleAiGenerated: (val: boolean) => void;
  aiModelName: string;
  onChangeAiModelName: (val: string) => void;
  userPrompt: string;
  onChangeUserPrompt: (val: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onClear: () => void;
  onRetryFailed: () => void;
}

export const BatchControls: React.FC<Props> = ({
  queueState,
  isAiGenerated,
  onToggleAiGenerated,
  aiModelName,
  onChangeAiModelName,
  userPrompt,
  onChangeUserPrompt,
  onStart,
  onPause,
  onResume,
  onStop,
  onClear,
  onRetryFailed,
}) => {
  const isRunning = queueState.status === 'running';
  const isPaused = queueState.status === 'paused';
  const hasItems = queueState.totalCount > 0;
  const hasFailed = queueState.failedCount > 0;
  const isCompleted = queueState.status === 'completed';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card rounded-xl border border-border">
      {/* Primary Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isRunning && !isPaused && (
          <Button
            size="sm"
            onClick={onStart}
            disabled={!hasItems || isCompleted}
            className="gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Start Vision ({queueState.totalCount})
          </Button>
        )}

        {isRunning && (
          <Button size="sm" variant="secondary" onClick={onPause} className="gap-1.5">
            <Pause className="w-3.5 h-3.5" />
            Pause
          </Button>
        )}

        {isPaused && (
          <Button size="sm" onClick={onResume} className="gap-1.5">
            <Play className="w-3.5 h-3.5 fill-current" />
            Resume
          </Button>
        )}

        {(isRunning || isPaused) && (
          <Button size="sm" variant="outline" onClick={onStop} className="gap-1.5">
            <StopCircle className="w-3.5 h-3.5 text-destructive" />
            Stop
          </Button>
        )}

        {hasFailed && !isRunning && (
          <Button size="sm" variant="destructive" onClick={onRetryFailed} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            Retry Failed ({queueState.failedCount})
          </Button>
        )}

        {hasItems && !isRunning && (
          <Button size="sm" variant="ghost" onClick={onClear} className="gap-1.5 text-muted-foreground">
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Options & AI Toggle */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAiGenerated}
            onChange={(e) => onToggleAiGenerated(e.target.checked)}
            disabled={isRunning}
            className="rounded border-border text-primary focus:ring-ring"
          />
          <span className="flex items-center gap-1 text-foreground">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            AI Asset
          </span>
        </label>

        {isAiGenerated && (
          <Input
            value={aiModelName}
            onChange={(e) => onChangeAiModelName(e.target.value)}
            disabled={isRunning}
            placeholder="Model (e.g. Midjourney v6)"
            className="h-7 w-36 text-[11px] font-mono"
            title="Model tag for Freepik CSV"
          />
        )}
      </div>
    </div>
  );
};
