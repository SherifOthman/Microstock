import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2',
        {
          'border-transparent bg-primary text-primary-foreground shadow-xs': variant === 'default',
          'border-transparent bg-secondary text-secondary-foreground': variant === 'secondary',
          'border-destructive/30 bg-destructive/15 text-destructive': variant === 'destructive',
          'border-border text-foreground': variant === 'outline',
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-400': variant === 'success',
          'border-amber-500/30 bg-amber-500/10 text-amber-400': variant === 'warning',
        },
        className
      )}
      {...props}
    />
  );
}
