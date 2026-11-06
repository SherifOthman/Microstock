import React, { useState, useMemo, useRef } from 'react';
import {
  ExportBasketRecord,
  MasterMetadataRecord,
  SupportedPlatform,
} from '../../types';
import { matchDroppedFilesToPendingAssets } from '../../services/tracker/bulkTrackerOperations';
import { resolveAssetPreviewUrl } from '../../db';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  UploadCloud,
  RotateCcw,
  FolderUp,
  CheckCircle2,
  AlertTriangle,
  Film,
  PenTool,
  Image as ImageIcon,
  Check,
} from 'lucide-react';

const AGENCY_NAMES: Record<SupportedPlatform, string> = {
  adobe: 'Adobe Stock',
  freepik: 'Freepik',
  shutterstock: 'Shutterstock',
  vecteezy: 'Vecteezy',
  dreamstime: 'Dreamstime',
  '123rf': '123RF',
};

export interface ExportBasketReconcileModalProps {
  open: boolean;
  onClose: () => void;
  baskets: ExportBasketRecord[];
  masterRecords: MasterMetadataRecord[];
  activeAgency: SupportedPlatform;
  onSplitReconcile: (payload: {
    agencyId: SupportedPlatform;
    revertToNewIds: string[];
    markUploadedIds: string[];
  }) => Promise<void>;
}

