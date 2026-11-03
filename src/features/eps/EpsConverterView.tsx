import React, { useRef, useState, useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { Tooltip } from '../../components/ui/tooltip';
import {
  CheckCircle2,
  FolderDown,
  FolderUp,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useEpsConverter, EpsConvertItem } from './hooks/useEpsConverter';
import { EpsVirtualGrid } from './components/EpsVirtualGrid';
import { MediaLightboxModal, LightboxAsset } from '../../components/MediaLightboxModal';

export type { EpsConvertItem };

interface EpsConverterViewProps {
  onSendToStudio?: (files: File[]) => void;
}

export const EpsConverterView: React.FC<EpsConverterViewProps> = ({ onSendToStudio }) => {
  const { language, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const {
    items,
    sortedItems,
    completedCount,
    isConvertingBatch,
    statusMessage,
    handleAddFiles,
    handleRenderSingle,
    handleConvertAll,
    handleSaveSingleJpg,
    handleSaveToDirectory,
    handleSendToStudio,
    handleClearAll,
  } = useEpsConverter(language, onSendToStudio);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleAddFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const allCompleted = items.length > 0 && completedCount === items.length && !isConvertingBatch;

  const lightboxAssets: LightboxAsset[] = useMemo(() => {
    return sortedItems.map((item) => ({
      id: item.id,
      filename: `${item.originalName} → ${item.outputJpgName}`,
      mediaType: 'vector',
      previewUrl: item.result?.objectUrl || item.result?.dataUrl,
      file: item.file,
      nativePath: item.nativePath || (item.file as any)?.path,
      width: item.result?.width,
      height: item.result?.height,
    }));
  }, [sortedItems]);

  return (
    <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".eps,.ai"
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border p-3.5 rounded-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-secondary text-primary border border-border">
            <Layers className="w-4 h-4" />
          </div>
          <div className="text-start">
            <h1 className="text-sm sm:text-base font-semibold text-foreground tracking-tight">
              {language === 'ar' ? 'محول EPS إلى JPG (300 DPI)' : 'EPS 10 to High-Res JPG Engine'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {language === 'ar'
                ? 'تحويل متجهات Illustrator إلى صور JPG بدقة 300 DPI ونظام ألوان RGB وخلفية بيضاء.'
                : 'Ghostscript 300 DPI vector rasterization in sRGB with pure white canvas.'}
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono text-muted-foreground shrink-0">
          {language === 'ar' ? '300 DPI · RGB · جودة 100%' : '300 DPI · RGB · 100% Quality'}
        </span>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div
          className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 shrink-0 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Upload Drop Zone (Empty State) with Consistent "Add Files" and "Add Folder" Buttons */}
      {items.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files) handleAddFiles(Array.from(e.dataTransfer.files));
          }}
          className="border-2 border-dashed border-border hover:border-primary/50 bg-card rounded-xl p-10 text-center transition space-y-3"
        >
          <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center mx-auto border border-border">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {language === 'ar' ? 'اسحب ملفات EPS هنا للتحويل' : 'Drop EPS vector files here'}
            </h3>
            <p dir="ltr" className="text-xs text-muted-foreground font-mono">
              .eps · .ai (EPS 10 / EPS 8)
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
          {/* Sticky Action Toolbar with Both "Add Files" & "Add Folder" */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border p-3 rounded-xl shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
              <span className="font-semibold text-foreground">
                {items.length} {language === 'ar' ? 'ملف' : 'files'}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {completedCount}/{items.length} {language === 'ar' ? 'جاهز' : 'ready'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

              <Button
                size="sm"
                onClick={handleConvertAll}
                disabled={isConvertingBatch || allCompleted}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                {isConvertingBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{language === 'ar' ? 'تحويل الكل إلى JPG' : 'Render All to JPG'}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveToDirectory}
                disabled={completedCount === 0 || isConvertingBatch}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <FolderDown className="w-3.5 h-3.5" />
                <span>
                  {language === 'ar' ? `حفظ (${completedCount}) في مجلد` : `Save to Folder (${completedCount})`}
                </span>
              </Button>

              {onSendToStudio && (
                <Tooltip
                  content={
                    !allCompleted
                      ? language === 'ar'
                        ? 'أكمل تحويل جميع ملفات EPS إلى JPG أولاً قبل الإرسال إلى استوديو Metadata'
                        : 'Render all EPS files to JPG first before sending to Metadata Studio'
                      : language === 'ar'
                      ? 'إرسال المتجهات المحولة إلى استوديو Metadata'
                      : 'Send converted vectors to Metadata Studio'
                  }
                >
                  <span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSendToStudio}
                      disabled={!allCompleted}
                      className="gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>
                        {language === 'ar'
                          ? `إرسال إلى استوديو Metadata (${completedCount})`
                          : `Send to Metadata Studio (${completedCount})`}
                      </span>
                    </Button>
                  </span>
                </Tooltip>
              )}

              <Tooltip content={language === 'ar' ? 'مسح الكل' : 'Clear All'}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearAll}
                  className="text-muted-foreground hover:text-destructive h-8 w-8 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* TanStack Virtualized 4-Column Grid (Full Window Height) */}
          <EpsVirtualGrid
            items={sortedItems}
            language={language}
            onRenderSingle={handleRenderSingle}
            onSaveSingleJpg={handleSaveSingleJpg}
            onPreviewItem={(item) => setPreviewItemId(item.id)}
          />
        </div>
      )}

      {/* Full-Screen EPS / Vector Preview Modal */}
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
