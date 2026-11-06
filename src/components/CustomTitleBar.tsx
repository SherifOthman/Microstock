import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { AppLogo } from './icons/AppLogo';
import { Tooltip } from './ui/tooltip';

export const CustomTitleBar: React.FC = () => {
  const [isMax, setIsMax] = useState(false);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.isMaximized) return;

    let mounted = true;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const checkState = async () => {
      if (!mounted || (typeof document !== 'undefined' && document.hidden)) return;
      try {
        const max = await window.electronAPI!.isMaximized();
        if (mounted) setIsMax(max);
      } catch {
        // ignore
      }
    };

    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkState, 150);
    };

    checkState();
    window.addEventListener('resize', handleResize);
    return () => {
      mounted = false;
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, [isElectron]);

  if (!isElectron) return null;

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow();
    setIsMax((prev) => !prev);
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  return (
    <div
      dir="ltr"
      className="h-8 w-full bg-card text-foreground select-none flex items-center justify-between border-b border-border z-50 text-xs"
      style={{ WebkitAppRegion: 'drag', direction: 'ltr' } as React.CSSProperties}
    >
      {/* Left: App Icon & Standardized StockFlow Wordmark */}
      <div className="flex items-center gap-2 px-3">
        <AppLogo size={16} className="shrink-0" />
        <span className="font-semibold text-foreground tracking-tight text-[11px]">
          StockFlow
        </span>
      </div>

      {/* Right: Window Control Action Buttons */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip content="Minimize" side="bottom">
          <button
            type="button"
            onClick={handleMinimize}
            aria-label="Minimize window"
            className="h-8 px-3.5 flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        <Tooltip content={isMax ? 'Restore' : 'Maximize'} side="bottom">
          <button
            type="button"
            onClick={handleMaximize}
            aria-label={isMax ? 'Restore window' : 'Maximize window'}
            className="h-8 px-3.5 flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            {isMax ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
          </button>
        </Tooltip>

        <Tooltip content="Close" side="bottom">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close window"
            className="h-8 px-3.5 flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
