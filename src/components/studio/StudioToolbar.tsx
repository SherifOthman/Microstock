import React from 'react';
import {
  Search,
  X,
  LayoutGrid,
  List,
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
  cardViewMode: 'compact' | 'detailed';
  onViewModeChange: (mode: 'compact' | 'detailed') => void;
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
  cardViewMode,
  onViewModeChange,
  totalAssetsCount,
  completedCount,
  pendingCount,
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
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-card rounded-xl border border-border">
      {/* Left: Search & View Toggle */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={activeT.searchInStudio || 'Search filename, title, keyword...'}
            className="ps-8 pe-7 h-8 text-xs bg-background/50"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted/40 shrink-0">
          <Button
            size="sm"
            variant={cardViewMode === 'compact' ? 'default' : 'ghost'}
            className="h-7 px-2 text-xs gap-1 cursor-pointer"
            onClick={() => onViewModeChange('compact')}
            title="Compact Rows View"
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Compact</span>
          </Button>
          <Button
            size="sm"
            variant={cardViewMode === 'detailed' ? 'default' : 'ghost'}
            className="h-7 px-2 text-xs gap-1 cursor-pointer"
            onClick={() => onViewModeChange('detailed')}
            title="Detailed Studio Cards"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Detailed</span>
          </Button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end min-w-0">
        {/* Start Generation Button */}
        {isRunning || isPaused || !hasHealthyKeys || brandNewPendingCount === 0 ? (
          <Tooltip
            content={
              isRunning
                ? (language === 'ar' ? 'المعالجة جارية حالياً' : 'Queue processing is currently active')
                : isPaused
                ? (language === 'ar' ? 'المعالجة متوقفة مؤقتاً' : 'Queue is paused')
                : !hasHealthyKeys
                ? (activeT.noActiveKeysTooltip || 'Add at least one active API key to start generating metadata')
                : (language === 'ar' ? 'لا توجد وسائط جديدة غير مولدة' : 'No new unqueued media to generate')
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
                className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center opacity-40 cursor-not-allowed bg-secondary text-muted-foreground border border-border"
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
            className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-500 text-white shadow-md ring-2 ring-blue-500/20 cursor-pointer animate-pulse"
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

        {/* Pause & Resume */}
        {isRunning && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onPauseQueue}
            className="gap-1.5 text-xs w-full sm:w-auto justify-center cursor-pointer shadow-xs"
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
            className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center bg-amber-600 hover:bg-amber-500 text-white shadow-md cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{activeT.resume || 'Resume'}</span>
          </Button>
        )}

        {/* Retry Failed */}
        {failedCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isRunning}
            onClick={onRetryFailed}
            className={`gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center shadow-sm ${
              isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-95'
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>
              {language === 'ar' ? `إعادة محاولة ${failedCount} فاشلة` : `Retry ${failedCount} Failed`}
            </span>
          </Button>
        )}

        {/* Global Regenerate All */}
        {completedCount > 0 && !isPaused && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRunning || !hasHealthyKeys}
            onClick={onRegenerateAll}
            className={`gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center transition-all ${
              isRunning || !hasHealthyKeys
                ? 'opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800'
                : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 shadow-2xs'
            }`}
            title={
              language === 'ar'
                ? 'إعادة توليد الميتاداتا لجميع العناصر المكتملة'
                : 'Regenerate metadata for all completed assets'
            }
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isRunning ? 'animate-spin' : ''}`} />
            <span className="truncate">
              {(activeT.regenerateAll || 'Regenerate All ({count})').replace('{count}', String(completedCount))}
            </span>
          </Button>
        )}

        {/* Export All CSVs (.ZIP): Strict Lockout when isRunning is true */}
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
          className={`gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center transition-all ${
            completedCount > 0 && brandNewPendingCount === 0 && failedCount === 0 && !isRunning
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md cursor-pointer ring-2 ring-emerald-500/20'
              : completedCount > 0 && !isRunning
              ? 'cursor-pointer border-zinc-300 dark:border-zinc-700 bg-white dark:bg-card hover:bg-zinc-50 dark:hover:bg-accent text-zinc-900 dark:text-zinc-100'
              : 'opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="truncate">
            {(activeT.exportCsvs || 'Export CSVs ({count})').replace('{count}', String(completedCount))}
          </span>
        </Button>

        {totalAssetsCount > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearAll}
            className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
            title={activeT.clearAll || 'Clear All'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
