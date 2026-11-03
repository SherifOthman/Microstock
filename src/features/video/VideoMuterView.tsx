import React, { useRef } from 'react';
import { Button } from '../../components/ui/button';
import { Tooltip } from '../../components/ui/tooltip';
import {
  Archive,
  CheckCircle2,
  FolderUp,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  VolumeX,
  Wand2,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVideoMuter, VideoMuteItem } from './hooks/useVideoMuter';
import { VideoMuterTable } from './components/VideoMuterTable';

export type { VideoMuteItem };

export interface VideoMuterViewProps {
  onSendToStudio?: (files: File[]) => void;
}

/**
 * Lossless Video Audio Stripper
 * Strictly preserves exact original filenames without renaming so sequence matching
 * with File Cleaner and CSV exports remains 100% intact.
 */
export const VideoMuterView: React.FC<VideoMuterViewProps> = ({ onSendToStudio }) => {
  const { language, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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
    handleDownloadAllZip,
    handleExportToFolder,
    handleSendToStudio,
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
  const readyForStudioCount = items.filter((i) => i.status === 'completed' || i.hasAudio === false).length;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
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

      {/* Header Bar (No Filename Renaming Checkbox) */}
      <div className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{exportSuccessMessage}</span>
          </div>
          {onSendToStudio && items.length > 0 && (
            <Button
              size="sm"
              onClick={handleSendToStudio}
              className="gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>
                {language === 'ar'
                  ? `إرسال إلى استوديو Metadata (${readyForStudioCount || items.length})`
                  : `Send to Metadata Studio (${readyForStudioCount || items.length})`}
              </span>
            </Button>
          )}
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
        <div className="space-y-3">
          {/* Action Toolbar with Both "Add Files" and "Add Folder" */}
          <div className="p-3 bg-card rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                variant="secondary"
                size="sm"
                onClick={handleExportToFolder}
                disabled={isExporting}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderUp className="w-3.5 h-3.5" />}
                <span>{language === 'ar' ? 'حفظ في مجلد' : 'Save to Folder'}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAllZip}
                disabled={isExporting}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'تصدير ZIP' : 'Export ZIP'}</span>
              </Button>

              {onSendToStudio && readyForStudioCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSendToStudio}
                  className="gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>
                    {language === 'ar'
                      ? `إرسال إلى استوديو Metadata (${readyForStudioCount})`
                      : `Send to Metadata Studio (${readyForStudioCount})`}
                  </span>
                </Button>
              )}

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

          {/* TanStack Virtualized Videos Table */}
          <VideoMuterTable
            items={items}
            language={language}
            onMuteSingle={handleMuteSingle}
            onDownloadSingle={handleDownloadSingle}
            onRemoveItem={handleRemoveItem}
          />
        </div>
      )}
    </div>
  );
};

