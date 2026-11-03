import React from 'react';
import {
  Search,
  X,
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  Download,
  Trash2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tooltip } from '../ui/tooltip';

interface StudioToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  cardViewMode?: 'compact' | 'detailed';
  onViewModeChange?: (mode: 'compact' | 'detailed') => void;
  totalAssetsCount: number;
  completedCount: number;
  pendingCount: number;
  brandNewPendingCount: number;
  failedCount: number;
  isRunning: boolean;
  isPaused: boolean;
  hasHealthyKeys: boolean;
  onStartQueue: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onRetryFailed: () => void;
  onRegenerateAll: () => void;
  onExportCsvs: () => void;
  onClearAll: () => void;
  onKeyAlertShake?: () => void;
  language?: 'ar' | 'en';
  t: Record<string, string>;
}

export const StudioToolbar: React.FC<StudioToolbarProps> = ({
  searchQuery,
  onSearchChange,
  totalAssetsCount,
  completedCount,
  brandNewPendingCount,
  failedCount,
  isRunning,
  isPaused,
  hasHealthyKeys,
  onStartQueue,
  onPauseQueue,
  onResumeQueue,
  onRetryFailed,
  onRegenerateAll,
  onExportCsvs,
  onClearAll,
  onKeyAlertShake,
  language = 'en',
  t = {},
}) => {
  const activeT = t || {};
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2.5 bg-card rounded-xl border border-border">
      {/* Left: Search Filter Input */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={activeT.searchInStudio || 'Filter by filename, title, or keyword...'}
            className="ps-8 pe-7 h-8 text-xs bg-background text-start"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Queue & Batch Actions */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end min-w-0">
        {isRunning || isPaused || !hasHealthyKeys || brandNewPendingCount === 0 ? (
          <Tooltip
            content={
              isRunning
                ? language === 'ar'
                  ? 'المعالجة جارية حالياً'
                  : 'Queue processing is active'
                : isPaused
                ? language === 'ar'
                  ? 'المعالجة متوقفة مؤقتاً'
                  : 'Queue is paused'
                : !hasHealthyKeys
                ? activeT.noActiveKeysTooltip || 'Add at least one active API key to generate metadata'
                : language === 'ar'
                ? 'لا توجد ملفات جديدة في الانتظار'
                : 'No new queued files'
            }
          >
            <div
              className="w-full sm:w-auto"
              onClick={() => {
                if (!isRunning && !hasHealthyKeys) onKeyAlertShake?.();
              }}
            >
              <Button
                size="sm"
                disabled
                className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center opacity-40 cursor-not-allowed bg-secondary text-muted-foreground border border-border tabular-nums"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="truncate">
                  {(activeT.startGeneration || 'Start Generation ({count})').replace(
                    '{count}',
                    String(brandNewPendingCount)
                  )}
                </span>
              </Button>
            </div>
          </Tooltip>
        ) : (
          <Button
            size="sm"
            onClick={onStartQueue}
            className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer tabular-nums"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="truncate">
              {(activeT.startGeneration || 'Start Generation ({count})').replace(
                '{count}',
                String(brandNewPendingCount)
              )}
            </span>
          </Button>
        )}

        {isRunning && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onPauseQueue}
            className="gap-1.5 text-xs w-full sm:w-auto justify-center cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>{activeT.pause || 'Pause'}</span>
          </Button>
        )}

        {isPaused && (
          <Button
            size="sm"
            variant="default"
            onClick={onResumeQueue}
            className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{activeT.resume || 'Resume'}</span>
          </Button>
        )}

        {failedCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isRunning}
            onClick={onRetryFailed}
            className={`gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center tabular-nums ${
              isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-95'
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>
              {language === 'ar' ? `إعادة محاولة (${failedCount})` : `Retry ${failedCount} Failed`}
            </span>
          </Button>
        )}

        {completedCount > 0 && !isPaused && (
          <Tooltip
            content={
              language === 'ar'
                ? 'إعادة توليد الـ Metadata لجميع العناصر المكتملة'
                : 'Regenerate metadata for all completed assets'
            }
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRunning || !hasHealthyKeys}
              onClick={onRegenerateAll}
              className={`gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center transition-all tabular-nums ${
                isRunning || !hasHealthyKeys
                  ? 'opacity-40 cursor-not-allowed border-border'
                  : 'cursor-pointer hover:bg-secondary text-foreground border-border'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isRunning ? 'animate-spin' : ''}`} />
              <span className="truncate">
                {(activeT.regenerateAll || 'Regenerate All ({count})').replace('{count}', String(completedCount))}
              </span>
            </Button>
          </Tooltip>
        )}

        <Button
          size="sm"
          variant={
            completedCount > 0 && brandNewPendingCount === 0 && failedCount === 0 && !isRunning
              ? 'default'
              : 'outline'
          }
          onClick={() => {
            if (isRunning) return;
            onExportCsvs();
          }}
          disabled={completedCount === 0 || isRunning}
          className={`gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center transition-all tabular-nums ${
            completedCount > 0 && brandNewPendingCount === 0 && failedCount === 0 && !isRunning
              ? 'bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer'
              : completedCount > 0 && !isRunning
              ? 'cursor-pointer border-border bg-card hover:bg-secondary text-foreground'
              : 'opacity-40 cursor-not-allowed border-border'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="truncate">
            {(activeT.exportCsvs || 'Export CSVs ({count})').replace('{count}', String(completedCount))}
          </span>
        </Button>

        {totalAssetsCount > 0 && (
          <Tooltip content={activeT.clearAll || 'Clear Workspace'}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClearAll}
              aria-label={activeT.clearAll || 'Clear All'}
              className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