export const ExportBasketReconcileModal: React.FC<ExportBasketReconcileModalProps> = ({
  open,
  onClose,
  baskets,
  masterRecords,
  activeAgency,
  onSplitReconcile,
}) => {
  const dropInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedBasketId, setSelectedBasketId] = useState<string | 'ACTIVE_AGENCY'>('ACTIVE_AGENCY');
  const [selectedFailedIds, setSelectedFailedIds] = useState<Set<string>>(new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropMatchMessage, setDropMatchMessage] = useState<{
    matchedCount: number;
    unmatchedCount: number;
    filenames: string[];
  } | null>(null);

  const activeBasket = useMemo(() => {
    if (selectedBasketId !== 'ACTIVE_AGENCY') {
      const found = baskets.find((b) => b.id === selectedBasketId);
      if (found) return found;
    }
    return baskets[0] || null;
  }, [baskets, selectedBasketId]);

  const targetAgency: SupportedPlatform =
    (activeBasket?.agencyId as SupportedPlatform) || activeAgency;

  // All Pending Upload assets for the selected basket or active agency
  const pendingAssets = useMemo(() => {
    if (activeBasket) {
      const byBasket = masterRecords.filter(
        (r) =>
          r.agencyTrackings?.[targetAgency]?.exportBasketId === activeBasket.id &&
          r.agencyTrackings?.[targetAgency]?.status === 'Pending Upload'
      );
      if (byBasket.length > 0) return byBasket;
    }
    return masterRecords.filter(
      (r) => r.agencyTrackings?.[targetAgency]?.status === 'Pending Upload'
    );
  }, [masterRecords, activeBasket, targetAgency]);

  const handleCardSelect = (
    assetId: string,
    index: number,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    const isShift = e.shiftKey;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    setSelectedFailedIds((prev) => {
      const next = new Set(prev);
      if (isShift && lastClickedIdx !== null && pendingAssets.length > 0) {
        const start = Math.min(lastClickedIdx, index);
        const end = Math.max(lastClickedIdx, index);
        for (let i = start; i <= end; i++) {
          const item = pendingAssets[i];
          if (item) next.add(item.id);
        }
      } else if (isCtrlOrMeta) {
        if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
      } else {
        if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
      }
      return next;
    });
    setLastClickedIdx(index);
  };

  const handleDroppedFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const pool = pendingAssets.length > 0 ? pendingAssets : masterRecords;
    const res = await matchDroppedFilesToPendingAssets(files, pool);

    if (res.matchedIds.length > 0) {
      setSelectedFailedIds((prev) => {
        const next = new Set(prev);
        for (const id of res.matchedIds) next.add(id);
        return next;
      });
    }

    setDropMatchMessage({
      matchedCount: res.matchedIds.length,
      unmatchedCount: res.unmatchedDroppedNames.length,
      filenames: res.matchedFilenames,
    });
  };

  const handleDropZoneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    await handleDroppedFiles(files);
  };

  const handleDropInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await handleDroppedFiles(files);
  };

  const failedIdsArray = Array.from(selectedFailedIds);
  const succeededIdsArray = pendingAssets
    .filter((a) => !selectedFailedIds.has(a.id))
    .map((a) => a.id);

  const handleRevertSelectedAndConfirmRest = async () => {
    await onSplitReconcile({
      agencyId: targetAgency,
      revertToNewIds: failedIdsArray,
      markUploadedIds: succeededIdsArray,
    });
    setSelectedFailedIds(new Set());
    setDropMatchMessage(null);
  };

  const handleRevertSelectedOnly = async () => {
    if (failedIdsArray.length === 0) return;
    await onSplitReconcile({
      agencyId: targetAgency,
      revertToNewIds: failedIdsArray,
      markUploadedIds: [],
    });
    setSelectedFailedIds(new Set());
    setDropMatchMessage(null);
  };

  const handleConfirmAllUploaded = async () => {
    const allIds = pendingAssets.map((a) => a.id);
    if (allIds.length === 0) return;
    await onSplitReconcile({
      agencyId: targetAgency,
      revertToNewIds: [],
      markUploadedIds: allIds,
    });
    setSelectedFailedIds(new Set());
    setDropMatchMessage(null);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export Baskets & Visual Exception Reconciliation"
      size="lg"
    >
      <div className="space-y-3.5 text-xs">
        <input
          ref={dropInputRef}
          type="file"
          multiple
          data-testid="reconcile-dropzone-file-input"
          onChange={handleDropInputChange}
          className="hidden"
        />

        {/* Basket / Target Agency Selector Strip */}
        {baskets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-border">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">
              Active Basket:
            </span>
            {baskets.map((basket) => {
              const agId = basket.agencyId as SupportedPlatform;
              const isSelected = activeBasket?.id === basket.id;
              return (
                <button
                  key={basket.id}
                  type="button"
                  onClick={() => {
                    setSelectedBasketId(basket.id);
                    setSelectedFailedIds(new Set());
                    setDropMatchMessage(null);
                  }}
                  className={`h-7 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary font-semibold'
                      : 'bg-secondary/40 text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  <span>{getPlatformLogo(agId, 12)}</span>
                  <span>{AGENCY_NAMES[agId] || basket.agencyId}</span>
                  <span className="font-mono text-[10px] opacity-85">
                    ({basket.itemCount})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Method 2: Drag & Drop Failed Files Dropzone */}
        <div
          data-testid="reconcile-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDropZoneDrop}
          onClick={() => dropInputRef.current?.click()}
          className={`p-3.5 rounded-xl border-2 border-dashed transition cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-3 ${
            isDragOver
              ? 'border-primary bg-primary/10'
              : 'border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <FolderUp className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 text-start">
              <div className="font-semibold text-foreground">
                Drag & Drop Failed Files from Windows Explorer to Auto-Revert
              </div>
              <p className="text-[11px] text-muted-foreground">
                Drop any files that failed portal/FTP upload here. StockFlow matches them by filename or SHA-256 hash and highlights them below.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              dropInputRef.current?.click();
            }}
            className="h-7 px-2.5 text-[11px] shrink-0 cursor-pointer"
          >
            Select Failed Files...
          </Button>
        </div>

        {dropMatchMessage && (
          <div
            data-testid="reconcile-drop-match-banner"
            className="px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex flex-wrap items-center justify-between gap-2 text-[11px]"
          >
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Matched {dropMatchMessage.matchedCount} failed file(s) by Filename / SHA-256 (selected in grid below).
                {dropMatchMessage.unmatchedCount > 0 &&
                  ` (${dropMatchMessage.unmatchedCount} unmatched)`}
              </span>
            </div>
            {dropMatchMessage.matchedCount > 0 && (
              <Button
                type="button"
                size="sm"
                data-testid="reconcile-drop-revert-only-btn"
                onClick={handleRevertSelectedOnly}
                className="h-6 px-2 text-[10px] bg-amber-500 text-black hover:bg-amber-400 font-semibold cursor-pointer"
              >
                Revert {dropMatchMessage.matchedCount} Matched to New Now
              </Button>
            )}
          </div>
        )}

        {/* Method 1: Visual Thumbnail Grid with Ctrl+Click & Shift+Click Range Selection */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                Pending Upload Visual Grid — {AGENCY_NAMES[targetAgency]} ({pendingAssets.length} items)
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                Click, Ctrl+Click, or Shift+Click thumbnails that failed upload
              </span>
            </div>

            {pendingAssets.length > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedFailedIds(new Set(pendingAssets.map((a) => a.id)))}
                  className="text-muted-foreground hover:text-foreground underline cursor-pointer"
                >
                  Select All
                </button>
                {selectedFailedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedFailedIds(new Set())}
                    className="text-muted-foreground hover:text-foreground underline cursor-pointer"
                  >
                    Clear ({selectedFailedIds.size})
                  </button>
                )}
              </div>
            )}
          </div>

          {pendingAssets.length === 0 ? (
            <div className="p-6 rounded-xl border border-border bg-secondary/20 text-center text-muted-foreground">
              No assets are currently in Pending Upload status for {AGENCY_NAMES[targetAgency]}.
            </div>
          ) : (
            <div
              data-testid="reconcile-visual-thumbnail-grid"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1 select-none"
            >
              {pendingAssets.map((asset, idx) => {
                const isSelectedFailed = selectedFailedIds.has(asset.id);
                const mediaType = asset.mediaType || 'image';
                const cleanHash = (asset.fileHash || '').replace(/^sha256_/, '').slice(0, 8);

                const previewSrc = resolveAssetPreviewUrl(asset);

                return (
                  <button
                    key={asset.id}
                    type="button"
                    data-testid={`reconcile-thumb-card-${asset.filename}`}
                    onClick={(e) => handleCardSelect(asset.id, idx, e)}
                    className={`p-2 rounded-lg border text-start flex items-center gap-2.5 transition cursor-pointer relative ${
                      isSelectedFailed
                        ? 'border-destructive bg-destructive/15 ring-1 ring-destructive'
                        : 'border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-md border border-border bg-background overflow-hidden shrink-0 flex items-center justify-center relative">
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={asset.filename}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : mediaType === 'video' ? (
                        <Film className="w-4 h-4 text-muted-foreground" />
                      ) : mediaType === 'vector' ? (
                        <PenTool className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-mono text-[11px] font-semibold text-foreground truncate" dir="ltr">
                        {asset.filename}
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-muted-foreground">
                        <span>#{idx + 1} · {cleanHash}</span>
                        {isSelectedFailed && (
                          <span className="text-destructive font-semibold">Failed</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelectedFailed}
                        onCheckedChange={() => {
                          setSelectedFailedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(asset.id)) next.delete(asset.id);
                            else next.add(asset.id);
                            return next;
                          });
                          setLastClickedIdx(idx);
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Reconciliation Action Footer */}
        <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground font-mono">
            {selectedFailedIds.size > 0 ? (
              <span className="text-destructive font-semibold">
                {selectedFailedIds.size} failed item(s) highlighted to Revert → New · {succeededIdsArray.length} remaining ready for Uploaded
              </span>
            ) : (
              <span>0 failed items selected · All {pendingAssets.length} items ready to confirm</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedFailedIds.size > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="reconcile-revert-selected-btn"
                  onClick={handleRevertSelectedOnly}
                  className="h-8 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert {selectedFailedIds.size} Selected to New</span>
                </Button>

                {succeededIdsArray.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    data-testid="reconcile-split-confirm-btn"
                    onClick={handleRevertSelectedAndConfirmRest}
                    className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      Revert {selectedFailedIds.size} to New & Mark {succeededIdsArray.length} Uploaded
                    </span>
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingAssets.length === 0}
                  onClick={async () => {
                    await onSplitReconcile({
                      agencyId: targetAgency,
                      revertToNewIds: pendingAssets.map((a) => a.id),
                      markUploadedIds: [],
                    });
                  }}
                  className="h-8 text-xs gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert All to New</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  data-testid="reconcile-confirm-all-uploaded-btn"
                  disabled={pendingAssets.length === 0}
                  onClick={handleConfirmAllUploaded}
                  className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Confirm All ({pendingAssets.length}) Uploaded</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
