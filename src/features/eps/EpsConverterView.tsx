import React, { useRef, useState, useMemo } from 'react';
import { rasterizeEpsFile, EpsRenderResult } from '../../services/eps/epsEngine';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileCheck,
  FolderDown,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  ZoomIn,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { saveFilesToLocalDirectory, FileToSave } from '../../services/desktop/desktopFs';

export interface EpsConvertItem {
  id: string;
  file: File;
  originalName: string;
  outputJpgName: string;
  size: number;
  status: 'idle' | 'rendering' | 'completed' | 'error';
  progressMsg?: string;
  errorMessage?: string;
  result?: EpsRenderResult;
}

interface EpsConverterViewProps {
  onSendToStudio?: (files: File[]) => void;
}

export const EpsConverterView: React.FC<EpsConverterViewProps> = ({ onSendToStudio }) => {
  const { t, language, isRtl } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<EpsConvertItem[]>([]);
  const [isConvertingBatch, setIsConvertingBatch] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Natural alphanumeric sorting matching Windows File Explorer
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) =>
      a.originalName.localeCompare(b.originalName, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [items]);

  const handleAddFiles = (newFiles: File[]) => {
    const epsFiles = newFiles.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'eps' || ext === 'ai';
    });

    if (epsFiles.length === 0) {
      setStatusMessage({
        type: 'error',
        text: language === 'ar' ? 'الرجاء اختيار ملفات بتنسيق .eps أو .ai فقط' : 'Please select only .eps or .ai vector files',
      });
      return;
    }

    const newItems: EpsConvertItem[] = epsFiles.map((file) => {
      const base = file.name.replace(/\.[^/.]+$/, '');
      return {
        id: crypto.randomUUID(),
        file,
        originalName: file.name,
        outputJpgName: `${base}.jpg`,
        size: file.size,
        status: 'idle',
      };
    });

    setItems((prev) => {
      const existing = new Set(prev.map((p) => p.originalName));
      return [...prev, ...newItems.filter((n) => !existing.has(n.originalName))];
    });

    setStatusMessage(null);
  };

  const handleRenderSingle = async (item: EpsConvertItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'rendering', progressMsg: 'Rasterizing vector...' } : i))
    );

    try {
      const res = await rasterizeEpsFile(item.file);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'completed', result: res, progressMsg: undefined } : i))
      );
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: 'error', errorMessage: err.message || 'Rasterization failed', progressMsg: undefined }
            : i
        )
      );
    }
  };

  const handleConvertAll = async () => {
    setIsConvertingBatch(true);
    setStatusMessage(null);

    const pending = sortedItems.filter((i) => i.status !== 'completed');
    for (const item of pending) {
      await handleRenderSingle(item);
    }

    setIsConvertingBatch(false);
    setStatusMessage({
      type: 'success',
      text: language === 'ar' ? 'اكتمل تحويل جميع ملفات الـ EPS بنجاح!' : 'All EPS files converted successfully!',
    });
  };

  const handleSaveSingleJpg = async (item: EpsConvertItem) => {
    if (!item.result?.blob) return;
    try {
      const res = await saveFilesToLocalDirectory([
        { name: item.outputJpgName, data: item.result.blob },
      ]);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: language === 'ar' ? `تم حفظ ${item.outputJpgName} في المجلد بنجاح!` : `Saved ${item.outputJpgName} directly to folder!`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to save',
      });
    }
  };

  const handleSaveToDirectory = async () => {
    const completed = items.filter((i) => i.result?.blob);
    if (completed.length === 0) return;

    try {
      const filesToSave: FileToSave[] = completed.map((item) => ({
        name: item.outputJpgName,
        data: item.result!.blob!,
      }));

      const res = await saveFilesToLocalDirectory(filesToSave, {
        folderName: 'EPS_Converted_JPGs',
      });

      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: language === 'ar' ? `تم حفظ ${res.savedCount} صورة JPG في المجلد بنجاح!` : `Saved ${res.savedCount} JPG images directly to folder!`,
        });
      } else if (!res.canceled) {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to save to directory',
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStatusMessage({
          type: 'error',
          text: err.message || 'Failed to save to directory',
        });
      }
    }
  };

  const handleSendToStudio = () => {
    if (!onSendToStudio) return;
    const completed = items.filter((i) => i.result?.blob);
    if (completed.length === 0) return;

    const filesToSend: File[] = completed.map(
      (item) => new File([item.result!.blob], item.outputJpgName, { type: 'image/jpeg' })
    );

    onSendToStudio(filesToSend);
  };

  const completedCount = items.filter((i) => i.status === 'completed').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-4 sm:p-6 rounded-2xl shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">
                {language === 'ar' ? 'محول ملفات EPS إلى صور JPG الاحترافية (300 DPI)' : 'Native EPS to JPG Extractor (300 DPI)'}
              </h1>
              <p className="text-xs text-muted-foreground">
                {language === 'ar'
                  ? 'رسترة متجهات Illustrator بمحرك Ghostscript بدقة 300 DPI ونظام ألوان DeviceRGB وتنعيم فائق (4-bit Supersampling) وجودة 100% مع خلفية بيضاء نقية.'
                  : 'Native Ghostscript rasterizer at 300 DPI, DeviceRGB color space, art-optimized supersampling anti-aliasing, and 100% JPEG quality matching Adobe Illustrator.'}
              </p>
            </div>
          </div>
        </div>

        {/* Engine Badge */}
        <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-xl border border-border text-xs font-mono text-zinc-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Ghostscript 300 DPI • RGB • Art-Optimized (100% Quality)</span>
        </div>
      </div>

      {/* Upload Drop Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files) handleAddFiles(Array.from(e.dataTransfer.files));
        }}
        className="border-2 border-dashed border-border hover:border-blue-500/50 bg-card/50 hover:bg-card rounded-2xl p-6 text-center transition flex flex-col items-center justify-center gap-3 cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".eps,.ai"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleAddFiles(Array.from(e.target.files));
          }}
        />
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
          <UploadCloud className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {language === 'ar' ? 'اسحب ملفات EPS 10 هنا أو انقر للاختيار' : 'Drop Illustrator EPS files here or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {language === 'ar' ? 'يدعم ملفات .eps و .ai (EPS 10 / EPS 8)' : 'Supports .eps and .ai (EPS 10 / EPS 8 standard)'}
          </p>
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Action Toolbar */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border p-3.5 rounded-xl">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Badge variant="outline">
              {items.length} {language === 'ar' ? 'ملفات' : 'files'}
            </Badge>
            <span className="text-muted-foreground">
              {completedCount} / {items.length} {language === 'ar' ? 'جاهز' : 'ready'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleConvertAll}
              disabled={isConvertingBatch}
              className={`gap-1.5 transition-all ${
                completedCount < items.length
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md font-semibold cursor-pointer'
                  : 'variant-outline text-muted-foreground'
              }`}
            >
              {isConvertingBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {language === 'ar' ? 'بدء تحويل الكل' : 'Convert All to JPG'}
            </Button>

            {completedCount > 0 && (
              <>
                <Button
                  size="sm"
                  onClick={handleSaveToDirectory}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md font-semibold cursor-pointer"
                >
                  <FolderDown className="w-3.5 h-3.5" />
                  {language === 'ar' ? `حفظ (${completedCount}) في مجلد` : `Save to Folder (${completedCount})`}
                </Button>

                {onSendToStudio && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSendToStudio}
                    className="gap-1.5 text-blue-400 hover:text-blue-300"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {language === 'ar' ? 'إرسال إلى استوديو الـ Metadata' : 'Send to Metadata Studio'}
                  </Button>
                )}
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setItems([])}
              className="text-muted-foreground hover:text-destructive h-8 px-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Items Grid */}
      {sortedItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sortedItems.map((item) => (
            <Card key={item.id} className="overflow-hidden flex flex-col justify-between border-border bg-card">
              <div className="p-3 space-y-2.5">
                {/* Thumbnail Preview Area */}
                <div className="aspect-square rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden relative">
                  {item.result?.dataUrl ? (
                    <img
                      src={item.result.dataUrl}
                      alt={item.outputJpgName}
                      className="w-full h-full object-contain bg-white"
                    />
                  ) : item.status === 'rendering' ? (
                    <div className="flex flex-col items-center gap-1.5 text-blue-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-[10px] font-mono">Rasterizing...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Layers className="w-8 h-8 text-blue-500/50" />
                      <span className="text-[10px] font-mono uppercase">EPS Vector</span>
                    </div>
                  )}

                  {item.result && (
                    <Badge
                      variant="outline"
                      className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[9px] font-mono border-zinc-700 py-0"
                    >
                      {item.result.width} × {item.result.height}
                    </Badge>
                  )}
                </div>

                {/* Filenames */}
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground truncate" title={item.originalName}>
                    {item.originalName}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate" title={item.outputJpgName}>
                    &rarr; {item.outputJpgName}
                  </p>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="p-3 pt-0 flex items-center justify-between border-t border-border/50 mt-2">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {(item.size / 1024).toFixed(0)} KB
                </span>

                <div className="flex items-center gap-1">
                  {item.status === 'completed' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveSingleJpg(item)}
                      className="h-7 text-xs px-2 gap-1 text-emerald-500 border-emerald-500/30"
                    >
                      <FolderDown className="w-3 h-3" /> Save
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRenderSingle(item)}
                      disabled={item.status === 'rendering'}
                      className="h-7 text-xs px-2 gap-1"
                    >
                      {item.status === 'rendering' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Convert
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
