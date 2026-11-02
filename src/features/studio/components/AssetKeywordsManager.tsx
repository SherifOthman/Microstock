import React, { useState } from 'react';
import { Tag, Edit3, Copy, Check, Plus, X, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { useLanguage } from '../../../context/LanguageContext';

export interface AssetKeywordsManagerProps {
  assetId: string;
  keywords: string[];
  isCompact?: boolean;
  copiedKey: string | null;
  onCopyKeywords: (text: string, id: string) => void;
  onUpdateKeywords: (keywords: string[]) => Promise<void>;
}

export const AssetKeywordsManager: React.FC<AssetKeywordsManagerProps> = React.memo(({
  assetId,
  keywords,
  isCompact = false,
  copiedKey,
  onCopyKeywords,
  onUpdateKeywords,
}) => {
  const { t } = useLanguage();
  const [isEditingKws, setIsEditingKws] = useState(false);
  const [rawKwsInput, setRawKwsInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [draggedKwIndex, setDraggedKwIndex] = useState<number | null>(null);
  const [dragOverKwIndex, setDragOverKwIndex] = useState<number | null>(null);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);

  const handleRemoveKeyword = async (kwToRemove: string) => {
    const updated = (keywords ?? []).filter(
      (k) => (k ?? '').toLowerCase() !== (kwToRemove ?? '').toLowerCase()
    );
    await onUpdateKeywords(updated);
  };

  const handleDropKeyword = async (targetIndex: number) => {
    if (draggedKwIndex === null || draggedKwIndex === targetIndex) {
      setDraggedKwIndex(null);
      setDragOverKwIndex(null);
      return;
    }
    const current = [...(keywords ?? [])];
    const [moved] = current.splice(draggedKwIndex, 1);
    current.splice(targetIndex, 0, moved);
    await onUpdateKeywords(current);
    setDraggedKwIndex(null);
    setDragOverKwIndex(null);
  };

  const handleSaveRawKeywords = async () => {
    const cleanKws = (rawKwsInput ?? '')
      .split(',')
      .map((k) => (k ?? '').trim())
      .filter((k) => k.length > 0);
    // Deduplicate
    const unique = Array.from(new Set(cleanKws.map((k) => k.toLowerCase()))).map(
      (k) => cleanKws.find((orig) => orig.toLowerCase() === k) || k
    );
    await onUpdateKeywords(unique);
    setIsEditingKws(false);
  };

  const handleAddTagSubmit = async () => {
    if (!(newTagInput ?? '').trim()) {
      setIsAddingTag(false);
      setNewTagInput('');
      return;
    }
    const newKws = (newTagInput ?? '')
      .split(',')
      .map((k) => (k ?? '').trim())
      .filter((k) => k.length > 0);

    const existingLower = new Set((keywords ?? []).map((k) => (k ?? '').toLowerCase()));
    const toAdd = newKws.filter((k) => !existingLower.has((k ?? '').toLowerCase()));

    if (toAdd.length > 0) {
      const updated = [...(keywords ?? []), ...toAdd];
      await onUpdateKeywords(updated);
    }
    setNewTagInput('');
    setIsAddingTag(false);
  };

  const displayKws = isCompact && !isTagsExpanded && !isEditingKws
    ? keywords.slice(0, 10)
    : keywords;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
          <Tag className="w-3.5 h-3.5 text-blue-500" />
          <span>{t.keywords}</span>
          <span className="text-[11px] font-mono font-normal text-muted-foreground">
            ({keywords.length})
          </span>
          <span className="text-[10px] text-muted-foreground font-normal hidden sm:inline">
            • {t.dragToReorderTags}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (isEditingKws) {
                setIsEditingKws(false);
              } else {
                setRawKwsInput(keywords.join(', '));
                setIsEditingKws(true);
              }
            }}
            className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <Edit3 className="w-3 h-3 text-muted-foreground" />
            <span>{isEditingKws ? t.cancel : t.edit}</span>
          </button>
          <button
            type="button"
            onClick={() => onCopyKeywords(keywords.join(', '), `${assetId}_kws`)}
            disabled={keywords.length === 0}
            className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40"
          >
            {copiedKey === `${assetId}_kws` ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500">{t.copied}</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-muted-foreground" />
                <span>{t.copy}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isEditingKws ? (
        <div className="space-y-2">
          <Textarea
            dir="ltr"
            value={rawKwsInput}
            onChange={(e) => setRawKwsInput(e.target.value)}
            placeholder="Type or paste keywords separated by commas..."
            className="text-xs min-h-[70px] bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-left shadow-2xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={handleSaveRawKeywords} className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white">
              {t.saveKeywords}
            </Button>
          </div>
        </div>
      ) : (
        <div
          dir="ltr"
          className={`p-2.5 sm:p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/90 dark:bg-zinc-900/90 flex flex-wrap gap-1.5 text-left touch-pan-y ${
            isCompact ? 'overflow-visible' : 'max-h-56 overflow-y-auto'
          }`}
        >
          {displayKws.map((kw, i) => {
            const isTop10 = i < 10;
            const isDragging = draggedKwIndex === i;
            const isOver = dragOverKwIndex === i;
            const canDrag = !isCompact || isEditingKws;

            return (
              <Badge
                key={`${kw}-${i}`}
                variant="outline"
                draggable={canDrag}
                onDragStart={(e) => {
                  if (!canDrag) return;
                  setDraggedKwIndex(i);
                  e.dataTransfer.setData('text/plain', String(i));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!canDrag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverKwIndex !== i) {
                    setDragOverKwIndex(i);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverKwIndex === i) {
                    setDragOverKwIndex(null);
                  }
                }}
                onDrop={(e) => {
                  if (!canDrag) return;
                  e.preventDefault();
                  handleDropKeyword(i);
                }}
                className={`text-[11px] py-0.5 px-2 gap-1 font-mono transition-all select-none ${
                  canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                } ${
                  isDragging
                    ? 'opacity-40 scale-95 border-dashed border-blue-500 bg-blue-500/10'
                    : isOver
                    ? 'border-blue-500 ring-2 ring-blue-500/30 scale-105'
                    : isTop10
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'border-zinc-300 dark:border-zinc-700 bg-card text-muted-foreground'
                }`}
              >
                {canDrag && <GripVertical className="w-2.5 h-2.5 opacity-40 shrink-0" />}
                <span className="text-[9px] opacity-50 select-none">{i + 1}</span>
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(kw)}
                  className="opacity-40 hover:opacity-100 hover:text-destructive transition ml-0.5"
                  title="Remove keyword"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </Badge>
            );
          })}

          {/* Add Tag Inline */}
          {isAddingTag ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                dir="ltr"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTagSubmit();
                  if (e.key === 'Escape') setIsAddingTag(false);
                }}
                onBlur={handleAddTagSubmit}
                placeholder="tag1, tag2..."
                className="h-6 text-[10px] w-28 px-1.5 py-0 font-mono bg-card"
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddingTag(true)}
              className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-foreground font-mono"
            >
              <Plus className="w-2.5 h-2.5" />
              <span>{t.addTag}</span>
            </Button>
          )}

          {/* Compact Mode Show More / Show Less Toggle */}
          {isCompact && keywords.length > 10 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsTagsExpanded(!isTagsExpanded)}
              className="h-6 text-[10px] px-2 gap-0.5 text-blue-600 dark:text-blue-400 font-medium ml-auto"
            >
              {isTagsExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  <span>{t.showLessTags || 'Show Less'}</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span>+{keywords.length - 10} {t.showMoreTags || 'more'}</span>
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

AssetKeywordsManager.displayName = 'AssetKeywordsManager';
