import React, { useRef, useState, useMemo, useCallback, useTransition } from 'react';
import { db } from '../../db';
import { useLanguage } from '../../context/LanguageContext';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  useBatchQueue,
  useUnifiedAssets,
  useCsvExport,
  useStudioMarketplaceSettings,
  useStudioDialogs,
} from '../../hooks';
import { StudioToolbar } from '../../components/studio/StudioToolbar';
import { GlobalProgressBanner } from '../../components/studio/GlobalProgressBanner';
import { MarketplaceSidebar } from '../../components/studio/MarketplaceSidebar';
import { AssetCardList } from '../../components/studio/AssetCardList';
import { KeyRingView } from '../keyring/components/KeyRingView';
import { StockTemplatesModal } from '../tools/StockTemplatesModal';
import { MediaLightboxModal } from '../../components/MediaLightboxModal';
import { Dialog } from '../../components/ui/dialog';
import { ConfirmDialog } from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import { PLATFORMS_CONFIG } from '../../constants/platforms';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { MasterMetadataRecord, SupportedPlatform } from '../../types';
import { Archive, Copy, Eye, Check, Download, AlertTriangle, KeyRound } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert';

export const StudioView: React.FC = () => {
  const { t, isRtl, language } = useLanguage();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Modular Hooks
  const {
    queueState,
    isRunning,
    isPaused,
    showProgressBar,
    start,
    pause,
    resume,
    retryFailed,
    reprocessItem,
    reprocessAll,
    addFiles,
    remove,
    clear,
  } = useBatchQueue();

  const settings = useStudioMarketplaceSettings();
  const dialogs = useStudioDialogs();

  // Keys & API Health Query
  const keys = useLiveQuery(() => db.apiKeys.toArray(), []) || [];
  const healthyKeys = useMemo(() => keys.filter((k) => k.status !== 'invalid' && k.status !== 'disabled'), [keys]);
  const combinedRpm = useMemo(() => healthyKeys.reduce((acc, k) => acc + (k.rpmLimit || 15), 0), [healthyKeys]);
  const [isKeyShake, setIsKeyShake] = useState(false);

  // Assets & View Mode
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>(() => {
    return (localStorage.getItem('stock_view_mode') as 'compact' | 'detailed') || 'detailed';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Unified Reactive Assets (In-Place sorting by createdAt)
  const { unifiedAssets, filteredAssets, completedCount, pendingCount, brandNewPendingCount, failedCount } =
    useUnifiedAssets(queueState, searchQuery, 'all');

  const records = useMemo(
    () => unifiedAssets.map((a: any) => a.masterRecord).filter(Boolean) as MasterMetadataRecord[],
    [unifiedAssets]
  );

  // CSV Export Engine with Strict Lockout
  const {
    previewPlatform,
    previewCsvContent,
    previewCopied,
    setPreviewPlatform,
    copyPreviewCsv,
    handlePreviewCsv,
    handleSingleExport,
    handleZipExport,
  } = useCsvExport(records, settings.selectedPlatforms, isRunning, settings.getTransformOptions);

  // Ingest Handlers
  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    await addFiles(files);
  }, [addFiles]);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }, [handleFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, [handleFiles]);

  // Action Dispatchers
  const handleStart = useCallback(() => {
    if (healthyKeys.length === 0) {
      setIsKeyShake(true);
      setTimeout(() => setIsKeyShake(false), 800);
      return;
    }
    const model = settings.freepikModel === 'Other' ? settings.customFreepikModel : settings.freepikModel;
    start(settings.isAiGenerated, settings.userCustomPrompt, model, settings.keywordPhrasing, settings.titleLengthPreset);
  }, [healthyKeys, settings, start]);

  const handleResume = useCallback(() => {
    const model = settings.freepikModel === 'Other' ? settings.customFreepikModel : settings.freepikModel;
    resume(settings.isAiGenerated, settings.userCustomPrompt, model);
  }, [settings, resume]);

  const handleRetryFailed = useCallback(() => {
    const model = settings.freepikModel === 'Other' ? settings.customFreepikModel : settings.freepikModel;
    retryFailed(settings.isAiGenerated, settings.userCustomPrompt, model, settings.keywordPhrasing, settings.titleLengthPreset);
  }, [settings, retryFailed]);

  const handleRegenerateAll = useCallback(() => {
    const model = settings.freepikModel === 'Other' ? settings.customFreepikModel : settings.freepikModel;
    reprocessAll(settings.isAiGenerated, settings.userCustomPrompt, model, settings.keywordPhrasing, settings.titleLengthPreset);
  }, [settings, reprocessAll]);

  const handleRegenerateSingle = useCallback((id: string) => {
    const model = settings.freepikModel === 'Other' ? settings.customFreepikModel : settings.freepikModel;
    reprocessItem(id, settings.isAiGenerated, settings.userCustomPrompt, model, settings.keywordPhrasing, settings.titleLengthPreset);
  }, [settings, reprocessItem]);

  const handleDeleteSingle = useCallback(async () => {
    if (dialogs.assetToDelete) {
      const { id } = dialogs.assetToDelete;
      await db.masterRecords.delete(id);
      remove(id);
      dialogs.setAssetToDelete(null);
    }
  }, [dialogs, remove]);

  const handleClearAll = useCallback(async () => {
    await db.masterRecords.clear();
    clear();
    dialogs.setClearAllConfirmOpen(false);
  }, [clear, dialogs]);

  const handleCopyText = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  const handleCopyAll = useCallback((rec: MasterMetadataRecord) => {
    const lines = [
      `Title: ${rec.baseTitle}`,
      `Description: ${rec.detailedDescription}`,
      `Keywords: ${(rec.rankedKeywords || []).join(', ')}`,
      rec.categories?.adobeCategoryId ? `Adobe Category: #${rec.categories.adobeCategoryId}` : '',
      rec.categories?.shutterstockCategories?.length ? `Shutterstock: ${rec.categories.shutterstockCategories.join(', ')}` : '',
      rec.categories?.dreamstimeCategory1 ? `Dreamstime: #${rec.categories.dreamstimeCategory1}` : '',
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedKey(`all-${rec.id}`);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start h-full min-h-0 overflow-hidden">
      {/* Hidden File / Folder Inputs */}
      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.eps,.ai,.svg" onChange={onFileInputChange} className="hidden" />
      <input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={onFileInputChange} className="hidden" />

      {/* Left Sidebar: Marketplaces, Tools, & API Key Status */}
      <MarketplaceSidebar
        settings={settings}
        healthyKeysCount={healthyKeys.length}
        combinedRpm={combinedRpm}
        onOpenKeyRing={() => dialogs.setIsKeyRingOpen(true)}
        onOpenTemplates={() => dialogs.setIsTemplatesOpen(true)}
        onUnlockDt={() => dialogs.setIsDtUnlockDialogOpen(true)}
        onUnlockShutter={() => dialogs.setIsShutterUnlockDialogOpen(true)}
      />

      {/* Main Workspace */}
      <main className="flex-1 w-full min-w-0 space-y-4 h-full min-h-0 overflow-y-auto pr-1">
        {/* Missing API Key Warning Banner */}
        {healthyKeys.length === 0 && (
          <Alert variant="warning" className={`shadow-2xs ${isKeyShake ? 'animate-shake ring-2 ring-amber-500/50' : ''}`}>
            <KeyRound className="w-4 h-4" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div>
                <AlertTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {t.apiKeyMissingBannerTitle || 'API Key Required for AI Generation'}
                </AlertTitle>
                <AlertDescription className="text-xs text-amber-800/90 dark:text-amber-300/80">
                  {t.apiKeyMissingBannerDesc || 'Please add at least one API key to start generating metadata.'}
                </AlertDescription>
              </div>
              <Button size="sm" onClick={() => dialogs.setIsKeyRingOpen(true)} className="h-8 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white shrink-0 cursor-pointer">
                {t.manageKeys || 'Manage Keys'}
              </Button>
            </div>
          </Alert>
        )}

        {/* Global Toolbar */}
        <StudioToolbar
          searchQuery={searchQuery}
          onSearchChange={(q) => startTransition(() => setSearchQuery(q))}
          cardViewMode={viewMode}
          onViewModeChange={(m) => {
            setViewMode(m);
            localStorage.setItem('stock_view_mode', m);
          }}
          totalAssetsCount={unifiedAssets.length}
          completedCount={completedCount}
          pendingCount={pendingCount}
          brandNewPendingCount={brandNewPendingCount}
          failedCount={failedCount}
          isRunning={isRunning}
          isPaused={isPaused}
          hasHealthyKeys={healthyKeys.length > 0}
          onStartQueue={handleStart}
          onPauseQueue={pause}
          onResumeQueue={handleResume}
          onRetryFailed={handleRetryFailed}
          onRegenerateAll={handleRegenerateAll}
          onExportCsvs={() => dialogs.setIsExportOpen(true)}
          onClearAll={() => dialogs.setClearAllConfirmOpen(true)}
          onKeyAlertShake={() => {
            setIsKeyShake(true);
            setTimeout(() => setIsKeyShake(false), 800);
          }}
          language={language as any}
          t={t as any}
        />

        {/* Live Progress Bar Banner */}
        <GlobalProgressBanner
          queueState={queueState}
          showProgressBar={showProgressBar}
          isRunning={isRunning}
          onRetryFailed={handleRetryFailed}
        />

        {/* Assets Cards Grid List */}
        <AssetCardList
          assets={filteredAssets}
          viewMode={viewMode}
          freepikAiGenerated={settings.freepikAiGenerated}
          dtAiGenerated={settings.dtAiGenerated}
          selectedPlatforms={settings.selectedPlatforms}
          copiedKey={copiedKey}
          onCopyText={handleCopyText}
          onCopyAll={handleCopyAll}
          onDelete={(id, filename) => dialogs.setAssetToDelete({ id, filename })}
          onRegenerate={handleRegenerateSingle}
          onOpenLightbox={(id) => {
            const idx = unifiedAssets.findIndex((a: any) => a.id === id);
            if (idx !== -1) dialogs.setLightboxIndex(idx);
          }}
          onSelectFiles={() => fileInputRef.current?.click()}
          onSelectFolder={() => folderInputRef.current?.click()}
          isDragOver={isDragOver}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
        />
      </main>

      {/* Modals & Dialogs */}
      <Dialog open={dialogs.isKeyRingOpen} onClose={() => dialogs.setIsKeyRingOpen(false)} title={t.keysTitle || 'API Keys & Priority'} className="max-w-3xl">
        <KeyRingView />
      </Dialog>

      <Dialog open={dialogs.isExportOpen} onClose={() => dialogs.setIsExportOpen(false)} title="Export Marketplace CSV Files" className="max-w-2xl">
        <div className="space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">CSVs for {settings.selectedPlatforms.length} active marketplaces.</span>
            <Button size="sm" onClick={() => handleZipExport()} disabled={settings.selectedPlatforms.length === 0} className="gap-1.5 text-xs font-semibold shrink-0 cursor-pointer">
              <Archive className="w-3.5 h-3.5" /> Download All Selected (.ZIP)
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.values(PLATFORMS_CONFIG).filter((p: any) => settings.selectedPlatforms.includes(p.id)).map((p: any) => (
              <div key={p.id} className="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getPlatformLogo(p.id, 20)}
                  <div>
                    <div className="font-semibold text-foreground">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{p.filenameSuffix}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handlePreviewCsv(p.id)} className="h-6 px-1.5 text-[10px] gap-1 cursor-pointer">
                    <Eye className="w-3 h-3" /> Preview
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleSingleExport(p.id)} className="h-6 px-2 text-[10px] gap-1 cursor-pointer">
                    <Download className="w-3 h-3" /> CSV
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      {previewPlatform && (
        <Dialog open={!!previewPlatform} onClose={() => setPreviewPlatform(null)} title={`CSV Preview: ${PLATFORMS_CONFIG[previewPlatform].name}`} className="max-w-2xl">
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={copyPreviewCsv} className="h-7 text-xs gap-1 cursor-pointer">
                {previewCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {previewCopied ? 'Copied' : 'Copy CSV'}
              </Button>
            </div>
            <pre dir="ltr" className="p-3 bg-secondary/50 rounded-lg text-[11px] font-mono text-foreground overflow-x-auto max-h-80 whitespace-pre text-left">
              {previewCsvContent}
            </pre>
          </div>
        </Dialog>
      )}

      <StockTemplatesModal open={dialogs.isTemplatesOpen} onClose={() => dialogs.setIsTemplatesOpen(false)} />

      <ConfirmDialog
        open={dialogs.isDtUnlockDialogOpen}
        onOpenChange={dialogs.setIsDtUnlockDialogOpen}
        title={t.dtWarningTitle}
        description={t.dtWarningDesc}
        confirmText={t.dtWarningConfirm}
        cancelText={t.cancel}
        onConfirm={() => {
          settings.setIsDtLocked(false);
          localStorage.setItem('stock_dt_locked', JSON.stringify(false));
        }}
      />

      <ConfirmDialog
        open={dialogs.isShutterUnlockDialogOpen}
        onOpenChange={dialogs.setIsShutterUnlockDialogOpen}
        title={t.shutterWarningTitle}
        description={t.shutterWarningDesc}
        confirmText={t.shutterWarningConfirm}
        cancelText={t.cancel}
        onConfirm={() => {
          settings.setIsShutterLocked(false);
          localStorage.setItem('stock_shutter_locked', JSON.stringify(false));
        }}
      />

      <ConfirmDialog
        open={!!dialogs.assetToDelete}
        onOpenChange={(open) => !open && dialogs.setAssetToDelete(null)}
        title="Delete Asset"
        description={`Delete "${dialogs.assetToDelete?.filename}" from studio and local database?`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteSingle}
      />

      <ConfirmDialog
        open={dialogs.clearAllConfirmOpen}
        onOpenChange={dialogs.setClearAllConfirmOpen}
        title="Clear All Assets"
        description="Are you sure you want to clear all assets, queues, and metadata records? This action cannot be undone."
        confirmText="Clear Everything"
        variant="destructive"
        onConfirm={handleClearAll}
      />

      {dialogs.lightboxIndex !== null && (
        <MediaLightboxModal
          open={dialogs.lightboxIndex !== null}
          onClose={() => dialogs.setLightboxIndex(null)}
          assets={unifiedAssets as any}
          initialIndex={dialogs.lightboxIndex}
        />
      )}
    </div>
  );
};
