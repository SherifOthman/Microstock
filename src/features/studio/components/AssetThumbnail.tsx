import React, { useState } from 'react';
import { MasterMetadataRecord } from '../../../types';
import { QueueItem } from '../../../services/queue/BatchQueueService';
import {
  Camera,
  Film,
  Image as ImageIcon,
  PenTool,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

export interface AssetThumbnailProps {
  assetId: string;
  filename: string;
  thumbnailUrl?: string;
  mediaType?: string;
  queueItem?: QueueItem;
  rec?: MasterMetadataRecord;
  isCompact?: boolean;
  onOpenLightbox?: (assetId: string) => void;
  onMuteSingleVideo?: (assetId: string) => void;
  isMuting?: boolean;
}

export const AssetThumbnail: React.FC<AssetThumbnailProps> = React.memo(({
  assetId,
  filename,
  thumbnailUrl,
  mediaType,
  queueItem,
  rec,
  isCompact = false,
  onOpenLightbox,
  onMuteSingleVideo,
  isMuting = false,
}) => {
  const [isHoverPlaying, setIsHoverPlaying] = useState(false);
  const [hoverVideoUrl, setHoverVideoUrl] = useState<string | null>(null);

  const effectiveMediaType = rec?.mediaType || queueItem?.mediaType || mediaType;
  const isVideo = effectiveMediaType === 'video';
  const isVector = effectiveMediaType === 'vector';

  const videoMeta = rec?.videoMeta || (queueItem?.videoDurationSeconds ? {
    durationSeconds: queueItem.videoDurationSeconds,
    resolution: queueItem.videoResolution,
    width: queueItem.videoWidth,
    height: queueItem.videoHeight,
  } : undefined);

  const hasAudio = queueItem?.hasAudio ?? false;
  const isMuted = queueItem?.isMuted ?? false;

  const handleMouseEnter = () => {
    if (isVideo && queueItem?.file) {
      const url = URL.createObjectURL(queueItem.file);
      setHoverVideoUrl(url);
      setIsHoverPlaying(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHoverPlaying(false);
    if (hoverVideoUrl) {
      URL.revokeObjectURL(hoverVideoUrl);
      setHoverVideoUrl(null);
    }
  };

  return (
    <div
      className={`w-full ${isCompact ? 'w-24 sm:w-28' : 'lg:w-56'} shrink-0 flex flex-col gap-2 min-w-0`}
    >
      <div
        onClick={() => onOpenLightbox && onOpenLightbox(assetId)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 aspect-4/3 flex items-center justify-center group cursor-pointer shadow-2xs"
        title="Click to view in Full-Screen Lightbox"
      >
        {isHoverPlaying && hoverVideoUrl ? (
          <video
            src={hoverVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={filename}
            className="w-full h-full object-contain bg-white dark:bg-zinc-900"
          />
        ) : isVector ? (
          <div className="flex flex-col items-center gap-1.5 text-blue-500">
            <PenTool className="w-8 h-8" />
            <span className="text-[10px] font-mono uppercase">EPS Vector</span>
          </div>
        ) : isVideo ? (
          <div className="flex flex-col items-center gap-1.5 text-purple-500">
            <Film className="w-8 h-8" />
            <span className="text-[10px] font-mono uppercase">Video</span>
          </div>
        ) : (
          <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
        )}

        {/* Video Duration & Resolution Overlay */}
        {isVideo && videoMeta && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
            {videoMeta.durationSeconds !== undefined && videoMeta.durationSeconds > 0 && (
              <span className="bg-black/75 text-white font-mono text-[9px] px-1.5 py-0.5 rounded-sm backdrop-blur-xs font-semibold">
                {Math.floor(videoMeta.durationSeconds / 60)}:
                {String(videoMeta.durationSeconds % 60).padStart(2, '0')}
              </span>
            )}
            {videoMeta.resolution && (
              <span className="bg-blue-600/80 text-white font-mono text-[9px] px-1 py-0.5 rounded-sm backdrop-blur-xs font-bold">
                {videoMeta.resolution}
              </span>
            )}
          </div>
        )}

        {/* Single Video Audio / Mute Button */}
        {isVideo && onMuteSingleVideo && (
          <div className="absolute top-1.5 right-1.5">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onMuteSingleVideo(assetId);
              }}
              disabled={isMuting || isMuted}
              className={`h-6 w-6 rounded-md shadow-xs text-xs ${
                isMuted
                  ? 'bg-emerald-500/90 text-white'
                  : hasAudio
                  ? 'bg-amber-500/90 text-white hover:bg-amber-600'
                  : 'bg-zinc-800/80 text-zinc-300'
              }`}
              title={
                isMuted
                  ? 'Audio removed (Silent)'
                  : hasAudio
                  ? 'Audio track detected: Click to strip audio lossless'
                  : 'Already silent'
              }
            >
              {isMuting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isMuted ? (
                <VolumeX className="w-3 h-3" />
              ) : hasAudio ? (
                <Volume2 className="w-3 h-3" />
              ) : (
                <VolumeX className="w-3 h-3 opacity-60" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

AssetThumbnail.displayName = 'AssetThumbnail';
