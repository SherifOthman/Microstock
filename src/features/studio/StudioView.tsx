import React, { useRef, useState, useMemo, useCallback, useTransition } from 'react';
import { db, useSqliteQuery } from '../../db';
import { useLanguage } from '../../context/LanguageContext';
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
import { MasterMetadataRecord } from '../../types';
import { Archive, Copy, Eye, Check, Download, KeyRound, FolderDown, Loader2, AlertTriangle, Volume2, VolumeX } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert';

export interface StudioViewProps {
  onOpenVideoMuter?: () => void;
}

export const StudioView: React.FC<StudioViewProps> = ({ onOpenVideoMuter }) => {
  const { t, language } = useLanguage();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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

  const keys = useSqliteQuery(() => db.apiKeys.toArray(), [], []) || [];
  const healthyKeys = useMemo(() => keys.filter((k) => k.status !== 'invalid' && k.status !== 'disabled'), [keys]);
  const combinedRpm = useMemo(() => healthyKeys.reduce((acc, k) => acc + (k.rpmLimit || 15), 0), [healthyKeys]);
  const [isKeyShake, setIsKeyShake] = useState(false);

  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>(() => {
    return (localStorage.getItem('stock_view_mode') as 'compact' | 'detailed') || 'detailed';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video' | 'vector'>(() => {
    return (localStorage.getItem('stock_studio_media_filter') as any) || 'all';
  });

  const { unifiedAssets, filteredAssets, completedCount, pendingCount, brandNewPendingCount, failedCount } =
    useUnifiedAssets(queueState, searchQuery, 'all');

  const mediaTypeCounts = useMemo(() => {
    const counts: Record<'image' | 'video' | 'vector', number> = { image: 0, video: 0, vector: 0 };
    for (const a of unifiedAssets) {
      const ext = (a.filename || '').split('.').pop()?.toLowerCase() || '';
      const rawType = (a as any).queueItem?.mediaType || (a as any).masterRecord?.mediaType;
      const type: 'image' | 'video' | 'vector' =
        rawType === 'video' || rawType === 'vector' || rawType === 'image'
          ? rawType
          : ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)
          ? 'video'
          : ['eps', 'ai', 'svg'].includes(ext)
          ? 'vector'
          : 'image';
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }, [unifiedAssets]);

  const distinctMediaTypesCount = useMemo(() => {
    return [mediaTypeCounts.image > 0, mediaTypeCounts.video > 0, mediaTypeCounts.vector > 0].filter(Boolean).length;
  }, [mediaTypeCounts]);

  const displayedAssets = useMemo(() => {
    if (distinctMediaTypesCount <= 1 || mediaTypeFilter === 'all') {
      return filteredAssets;
    }
    return filteredAssets.filter((a: any) => {
      const ext = (a.filename || '').split('.').pop()?.toLowerCase() || '';
      const type =
        a.queueItem?.mediaType ||
        a.masterRecord?.mediaType ||
        (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)
          ? 'video'
          : ['eps', 'ai', 'svg'].includes(ext)
          ? 'vector'
          : 'image');
      return type === mediaTypeFilter;
    });
  }, [filteredAssets, mediaTypeFilter, distinctMediaTypesCount]);

  const records = useMemo(
    () => unifiedAssets.map((a: any) => a.masterRecord).filter(Boolean) as MasterMetadataRecord[],
    [unifiedAssets]
  );

  const videosWithAudio = useMemo(
    () =>
      unifiedAssets.filter(
        (a: any) =>
          (a.queueItem?.mediaType === 'video' ||
            a.masterRecord?.mediaType === 'video' ||
            /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(a.filename)) &&
          Boolean(a.queueItem?.hasAudio ?? a.masterRecord?.videoMeta?.hasAudio)
      ),
    [unifiedAssets]
  );

  const {
    previewPlatform,
    previewCsvContent,
    previewCopied,
    setPreviewPlatform,
    copyPreviewCsv,
    isSavingToFolder,
    folderSaveSuccess,
    setFolderSaveSuccess,
    noticeDialog,
    setNoticeDialog,
    incompleteExportDialog,
    setIncompleteExportDialog,
    handlePreviewCsv,
    handleSingleExportWithCheck,
    handleExportZipWithCheck,
    handleSaveToFolderWithCheck,
  } = useCsvExport(records, settings.selectedPlatforms, isRunning, settings.getTransformOptions);

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
    <div className="flex flex-col lg:flex-row gap-4 items-start h-full min-h-0 overflow-hidden">
      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.eps,.ai,.svg" onChange={onFileInputChange} className="hidden" />
      <input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={onFileInputChange} className="hidden" />

      <MarketplaceSidebar
        settings={settings}
        healthyKeysCount={healthyKeys.length}
        combinedRpm={combinedRpm}
        onOpenKeyRing={() => dialogs.setIsKeyRingOpen(true)}
        onOpenTemplates={() => dialogs.setIsTemplatesOpen(true)}
        onUnlockDt={() => dialogs.setIsDtUnlockDialogOpen(true)}
        onUnlockShutter={() => dialogs.setIsShutterUnlockDialogOpen(true)}
      />

      <main className="flex-1 w-full min-w-0 space-y-3 h-full min-h-0 flex flex-col overflow-hidden pr-1">
        {healthyKeys.length === 0 && (
          <Alert variant="warning" className={isKeyShake ? 'animate-shake ring-2 ring-amber-500/50' : ''}>
            <KeyRound className="w-4 h-4" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div>
                <AlertTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {t.apiKeyMissingBannerTitle}
                </AlertTitle>
                <AlertDescription className="text-xs text-amber-800/90 dark:text-amber-300/80">
                  {t.apiKeyMissingBannerDesc}
                </AlertDescription>
              </div>
              <Button size="sm" onClick={() => dialogs.setIsKeyRingOpen(true)} className="h-7 px-3 text-xs shrink-0 cursor-pointer">
                {t.manageKeys}
              </Button>
            </div>
          </Alert>
        )}

        {videosWithAudio.length > 0 && (
          <Alert variant="warning" className="border-amber-500/50 bg-amber-500/10 py-2.5">
            <Volume2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div className="space-y-0.5">
                <AlertTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {language === 'ar'
                    ? `تحذير: تم اكتشاف مسار صوتي في ${videosWithAudio.length} فيديو — خطر رفض الملفات أو حظر الحساب`
                    : `Audio Track Detected in ${videosWithAudio.length} Video(s) — Agency Rejection & Account Risk`}
                </AlertTitle>
                <AlertDescription className="text-[11px] text-amber-800/90 dark:text-amber-300/85 leading-snug">
                  {language === 'ar'
                    ? 'وكالات الميكروستوك (Adobe Stock, Shutterstock, Freepik, Pond5) ترفض الفيديوهات التي تحتوي على ضوضاء مايكروفون أو أصوات بشرية غير مرخصة أو موسيقى خلفية، وقد يؤدي رفع صوت محمي بحقوق نشر إلى حظر حسابك. يُنصح بإزالة الصوت عبر أداة عزل الصوت (Audio Stripper) قبل الرفع.'
                    : 'Stock agencies (Adobe Stock, Shutterstock, Freepik, Pond5, Vecteezy) strictly reject clips containing mic noise, unreleased voices, or background music, and copyrighted audio can trigger account suspension. Strip audio in Audio Stripper before uploading to agencies.'}
                </AlertDescription>
              </div>
              {onOpenVideoMuter && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenVideoMuter}
                  className="h-7 px-2.5 text-xs shrink-0 gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                >
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'فتح أداة عزل الصوت' : 'Open Audio Stripper'}</span>
                </Button>
              )}
            </div>
          </Alert>
        )}

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
          isResizing={queueState.status === 'resizing'}
          mediaTypeFilter={mediaTypeFilter}
          onMediaTypeFilterChange={(f) => {
            setMediaTypeFilter(f);
            localStorage.setItem('stock_studio_media_filter', f);
          }}
          mediaTypeCounts={mediaTypeCounts}
          distinctMediaTypesCount={distinctMediaTypesCount}
          onStartQueue={handleStart}
          onPauseQueue={pause}
          onResumeQueue={handleResume}
          onRetryFailed={handleRetryFailed}
          onRegenerateAll={handleRegenerateAll}
          onExportCsvs={() => {
            setFolderSaveSuccess(null);
            dialogs.setIsExportOpen(true);
          }}
          onClearAll={() => dialogs.setClearAllConfirmOpen(true)}
          onKeyAlertShake={() => {
            setIsKeyShake(true);
            setTimeout(() => setIsKeyShake(false), 800);
          }}
          language={language as any}
          t={t as any}
        />

        <GlobalProgressBanner
          queueState={queueState}
          showProgressBar={showProgressBar}
          isRunning={isRunning}
          onRetryFailed={handleRetryFailed}
          language={language as any}
        />

        <AssetCardList
          assets={displayedAssets}
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
      <Dialog open={dialogs.isKeyRingOpen} onClose={() => dialogs.setIsKeyRingOpen(false)} title={t.keysTitle} size="lg">
        <KeyRingView />
      </Dialog>

      <Dialog
        open={dialogs.isExportOpen}
        onClose={() => dialogs.setIsExportOpen(false)}
        title={language === 'ar' ? 'تصدير ملفات CSV للمنصات' : 'Export Agency CSV Files'}
        size="md"
      >
        <div className="space-y-4 text-xs">
          {unifiedAssets.length > completedCount && (
            <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-2 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {language === 'ar'
                  ? `سيتم تصدير ${completedCount} ملف مكتمل فقط واستبعاد ${unifiedAssets.length - completedCount} ملف قيد الانتظار أو فاشل.`
                  : `Only the ${completedCount} completed asset(s) will be exported (${unifiedAssets.length - completedCount} pending/failed excluded).`}
              </span>
            </div>
          )}

          {videosWithAudio.length > 0 && (
            <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-start gap-2 text-[11px]">
              <Volume2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {language === 'ar'
                  ? `تنبيه هام قبل الرفع: يوجد ${videosWithAudio.length} فيديو يحتوي على مسار صوتي نشط. تأكد من إزالة الصوت قبل رفع الفيديوهات لمنصات الستوك لتجنب رفض الدفعة أو حظر الحساب.`
                  : `Pre-Upload Notice: ${videosWithAudio.length} video(s) still contain an active audio track. Make sure to strip unwanted audio before uploading the video files to stock agencies to avoid rejections or account strikes.`}
              </span>
            </div>
          )}

          {folderSaveSuccess && (
            <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-2 text-[11px]">
              <Check className="w-4 h-4 shrink-0" />
              <span>{folderSaveSuccess}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-mono tabular-nums">
              {language === 'ar'
                ? `${settings.selectedPlatforms.length} منصات · ${completedCount} أصل جاهز`
                : `${settings.selectedPlatforms.length} agencies · ${completedCount} ready`}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => handleSaveToFolderWithCheck(unifiedAssets.length, completedCount)}
                disabled={settings.selectedPlatforms.length === 0 || isSavingToFolder}
                className="gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
              >
                {isSavingToFolder ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderDown className="w-3.5 h-3.5" />
                )}
                <span>{language === 'ar' ? 'حفظ CSV في مجلد' : 'Save CSVs to Folder'}</span>
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {Object.values(PLATFORMS_CONFIG)
              .filter((p: any) => settings.selectedPlatforms.includes(p.id))
              .map((p: any) => (
                <div
                  key={p.id}
                  className="p-3 rounded-lg border border-border bg-secondary/40 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {getPlatformLogo(p.id, 20)}
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground truncate">{p.name}</div>
                      <div dir="ltr" className="text-[10px] text-muted-foreground font-mono text-start truncate">{p.filenameSuffix}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePreviewCsv(p.id)}
                      className="h-7 px-2 text-xs gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> {language === 'ar' ? 'معاينة' : 'Preview'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSingleExportWithCheck(p.id, unifiedAssets.length, completedCount)}
                      className="h-7 px-2.5 text-xs gap-1 cursor-pointer font-medium"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </Dialog>

      {previewPlatform && (
        <Dialog
          open={!!previewPlatform}
          onClose={() => setPreviewPlatform(null)}
          title={
            language === 'ar'
              ? `معاينة CSV: ${PLATFORMS_CONFIG[previewPlatform].name}`
              : `CSV Preview: ${PLATFORMS_CONFIG[previewPlatform].name}`
          }
          size="lg"
        >
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={copyPreviewCsv} className="h-7 text-xs gap-1 cursor-pointer">
                {previewCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {previewCopied ? t.copied : language === 'ar' ? 'نسخ CSV' : 'Copy CSV'}
              </Button>
            </div>
            <pre
              dir="ltr"
              className="p-3 bg-secondary/60 rounded-lg text-[11px] font-mono text-foreground overflow-x-auto max-h-80 whitespace-pre text-left border border-border"
            >
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
        title={t.deleteAsset}
        description={
          language === 'ar'
            ? `هل تريد حذف "${dialogs.assetToDelete?.filename}" من الاستوديو؟`
            : `Remove "${dialogs.assetToDelete?.filename}" from the workspace?`
        }
        confirmText={language === 'ar' ? 'حذف' : 'Delete'}
        cancelText={t.cancel}
        variant="destructive"
        onConfirm={handleDeleteSingle}
      />

      <ConfirmDialog
        open={dialogs.clearAllConfirmOpen}
        onOpenChange={dialogs.setClearAllConfirmOpen}
        title={t.clearAll}
        description={
          language === 'ar'
            ? 'سيتم مسح جميع الملفات وسجلات الـ Metadata الحالية. لا يمكن التراجع عن هذا الإجراء.'
            : 'Clear all queued files and generated metadata records? This action cannot be undone.'
        }
        confirmText={t.clearAll}
        cancelText={t.cancel}
        variant="destructive"
        onConfirm={handleClearAll}
      />

      <ConfirmDialog
        open={Boolean(incompleteExportDialog)}
        onOpenChange={(open) => !open && setIncompleteExportDialog(null)}
        title={language === 'ar' ? 'توجد ملفات غير مكتملة في الدفعة' : 'Incomplete Assets in Batch'}
        description={
          language === 'ar'
            ? `يوجد ${incompleteExportDialog?.incompleteCount || 0} ملف قيد الانتظار أو فشل توليد بياناته. هل تريد المتابعة وتصدير الـ ${incompleteExportDialog?.completedCount || 0} ملف المكتمل فقط؟`
            : `${incompleteExportDialog?.incompleteCount || 0} assets are still pending or failed. Do you want to export only the ${incompleteExportDialog?.completedCount || 0} completed assets?`
        }
        confirmText={
          language === 'ar'
            ? `تصدير المكتمل فقط (${incompleteExportDialog?.completedCount || 0})`
            : `Export Only Completed (${incompleteExportDialog?.completedCount || 0})`
        }
        cancelText={t.cancel}
        onConfirm={() => {
          incompleteExportDialog?.onProceed();
        }}
        onCancel={() => setIncompleteExportDialog(null)}
      />

      <ConfirmDialog
        open={Boolean(noticeDialog)}
        onOpenChange={(open) => !open && setNoticeDialog(null)}
        title={noticeDialog?.title || 'Notice'}
        description={noticeDialog?.message || ''}
        confirmText={language === 'ar' ? 'حسناً' : 'OK'}
        hideCancel={true}
        onConfirm={() => setNoticeDialog(null)}
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
