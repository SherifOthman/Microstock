import * as React from 'react';
import { cn } from '../../lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'warning' | 'info';
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'relative w-full rounded-xl border px-4 py-3 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-2px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg]:text-foreground rtl:[&>svg~*]:pl-0 rtl:[&>svg~*]:pr-7 rtl:[&>svg]:left-auto rtl:[&>svg]:right-4',
        {
          'bg-background text-foreground border-border': variant === 'default',
          'border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/50 [&>svg]:text-destructive':
            variant === 'destructive',
          'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:bg-amber-950/20 [&>svg]:text-amber-500':
            variant === 'warning',
          'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 dark:bg-sky-950/20 [&>svg]:text-sky-500':
            variant === 'info',
        },
        className
      )}
      {...props}
    />
  )
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-semibold leading-none tracking-tight text-foreground', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-xs text-muted-foreground leading-relaxed [&_p]:leading-relaxed', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
