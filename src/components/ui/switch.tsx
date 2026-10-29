import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  className,
  'aria-label': ariaLabel,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-state={checked ? 'checked' : 'unchecked'}
      id={id}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-muted-foreground/30 dark:bg-zinc-700',
        className
      )}
    >
      <span
        data-state={checked ? 'checked' : 'unchecked'}
        className={cn(
          'pointer-events-none block h-4 w-4 shrink-0 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out',
          checked
            ? 'translate-x-4 rtl:-translate-x-4 data-[state=checked]:ltr:translate-x-4 data-[state=checked]:rtl:-translate-x-4'
            : 'translate-x-0 rtl:translate-x-0 data-[state=unchecked]:translate-x-0'
        )}
      />
    </button>
  );
};
