import React, { useState } from 'react';
import { AssetTrackerRecord, PlatformUploadStatus, SupportedPlatform } from '../../../types';
import { TrackerStatusPill } from './TrackerStatusPill';
import { Checkbox } from '../../../components/ui/checkbox';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  Copy,
  Check,
  Film,
  Layers,
  Image as ImageIcon,
  Trash2,
  MoreVertical,
  CheckCheck,
  RotateCcw,
} from 'lucide-react';

interface Props {
  record: AssetTrackerRecord;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onStatusChange: (id: string, platformId: SupportedPlatform, status: PlatformUploadStatus) => void;
  onDelete: (id: string) => void;
  onMarkAll: (id: string, status: PlatformUploadStatus) => void;
}

const PLATFORMS: SupportedPlatform[] = [
  'adobe',
  'freepik',
  'shutterstock',
  'vecteezy',
  'dreamstime',
  '123rf',
];

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const TrackerRow: React.FC<Props> = ({
  record,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onDelete,
  onMarkAll,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyName = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(record.filename);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`group rounded-xl border transition p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
        isSelected
          ? 'border-primary/60 bg-primary/5 shadow-xs'
          : 'border-border/70 bg-card hover:border-border'
      }`}
    >
      {/* Left: Checkbox + Thumbnail + Filename & Details */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(record.id)}
          className="shrink-0 cursor-pointer"
        />

        {/* Thumbnail with Media Badge */}
        <div className="relative w-14 h-11 rounded-lg overflow-hidden border border-border/80 bg-muted/40 shrink-0 flex items-center justify-center">
          {record.thumbnailBase64 ? (
            <img
              src={`data:image/jpeg;base64,${record.thumbnailBase64}`}
              alt={record.filename}
              className="w-full h-full object-cover"
            />
          ) : record.mediaType === 'video' ? (
            <Film className="w-5 h-5 text-sky-400/60" />
          ) : record.mediaType === 'vector' ? (
            <Layers className="w-5 h-5 text-blue-400/60" />
          ) : (
            <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
          )}

          {/* Media Type Indicator */}
          {record.mediaType === 'video' && (
            <div className="absolute bottom-0.5 left-0.5 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-sky-300 font-bold">
              {record.videoResolution || 'VIDEO'}
            </div>
          )}
          {record.mediaType === 'vector' && (
            <div className="absolute bottom-0.5 left-0.5 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-blue-300 font-bold">
              EPS
            </div>
          )}
        </div>

        {/* Filename & Info */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-semibold text-foreground truncate block max-w-[260px] md:max-w-[340px]"
              title={record.filename}
            >
              {record.filename}
            </span>

            <button
              type="button"
              onClick={handleCopyName}
              className="text-muted-foreground hover:text-foreground transition p-0.5 rounded cursor-pointer shrink-0"
              title="Copy filename"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
            <span>{formatBytes(record.fileSizeBytes)}</span>
            {record.cleanTitle && (
              <>
                <span>•</span>
                <span className="truncate max-w-[200px] text-foreground/80">{record.cleanTitle}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Middle/Right: 6 Platform Status Pills */}
      <div className="flex items-center gap-1.5 flex-wrap shrink-0 w-full md:w-auto justify-start md:justify-end">
        {PLATFORMS.map((pid) => {
          const statusInfo = record.platforms[pid] || { status: 'not_uploaded' };
          return (
            <TrackerStatusPill
              key={pid}
              platformId={pid}
              status={statusInfo.status}
              updatedAt={statusInfo.updatedAt}
              onStatusChange={(newStatus) => onStatusChange(record.id, pid, newStatus)}
            />
          );
        })}

        {/* Row Menu Actions via official Shadcn DropdownMenu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-7 h-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 p-1">
            <DropdownMenuItem
              onClick={() => onMarkAll(record.id, 'uploaded')}
              className="flex items-center gap-2 text-xs text-emerald-500 hover:text-emerald-400 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark All Uploaded</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onMarkAll(record.id, 'not_uploaded')}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Statuses</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(record.id)}
              className="flex items-center gap-2 text-xs text-rose-500 hover:text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete from Tracker</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
