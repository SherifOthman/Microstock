import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonVariantsArgs {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: ButtonVariantsArgs = {}): string {
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
    {
      'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs': variant === 'default',
      'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs':
        variant === 'destructive',
      'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground':
        variant === 'outline',
      'bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'secondary',
      'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
      'text-primary underline-offset-4 hover:underline': variant === 'link',
      'h-9 px-4 py-2': size === 'default',
      'h-8 rounded-md px-3 text-xs': size === 'sm',
      'h-10 rounded-md px-6 text-sm': size === 'lg',
      'h-8 w-8 p-0': size === 'icon',
    },
    className
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
