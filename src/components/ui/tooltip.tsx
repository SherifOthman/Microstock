import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
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
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    effectiveSide: 'top' | 'bottom' | 'left' | 'right';
  } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const computeCoords = useCallback(() => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 8;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

    let effectiveSide = side;
    // Auto-flip horizontal sides if too close to viewport edge (e.g. 400px wide media previews in RTL)
    if (side === 'right' && rect.right + 380 > vw - 16) {
      effectiveSide = 'left';
    } else if (side === 'left' && rect.left - 380 < 16) {
      effectiveSide = 'right';
    }

    let top = rect.top - gap;
    let left = Math.max(48, Math.min(vw - 48, rect.left + rect.width / 2));

    if (effectiveSide === 'bottom') {
      top = rect.bottom + gap;
      left = Math.max(48, Math.min(vw - 48, rect.left + rect.width / 2));
    } else if (effectiveSide === 'left') {
      top = Math.max(20, Math.min(vh - 20, rect.top + rect.height / 2));
      left = Math.max(16, rect.left - gap);
    } else if (effectiveSide === 'right') {
      top = Math.max(20, Math.min(vh - 20, rect.top + rect.height / 2));
      left = Math.min(vw - 16, rect.right + gap);
    }

    return { top, left, effectiveSide };
  }, [side]);

  const handleShow = useCallback(() => {
    const nextCoords = computeCoords();
    if (nextCoords) {
      setCoords(nextCoords);
    }
    setVisible(true);
  }, [computeCoords]);

  const handleHide = useCallback(() => {
    setVisible(false);
    setCoords(null);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    const nextCoords = computeCoords();
    if (nextCoords) {
      setCoords(nextCoords);
    }
  }, [visible, computeCoords]);

  if (!content) {
    return <>{children}</>;
  }

  const effectiveSide = coords?.effectiveSide || side;
  const transformClass =
    effectiveSide === 'top'
      ? '-translate-x-1/2 -translate-y-full'
      : effectiveSide === 'bottom'
      ? '-translate-x-1/2'
      : effectiveSide === 'left'
      ? '-translate-x-full -translate-y-1/2'
      : '-translate-y-1/2';

  return (
    <div
      ref={triggerRef}
      className="inline-flex items-center"
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocus={handleShow}
      onBlur={handleHide}
    >
      {children}
      {visible &&
        coords !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            className={cn(
              'fixed z-[250] w-max max-w-xs px-2.5 py-1 text-[11px] font-medium leading-snug text-popover-foreground bg-popover border border-border rounded-md shadow-md pointer-events-none',
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

