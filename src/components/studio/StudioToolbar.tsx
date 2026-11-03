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
  Loader2,
  Camera,
  Film,
  Layers,
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
  isResizing?: boolean;
  mediaTypeFilter?: 'all' | 'image' | 'video' | 'vector';
  onMediaTypeFilterChange?: (filter: 'all' | 'image' | 'video' | 'vector') => void;
  mediaTypeCounts?: { image: number; video: number; vector: number };
  distinctMediaTypesCount?: number;
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
  isResizing = false,
  mediaTypeFilter = 'all',
  onMediaTypeFilterChange,
  mediaTypeCounts,
  distinctMediaTypesCount = 0,
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
      {/* Left: Search Filter Input & Dynamic Media Type Filter */}
      <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-md">
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

        {/* Media Type Filter Pills (Appears ONLY when queue contains > 1 media type) */}
        {distinctMediaTypesCount > 1 && (
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-secondary/80 border border-border text-xs shrink-0">
            <button
              type="button"
              onClick={() => onMediaTypeFilterChange?.('all')}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                mediaTypeFilter === 'all'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{language === 'ar' ? 'الكل' : 'All'}</span>{' '}
              <span className="font-mono text-[10px] text-muted-foreground">({totalAssetsCount})</span>
            </button>

            {mediaTypeCounts && mediaTypeCounts.image > 0 && (
              <button
                type="button"
                onClick={() => onMediaTypeFilterChange?.('image')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                  mediaTypeFilter === 'image'
                    ? 'bg-background text-emerald-600 dark:text-emerald-400 shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Camera className="w-3 h-3" />
                <span>{language === 'ar' ? 'صور' : 'Photos'}</span>{' '}
                <span className="font-mono text-[10px] opacity-75">({mediaTypeCounts.image})</span>
              </button>
            )}

            {mediaTypeCounts && mediaTypeCounts.video > 0 && (
              <button
                type="button"
                onClick={() => onMediaTypeFilterChange?.('video')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                  mediaTypeFilter === 'video'
                    ? 'bg-background text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Film className="w-3 h-3" />
                <span>{language === 'ar' ? 'فيديو' : 'Videos'}</span>{' '}
                <span className="font-mono text-[10px] opacity-75">({mediaTypeCounts.video})</span>
              </button>
            )}

            {mediaTypeCounts && mediaTypeCounts.vector > 0 && (
              <button
                type="button"
                onClick={() => onMediaTypeFilterChange?.('vector')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                  mediaTypeFilter === 'vector'
                    ? 'bg-background text-violet-600 dark:text-violet-400 shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>{language === 'ar' ? 'فيكتور' : 'Vectors'}</span>{' '}
                <span className="font-mono text-[10px] opacity-75">({mediaTypeCounts.vector})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Queue & Batch Actions */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end min-w-0">
        {isResizing ? (
          <Tooltip
            content={
              language === 'ar'
                ? 'يرجى الانتظار حتى يكتمل تجهيز وفحص المعاينات لجميع الملفات قبل بدء التوليد'
                : 'Please wait for previews and resolutions to finish preparing before generating metadata'
            }
          >
            <div className="w-full sm:w-auto">
              <Button
                size="sm"
                disabled
                className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center opacity-65 cursor-not-allowed bg-secondary text-primary border border-border tabular-nums"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                <span className="truncate">
                  {language === 'ar' ? 'جاري تجهيز المعاينات...' : 'Preparing Previews...'}
                </span>
              </Button>
            </div>
          </Tooltip>
        ) : isRunning || isPaused || !hasHealthyKeys || brandNewPendingCount === 0 ? (
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
