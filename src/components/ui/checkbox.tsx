import React from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onCheckedChange,
  className = '',
  disabled = false,
}) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`w-4 h-4 rounded border transition-colors flex items-center justify-center shrink-0 cursor-pointer ${
        checked
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border bg-card hover:border-muted-foreground/60'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {checked && <Check className="w-3 h-3 stroke-[3]" />}
    </button>
  );
};
