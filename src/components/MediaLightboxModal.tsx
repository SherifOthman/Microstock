import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tooltip } from '../components/ui/tooltip';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  X,
  ZoomIn,
  ZoomOut,
  Layers,
  Camera,
  FolderOpen,
  Image as ImageIcon,
} from 'lucide-react';
import { MasterMetadataRecord, MediaType } from '../types';
import { QueueItem } from '../services/queue/BatchQueueService';
import { rasterizeEpsFile } from '../services/eps/epsEngine';

export interface LightboxAsset {
  id: string;
  filename: string;
  mediaType?: MediaType;
  previewUrl?: string;
  thumbnailUrl?: string;
  file?: File;
  nativePath?: string;
  originalSizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  resolution?: string;
  queueItem?: QueueItem;
  masterRecord?: MasterMetadataRecord;
}

export interface MediaLightboxModalProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  assets: LightboxAsset[];
  initialIndex?: number;
  initialAssetId?: string | null;
  onNavigate?: (id: string) => void;
}

function normalizeDataUrl(val?: string): string {
  if (!val) return '';
  if (val.startsWith('data:') || val.startsWith('blob:') || val.startsWith('http') || val.startsWith('stockflow://')) {
    return val;
  }
  return `data:image/jpeg;base64,${val}`;
}

function resolveAssetFields(raw: LightboxAsset | null) {
  if (!raw) return null;
  const file = raw.file || raw.queueItem?.file;
  const filename = raw.filename || file?.name || 'asset';
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const mediaType: MediaType =
    raw.mediaType ||
    raw.queueItem?.mediaType ||
    raw.masterRecord?.mediaType ||
    ((file as any)?.__sourceMediaType as MediaType) ||
    (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)
      ? 'video'
      : ['eps', 'ai', 'svg'].includes(ext)
      ? 'vector'
      : 'image');

  let nativePath =
    raw.nativePath ||
    (file as any)?.__nativePath ||
    (file as any)?.path ||
    '';

  if (!nativePath && file && typeof window !== 'undefined' && (window as any).electronAPI?.getPathForFile) {
    try {
      nativePath = (window as any).electronAPI.getPathForFile(file) || '';
    } catch {
      nativePath = '';
    }
  }

  const preRenderedDataUrl = (file as any)?.__preRenderedDataUrl as string | undefined;
  const fallbackPreviewUrl =
    preRenderedDataUrl ||
    raw.previewUrl ||
    raw.thumbnailUrl ||
    normalizeDataUrl(raw.queueItem?.thumbnailDataUrl) ||
    normalizeDataUrl(raw.masterRecord?.thumbnailBase64) ||
    normalizeDataUrl(raw.queueItem?.thumbnailBase64) ||
    '';

  const width =
    raw.width ||
    (file as any)?.__preRenderedWidth ||
    raw.queueItem?.videoWidth ||
    raw.masterRecord?.videoMeta?.width;
  const height =
    raw.height ||
    (file as any)?.__preRenderedHeight ||
    raw.queueItem?.videoHeight ||
    raw.masterRecord?.videoMeta?.height;
  const durationSeconds =
    raw.durationSeconds ??
    raw.queueItem?.videoDurationSeconds ??
    raw.masterRecord?.videoMeta?.durationSeconds;
  const resolution =
    raw.resolution ||
    raw.queueItem?.videoResolution ||
    raw.masterRecord?.videoMeta?.resolution;

  return {
    id: raw.id,
    filename,
    mediaType,
    file,
    nativePath,
    fallbackPreviewUrl,
    width,
    height,
    durationSeconds,
    resolution,
    masterRecord: raw.masterRecord || raw.queueItem?.metadataRecord,
  };
}

