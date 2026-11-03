import React from 'react';
import { RenamerFileItem, AssetBatchType } from '../../types/renamer';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Check, AlertTriangle, ArrowRight, Folder, Loader2, Sparkles, Camera } from 'lucide-react';

export interface RenamerPreviewTableProps {
  items: RenamerFileItem[];
  batchType: AssetBatchType;
  stats: {
    total: number;
    ready: number;
    needsFixing: number;
    alreadyFormatted: number;
    vectorPairs: number;
  };
  isRenaming: boolean;
  onExecute: () => void;
  onCancel: () => void;
  onChangeBatchType?: () => void;
}

export const RenamerPreviewTable: React.FC<RenamerPreviewTableProps> = ({
  items,
  batchType,
  stats,
  isRenaming,
  onExecute,
  onCancel,
  onChangeBatchType,
}) => {
  return (
    <div className="space-y-4">
      {/* Header Summary & Mode */}
      <div className="p-3.5 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Badge
            variant="outline"
            className="px-2.5 py-1 text-xs font-semibold gap-1.5 border-primary/40 text-primary bg-primary/10"
          >
            {batchType === 'AI' ? <Sparkles className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
            <span>{batchType === 'AI' ? 'AI-Generated Track' : 'Native / Standard Track'}</span>
          </Badge>

          {onChangeBatchType && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onChangeBatchType}
              className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Change Track
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
          <Badge variant="outline" className="text-[11px]">
            Total: {stats.total}
          </Badge>
          <Badge variant="outline" className="text-[11px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
            Ready: {stats.ready}
          </Badge>
          {stats.needsFixing > 0 && (
            <Badge variant="destructive" className="text-[11px] gap-1">
              <AlertTriangle className="w-3 h-3" />
              Needs Fixing: {stats.needsFixing}
            </Badge>
          )}
          {stats.alreadyFormatted > 0 && (
            <Badge variant="secondary" className="text-[11px]">
              Already Formatted: {stats.alreadyFormatted}
            </Badge>
          )}
          {stats.vectorPairs > 0 && (
            <Badge variant="outline" className="text-[11px] text-primary border-primary/30">
              Vector Pairs: {stats.vectorPairs}
            </Badge>
          )}
        </div>
      </div>

      {/* Table Preview */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-secondary sticky top-0 z-10 border-b border-border text-muted-foreground font-mono">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Original Filename</th>
                <th className="p-3">Target Folder</th>
                <th className="p-3">New Sanitized Filename</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3 text-muted-foreground font-mono tabular-nums text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="p-3 font-mono max-w-[220px] truncate">
                    {item.originalName || item.originalFilename}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                      {item.targetFolder}/
                    </span>
                  </td>
                  <td className="p-3 font-mono font-medium max-w-[320px] truncate">
                    {item.proposedFilename || item.newFilename}
                  </td>
                  <td className="p-3 text-right">
                    {item.needsFixing ? (
                      <Badge variant="destructive" className="text-[10px] gap-1 font-mono">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        _Needs_Fixing
                      </Badge>
                    ) : item.isAlreadyFormatted ? (
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        Skipped
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-mono gap-1">
                        <Check className="w-2.5 h-2.5" />
                        Ready
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isRenaming} className="cursor-pointer">
          Cancel & Clear
        </Button>
        <Button
          size="sm"
          onClick={onExecute}
          disabled={isRenaming || stats.ready === 0}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer"
        >
          {isRenaming ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Renaming Files...</span>
            </>
          ) : (
            <>
              <span>Apply Renaming ({stats.ready})</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
