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
} from 'lucide-react';
import { MasterMetadataRecord, MediaType } from '../types';

export interface LightboxAsset {
  id: string;
  filename: string;
  mediaType: MediaType;
  previewUrl: string;
  file?: File;
  originalSizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  resolution?: string;
  masterRecord?: MasterMetadataRecord;
}

interface MediaLightboxModalProps {
  open: boolean;
  onClose: () => void;
  assets: LightboxAsset[];
  initialIndex?: number;
}

export const MediaLightboxModal: React.FC<MediaLightboxModalProps> = ({
  open,
  onClose,
  assets,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomLevel(1);
  }, [initialIndex, open]);

  const currentAsset = assets[currentIndex] || null;

  useEffect(() => {
    if (!open || !currentAsset) {
      if (videoObjectUrl) {
        URL.revokeObjectURL(videoObjectUrl);
        setVideoObjectUrl(null);
      }
      return;
    }

    if (currentAsset.mediaType === 'video' && currentAsset.file) {
      const url = URL.createObjectURL(currentAsset.file);
      setVideoObjectUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setVideoObjectUrl(null);
      };
    } else {
      if (videoObjectUrl) {
        URL.revokeObjectURL(videoObjectUrl);
        setVideoObjectUrl(null);
      }
    }
  }, [currentIndex, open, currentAsset?.id]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, assets.length]);

  if (!open || !currentAsset) return null;

  const handleNext = () => {
    if (assets.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % assets.length);
    setZoomLevel(1);
  };

  const handlePrev = () => {
    if (assets.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + assets.length) % assets.length);
    setZoomLevel(1);
  };

  const isVideo = currentAsset.mediaType === 'video';
  const isVector = currentAsset.mediaType === 'vector';
  const isAr = typeof document !== 'undefined' && document.documentElement.lang === 'ar';

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
              onClick={onClose}
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
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3">
                <img
                  src={currentAsset.previewUrl}
                  alt={currentAsset.filename}
                  className="max-h-[65vh] max-w-full rounded-xl shadow-2xl object-contain bg-zinc-900 border border-zinc-800 opacity-60"
                />
                <p className="text-zinc-400 text-xs font-mono bg-zinc-900/80 px-3 py-1.5 rounded-md border border-zinc-700">
                  {isAr ? 'معاينة الفيديو — الملف الأصلي غير محمّل في الذاكرة.' : 'Video preview — original file not in memory.'}
                </p>
              </div>
            )
          ) : (
            <div
              className="overflow-auto max-h-[85vh] max-w-full flex items-center justify-center transition-transform duration-100"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <img
                src={currentAsset.previewUrl}
                alt={currentAsset.filename}
                className="max-h-[85vh] max-w-full rounded-xl shadow-2xl object-contain bg-zinc-900 border border-zinc-800"
              />
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
