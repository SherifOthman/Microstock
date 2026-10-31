import React from 'react';
import { PlatformUploadStatus, SupportedPlatform } from '../../../types';
import { getPlatformLogo } from '../../../components/icons/StockLogos';
import { Check, Clock, Star, X, Ban, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { cn } from '../../../lib/utils';

interface Props {
  platformId: SupportedPlatform;
  status: PlatformUploadStatus;
  updatedAt?: number;
  onStatusChange: (newStatus: PlatformUploadStatus) => void;
  compact?: boolean;
}

export const STATUS_CONFIG: Record<
  PlatformUploadStatus,
  { label: string; shortLabel: string; bg: string; text: string; border: string; icon: any }
> = {
  uploaded: {
    label: 'Uploaded',
    shortLabel: 'Uploaded',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    icon: Check,
  },
  pending_review: {
    label: 'Pending Review',
    shortLabel: 'Pending',
    bg: 'bg-amber-500/10 hover:bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    shortLabel: 'Approved',
    bg: 'bg-sky-500/10 hover:bg-sky-500/20',
    text: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-500/30',
    icon: Star,
  },
  rejected: {
    label: 'Rejected',
    shortLabel: 'Rejected',
    bg: 'bg-rose-500/10 hover:bg-rose-500/20',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/30',
    icon: Ban,
  },
  not_uploaded: {
    label: 'Not Uploaded',
    shortLabel: 'Not Uploaded',
    bg: 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50',
    text: 'text-zinc-400 dark:text-zinc-500 opacity-60 hover:opacity-100',
    border: 'border-zinc-200/60 dark:border-zinc-800/60',
    icon: X,
  },
};

export const TrackerStatusPill: React.FC<Props> = ({
  platformId,
  status,
  onStatusChange,
  compact = false,
}) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_uploaded;
  const Icon = cfg.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono border transition cursor-pointer select-none focus:outline-hidden focus:ring-1 focus:ring-ring',
            cfg.bg,
            cfg.text,
            cfg.border
          )}
          title={`Platform: ${platformId} • Status: ${cfg.label} (Click to change)`}
        >
          <span className="shrink-0">{getPlatformLogo(platformId, 13)}</span>
          <Icon className="w-3 h-3 stroke-[2.5]" />
          {!compact && <span className="font-sans font-medium">{cfg.shortLabel}</span>}
          <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity ml-0.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-40 p-1">
        {(Object.keys(STATUS_CONFIG) as PlatformUploadStatus[]).map((st) => {
          const item = STATUS_CONFIG[st];
          const ItemIcon = item.icon;
          const isCurrent = st === status;

          return (
            <DropdownMenuItem
              key={st}
              onClick={() => onStatusChange(st)}
              className={cn(
                'flex items-center gap-2 text-xs py-1.5 px-2 rounded-sm cursor-pointer',
                isCurrent && 'bg-accent font-semibold'
              )}
            >
              <ItemIcon className={cn('w-3.5 h-3.5 shrink-0', item.text)} />
              <span className={cn('flex-1', item.text)}>{item.label}</span>
              {isCurrent && <Check className="w-3 h-3 text-foreground ml-auto" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
