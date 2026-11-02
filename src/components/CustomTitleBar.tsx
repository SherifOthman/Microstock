import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { AppLogo } from './icons/AppLogo';

export const CustomTitleBar: React.FC = () => {
  const [isMax, setIsMax] = useState(false);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.isMaximized) return;

    let mounted = true;
    const checkState = async () => {
      try {
        const max = await window.electronAPI!.isMaximized();
        if (mounted) setIsMax(max);
      } catch {
        // ignore
      }
    };

    checkState();
    const interval = setInterval(checkState, 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
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
      className="h-9 w-full bg-zinc-950 text-zinc-300 select-none flex items-center justify-between border-b border-zinc-800/80 z-50 text-xs ltr"
      style={{ WebkitAppRegion: 'drag', direction: 'ltr' } as React.CSSProperties}
    >
      {/* Left: App Logo & Title */}
      <div className="flex items-center gap-2 px-3">
        <AppLogo className="w-4 h-4 text-blue-500" />
        <span className="font-semibold text-zinc-200 tracking-wide text-[11px]">
          Microstock Studio
        </span>
      </div>

      {/* Middle: Subtle Window Drag Zone Title */}
      <div className="text-[11px] text-zinc-500 font-medium truncate pointer-events-none">
        Native Desktop Client
      </div>

      {/* Right: Window Control Action Buttons */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={handleMinimize}
          className="h-full px-3.5 flex items-center justify-center hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleMaximize}
          className="h-full px-3.5 flex items-center justify-center hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
          title={isMax ? 'Restore' : 'Maximize'}
        >
          {isMax ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="h-full px-3.5 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
