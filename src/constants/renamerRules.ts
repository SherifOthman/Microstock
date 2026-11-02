/**
 * Renamer Rules, Stop Words, Dangling Prepositions, and 6-Way Segregation Definitions
 */

export const DANGLING_PREPOSITIONS = new Set([
  'in',
  'on',
  'at',
  'to',
  'of',
  'for',
  'with',
  'over',
  'under',
  'into',
  'from',
  'by',
  'and',
  'or',
  'the',
  'a',
  'an',
  'as',
  'up',
  'down',
  'out',
  'off',
  'through',
  'about',
  'against',
  'between',
  'into',
  'throughout',
  'towards',
  'upon',
]);

/**
 * Truncated trailing fragments commonly left by downloaders (e.g. melted_chocolate_flowing_over_br -> bread cut to br)
 */
export const DANGLING_FRAGMENTS = new Set([
  'b',
  'u',
  'w',
  'br',
  'backgr',
  'bg',
  'desc',
  'txt',
  'img',
]);

export const RENAMER_STOP_WORDS = new Set([
  'upscayl',
  'upscaled',
  'upscale',
  'remini',
  'topaz',
  'gigapixel',
  'magnific',
  'enhanced',
  'copy',
  'duplicate',
  'final',
  'raw',
  'edit',
  'v1',
  'v2',
  'v3',
  'ver1',
  'ver2',
  'midjourney',
  'dalle',
  'flux',
  'leonardo',
  'stablediffusion',
  'sdxl',
  'firefly',
  'mystic',
]);

export const RESOLUTION_TOKENS = new Set([
  '1080p',
  '720p',
  '4k',
  '2k',
  '8k',
  'uhd',
  'fhd',
  'hd',
  'sd',
  '2160p',
  '4320p',
]);

/**
 * 6 Segregated Tracks based on (Origin: AI vs Native) x (MediaType: Photo, Video, Vector)
 */
export type SegregatedTrack =
  | 'Photos'
  | 'AI_Photos'
  | 'Videos'
  | 'AI_Videos'
  | 'Vectors'
  | 'AI_Vectors';

export interface TrackDefinition {
  folderName: SegregatedTrack;
  mediaType: 'photo' | 'video' | 'vector';
  isAi: boolean;
  prefixCode: 'NT_PH' | 'AI_PH' | 'NT_VD' | 'AI_VD' | 'NT_VC' | 'AI_VC';
}

export const SEGREGATED_TRACKS: Record<SegregatedTrack, TrackDefinition> = {
  Photos: {
    folderName: 'Photos',
    mediaType: 'photo',
    isAi: false,
    prefixCode: 'NT_PH',
  },
  AI_Photos: {
    folderName: 'AI_Photos',
    mediaType: 'photo',
    isAi: true,
    prefixCode: 'AI_PH',
  },
  Videos: {
    folderName: 'Videos',
    mediaType: 'video',
    isAi: false,
    prefixCode: 'NT_VD',
  },
  AI_Videos: {
    folderName: 'AI_Videos',
    mediaType: 'video',
    isAi: true,
    prefixCode: 'AI_VD',
  },
  Vectors: {
    folderName: 'Vectors',
    mediaType: 'vector',
    isAi: false,
    prefixCode: 'NT_VC',
  },
  AI_Vectors: {
    folderName: 'AI_Vectors',
    mediaType: 'vector',
    isAi: true,
    prefixCode: 'AI_VC',
  },
};

export const NEEDS_FIXING_FOLDER = '_Needs_Fixing';
