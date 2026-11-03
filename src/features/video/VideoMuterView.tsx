import React, { useRef, useState, useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { Tooltip } from '../../components/ui/tooltip';
import {
  CheckCircle2,
  FolderUp,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  VolumeX,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVideoMuter, VideoMuteItem } from './hooks/useVideoMuter';
import { VideoMuterTable } from './components/VideoMuterTable';
import { TaskProgressBar } from '../../components/ui/TaskProgressBar';
import { MediaLightboxModal, LightboxAsset } from '../../components/MediaLightboxModal';

export type { VideoMuteItem };

export interface VideoMuterViewProps {
  onSendToStudio?: (files: File[]) => void;
}

/**
 * Lossless Video Audio Stripper (Standalone Utility)
 * Strictly preserves exact original filenames without renaming so sequence matching
 * with File Cleaner and CSV exports remains 100% intact.
 */
export const VideoMuterView: React.FC<VideoMuterViewProps> = ({ onSendToStudio }) => {
  const { language, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const {
    items,
    isMutingBatch,
    isExporting,
    exportSuccessMessage,
    handleAddFiles,
    handleRemoveItem,
    handleClearAll,
    handleMuteSingle,
    handleMuteAll,
    handleDownloadSingle,
    handleExportToFolder,
  } = useVideoMuter(language, onSendToStudio);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleAddFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  const completedCount = items.filter((i) => i.status === 'completed').length;

  const lightboxAssets: LightboxAsset[] = useMemo(() => {
    return items.map((item) => ({
      id: item.id,
      filename: item.originalName,
      mediaType: 'video',
      file: item.file,
      nativePath: item.nativePath || (item.file as any)?.path,
    }));
  }, [items]);

  return (
    <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/mp4,video/quicktime,.mp4,.mov"
        onChange={onFileInputChange}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        onChange={onFileInputChange}
        className="hidden"
      />

      {/* Header Bar */}
      <div className="p-3.5 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-secondary text-primary border border-border">
            <VolumeX className="w-4 h-4" />
          </div>
          <div className="text-start">
            <h1 className="text-sm sm:text-base font-semibold text-foreground tracking-tight">
              {language === 'ar' ? 'حذف صوت الفيديو بدون إعادة ترميز' : 'Lossless Video Audio Stripper'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {language === 'ar'
                ? 'إزالة مسارات الصوت من ملفات MP4 و MOV مع الحفاظ على الاسم الأصلي ودقة الفيديو 100%.'
                : 'Strip audio tracks from MP4 and MOV containers while preserving exact original filenames.'}
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono text-muted-foreground shrink-0">
          {language === 'ar' ? 'MP4 · MOV · بدون إعادة ترميز' : 'MP4 · MOV · Zero Re-encode'}
        </span>
      </div>

      {/* Success Banner */}
      {exportSuccessMessage && (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 shrink-0">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{exportSuccessMessage}</span>
        </div>
      )}

      {/* Main Content */}
      {items.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="border-2 border-dashed border-border hover:border-primary/50 bg-card rounded-xl p-10 text-center transition space-y-3"
        >
          <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center mx-auto border border-border">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {language === 'ar' ? 'اسحب مقاطع الفيديو هنا (MP4 / MOV)' : 'Drop MP4 or MOV video files here'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {language === 'ar'
                ? 'فحص تلقائي لوجود الصوت وحذفه في أجزاء من الثانية.'
                : 'Automatic audio track detection and sub-second stream stripping.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 text-xs font-semibold cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              <span>{t.selectFiles}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => folderInputRef.current?.click()}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <FolderUp className="w-3.5 h-3.5" />
              <span>{t.selectFolder}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 h-full flex flex-col gap-2.5 overflow-hidden">
          {/* Sticky Action Toolbar with Both "Add Files" and "Add Folder" + Standalone "Save to Folder" */}
          <div className="p-3 bg-card rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
              <span className="font-semibold text-foreground">
                {items.length} {language === 'ar' ? 'فيديو' : 'videos'}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {completedCount}/{items.length} {language === 'ar' ? 'صامت' : 'muted'}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.selectFiles}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <FolderUp className="w-3.5 h-3.5" />
                <span>{t.selectFolder}</span>
              </Button>

              {completedCount < items.length && (
                <Button
                  size="sm"
                  onClick={handleMuteAll}
                  disabled={isMutingBatch}
                  className="gap-1.5 text-xs font-semibold cursor-pointer"
                >
                  {isMutingBatch ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>{language === 'ar' ? 'كتم صوت الكل' : 'Mute All Videos'}</span>
                </Button>
              )}

              <Button
                size="sm"
                variant={completedCount === items.length ? 'default' : 'secondary'}
                onClick={handleExportToFolder}
                disabled={isExporting}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderUp className="w-3.5 h-3.5" />}
                <span>{language === 'ar' ? 'حفظ في مجلد' : 'Save to Folder'}</span>
              </Button>

              <Tooltip content={language === 'ar' ? 'مسح القائمة' : 'Clear All'}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearAll}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* Consistent Global Task Progress Bar */}
          <TaskProgressBar
            status={
              isMutingBatch
                ? 'running'
                : completedCount === items.length && items.length > 0
                ? 'completed'
                : 'idle'
            }
            currentCount={completedCount}
            totalCount={items.length}
            statusLabel={
              isMutingBatch
                ? language === 'ar'
                  ? 'جاري كتم مسارات الصوت من الفيديوهات...'
                  : 'Stripping audio tracks from videos...'
                : completedCount === items.length
                ? language === 'ar'
                  ? 'تم كتم جميع مسارات الصوت'
                  : 'All videos audio stripped'
                : language === 'ar'
                ? 'جاهز للكتم'
                : 'Ready to Strip'
            }
            failedCount={items.filter((i) => i.status === 'error').length}
            onRetryFailed={
              items.some((i) => i.status === 'error')
                ? () => {
                    const failed = items.filter((i) => i.status === 'error');
                    failed.forEach((f) => handleMuteSingle(f.id));
                  }
                : undefined
            }
            language={language}
          />

          {/* TanStack Virtualized Videos Table (Full Window Height) */}
          <VideoMuterTable
            items={items}
            language={language}
            onMuteSingle={handleMuteSingle}
            onDownloadSingle={handleDownloadSingle}
            onRemoveItem={handleRemoveItem}
            onPreviewItem={(item) => setPreviewItemId(item.id)}
          />
        </div>
      )}

      {/* Full-Screen Video Lightbox Preview */}
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

