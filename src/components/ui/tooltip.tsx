import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  content?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  side = 'top',
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 6;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
    let top = rect.top - gap;
    let left = Math.max(48, Math.min(vw - 48, rect.left + rect.width / 2));

    if (side === 'bottom') {
      top = rect.bottom + gap;
      left = Math.max(48, Math.min(vw - 48, rect.left + rect.width / 2));
    } else if (side === 'left') {
      top = rect.top + rect.height / 2;
      left = rect.left - gap;
    } else if (side === 'right') {
      top = rect.top + rect.height / 2;
      left = rect.right + gap;
    }

    setCoords({ top, left });
  }, [visible, side]);

  if (!content) {
    return <>{children}</>;
  }

  const transformClass =
    side === 'top'
      ? '-translate-x-1/2 -translate-y-full'
      : side === 'bottom'
      ? '-translate-x-1/2'
      : side === 'left'
      ? '-translate-x-full -translate-y-1/2'
      : '-translate-y-1/2';

  return (
    <div
      ref={triggerRef}
      className="inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            className={cn(
              'fixed z-[100] w-max max-w-xs px-2.5 py-1 text-[11px] font-medium leading-snug text-popover-foreground bg-popover border border-border rounded-md shadow-md pointer-events-none animate-in fade-in-0 zoom-in-95 duration-100',
              transformClass,
              className
            )}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
};
