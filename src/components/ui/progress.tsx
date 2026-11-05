import React from 'react';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indicatorClassName?: string;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className = '', value = 0, max = 100, indicatorClassName = '', ...props }, ref) => {
    const safeMax = max > 0 ? max : 100;
    const clampedPercent = Math.min(100, Math.max(0, (value / safeMax) * 100));

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.round(clampedPercent)}
        className={`relative h-2 w-full overflow-hidden rounded-full bg-secondary ${className}`}
        {...props}
      >
        <div
          className={`h-full w-full flex-1 bg-primary transition-transform duration-75 ease-linear ${indicatorClassName}`}
          style={{ transform: `translateX(-${100 - clampedPercent}%)` }}
        />
      </div>
    );
  }
);

Progress.displayName = 'Progress';
