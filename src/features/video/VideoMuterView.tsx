import React, { useRef, useState } from 'react';
import {
  VideoInspectionResult,
  downloadMutedVideosAsZip,
  inspectVideoAudioTrack,
  saveMutedVideosToDirectory,
  stripAudioTrackLossless,
} from '../../services/video/videoMuterEngine';
import { cleanRawFilename } from '../../services/cleaner/fileCleanerEngine';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import {
  Check,
  CheckCircle2,
  Clock,
  Download,
  Film,
  FolderUp,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const VideoMuterView: React.FC = () => {
  const { t, language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [videos, setVideos] = useState<VideoInspectionResult[]>([]);
  const [autoCleanFilename, setAutoCleanFilename] = useState(true);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [selectedPreviewVideo, setSelectedPreviewVideo] = useState<{ url: string; name: string } | null>(null);
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isFSSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const handleAddVideos = async (files: File[]) => {
    const videoFiles = files.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return (
        f.type.startsWith('video/') ||
        ext === 'mp4' ||
        ext === 'mov' ||
        ext === 'webm' ||
        ext === 'm4v'
      );
    });

    if (videoFiles.length === 0) return;

    // Initial item objects
    const newItems: VideoInspectionResult[] = videoFiles.map((file, idx) => {
      const cleanName = autoCleanFilename
        ? `${cleanRawFilename(file.name, '_')}.${(file.name.split('.').pop() || 'mp4').toLowerCase()}`
        : file.name;

      return {
        id: `${file.name}-${file.size}-${Date.now()}-${idx}`,
        file,
        originalName: file.name,
        outputName: cleanName,
        size: file.size,
        hasAudio: false,
        audioTrackCount: 0,
        videoTrackCount: 1,
        status: 'analyzing',
      };
    });

    setVideos((prev) => [...prev, ...newItems]);

    // Inspect each video in parallel
    for (const item of newItems) {
      try {
        const info = await inspectVideoAudioTrack(item.file);
        setVideos((prev) =>
          prev.map((v) =>
            v.id === item.id
              ? {
                  ...v,
                  hasAudio: info.hasAudio,
                  audioTrackCount: info.audioTrackCount,
                  videoTrackCount: info.videoTrackCount,
                  durationSeconds: info.durationSeconds,
                  status: info.hasAudio ? 'ready' : 'already_silent',
                }
              : v
          )
        );
      } catch (err) {
        setVideos((prev) =>
          prev.map((v) =>
            v.id === item.id
              ? { ...v, status: 'error', errorMessage: 'Could not read video metadata' }
              : v
          )
        );
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddVideos(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddVideos(Array.from(e.dataTransfer.files));
    }
  };

  const handleMuteSingle = async (id: string) => {
    const target = videos.find((v) => v.id === id);
    if (!target) return;

    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, status: 'muting' } : v)));

    try {
      const mutedBlob = await stripAudioTrackLossless(target.file);
      setVideos((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, status: 'muted', mutedBlob, hasAudio: false } : v
        )
      );
    } catch (err: any) {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, status: 'error', errorMessage: err.message || 'Muting failed' } : v
        )
      );
    }
  };

  const handleMuteAll = async () => {
    const needsMuting = videos.filter((v) => v.hasAudio || v.status === 'ready');
    if (needsMuting.length === 0) return;

    setIsProcessingAll(true);
    setProgressMsg(`Losslessly stripping audio from ${needsMuting.length} videos...`);
    setStatusNotification(null);

    let completed = 0;
    for (const v of needsMuting) {
      try {
        setVideos((prev) => prev.map((item) => (item.id === v.id ? { ...item, status: 'muting' } : item)));
        const mutedBlob = await stripAudioTrackLossless(v.file);
        setVideos((prev) =>
          prev.map((item) =>
            item.id === v.id ? { ...item, status: 'muted', mutedBlob, hasAudio: false } : item
          )
        );
        completed++;
        setProgressMsg(`Processed ${completed} of ${needsMuting.length} videos...`);
      } catch (err: any) {
        setVideos((prev) =>
          prev.map((item) =>
            item.id === v.id ? { ...item, status: 'error', errorMessage: err.message } : item
          )
        );
      }
    }

    setIsProcessingAll(false);
    setProgressMsg(null);
    setStatusNotification({
      type: 'success',
      message: `Completed! Losslessly stripped audio from ${completed} videos (0% re-encoding quality loss).`,
    });
  };

  const handleSaveToDirectory = async () => {
    if (videos.length === 0) return;
    setIsProcessingAll(true);
    setProgressMsg('Saving videos to folder...');
    setStatusNotification(null);

    const res = await saveMutedVideosToDirectory(videos, '_Muted_Videos', (done, total) => {
      setProgressMsg(`Saved ${done} of ${total} videos...`);
    });

    setIsProcessingAll(false);
    setProgressMsg(null);

    if (res.success) {
      setStatusNotification({
        type: 'success',
        message: `Successfully saved ${res.savedCount} videos into folder "_Muted_Videos"!`,
      });
    } else if (res.error && !res.error.includes('cancelled')) {
      setStatusNotification({ type: 'error', message: res.error });
    }
  };

  const handleDownloadZip = async () => {
    if (videos.length === 0) return;
    setIsProcessingAll(true);
    setProgressMsg('Creating ZIP bundle...');
    setStatusNotification(null);

    try {
      await downloadMutedVideosAsZip(videos, 'Muted_Microstock_Videos.zip', (percent) => {
        setProgressMsg(`Packaging ZIP: ${percent}%`);
      });
      setStatusNotification({
        type: 'success',
        message: `ZIP archive with ${videos.length} videos downloaded successfully!`,
      });
    } catch (err: any) {
      setStatusNotification({ type: 'error', message: err.message || 'Failed to create ZIP.' });
    } finally {
      setIsProcessingAll(false);
      setProgressMsg(null);
    }
  };

  const handleClearAll = () => {
    setVideos([]);
    setStatusNotification(null);
  };

  const handleRemoveSingle = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const handlePreview = (item: VideoInspectionResult) => {
    const blobToPlay = item.mutedBlob || item.file;
    const url = URL.createObjectURL(blobToPlay);
    setSelectedPreviewVideo({ url, name: item.outputName });
  };

  const pendingMuteCount = videos.filter((v) => v.hasAudio && v.status !== 'muted').length;
  const mutedCount = videos.filter((v) => v.status === 'muted' || v.status === 'already_silent').length;

  return (
    <div className="space-y-5 max-w-6xl mx-auto py-2 px-1">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
        onChange={handleFileInput}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory folder upload
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <VolumeX className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-foreground">
              {language === 'ar' ? 'حذف الصوت من الفيديوهات بدون إعادة ترميز' : 'Lossless Video Audio Remover (Video Muter)'}
            </h1>
            <Badge variant="secondary" className="text-[11px] font-mono">
              0% Quality Loss
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {language === 'ar'
              ? 'إزالة المسار الصوتي فورياً بدون إعادة ضغط الفيديو مع الحفاظ على الدقة ومعدل الإطارات 100% كما تطلب وكالات الستوك.'
              : 'Strips audio streams instantly in the browser without re-encoding frames. Preserves 100% original visual quality.'}
          </p>
        </div>

        {videos.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.clearAll || 'Clear All'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Options & Filename Sanitizer Toggle Bar */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Switch
            checked={autoCleanFilename}
            onCheckedChange={(val) => {
              setAutoCleanFilename(val);
              setVideos((prev) =>
                prev.map((v) => ({
                  ...v,
                  outputName: val
                    ? `${cleanRawFilename(v.originalName, '_')}.${(v.originalName.split('.').pop() || 'mp4').toLowerCase()}`
                    : v.originalName,
                }))
              );
            }}
            id="clean-fn-toggle"
          />
          <label htmlFor="clean-fn-toggle" className="text-xs font-medium text-foreground cursor-pointer">
            {language === 'ar'
              ? 'تطبيق قواعد تنظيف وتنسيق اسم الملف تلقائياً أثناء الحفظ'
              : 'Apply smart filename cleaning rules to output videos'}
          </label>
        </div>

        <div className="text-xs text-muted-foreground font-mono">
          <span>{videos.length} videos • {mutedCount} silent / {pendingMuteCount} with audio</span>
        </div>
      </div>

      {/* Notification banner */}
      {statusNotification && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            statusNotification.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <X className="w-4 h-4 shrink-0" />
            )}
            <span>{statusNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotification(null)}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drop Zone or Video List */}
      {videos.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-border hover:border-foreground/50 bg-card/50 rounded-2xl p-12 text-center transition space-y-4"
        >
          <div className="w-12 h-12 rounded-xl bg-secondary text-foreground flex items-center justify-center mx-auto border border-border">
            <Film className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {language === 'ar' ? 'اسحب ملفات الفيديو هنا' : 'Drop stock video files here'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {language === 'ar'
                ? 'يدعم MP4 و MOV و WebM. يتم كشف الصوت وإزالته بشكل فوري بدون فقدان للجودة.'
                : 'Supports MP4, MOV, and WebM. Zero re-encoding ensures lightning speed (under 1s per 50MB clip).'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'اختيار فيديوهات' : 'Select Videos'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => folderInputRef.current?.click()}
              className="gap-1.5 text-xs"
            >
              <FolderUp className="w-3.5 h-3.5" />
              <span>{t.selectFolder || 'Select Folder'}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Action Toolbar */}
          <div className="p-3 bg-card rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'إضافة فيديوهات' : 'Add Videos'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                className="gap-1.5 text-xs"
              >
                <FolderUp className="w-3.5 h-3.5" />
                <span>{t.selectFolder || 'Add Folder'}</span>
              </Button>
            </div>

            {/* Mute All & Save Controls */}
            <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
              {pendingMuteCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleMuteAll}
                  disabled={isProcessingAll}
                  className="gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isProcessingAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {language === 'ar' ? `حذف الصوت من الكل (${pendingMuteCount})` : `Mute All (${pendingMuteCount})`}
                  </span>
                </Button>
              )}

              {isFSSupported && (
                <Button
                  size="sm"
                  onClick={handleSaveToDirectory}
                  disabled={isProcessingAll || videos.length === 0}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'حفظ في مجلد مباشر' : 'Save to Folder'}</span>
                </Button>
              )}

              <Button
                size="sm"
                variant={isFSSupported ? 'outline' : 'default'}
                onClick={handleDownloadZip}
                disabled={isProcessingAll || videos.length === 0}
                className="gap-1.5 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'تحميل كـ ZIP' : 'Download All as .ZIP'}</span>
              </Button>
            </div>
          </div>

          {/* Progress message */}
          {progressMsg && (
            <div className="p-2.5 rounded-lg bg-secondary/50 border border-border text-xs flex items-center gap-2 font-mono text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
              <span>{progressMsg}</span>
            </div>
          )}

          {/* Video Table */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[220px]">
                      {language === 'ar' ? 'الفيديو والمواصفات' : 'Video File & Details'}
                    </th>
                    <th className="py-2.5 px-3 min-w-[160px]">
                      {language === 'ar' ? 'حالة الصوت' : 'Audio Status'}
                    </th>
                    <th className="py-2.5 px-3 min-w-[220px]">
                      {language === 'ar' ? 'اسم الملف النهائي' : 'Target Filename'}
                    </th>
                    <th className="py-2.5 px-3 w-28 text-center">
                      {language === 'ar' ? 'الإجراء' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {videos.map((item, idx) => {
                    const isMuted = item.status === 'muted';
                    const isAlreadySilent = item.status === 'already_silent';
                    const isAnalyzing = item.status === 'analyzing';
                    const isMuting = item.status === 'muting';

                    return (
                      <tr key={item.id} className="hover:bg-secondary/20 transition">
                        <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 min-w-0">
                          <p className="font-semibold text-foreground truncate max-w-xs" title={item.originalName}>
                            {item.originalName}
                          </p>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {(item.size / (1024 * 1024)).toFixed(1)} MB
                            {item.durationSeconds ? ` • ${item.durationSeconds}s` : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 min-w-0">
                          {isAnalyzing && (
                            <Badge variant="outline" className="gap-1 text-[10px] py-0 text-muted-foreground">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>Scanning tracks...</span>
                            </Badge>
                          )}
                          {isAlreadySilent && (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[10px] py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                            >
                              <VolumeX className="w-3 h-3" />
                              <span>🔇 Already Silent</span>
                            </Badge>
                          )}
                          {isMuted && (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[10px] py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                            >
                              <Check className="w-3 h-3" />
                              <span>✓ Muted (Lossless)</span>
                            </Badge>
                          )}
                          {!isAnalyzing && !isAlreadySilent && !isMuted && item.hasAudio && (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[10px] py-0 border-amber-500/30 text-amber-500 bg-amber-500/10"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>🔊 Audio Track Detected</span>
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3 min-w-0 font-mono text-muted-foreground truncate max-w-xs">
                          {item.outputName}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePreview(item)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer transition"
                              title="Preview Video"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>

                            {item.hasAudio && item.status !== 'muted' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMuteSingle(item.id)}
                                disabled={isMuting}
                                className="h-6 text-[10px] px-2 gap-1 cursor-pointer"
                              >
                                {isMuting ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <VolumeX className="w-2.5 h-2.5" />
                                )}
                                <span>Mute</span>
                              </Button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveSingle(item.id)}
                              className="p-1 rounded text-muted-foreground hover:text-destructive cursor-pointer transition"
                              title="Remove video"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {selectedPreviewVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => {
            URL.revokeObjectURL(selectedPreviewVideo.url);
            setSelectedPreviewVideo(null);
          }}
        >
          <div
            className="bg-card border border-border rounded-2xl p-4 max-w-2xl w-full space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground truncate max-w-md">
                {selectedPreviewVideo.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(selectedPreviewVideo.url);
                  setSelectedPreviewVideo(null);
                }}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
              <video
                src={selectedPreviewVideo.url}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
