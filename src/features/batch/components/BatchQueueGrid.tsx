import React from 'react';
import { QueueItem } from '../../../services/queue/BatchQueueService';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  Loader2,
  Trash2,
  RotateCw,
} from 'lucide-react';

interface Props {
  items: QueueItem[];
  onRemoveItem: (id: string) => void;
  onRetryItem: (id: string) => void;
  disabled?: boolean;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const BatchQueueGrid: React.FC<Props> = ({ items, onRemoveItem, onRetryItem, disabled = false }) => {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {items.map((item) => {
        const isProcessing = item.status === 'processing';
        const isCompleted = item.status === 'completed';
        const isError = item.status === 'error';
        const isResizing = item.status === 'resizing';

        return (
          <div
            key={item.id}
            className="group relative bg-card rounded-lg border border-border overflow-hidden transition flex flex-col hover:border-muted-foreground/30"
          >
            {/* Image Thumbnail Container */}
            <div className="relative aspect-video w-full bg-secondary/50 flex items-center justify-center overflow-hidden">
              {item.thumbnailDataUrl ? (
                <img
                  src={item.thumbnailDataUrl}
                  alt={item.filename}
                  className="w-full h-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}

              {/* Status Badge Over Image */}
              <div className="absolute top-1.5 left-1.5 z-10">
                {isProcessing && (
                  <Badge variant="default" className="gap-1 text-[10px] py-0 px-1.5" title={item.assignedProvider && item.assignedModel ? `Using ${item.assignedProvider} / ${item.assignedModel}` : 'Analyzing image with AI vision'}>
                    <Flame className="w-2.5 h-2.5" />
                    <span className="font-mono">{item.assignedProvider || 'Analyzing'}</span>
                  </Badge>
                )}
                {isCompleted && (
                  <Badge variant="success" className="gap-1 text-[10px] py-0 px-1.5">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Done
                  </Badge>
                )}
                {isError && (
                  <Badge variant="destructive" className="gap-1 text-[10px] py-0 px-1.5">
                    <AlertCircle className="w-2.5 h-2.5" /> Failed
                  </Badge>
                )}
                {isResizing && (
                  <Badge variant="secondary" className="gap-1 text-[10px] py-0 px-1.5">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Resizing
                  </Badge>
                )}
              </div>

              {/* Action Buttons - Retry for failed, Delete for others */}
              <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {isError && !disabled && (
                  <button
                    type="button"
                    onClick={() => onRetryItem(item.id)}
                    className="p-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm cursor-pointer"
                    title="Retry this item"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1 rounded-md bg-background/80 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="p-2 space-y-1">
              <p className="text-[11px] font-medium text-foreground truncate" title={item.filename}>
                {item.filename}
              </p>

              {/* Dual Size display */}
              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                <span>Orig: {formatBytes(item.originalSizeBytes || item.file?.size || item.metadataRecord?.fileSize)}</span>
                <span className="text-sky-400 font-medium">
                  AI: {formatBytes(
                    item.compressedSizeBytes ||
                    item.metadataRecord?.compressedSize ||
                    (item.thumbnailBase64 ? Math.round((item.thumbnailBase64.length * 3) / 4) : undefined)
                  )}
                </span>
              </div>

              {item.metadataRecord ? (
                <p
                  className="text-[10px] text-muted-foreground line-clamp-1"
                  title={item.metadataRecord.baseTitle}
                >
                  {item.metadataRecord.baseTitle}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground/60 italic truncate">
                  {item.error || 'Awaiting analysis'}
                </p>
              )}

              {/* Failover Trail (NEW) */}
              {item.attemptHistory && item.attemptHistory.length > 1 && (
                <div className="text-[9px] font-mono text-amber-500/90 flex items-center gap-0.5 flex-wrap mt-1 pt-1 border-t border-border/30">
                  <span className="text-muted-foreground text-[8px] uppercase tracking-wide">Trail:</span>
                  {item.attemptHistory.map((att, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="text-muted-foreground/60">→</span>}
                      <span 
                        className={att.status === 'success' ? 'text-emerald-400 font-semibold' : 'text-red-400'}
                        title={att.error || `${att.provider} / ${att.model}`}
                      >
                        {att.provider}
                        {att.status === 'failed' && ' ✗'}
                        {att.status === 'success' && ' ✓'}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
