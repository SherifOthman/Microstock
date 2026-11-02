import React, { useRef } from 'react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Sparkles, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useFileCleaner } from './hooks/useFileCleaner';
import { CleanerToolbar } from './components/CleanerToolbar';
import { CleanerFileTable } from './components/CleanerFileTable';
import { DuplicateResolverModal } from './components/DuplicateResolverModal';

export const FileCleanerView: React.FC = () => {
  const { t, language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const cleaner = useFileCleaner(language);

  return (
    <div className="space-y-5 max-w-6xl mx-auto py-2 px-1">
      {/* Hidden File / Folder Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={cleaner.handleFileInput}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory folder upload
        webkitdirectory=""
        directory=""
        multiple
        onChange={cleaner.handleFileInput}
        className="hidden"
      />

      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-foreground">
              {language === 'ar' ? 'منظم الباتشات والمُسمّي الذكي' : 'Smart Batch Ingestor & Auto-Organizer'}
            </h1>
            <Badge variant="secondary" className="text-[11px] font-mono text-emerald-500 border-emerald-500/30">
              Microstock Ready
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {language === 'ar'
              ? 'تنظيم ذكي للأصول بهيكلية (Photos / Videos / Vectors / B01) مع تسمية هجينة تسلسلية (B01_001__name) وفحص دقة الستوك ومنع التكرار.'
              : 'Media-first hierarchy (Photos/Videos/Vectors > B01) with hybrid sequential naming (B01_001__name), microstock resolution validation, and duplicate detection.'}
          </p>
        </div>

        {cleaner.rawFiles.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={cleaner.handleClearAll}
              disabled={cleaner.isProcessing}
              className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.clearAll || 'Clear Queue'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Ingestion Settings & Master Destination Toolbar */}
      <CleanerToolbar
        language={language}
        masterDirectory={cleaner.masterDirectory}
        existingBatchesCount={cleaner.existingBatches.length}
        isScanningDisk={cleaner.isScanningDisk}
        isProcessing={cleaner.isProcessing}
        mediaSlots={cleaner.mediaSlots}
        options={cleaner.options}
        setOptions={cleaner.setOptions}
        rawFilesCount={cleaner.rawFiles.length}
        isSeqWarningDismissed={cleaner.isSeqWarningDismissed}
        setIsSeqWarningDismissed={cleaner.setIsSeqWarningDismissed}
        blockingErrorCount={cleaner.blockingErrorCount}
        softWarningCount={cleaner.softWarningCount}
        isBulkMoving={cleaner.isBulkMoving}
        statusNotification={cleaner.statusNotification}
        onSelectMasterDirectory={cleaner.handleSelectMasterDirectory}
        onScanMasterDirectory={cleaner.scanMasterDirectory}
        onReShuffle={cleaner.handleReShuffle}
        onBulkMoveLowResPhotos={cleaner.handleBulkMoveLowResPhotos}
        onDismissNotification={() => cleaner.setStatusNotification(null)}
      />

      {/* Dropzone & Live File Ingest Allocation Table */}
      <CleanerFileTable
        language={language}
        rawFilesCount={cleaner.rawFiles.length}
        cleanedItems={cleaner.cleanedItems}
        filteredItems={cleaner.filteredItems}
        mediaBatches={cleaner.mediaBatches}
        batchDistribution={cleaner.batchDistribution}
        searchFilter={cleaner.searchFilter}
        setSearchFilter={cleaner.setSearchFilter}
        isProcessing={cleaner.isProcessing}
        masterDirectory={cleaner.masterDirectory}
        blockingErrorCount={cleaner.blockingErrorCount}
        totalDuplicateCount={cleaner.totalDuplicateCount}
        duplicateGroupKeys={cleaner.duplicateGroupKeys}
        progressMsg={cleaner.progressMsg}
        onDrop={cleaner.handleDrop}
        onSelectFilesClick={() => fileInputRef.current?.click()}
        onSelectFolderClick={() => folderInputRef.current?.click()}
        onInitiateProcess={cleaner.handleInitiateProcess}
        onOpenDuplicateModal={(key) => cleaner.setActiveDuplicateKey(key)}
        onRemoveItem={cleaner.handleRemoveItem}
      />

      {/* Duplicate Resolution & Success Dialogs */}
      <DuplicateResolverModal
        language={language}
        activeDuplicateKey={cleaner.activeDuplicateKey}
        onCloseDuplicateModal={() => cleaner.setActiveDuplicateKey(null)}
        currentDuplicateModalItems={cleaner.currentDuplicateModalItems}
        onRemoveItem={cleaner.handleRemoveItem}
        showDuplicateInterceptDialog={cleaner.showDuplicateInterceptDialog}
        onOpenChangeDuplicateIntercept={cleaner.setShowDuplicateInterceptDialog}
        totalDuplicateCount={cleaner.totalDuplicateCount}
        onConfirmProceedDuplicates={() => {
          cleaner.setShowDuplicateInterceptDialog(false);
          cleaner.handleProcessAndSave();
        }}
        showSuccessDialog={cleaner.showSuccessDialog}
        onOpenChangeSuccessDialog={cleaner.setShowSuccessDialog}
        successDialogInfo={cleaner.successDialogInfo}
      />
    </div>
  );
};
