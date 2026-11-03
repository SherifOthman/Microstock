import React, { useRef, useState, useMemo } from 'react';
import { Sparkles, Wand2, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useFileCleaner } from './hooks/useFileCleaner';
import { CleanerToolbar } from './components/CleanerToolbar';
import { CleanerFileTable } from './components/CleanerFileTable';
import { DuplicateResolverModal } from './components/DuplicateResolverModal';
import { MediaLightboxModal, LightboxAsset } from '../../components/MediaLightboxModal';
import { Button } from '../../components/ui/button';

export interface FileCleanerViewProps {
  onSendToStudio?: (files: File[]) => void;
}

export const FileCleanerView: React.FC<FileCleanerViewProps> = ({ onSendToStudio }) => {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const c = useFileCleaner(language, onSendToStudio);

  const lightboxAssets: LightboxAsset[] = useMemo(() => {
    return c.filteredItems.map((item) => ({
      id: item.id,
      filename: `${item.originalName} → ${item.customName || item.cleanedName}`,
      mediaType:
        item.subFolder === 'Videos' ? 'video' : item.subFolder === 'Vectors' ? 'vector' : 'image',
      file: item.file,
      nativePath: item.nativePath || (item.file as any)?.path,
      width: item.validation?.width,
      height: item.validation?.height,
    }));
  }, [c.filteredItems]);

  return (
    <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.eps,.ai,.svg"
        onChange={c.handleFileInput}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        onChange={c.handleFileInput}
        className="hidden"
      />

      {/* Compact Workspace Header */}
      <div className="p-3.5 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-secondary text-primary border border-border">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-semibold text-foreground tracking-tight">
              {language === 'ar'
                ? 'منظم ومُسمّي ملفات الستوك'
                : 'Batch File Cleaner & Sequential Renamer'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {language === 'ar'
                ? 'تنظيف الأسماء، فحص الأبعاد، والفرز التلقائي إلى مجلدات الـ Batch.'
                : 'Sanitize filenames, verify agency resolution thresholds, and auto-route into batch folders.'}
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground shrink-0">
          {language === 'ar' ? '≤ 55 حرف · فحص 4K/1080p' : '≤ 55 chars · 4K/1080p Check'}
        </span>
      </div>

      {/* Post-Process Handoff Banner when queue was saved */}
      {c.rawFiles.length === 0 && c.lastProcessedFiles.length > 0 && onSendToStudio && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {language === 'ar'
                ? `تم تجهيز وتسمية ${c.lastProcessedFiles.length} ملف بنجاح.`
                : `${c.lastProcessedFiles.length} cleaned file(s) are ready for AI tagging.`}
            </span>
          </div>
          <Button
            size="sm"
            onClick={c.handleSendToStudio}
            className="gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>
              {language === 'ar'
                ? `إرسال إلى استوديو Metadata (${c.lastProcessedFiles.length})`
                : `Send to Metadata Studio (${c.lastProcessedFiles.length})`}
            </span>
          </Button>
        </div>
      )}

      {/* Master Directory & Sorting Toolbar */}
      <div className="shrink-0">
        <CleanerToolbar
          language={language}
          masterDirectory={c.masterDirectory}
          existingBatchesCount={c.existingBatches.length}
          isScanningDisk={c.isScanningDisk}
          isProcessing={c.isProcessing}
          mediaSlots={c.mediaSlots}
          options={c.options}
          setOptions={c.setOptions}
          rawFilesCount={c.rawFiles.length}
          isSeqWarningDismissed={c.isSeqWarningDismissed}
          setIsSeqWarningDismissed={c.setIsSeqWarningDismissed}
          blockingErrorCount={c.blockingErrorCount}
          softWarningCount={c.softWarningCount}
          isBulkMoving={c.isBulkMoving}
          statusNotification={c.statusNotification}
          onSelectMasterDirectory={c.handleSelectMasterDirectory}
          onScanMasterDirectory={c.scanMasterDirectory}
          onReShuffle={c.handleReShuffle}
          onBulkMoveLowResPhotos={c.handleBulkMoveLowResPhotos}
          onDismissNotification={() => c.setStatusNotification(null)}
        />
      </div>

      {/* File Table or Dropzone */}
      <CleanerFileTable
        language={language}
        rawFilesCount={c.rawFiles.length}
        cleanedItems={c.cleanedItems}
        filteredItems={c.filteredItems}
        mediaBatches={c.mediaBatches}
        batchDistribution={c.batchDistribution}
        searchFilter={c.searchFilter}
        setSearchFilter={c.setSearchFilter}
        isProcessing={c.isProcessing}
        isBatchSaved={c.isBatchSaved}
        masterDirectory={c.masterDirectory}
        blockingErrorCount={c.blockingErrorCount}
        totalDuplicateCount={c.totalDuplicateCount}
        duplicateGroupKeys={c.duplicateGroupKeys}
        progressMsg={c.progressMsg}
        onDrop={c.handleDrop}
        onSelectFilesClick={() => fileInputRef.current?.click()}
        onSelectFolderClick={() => folderInputRef.current?.click()}
        onInitiateProcess={c.handleInitiateProcess}
        onSendToStudio={onSendToStudio ? c.handleSendToStudio : undefined}
        onOpenDuplicateModal={(key) => c.setActiveDuplicateKey(key)}
        onRemoveItem={c.handleRemoveItem}
        onPreviewItem={(item) => setPreviewItemId(item.id)}
      />

      {/* Modals for Duplicate Comparison & Completion */}
      <DuplicateResolverModal
        language={language}
        activeDuplicateKey={c.activeDuplicateKey}
        onCloseDuplicateModal={() => c.setActiveDuplicateKey(null)}
        currentDuplicateModalItems={c.currentDuplicateModalItems}
        onRemoveItem={c.handleRemoveItem}
        showDuplicateInterceptDialog={c.showDuplicateInterceptDialog}
        onOpenChangeDuplicateIntercept={c.setShowDuplicateInterceptDialog}
        totalDuplicateCount={c.totalDuplicateCount}
        onConfirmProceedDuplicates={() => {
          c.setShowDuplicateInterceptDialog(false);
          c.handleProcessAndSave();
        }}
        showSuccessDialog={c.showSuccessDialog}
        onOpenChangeSuccessDialog={c.setShowSuccessDialog}
        successDialogInfo={c.successDialogInfo}
        onSendToStudio={onSendToStudio ? c.handleSendToStudio : undefined}
      />

      {/* Full-Screen Media Lightbox Preview for Images, Videos & Vectors */}
      <MediaLightboxModal
        open={Boolean(previewItemId)}
        onOpenChange={(open) => {
          if (!open) setPreviewItemId(null);
        }}
        assets={lightboxAssets}
        initialAssetId={previewItemId}
        onNavigate={(id) => setPreviewItemId(id)}
      />
    </div>
  );
};

