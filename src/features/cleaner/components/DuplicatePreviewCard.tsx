import React, { useState, useEffect } from 'react';
import { CleanedFileItem } from '../../../services/cleaner/fileCleanerEngine';
import { Button } from '../../../components/ui/button';
import { FolderOpen, PenTool, Trash2 } from 'lucide-react';

export interface DuplicatePreviewCardProps {
  item: CleanedFileItem;
  onLocate: (path: string) => void;
  onRemove: (id: string, file: File, item: CleanedFileItem) => void;
  language: string;
}

export const DuplicatePreviewCard: React.FC<DuplicatePreviewCardProps> = React.memo(({
  item,
  onLocate,
  onRemove,
  language,
}) => {
  const [objectUrl, setObjectUrl] = useState<string>('');

  useEffect(() => {
    let url = '';
    try {
      url = URL.createObjectURL(item.file);
      setObjectUrl(url);
    } catch {
      // ignore
    }
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [item.file]);

  const isVideo = item.subFolder === 'Videos';
  const isImage = item.subFolder === 'Photos';

  return (
    <div className="flex flex-col border border-border bg-card rounded-xl p-3 space-y-2.5 shadow-xs">
      <div className="w-full h-40 bg-zinc-950/80 rounded-lg overflow-hidden flex items-center justify-center relative border border-border/60">
        {isVideo && objectUrl ? (
          <video src={objectUrl} controls className="w-full h-full object-contain" />
        ) : isImage && objectUrl ? (
          <img src={objectUrl} alt={item.originalName} className="w-full h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <PenTool className="w-8 h-8 text-amber-500" />
            <span className="text-xs uppercase font-mono">{item.extension}</span>
          </div>
        )}
      </div>

      <div className="space-y-1 text-xs flex-1">
        <div className="font-mono font-medium text-foreground truncate" title={item.originalName}>
          {item.originalName}
        </div>
        <div className="flex items-center justify-between text-muted-foreground font-mono text-[11px]">
          <span>
            {item.validation?.width && item.validation?.height
              ? `${item.validation.width} × ${item.validation.height}`
              : 'Unknown res'}
          </span>
          <span>{(item.size / (1024 * 1024)).toFixed(2)} MB</span>
        </div>
        {item.nativePath && (
          <div className="text-[10px] text-zinc-500 font-mono truncate" title={item.nativePath}>
            {item.nativePath}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        {item.nativePath && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onLocate(item.nativePath!)}
            className="flex-1 h-7 text-[11px] gap-1 cursor-pointer"
            title={language === 'ar' ? 'تحديد الملف في مستكشف ويندوز' : 'Show in Windows Explorer'}
          >
            <FolderOpen className="w-3 h-3" />
            <span>{language === 'ar' ? 'تحديد' : 'Locate'}</span>
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onRemove(item.id, item.file, item)}
          className="h-7 text-[11px] px-2.5 gap-1 cursor-pointer"
          title={language === 'ar' ? 'حذف هذه النسخة من القائمة' : 'Remove this copy'}
        >
          <Trash2 className="w-3 h-3" />
          <span>{language === 'ar' ? 'حذف' : 'Remove'}</span>
        </Button>
      </div>
    </div>
  );
});

DuplicatePreviewCard.displayName = 'DuplicatePreviewCard';