export const MediaLightboxModal: React.FC<MediaLightboxModalProps> = ({
  open,
  onClose,
  onOpenChange,
  assets,
  initialIndex = 0,
  initialAssetId,
  onNavigate,
}) => {
  const resolveStartIndex = () => {
    if (initialAssetId) {
      const idx = assets.findIndex((a) => a.id === initialAssetId);
      if (idx >= 0) return idx;
    }
    return initialIndex;
  };

  const [currentIndex, setCurrentIndex] = useState(resolveStartIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [dynamicImageUrl, setDynamicImageUrl] = useState<string | null>(null);

  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  useEffect(() => {
    setCurrentIndex(resolveStartIndex());
    setZoomLevel(1);
  }, [initialIndex, initialAssetId, open, assets.length]);

  const currentAsset = resolveAssetFields(assets[currentIndex] || null);

  useEffect(() => {
    let createdBlobUrl: string | null = null;
    let isCancelled = false;

    setVideoObjectUrl(null);
    setDynamicImageUrl(null);

    if (!open || !currentAsset) {
      return;
    }

    if (currentAsset.mediaType === 'video') {
      if (currentAsset.file && currentAsset.file.size > 0 && typeof URL.createObjectURL === 'function') {
        try {
          createdBlobUrl = URL.createObjectURL(currentAsset.file);
          setVideoObjectUrl(createdBlobUrl);
        } catch {
          if (currentAsset.nativePath) {
            setVideoObjectUrl(`stockflow://local?path=${encodeURIComponent(currentAsset.nativePath)}`);
          }
        }
      } else if (currentAsset.nativePath) {
        setVideoObjectUrl(`stockflow://local?path=${encodeURIComponent(currentAsset.nativePath)}`);
      } else if (currentAsset.fallbackPreviewUrl.startsWith('blob:') || currentAsset.fallbackPreviewUrl.startsWith('stockflow://')) {
        setVideoObjectUrl(currentAsset.fallbackPreviewUrl);
      }
    } else if (currentAsset.mediaType === 'vector') {
      if (!currentAsset.fallbackPreviewUrl && currentAsset.file && currentAsset.file.size > 0) {
        rasterizeEpsFile(currentAsset.file, 1024, 0.85)
          .then((res) => {
            if (!isCancelled) {
              setDynamicImageUrl(res.dataUrl || res.objectUrl || null);
            }
          })
          .catch(() => {
            // ignore
          });
      }
    } else {
      // Photo / Image: prefer full-res Blob or stockflow:// local file when fallbackPreviewUrl is missing
      if (!currentAsset.fallbackPreviewUrl) {
        if (currentAsset.file && currentAsset.file.size > 0 && typeof URL.createObjectURL === 'function') {
          try {
            createdBlobUrl = URL.createObjectURL(currentAsset.file);
            setDynamicImageUrl(createdBlobUrl);
          } catch {
            if (currentAsset.nativePath) {
              setDynamicImageUrl(`stockflow://local?path=${encodeURIComponent(currentAsset.nativePath)}`);
            }
          }
        } else if (currentAsset.nativePath) {
          setDynamicImageUrl(`stockflow://local?path=${encodeURIComponent(currentAsset.nativePath)}`);
        }
      }
    }

    return () => {
      isCancelled = true;
      if (createdBlobUrl) {
        try {
          URL.revokeObjectURL(createdBlobUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [currentIndex, open, currentAsset?.id]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, assets.length]);

  if (!open || !currentAsset) return null;

  const handleNext = () => {
    if (assets.length <= 1) return;
    const nextIdx = (currentIndex + 1) % assets.length;
    setCurrentIndex(nextIdx);
    setZoomLevel(1);
    if (assets[nextIdx]) {
      onNavigate?.(assets[nextIdx].id);
    }
  };

  const handlePrev = () => {
    if (assets.length <= 1) return;
    const prevIdx = (currentIndex - 1 + assets.length) % assets.length;
    setCurrentIndex(prevIdx);
    setZoomLevel(1);
    if (assets[prevIdx]) {
      onNavigate?.(assets[prevIdx].id);
    }
  };

  const isVideo = currentAsset.mediaType === 'video';
  const isVector = currentAsset.mediaType === 'vector';
  const isAr = typeof document !== 'undefined' && document.documentElement.lang === 'ar';
  const effectiveImageSrc = currentAsset.fallbackPreviewUrl || dynamicImageUrl || '';

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in-0 duration-150">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/80 border-b border-zinc-800/80 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <Badge
            variant="outline"
            className="text-[10px] font-mono uppercase bg-zinc-900 border-zinc-700 text-zinc-200 gap-1 shrink-0"
          >
            {isVideo ? (
              <>
                <Film className="w-3 h-3 text-primary" /> {isAr ? 'فيديو' : 'VIDEO'}
              </>
            ) : isVector ? (
              <>
                <Layers className="w-3 h-3 text-primary" /> {isAr ? 'متجه EPS' : 'EPS VECTOR'}
              </>
            ) : (
              <>
                <Camera className="w-3 h-3 text-primary" /> {isAr ? 'صورة' : 'PHOTO'}
              </>
            )}
          </Badge>

          <span dir="ltr" className="text-xs font-semibold text-zinc-100 truncate max-w-[200px] sm:max-w-md font-mono">
            {currentAsset.filename}
          </span>

          <span dir="ltr" className="text-[11px] text-zinc-400 font-mono tabular-nums hidden sm:inline">
            ({currentIndex + 1} / {assets.length})
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {currentAsset.nativePath && typeof window !== 'undefined' && (window as any).electronAPI?.showItemInFolder && (
            <Tooltip content={isAr ? 'إظهار في مستكشف الملفات' : 'Reveal in OS Explorer'} side="bottom">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => (window as any).electronAPI?.showItemInFolder?.(currentAsset.nativePath)}
                className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
              </Button>
            </Tooltip>
          )}

          {!isVideo && (
            <div dir="ltr" className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <Tooltip content={isAr ? 'تصغير' : 'Zoom Out'} side="bottom">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  className="h-7 w-7 text-zinc-300 hover:text-white cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
              <span className="text-[10px] font-mono tabular-nums text-zinc-400 w-9 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <Tooltip content={isAr ? 'تكبير' : 'Zoom In'} side="bottom">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                  className="h-7 w-7 text-zinc-300 hover:text-white cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
            </div>
          )}

          <Tooltip content={isAr ? 'إغلاق (Esc)' : 'Close (Esc)'} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Main Media Preview Area */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden min-h-0">
        {assets.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous asset"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 text-white flex items-center justify-center transition shadow-lg cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center justify-center w-full h-full">
          {isVideo ? (
            videoObjectUrl ? (
              <video
                key={currentAsset.id}
                src={videoObjectUrl}
                controls
                autoPlay
                loop
                playsInline
                muted
                className="w-full h-full max-h-[85vh] object-contain rounded-lg shadow-2xl bg-black"
                style={{ minHeight: '400px', maxWidth: '95vw' }}
                onCanPlay={(e) => {
                  const vid = e.currentTarget;
                  vid.muted = false;
                }}
                onError={() => {
                  if (
                    currentAsset.nativePath &&
                    !videoObjectUrl.startsWith('stockflow://')
                  ) {
                    setVideoObjectUrl(
                      `stockflow://local?path=${encodeURIComponent(currentAsset.nativePath)}`
                    );
                  } else {
                    setVideoObjectUrl(null);
                  }
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3">
                {effectiveImageSrc && (
                  <img
                    src={effectiveImageSrc}
                    alt={currentAsset.filename}
                    className="max-h-[65vh] max-w-full rounded-xl shadow-2xl object-contain bg-zinc-900 border border-zinc-800 opacity-80"
                  />
                )}
                <p className="text-zinc-400 text-xs font-mono bg-zinc-900/80 px-3 py-1.5 rounded-md border border-zinc-700">
                  {isAr ? 'معاينة الفيديو — الملف الأصلي غير محمّل في الذاكرة.' : 'Video preview — original file not in memory.'}
                </p>
              </div>
            )
          ) : effectiveImageSrc ? (
            <div
              className="overflow-auto max-h-[85vh] max-w-full flex items-center justify-center transition-transform duration-100"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <img
                src={effectiveImageSrc}
                alt={currentAsset.filename}
                className="max-h-[85vh] max-w-full rounded-xl shadow-2xl object-contain bg-zinc-900 border border-zinc-800"
                onError={() => {
                  if (
                    currentAsset.nativePath &&
                    !effectiveImageSrc.startsWith('stockflow://')
                  ) {
                    setDynamicImageUrl(
                      `stockflow://local?path=${encodeURIComponent(currentAsset.nativePath)}`
                    );
                  }
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-zinc-400 p-8 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <ImageIcon className="w-10 h-10 text-zinc-500" />
              <span className="text-xs font-mono">{currentAsset.filename}</span>
            </div>
          )}
        </div>

        {assets.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next asset"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 text-white flex items-center justify-center transition shadow-lg cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Bottom Metadata & Specs Strip */}
      <div className="px-6 py-2.5 bg-zinc-950/90 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs z-10">
        <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] text-zinc-400">
          {currentAsset.width && currentAsset.height && (
            <span>
              {currentAsset.width} × {currentAsset.height} px
            </span>
          )}
          {currentAsset.durationSeconds !== undefined && (
            <span className="text-zinc-200">
              {currentAsset.durationSeconds}s
            </span>
          )}
          {currentAsset.resolution && (
            <Badge variant="outline" className="text-[10px] bg-zinc-900 border-zinc-700 py-0">
              {currentAsset.resolution}
            </Badge>
          )}
        </div>

        {currentAsset.masterRecord?.baseTitle && (
          <p className="text-xs text-zinc-300 max-w-xl truncate font-medium">
            {currentAsset.masterRecord.baseTitle}
          </p>
        )}
      </div>
    </div>
  );
};
