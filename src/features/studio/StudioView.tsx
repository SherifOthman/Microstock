import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ApiKeyRecord, MasterMetadataRecord } from '../../types';
import { db } from '../../db';
import { batchQueueService, QueueItem, QueueState } from '../../services/queue/BatchQueueService';
import { keyRingScheduler } from '../../services/scheduler/KeyRingScheduler';
import {
  PLATFORMS_CONFIG,
  SupportedPlatform,
  downloadAllCsvsAsZip,
  downloadSingleCsv,
  generatePlatformCsv,
} from '../../services/export/csvExporter';
import { UniversalTransformOptions } from '../../services/rules/platformTransformers';
import { COUNTRIES } from '../../constants/countries';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Dialog } from '../../components/ui/dialog';
import { ConfirmDialog } from '../../components/ui/alert-dialog';
import { Switch } from '../../components/ui/switch';
import { Tooltip } from '../../components/ui/tooltip';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { KeyRingView } from '../keyring/components/KeyRingView';
import { StockTemplatesModal } from '../tools/StockTemplatesModal';
import { MODEL_DISPLAY_NAMES } from '../../constants/providers';
import { FREEPIK_BASE_MODELS } from '../../constants/categories';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { AssetCard, UnifiedAssetRow } from './components/AssetCard';
import { MediaLightboxModal, LightboxAsset } from '../../components/MediaLightboxModal';
import { stripAudioTrackLossless, saveMutedVideosToDirectory, VideoInspectionResult } from '../../services/video/videoMuterEngine';
import { KeywordPhrasing } from '../../services/ai/metadataParser';
import { useLanguage } from '../../context/LanguageContext';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCheck,
  FileText,
  Film,
  FolderUp,
  Image as ImageIcon,
  Info,
  KeyRound,
  Layers,
  LayoutGrid,
  LayoutList,
  Loader2,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

export const StudioView: React.FC = () => {
  const { t, isRtl, language } = useLanguage();
  // Queue & Database States
  const [queueState, setQueueState] = useState<QueueState>(batchQueueService.getState());
  const liveRecords = useLiveQuery(() => db.masterRecords.toArray(), []) || [];
  const records = useMemo(
    () => [...liveRecords].sort((a, b) => b.createdAt - a.createdAt),
    [liveRecords]
  );

  // API Keys Subscription
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);

  // Mobile Sidebar Collapsible Toggle
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Real-time progress bar auto-collapse state
  const [showProgressBar, setShowProgressBar] = useState(false);

  useEffect(() => {
    if (queueState.status === 'running' || queueState.status === 'paused') {
      setShowProgressBar(true);
    } else if (queueState.status === 'completed') {
      setShowProgressBar(true);
      const timer = setTimeout(() => {
        setShowProgressBar(false);
      }, 2000);
      return () => clearTimeout(timer);
    } else if (queueState.totalCount === 0) {
      setShowProgressBar(false);
    }
  }, [queueState.status, queueState.totalCount]);

  // Workflow Configurations (Persisted in localStorage)
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_is_ai_generated');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [freepikAiGenerated, setFreepikAiGenerated] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_freepik_ai');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [keywordPhrasing, setKeywordPhrasing] = useState<KeywordPhrasing>(() => {
    const saved = localStorage.getItem('stock_keyword_phrasing');
    if (saved === 'single') {
      localStorage.setItem('stock_keyword_phrasing', 'mixed');
      return 'mixed';
    }
    return (saved as KeywordPhrasing) || 'mixed';
  });

  const [titleLengthPreset, setTitleLengthPreset] = useState<'optimal' | 'short' | 'standard' | 'extended'>(() => {
    return (localStorage.getItem('stock_title_length_preset') as any) || 'optimal';
  });

  // Freepik Specific Options
  const [freepikModel, setFreepikModel] = useState<string>(() => {
    const saved = localStorage.getItem('stock_freepik_model');
    if (saved === 'Nano Banana') return 'Google Nano Banana';
    return saved || 'Google Nano Banana';
  });

  const [customFreepikModel, setCustomFreepikModel] = useState<string>(() => {
    return localStorage.getItem('stock_custom_freepik_model') || '';
  });

  const [selectedPlatforms, setSelectedPlatforms] = useState<SupportedPlatform[]>(() => {
    const saved = localStorage.getItem('stock_selected_platforms');
    return saved
      ? JSON.parse(saved)
      : ['adobe', 'freepik', 'shutterstock', 'vecteezy', 'dreamstime', '123rf'];
  });

  // Dreamstime Settings
  const [dtAdvancedOpen, setDtAdvancedOpen] = useState<boolean>(false);
  const [userCustomPrompt, setUserCustomPrompt] = useState<string>('');
  const [dtAiGenerated, setDtAiGenerated] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_ai');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [dtFree, setDtFree] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_free');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [dtEditorial, setDtEditorial] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_editorial');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [dtWel, setDtWel] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_wel');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [dtPel, setDtPel] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_pel');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [dtSrel, setDtSrel] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_srel');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [isDtLocked, setIsDtLocked] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_locked');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isDtUnlockDialogOpen, setIsDtUnlockDialogOpen] = useState<boolean>(false);

  // Shutterstock Settings (Official 7-col schema: Editorial, Mature content, illustration)
  const [shutterEditorial, setShutterEditorial] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_shutter_editorial');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [shutterMature, setShutterMature] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_shutter_mature');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [shutterIllustration, setShutterIllustration] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_shutter_illustration');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [isShutterLocked, setIsShutterLocked] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_shutter_locked');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [shutterAdvancedOpen, setShutterAdvancedOpen] = useState<boolean>(false);
  const [isShutterUnlockDialogOpen, setIsShutterUnlockDialogOpen] = useState<boolean>(false);

  const handleResetShutterOptions = () => {
    setShutterEditorial(false);
    setShutterMature(false);
    setShutterIllustration(false);
    setIsShutterLocked(true);
    localStorage.setItem('stock_shutter_editorial', 'false');
    localStorage.setItem('stock_shutter_mature', 'false');
    localStorage.setItem('stock_shutter_illustration', 'false');
    localStorage.setItem('stock_shutter_locked', 'true');
  };

  const handleUnlockShutterOptions = () => {
    setIsShutterLocked(false);
    localStorage.setItem('stock_shutter_locked', 'false');
    setIsShutterUnlockDialogOpen(false);
  };

  const handleResetDtLicensing = () => {
    setDtWel(true);
    setDtPel(true);
    setDtFree(false);
    setDtSrel(false);
    setIsDtLocked(true);
    localStorage.setItem('stock_dt_wel', 'true');
    localStorage.setItem('stock_dt_pel', 'true');
    localStorage.setItem('stock_dt_free', 'false');
    localStorage.setItem('stock_dt_srel', 'false');
    localStorage.setItem('stock_dt_locked', 'true');
  };

  const handleUnlockDtLicensing = () => {
    setIsDtLocked(false);
    localStorage.setItem('stock_dt_locked', 'false');
    setIsDtUnlockDialogOpen(false);
  };

  // Vecteezy Settings
  const [vecLicense, setVecLicense] = useState<'pro' | 'free'>(() => {
    return (localStorage.getItem('stock_vec_license') as 'pro' | 'free') || 'pro';
  });

  // 123RF Settings (Default: 'EG' for Egypt)
  const [rfCountry, setRfCountry] = useState<string>(() => {
    return localStorage.getItem('stock_123rf_country') || 'EG';
  });

  // Dialog Controls
  const [isKeyRingOpen, setIsKeyRingOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<SupportedPlatform | null>(null);
  const [previewCsvContent, setPreviewCsvContent] = useState<string>('');

  // Quick Copy Feedback State (key = "id_field")
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewCopied, setPreviewCopied] = useState<boolean>(false);

  // Lightbox & Media Filter States
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video' | 'vector'>('all');
  const [isMutingBatch, setIsMutingBatch] = useState<boolean>(false);
  const [mutingAssetId, setMutingAssetId] = useState<string | null>(null);

  // Dialog & Confirmation States (replaces native alert/confirm)
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; filename: string } | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState<boolean>(false);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const [incompleteExportDialog, setIncompleteExportDialog] = useState<{
    completedCount: number;
    incompleteCount: number;
    onProceed: () => void;
  } | null>(null);

  // Search Filter & View Mode ('compact' vs 'detailed')
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isKeyShake, setIsKeyShake] = useState(false);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('stock_card_view_mode');
        if (saved === 'compact' || saved === 'detailed') return saved;
      } catch {
        // ignore localStorage access issues
      }
      // If no explicit preference has been saved yet, detect mobile via viewport width or user-agent
      const isMobileDevice =
        window.innerWidth < 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
      return isMobileDevice ? 'compact' : 'detailed';
    }
    return 'detailed';
  });

  const handleViewModeChange = (mode: 'compact' | 'detailed') => {
    setViewMode(mode);
    try {
      localStorage.setItem('stock_card_view_mode', mode);
    } catch {
      // ignore
    }
  };

  // File Inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Subscriptions
  useEffect(() => {
    const unsubQueue = batchQueueService.subscribe((state) => setQueueState({ ...state }));
    const unsubKeys = keyRingScheduler.subscribe((k) => setKeys([...k]));
    keyRingScheduler.init();
    return () => {
      unsubQueue();
      unsubKeys();
    };
  }, []);

  // Save configs to localStorage
  useEffect(() => {
    localStorage.setItem('stock_is_ai_generated', JSON.stringify(isAiGenerated));
  }, [isAiGenerated]);

  useEffect(() => {
    localStorage.setItem('stock_freepik_ai', JSON.stringify(freepikAiGenerated));
  }, [freepikAiGenerated]);

  useEffect(() => {
    localStorage.setItem('stock_keyword_phrasing', keywordPhrasing);
  }, [keywordPhrasing]);

  useEffect(() => {
    localStorage.setItem('stock_title_length_preset', titleLengthPreset);
  }, [titleLengthPreset]);

  useEffect(() => {
    localStorage.setItem('stock_freepik_model', freepikModel);
  }, [freepikModel]);

  useEffect(() => {
    localStorage.setItem('stock_custom_freepik_model', customFreepikModel);
  }, [customFreepikModel]);

  useEffect(() => {
    localStorage.setItem('stock_selected_platforms', JSON.stringify(selectedPlatforms));
  }, [selectedPlatforms]);

  useEffect(() => {
    localStorage.setItem('stock_dt_ai', JSON.stringify(dtAiGenerated));
  }, [dtAiGenerated]);

  useEffect(() => {
    localStorage.setItem('stock_dt_free', JSON.stringify(dtFree));
  }, [dtFree]);

  useEffect(() => {
    localStorage.setItem('stock_dt_editorial', JSON.stringify(dtEditorial));
  }, [dtEditorial]);

  useEffect(() => {
    localStorage.setItem('stock_dt_wel', JSON.stringify(dtWel));
  }, [dtWel]);

  useEffect(() => {
    localStorage.setItem('stock_dt_pel', JSON.stringify(dtPel));
  }, [dtPel]);

  useEffect(() => {
    localStorage.setItem('stock_dt_srel', JSON.stringify(dtSrel));
  }, [dtSrel]);

  useEffect(() => {
    localStorage.setItem('stock_shutter_editorial', JSON.stringify(shutterEditorial));
  }, [shutterEditorial]);

  useEffect(() => {
    localStorage.setItem('stock_shutter_mature', JSON.stringify(shutterMature));
  }, [shutterMature]);

  useEffect(() => {
    localStorage.setItem('stock_shutter_illustration', JSON.stringify(shutterIllustration));
  }, [shutterIllustration]);

  useEffect(() => {
    localStorage.setItem('stock_123rf_country', rfCountry);
  }, [rfCountry]);

  useEffect(() => {
    localStorage.setItem('stock_vec_license', vecLicense);
  }, [vecLicense]);

  // Keys stats
  const healthyKeys = keys.filter((k) => k.status === 'healthy');
  const combinedRpm = healthyKeys.reduce((sum, k) => sum + (k.rpmLimit || 0), 0);

  // Construct current transform options
  const getUniversalTransformOptions = (): UniversalTransformOptions => {
    const finalFreepikModel =
      freepikModel === 'Other' ? customFreepikModel.trim() || 'AI Generator' : freepikModel;

    return {
      dreamstime: {
        isAiGenerated: dtAiGenerated,
        free: dtFree,
        editorial: dtEditorial,
        wel: dtWel,
        pel: dtPel,
        srel: dtSrel,
      },
      shutterstock: {
        editorial: shutterEditorial,
        matureContent: shutterMature,
        illustration: shutterIllustration,
      },
      vecteezy: {
        license: vecLicense,
      },
      freepik: {
        modelName: finalFreepikModel,
        isAiGenerated: freepikAiGenerated,
      },
      '123rf': {
        countryCode: rfCountry,
      },
    };
  };

  // Build the Unified Asset Rows: Combines Queue Items (uploaded/pending) with Master Records (completed/error)
  const unifiedAssets: UnifiedAssetRow[] = useMemo(() => {
    const rowMap = new Map<string, UnifiedAssetRow>();

    // 1. Process all in-memory queue items
    queueState.items.forEach((item) => {
      let status: UnifiedAssetRow['status'] = 'queued';
      if (item.status === 'processing') status = 'processing';
      else if (item.status === 'completed') status = 'completed';
      else if (item.status === 'error') status = 'error';

      rowMap.set(item.filename, {
        id: item.id,
        filename: item.filename,
        thumbnailUrl: item.thumbnailDataUrl || '',
        status,
        queueItem: item,
        masterRecord: item.metadataRecord,
        error: item.error,
      });
    });

    // 2. Overlay records from Dexie IndexedDB (preserves records across page refresh!)
    records.forEach((rec) => {
      const recStatus: UnifiedAssetRow['status'] =
        rec.status === 'error'
          ? 'error'
          : rec.status === 'processing'
          ? 'processing'
          : rec.status === 'pending'
          ? 'queued'
          : rec.baseTitle
          ? 'completed'
          : 'queued';

      const existing = rowMap.get(rec.filename);
      if (existing) {
        existing.masterRecord = rec;
        // Priority rule for status:
        // While the queue is running or resizing, the in-memory item state ('processing' vs 'queued') is authoritative!
        if (queueState.status === 'running' || queueState.status === 'resizing') {
          // If in-memory is completed or error, reflect it
          if (rec.baseTitle && existing.status !== 'processing') {
            existing.status = 'completed';
          }
        } else {
          // When queue is idle, adopted status from DB
          existing.status = recStatus;
          if (rec.errorMessage && !existing.error) {
            existing.error = rec.errorMessage;
          }
        }
        if (!existing.thumbnailUrl) existing.thumbnailUrl = rec.thumbnailBase64;
      } else {
        rowMap.set(rec.filename, {
          id: rec.id,
          filename: rec.filename,
          thumbnailUrl: rec.thumbnailBase64,
          status: recStatus,
          masterRecord: rec,
          error: rec.errorMessage,
        });
      }
    });

    return Array.from(rowMap.values());
  }, [queueState.items, queueState.status, records]);

  // Detect coexistence of distinct media types
  const mediaTypeCounts = useMemo(() => {
    let images = 0;
    let videos = 0;
    let vectors = 0;

    unifiedAssets.forEach((a) => {
      const type = a.masterRecord?.mediaType || a.queueItem?.mediaType || 'image';
      if (type === 'video') videos++;
      else if (type === 'vector') vectors++;
      else images++;
    });

    const distinctTypesCount = (images > 0 ? 1 : 0) + (videos > 0 ? 1 : 0) + (vectors > 0 ? 1 : 0);

    return { images, videos, vectors, distinctTypesCount };
  }, [unifiedAssets]);

  // Video Audio status in batch
  const videosWithAudio = useMemo(() => {
    return unifiedAssets.filter((a) => {
      const isVid = a.masterRecord?.mediaType === 'video' || a.queueItem?.mediaType === 'video';
      return isVid && a.queueItem?.hasAudio && !a.queueItem?.isMuted;
    });
  }, [unifiedAssets]);

  // Filter unified assets by search query AND conditional media type filter
  const filteredAssets = useMemo(() => {
    let list = unifiedAssets;

    if (mediaTypeCounts.distinctTypesCount >= 2 && mediaTypeFilter !== 'all') {
      list = list.filter((a) => {
        const type = a.masterRecord?.mediaType || a.queueItem?.mediaType || 'image';
        return type === mediaTypeFilter;
      });
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (a) =>
        a.filename.toLowerCase().includes(q) ||
        a.masterRecord?.baseTitle.toLowerCase().includes(q) ||
        a.masterRecord?.rankedKeywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [unifiedAssets, searchQuery, mediaTypeFilter, mediaTypeCounts.distinctTypesCount]);

  // Prepare assets for Lightbox Modal
  const lightboxAssets: LightboxAsset[] = useMemo(() => {
    return filteredAssets.map((a) => {
      const type = a.masterRecord?.mediaType || a.queueItem?.mediaType || 'image';
      return {
        id: a.id,
        filename: a.filename,
        mediaType: type,
        previewUrl: a.thumbnailUrl,
        file: a.queueItem?.file,
        originalSizeBytes: a.masterRecord?.fileSize || a.queueItem?.originalSizeBytes,
        width: a.masterRecord?.videoMeta ? undefined : 2000,
        height: a.masterRecord?.videoMeta ? undefined : 2000,
        durationSeconds: a.masterRecord?.videoMeta?.durationSeconds || a.queueItem?.videoDurationSeconds,
        resolution: a.masterRecord?.videoMeta?.resolution || a.queueItem?.videoResolution,
        masterRecord: a.masterRecord,
      };
    });
  }, [filteredAssets]);

  const handleOpenLightbox = (assetId: string) => {
    const idx = filteredAssets.findIndex((a) => a.id === assetId);
    if (idx >= 0) {
      setLightboxIndex(idx);
    }
  };

  const handleMuteSingleVideo = async (assetId: string) => {
    const asset = unifiedAssets.find((a) => a.id === assetId);
    if (!asset || !asset.queueItem?.file) return;

    setMutingAssetId(assetId);
    try {
      const mutedBlob = await stripAudioTrackLossless(asset.queueItem.file);
      // Keep exact original filename so disk files and CSV entries match 100%
      const mutedFile = new File([mutedBlob], asset.filename, {
        type: asset.queueItem.file.type || 'video/mp4',
      });
      batchQueueService.markItemMuted(assetId, mutedFile);
    } catch (err: any) {
      setNoticeDialog({
        title: 'Audio Mute Failed',
        message: err.message || 'Could not strip audio track from video file',
      });
    } finally {
      setMutingAssetId(null);
    }
  };

  const handleMuteAllVideosInBatch = async () => {
    if (videosWithAudio.length === 0) return;
    setIsMutingBatch(true);

    try {
      for (const asset of videosWithAudio) {
        if (asset.queueItem?.file) {
          const mutedBlob = await stripAudioTrackLossless(asset.queueItem.file);
          // Keep exact original filename so disk files and CSV entries match 100%
          const mutedFile = new File([mutedBlob], asset.filename, {
            type: asset.queueItem.file.type || 'video/mp4',
          });
          batchQueueService.markItemMuted(asset.id, mutedFile);
        }
      }
      setNoticeDialog({
        title: language === 'ar' ? 'تم كتم جميع الفيديوهات' : 'All Videos Muted',
        message:
          language === 'ar'
            ? `تم حذف المسارات الصوتية بنجاح من ${videosWithAudio.length} فيديو دون إعادة ترميز!`
            : `Successfully stripped audio tracks from ${videosWithAudio.length} videos without re-encoding!`,
      });
    } catch (err: any) {
      setNoticeDialog({
        title: 'Batch Audio Mute Error',
        message: err.message || 'Error occurred while muting videos',
      });
    } finally {
      setIsMutingBatch(false);
    }
  };

  // Counts
  const pendingCount = unifiedAssets.filter(
    (a) => a.status === 'queued' || a.status === 'processing'
  ).length;
  const completedCount = unifiedAssets.filter((a) => a.status === 'completed').length;
  const nonAsciiCount = useMemo(() => {
    return unifiedAssets.filter((a) => /\u2026|[^\x00-\x7F]/.test(a.filename)).length;
  }, [unifiedAssets]);

  // Handlers
  const isSupportedMediaFile = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return (
      file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm', 'eps', 'ai'].includes(ext)
    );
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(isSupportedMediaFile);
    if (files.length > 0) {
      await batchQueueService.addFiles(files);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(isSupportedMediaFile);
      await batchQueueService.addFiles(files);
      e.target.value = '';
    }
  };

  const triggerKeyAlertShake = () => {
    setIsKeyShake(true);
    setTimeout(() => setIsKeyShake(false), 800);
  };

  const handleStartQueue = () => {
    if (healthyKeys.length === 0) {
      triggerKeyAlertShake();
      return;
    }
    const finalFreepikModel =
      freepikModel === 'Other' ? customFreepikModel.trim() || 'Google Nano Banana' : freepikModel;
    batchQueueService.start(isAiGenerated, userCustomPrompt.trim(), finalFreepikModel, keywordPhrasing, titleLengthPreset);
  };

  const handleCopyText = (text: string, keyIdentifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyIdentifier);
    setTimeout(() => setCopiedKey(null), 1200);
  };

  const handleCopyAllRecord = (rec: MasterMetadataRecord) => {
    const lines = [
      `Title: ${rec.baseTitle}`,
      `Description: ${rec.detailedDescription}`,
      `Keywords: ${rec.rankedKeywords.join(', ')}`,
    ];
    if (rec.isAiGenerated && rec.aiGenerationInfo?.prompt) {
      lines.push(`Prompt: ${rec.aiGenerationInfo.prompt}`);
    }
    if (rec.isAiGenerated && rec.aiGenerationInfo?.model) {
      lines.push(`Model: ${rec.aiGenerationInfo.model}`);
    }
    handleCopyText(lines.join('\n\n'), `${rec.id}_all`);
  };

  const handleDeleteAsset = (id: string, filename: string) => {
    setAssetToDelete({ id, filename });
  };

  const handleConfirmDeleteAsset = async () => {
    if (assetToDelete) {
      await db.masterRecords.delete(assetToDelete.id);
      batchQueueService.removeItem(assetToDelete.id);
      setAssetToDelete(null);
    }
  };

  const handleConfirmClearAll = async () => {
    await db.masterRecords.clear();
    batchQueueService.clear();
    setClearAllConfirmOpen(false);
  };

  const handleRegenerateSingle = async (id: string) => {
    const finalFreepikModel =
      freepikModel === 'Other' ? customFreepikModel.trim() || 'Google Nano Banana' : freepikModel;
    await batchQueueService.reprocessItem(id, isAiGenerated, '', finalFreepikModel, keywordPhrasing, titleLengthPreset);
  };

  const handlePreviewCsv = (pid: SupportedPlatform) => {
    const res = generatePlatformCsv(pid, records, 'stock_metadata', getUniversalTransformOptions());
    if (res.isBlocked) {
      setNoticeDialog({
        title: 'Preview Blocked',
        message: res.blockedReason || 'Platform export requirements not met.',
      });
      return;
    }
    setPreviewPlatform(pid);
    setPreviewCsvContent(res.csvString);
    setPreviewCopied(false);
  };

  const triggerSingleExport = (pid: SupportedPlatform) => {
    const res = generatePlatformCsv(pid, records, 'stock_metadata', getUniversalTransformOptions());
    if (res.isBlocked) {
      setNoticeDialog({
        title: 'Export Blocked',
        message: res.blockedReason || 'Platform export requirements not met.',
      });
      return;
    }
    try {
      downloadSingleCsv(res);
    } catch (err: any) {
      setNoticeDialog({
        title: 'Download Failed',
        message: err.message || 'Failed to download CSV.',
      });
    }
  };

  const triggerZipExport = async () => {
    try {
      await downloadAllCsvsAsZip(
        selectedPlatforms,
        records,
        'stock_metadata',
        getUniversalTransformOptions()
      );
    } catch (err: any) {
      setNoticeDialog({
        title: 'ZIP Export Failed',
        message: err.message || 'Export failed.',
      });
    }
  };

  const handleSingleExport = (pid: SupportedPlatform) => {
    if (completedCount < unifiedAssets.length) {
      setIncompleteExportDialog({
        completedCount,
        incompleteCount: unifiedAssets.length - completedCount,
        onProceed: () => triggerSingleExport(pid),
      });
      return;
    }
    triggerSingleExport(pid);
  };

  const handleZipExport = async () => {
    if (completedCount < unifiedAssets.length) {
      setIncompleteExportDialog({
        completedCount,
        incompleteCount: unifiedAssets.length - completedCount,
        onProceed: () => triggerZipExport(),
      });
      return;
    }
    triggerZipExport();
  };

  const isRunning = queueState.status === 'running';
  const isPaused = queueState.status === 'paused';

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.eps,.ai,.svg"
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

      {/* ======================================================== */}
      {/* MOBILE TOGGLE BAR (Visible only on screens < lg)          */}
      {/* ======================================================== */}
      <div className="w-full lg:hidden flex items-center justify-between p-3 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-foreground" />
          <span className="font-semibold text-xs text-foreground">{t.marketplacesAndSettings}</span>
          <Badge variant="outline" className="text-[10px] py-0 font-mono">
            {(t.activeCount || '{count} active').replace('{count}', String(selectedPlatforms.length))}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          className="h-7 text-xs gap-1"
        >
          {isMobileSidebarOpen ? t.hide : t.configure}
          {isMobileSidebarOpen ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* ======================================================== */}
      {/* LEFT SIDEBAR: Marketplaces, Dynamic Settings & Tools      */}
      {/* ======================================================== */}
      <aside
        className={`w-full lg:w-76 shrink-0 space-y-4 ${
          isMobileSidebarOpen ? 'block' : 'hidden lg:block'
        }`}
      >
        {/* Card 1: Target Marketplaces & Authentic Logos */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs text-foreground">{t.marketplaces}</span>
              <Tooltip content="Choose target stock agencies. Data formats are automatically adapted on-the-fly.">
                <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
              </Tooltip>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {selectedPlatforms.length}/6
            </span>
          </div>

          <div className="space-y-1.5">
            {Object.values(PLATFORMS_CONFIG).map((p) => {
              const isSelected = selectedPlatforms.includes(p.id);

              return (
                <div key={p.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedPlatforms(selectedPlatforms.filter((id) => id !== p.id));
                      } else {
                        setSelectedPlatforms([...selectedPlatforms, p.id]);
                      }
                    }}
                    className={`w-full p-2 rounded-lg border text-left transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-border bg-secondary/60 text-foreground font-medium'
                        : 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary/30'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="shrink-0">{getPlatformLogo(p.id, 18)}</div>
                      <span className="text-xs">{p.name}</span>
                    </div>

                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                        isSelected
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border bg-card'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>

                  {/* Contextual Vecteezy Options */}
                  {p.id === 'vecteezy' && isSelected && (
                    <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground font-medium">{t.license}:</span>
                          <Tooltip content="Pro (Default) or Free license column for Vecteezy contributors.">
                            <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </Tooltip>
                        </div>
                        <div className="w-28">
                          <Select
                            value={vecLicense}
                            onValueChange={(val) => setVecLicense(val as 'pro' | 'free')}
                          >
                            <SelectTrigger className="h-7 text-xs bg-card">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                              <SelectItem value="pro" className="text-xs">
                                {t.proDefault}
                              </SelectItem>
                              <SelectItem value="free" className="text-xs">
                                {t.freeLicense}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground font-mono">
                        Direct Web Upload Parity (No Hydration Needed)
                      </div>
                    </div>
                  )}

                  {/* Contextual Freepik Options */}
                  {p.id === 'freepik' && isSelected && (
                    <div className="p-2.5 ms-3 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
                      {/* AI Generated Toggle Button */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-foreground font-medium">{t.aiGenerated}</span>
                          <Tooltip content="Check if your files are AI generated (Freepik requires Prompt & Base Model). Leave unchecked for real photos or manual vectors.">
                            <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </Tooltip>
                        </div>
                        <Switch
                          checked={freepikAiGenerated}
                          onCheckedChange={(val) => {
                            setFreepikAiGenerated(val);
                            setIsAiGenerated(val);
                          }}
                          aria-label="Toggle Freepik AI Generated"
                        />
                      </div>

                      {/* Base Model (Conditional on AI Generated being ON) */}
                      {freepikAiGenerated ? (
                        <>
                          <div className="flex items-center justify-between pt-1 border-t border-border/40">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-muted-foreground font-medium">{t.baseModel}:</span>
                              <Tooltip content="Select the AI base model required by the Freepik Contributor portal (Default: Google Nano Banana).">
                                <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                              </Tooltip>
                            </div>
                            <div className="w-44 sm:w-48">
                              <Select
                                value={freepikModel}
                                onValueChange={setFreepikModel}
                              >
                                <SelectTrigger className="h-7 text-xs bg-card">
                                  <SelectValue placeholder="Base model" />
                                </SelectTrigger>
                                <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                                  {FREEPIK_BASE_MODELS.map((m) => (
                                    <SelectItem key={m} value={m} className="text-xs">
                                      {m}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {freepikModel === 'Other' && (
                            <div className="pt-1">
                              <Input
                                placeholder="Enter custom model name..."
                                value={customFreepikModel}
                                onChange={(e) => setCustomFreepikModel(e.target.value)}
                                className="h-7 text-xs"
                              />
                            </div>
                          )}

                          <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground space-y-0.5">
                            <p>• Max 49 keywords (Freepik appends _ai_generated)</p>
                            <p>• Titles auto-cleansed (spaces instead of hyphens)</p>
                            <p>• Prompt & Model included for AI compliance</p>
                          </div>
                        </>
                      ) : (
                        <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground space-y-0.5">
                          <p className="text-foreground/90 font-medium">• {t.standardPhotoVector}</p>
                          <p>• Prompt & Model columns left empty</p>
                          <p>• Up to 50 keywords allowed (no _ai_generated tag)</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contextual Dreamstime Options */}
                  {p.id === 'dreamstime' && isSelected && (
                    <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
                      {/* 1. AI Generated (Visible & Direct) */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-foreground font-medium">{t.aiGenerated}</span>
                          <Tooltip content="Category 3 = 114 (AI) and appends 'AI-generated image' to description in CSV.">
                            <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </Tooltip>
                        </div>
                        <Switch
                          checked={dtAiGenerated}
                          onCheckedChange={(c) => {
                            setDtAiGenerated(c);
                          }}
                        />
                      </div>

                      {/* 2. Editorial (Visible & Direct) */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground font-medium">{t.editorial}</span>
                        <Switch checked={dtEditorial} onCheckedChange={setDtEditorial} />
                      </div>

                      {/* 3. Collapsible Advanced Licensing (W-EL, P-EL, Free, SR-EL protected) */}
                      <div className="pt-1.5 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => setDtAdvancedOpen(!dtAdvancedOpen)}
                          className="flex items-center justify-between w-full text-[11px] text-muted-foreground hover:text-foreground cursor-pointer py-1"
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-foreground/80">{t.advancedLicensing}</span>
                            <Tooltip content="W-EL (Web) and P-EL (Print) enabled by default. Free Images & SR-EL disabled for protection.">
                              <Info className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </Tooltip>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {dtAdvancedOpen ? '▲' : '▼ (W-EL & P-EL)'}
                          </span>
                        </button>

                        {dtAdvancedOpen && (
                          <div className="space-y-2 pt-1.5 pl-1 animate-in fade-in-50 duration-150">
                            {/* Safety Lock & Reset Controls */}
                            <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-border/40">
                              {isDtLocked ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setIsDtUnlockDialogOpen(true)}
                                  className="h-6 px-2 text-[10px] gap-1 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                                >
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>{t.unlockToEdit}</span>
                                </Button>
                              ) : (
                                <Badge variant="outline" className="h-5 px-1.5 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono">
                                  Unlocked
                                </Badge>
                              )}

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleResetDtLicensing}
                                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Reset to defaults: W-EL & P-EL ON, Free & SR-EL OFF"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>{t.resetToDefaults}</span>
                              </Button>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">{t.welExtended}</span>
                              <Switch checked={dtWel} onCheckedChange={setDtWel} disabled={isDtLocked} />
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">{t.pelExtended}</span>
                              <Switch checked={dtPel} onCheckedChange={setDtPel} disabled={isDtLocked} />
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">{t.freeImages}</span>
                              <Switch checked={dtFree} onCheckedChange={setDtFree} disabled={isDtLocked} />
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{t.srelTransfers}</span>
                                <Tooltip content={t.srElWarning}>
                                  <Info className="w-3 h-3 text-destructive cursor-pointer" />
                                </Tooltip>
                              </div>
                              <Switch checked={dtSrel} onCheckedChange={setDtSrel} disabled={isDtLocked} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Contextual Shutterstock Options */}
                  {p.id === 'shutterstock' && isSelected && (
                    <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
                      {/* Collapsible Advanced Compliance Options (Protected with Safety Lock) */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShutterAdvancedOpen(!shutterAdvancedOpen)}
                          className="flex items-center justify-between w-full text-[11px] text-muted-foreground hover:text-foreground cursor-pointer py-1"
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-foreground/80">{t.shutterstockAdvanced}</span>
                            <Tooltip content="Defaults (no / no / no) match 99% of commercial submissions. Unlock to flag Editorial, Mature content, or Illustration.">
                              <Info className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </Tooltip>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {shutterAdvancedOpen ? '▲' : '▼ (no / no / no)'}
                          </span>
                        </button>

                        {shutterAdvancedOpen && (
                          <div className="space-y-2 pt-1.5 pl-1 animate-in fade-in-50 duration-150 border-t border-border/40 mt-1">
                            {/* Safety Lock & Reset Controls */}
                            <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-border/40">
                              {isShutterLocked ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setIsShutterUnlockDialogOpen(true)}
                                  className="h-6 px-2 text-[10px] gap-1 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                                >
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>{t.unlockToEdit}</span>
                                </Button>
                              ) : (
                                <Badge variant="outline" className="h-5 px-1.5 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono">
                                  Unlocked
                                </Badge>
                              )}

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleResetShutterOptions}
                                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Reset to defaults: Editorial, Mature & Illustration set to 'no'"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>{t.resetToDefaults}</span>
                              </Button>
                            </div>

                            {/* 1. Editorial ('yes'/'no') */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{t.editorial}</span>
                                <Tooltip content="Flag as Editorial content (news, documentary, events). Default: no.">
                                  <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                                </Tooltip>
                              </div>
                              <Switch
                                checked={shutterEditorial}
                                onCheckedChange={setShutterEditorial}
                                disabled={isShutterLocked}
                              />
                            </div>

                            {/* 2. Mature Content ('yes'/'no') */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{t.matureContent}</span>
                                <Tooltip content="Flag if asset contains nudity or adult themes. Warning: restricts asset to adult viewers. Default: no.">
                                  <Info className="w-3 h-3 text-amber-500 cursor-pointer" />
                                </Tooltip>
                              </div>
                              <Switch
                                checked={shutterMature}
                                onCheckedChange={setShutterMature}
                                disabled={isShutterLocked}
                              />
                            </div>

                            {/* 3. Illustration ('yes'/'no') */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{t.illustration}</span>
                                <Tooltip content="Flag as vector drawing, 3D render or digital illustration. Default: no (photo).">
                                  <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                                </Tooltip>
                              </div>
                              <Switch
                                checked={shutterIllustration}
                                onCheckedChange={setShutterIllustration}
                                disabled={isShutterLocked}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Contextual 123RF Options */}
                  {p.id === '123rf' && isSelected && (
                    <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[11px] text-muted-foreground font-medium">{t.rfCountry}:</span>
                          <Tooltip content={t.rfCountryDesc}>
                            <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </Tooltip>
                        </div>
                        <div className="w-40 sm:w-48">
                          <Select
                            value={rfCountry}
                            onValueChange={(val) => setRfCountry(val)}
                          >
                            <SelectTrigger className="h-7 text-xs bg-card font-medium">
                              <SelectValue placeholder="Select country..." />
                            </SelectTrigger>
                            <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                              {COUNTRIES.map((c) => (
                                <SelectItem key={c.code} value={c.code} className="text-xs">
                                  <span className="font-semibold">{c.name}</span>{' '}
                                  <span className="font-mono text-muted-foreground text-[10px]">({c.code})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 1.5: AI Context Hint / Prompt */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold text-xs text-foreground">
                {language === 'ar' ? 'توجيه إضافي للذكاء الاصطناعي' : 'AI Context Hint / Prompt'}
              </span>
            </div>
            {userCustomPrompt && (
              <button
                type="button"
                onClick={() => setUserCustomPrompt('')}
                className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {language === 'ar' ? 'مسح' : 'Clear'}
              </button>
            )}
          </div>
          <Textarea
            rows={2}
            value={userCustomPrompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setUserCustomPrompt(e.target.value)}
            placeholder={t.contextHintPlaceholder || "e.g. '3D glass texture, minimalist, studio lighting'..."}
            className="text-xs bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 resize-none w-full shadow-2xs"
            title="Appended to AI vision prompt for all assets in this batch"
          />
          <p className="text-[10px] text-muted-foreground leading-normal">
            {language === 'ar'
              ? 'يُضاف هذا التوجيه تلقائياً إلى موجه التحليل البصري لجميع الملفات في هذه الجلسة.'
              : 'This hint is automatically appended to the vision prompt for all assets.'}
          </p>
        </div>

        {/* Card 2: API Keys Status Widget */}
        <div className="p-3.5 bg-card rounded-xl border border-border flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground">{t.apiKeysWidget}</span>
            <p className="text-[11px] text-muted-foreground font-mono">
              {healthyKeys.length > 0
                ? (t.readyRpm || '{count} Ready ({rpm} RPM)').replace('{count}', String(healthyKeys.length)).replace('{rpm}', String(combinedRpm))
                : t.noActiveKeys}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsKeyRingOpen(true)}
            className="h-7 text-xs font-semibold"
          >
            {t.manageKeys}
          </Button>
        </div>

        {/* Card 4: Quick Smart Utilities */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-2 text-xs">
          <span className="font-semibold text-foreground block pb-1 border-b border-border">
            {t.utilities}
          </span>
          <button
            type="button"
            onClick={() => setIsTemplatesOpen(true)}
            className="w-full p-1.5 rounded-md text-left text-muted-foreground hover:text-foreground hover:bg-secondary/40 flex items-center gap-2 cursor-pointer transition"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t.csvSpecsSamples}</span>
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* RIGHT WORKSPACE: Batch Action Bar, Live Progress, Table   */}
      {/* ======================================================== */}
      <main className="flex-1 w-full min-w-0 space-y-4">
        {/* Missing API Key Alert Banner (Guards Zero Key Empty State) */}
        {healthyKeys.length === 0 && (
          <Alert
            variant="warning"
            className={`transition-all duration-300 shadow-2xs ${
              isKeyShake ? 'animate-shake ring-2 ring-amber-500/50' : ''
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div className="space-y-0.5">
                <AlertTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {t.apiKeyMissingBannerTitle || 'API Key Required for AI Generation'}
                </AlertTitle>
                <AlertDescription className="text-xs text-amber-800/90 dark:text-amber-300/80">
                  {t.apiKeyMissingBannerDesc ||
                    'Please add at least one API key (e.g., Gemini or Groq) to start AI metadata generation.'}
                </AlertDescription>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsKeyRingOpen(true)}
                className="h-8 px-3.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-sm rounded-lg shrink-0 self-start sm:self-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{t.manageKeysButton || t.manageKeys || 'Manage Keys'}</span>
              </Button>
            </div>
          </Alert>
        )}

        {/* Non-ASCII Filename Warning Banner */}
        {nonAsciiCount > 0 && (
          <Alert variant="warning" className="shadow-2xs">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <div className="space-y-0.5">
              <AlertTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {language === 'ar'
                  ? `تنبيه: ${nonAsciiCount} ملف يحتوي على أحرف خاصة أو نقاط حذف (…)`
                  : `Warning: ${nonAsciiCount} file(s) contain non-ASCII characters or ellipsis (…)`}
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-800/90 dark:text-amber-300/80">
                {language === 'ar'
                  ? 'أدوبي ستوك وشترستوك تتطلب تطابقاً تاماً 100% بين اسم الملف في CSV واسم الملف المرفوع. قد تؤدي الأحرف غير الإنجليزية أو نقاط الحذف إلى فشل ربط البيانات الوصفية تلقائياً.'
                  : 'Adobe Stock and Shutterstock require 100% exact matching between the CSV filename and your uploaded media. Special characters or Unicode ellipsis may cause metadata matching to fail.'}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Top Action Toolbar */}
        <div className="p-3 bg-card rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs w-full min-w-0">
          {/* File Ingestion Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto min-w-0">
            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant={unifiedAssets.length === 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning}
                className={`gap-1.5 text-xs w-full sm:w-auto justify-center transition-all ${
                  unifiedAssets.length === 0
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md font-semibold cursor-pointer ring-2 ring-blue-500/20'
                    : 'border-zinc-300 dark:border-zinc-800 bg-white hover:bg-zinc-50 dark:bg-card dark:hover:bg-accent text-zinc-800 dark:text-foreground'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                {t.addImages}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                disabled={isRunning}
                className="gap-1.5 text-xs w-full sm:w-auto justify-center border-zinc-300 dark:border-zinc-800 bg-white hover:bg-zinc-50 dark:bg-card dark:hover:bg-accent text-zinc-800 dark:text-foreground"
              >
                <FolderUp className="w-3.5 h-3.5" />
                {t.selectFolder}
              </Button>
            </div>

            {unifiedAssets.length > 0 && (
              <span className="text-xs text-muted-foreground font-mono truncate w-full sm:w-auto text-center sm:text-start">
                {(t.assetsCount || '{total} assets ({ready} ready, {queued} queued)')
                  .replace('{total}', String(unifiedAssets.length))
                  .replace('{ready}', String(completedCount))
                  .replace('{queued}', String(pendingCount))}
              </span>
            )}
          </div>

          {/* Queue Execution & Export Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end min-w-0">
            <div className="grid grid-cols-2 sm:flex items-center gap-2 flex-1 sm:flex-initial min-w-0">
              {/* Start / Pause / Resume Controls */}
              {!isRunning && !isPaused && (
                healthyKeys.length === 0 || pendingCount === 0 ? (
                  <Tooltip
                    content={
                      healthyKeys.length === 0
                        ? t.noActiveKeysTooltip || 'Add at least one active API key to start generating metadata'
                        : t.addImages || 'Add images first'
                    }
                  >
                    <div
                      className="w-full sm:w-auto"
                      onClick={() => {
                        if (healthyKeys.length === 0) triggerKeyAlertShake();
                      }}
                    >
                      <Button
                        size="sm"
                        disabled
                        className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center opacity-40 cursor-not-allowed bg-secondary text-muted-foreground border border-border"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span className="truncate">
                          {(t.startGeneration || 'Start Generation ({count})').replace(
                            '{count}',
                            String(pendingCount)
                          )}
                        </span>
                      </Button>
                    </div>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleStartQueue}
                    className="gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-500 text-white shadow-md ring-2 ring-blue-500/20 cursor-pointer animate-pulse"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span className="truncate">
                      {(t.startGeneration || 'Start Generation ({count})').replace(
                        '{count}',
                        String(pendingCount)
                      )}
                    </span>
                  </Button>
                )
              )}

              {isRunning && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => batchQueueService.pause()}
                  className="gap-1.5 text-xs w-full sm:w-auto justify-center"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>{t.pause}</span>
                </Button>
              )}

              {isPaused && (
                <Button
                  size="sm"
                  onClick={() => {
                    const finalFreepikModel =
                      freepikModel === 'Other' ? customFreepikModel.trim() || 'Google Nano Banana' : freepikModel;
                    batchQueueService.resume(isAiGenerated, '', finalFreepikModel);
                  }}
                  className="gap-1.5 text-xs w-full sm:w-auto justify-center"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t.resume}</span>
                </Button>
              )}

              {/* Export All CSVs (.ZIP) */}
              <Button
                size="sm"
                variant={completedCount > 0 && pendingCount === 0 ? 'default' : 'outline'}
                onClick={() => setIsExportOpen(true)}
                disabled={completedCount === 0}
                className={`gap-1.5 text-xs font-semibold w-full sm:w-auto justify-center transition-all ${
                  completedCount > 0 && pendingCount === 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md cursor-pointer ring-2 ring-emerald-500/20'
                    : 'opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="truncate">{(t.exportCsvs || 'Export CSVs ({count})').replace('{count}', String(completedCount))}</span>
              </Button>
            </div>

            {unifiedAssets.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setClearAllConfirmOpen(true)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                title={t.clearAll}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Real-time Progress Bar */}
        {queueState.totalCount > 0 && showProgressBar && (
          <div className="p-3 bg-card rounded-xl border border-border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground" />}
                {queueState.status === 'completed' && (
                  <Check className="w-3.5 h-3.5 text-foreground" />
                )}
                <span className="font-medium text-foreground">
                  Processing: {queueState.processedCount}/{queueState.totalCount} completed
                </span>
                {queueState.failedCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="destructive" className="py-0 text-[10px]">
                      {queueState.failedCount} failed
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const finalFreepikModel =
                          freepikModel === 'Other' ? customFreepikModel.trim() || 'Google Nano Banana' : freepikModel;
                        batchQueueService.retryFailed(
                          isAiGenerated,
                          '',
                          finalFreepikModel,
                          keywordPhrasing,
                          titleLengthPreset
                        );
                      }}
                      className="h-6 text-[10px] px-2 gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Retry Failed
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-muted-foreground font-mono text-[11px]">
                {queueState.activeWorkers > 0 && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {queueState.activeWorkers} active
                  </Badge>
                )}
                <span>
                  Elapsed: {Math.floor(queueState.elapsedSeconds / 60)}:
                  {queueState.elapsedSeconds % 60 < 10 ? '0' : ''}
                  {queueState.elapsedSeconds % 60}
                </span>
              </div>
            </div>

            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden flex">
              <div
                className="bg-foreground h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${
                    queueState.totalCount > 0
                      ? Math.round((queueState.processedCount / queueState.totalCount) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Empty State / Drag and Drop Zone */}
        {unifiedAssets.length === 0 ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-16 text-center transition-all ${
              isDragOver
                ? 'border-foreground bg-accent/40 scale-[0.99]'
                : 'border-border bg-card/40 hover:bg-card/70'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-secondary text-foreground flex items-center justify-center mx-auto mb-3 border border-border">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Drop stock images here or browse files
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Supports JPG, PNG, WebP. Original files on disk are completely untouched.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Select Images
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                className="gap-1.5"
              >
                <FolderUp className="w-3.5 h-3.5" /> {t.selectFolder}
              </Button>
            </div>
          </div>
        ) : (
          /* Populated State: Full-Width Unified Data Grid Table */
          <div className="space-y-3">
            {/* Search Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs w-full min-w-0">
              <div className="relative flex-1 w-full min-w-0">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute start-2.5 top-2 pointer-events-none" />
                <Input
                  placeholder={t.searchAssetsPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7.5 ps-8 pe-2.5 w-full text-xs min-w-0 bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                />
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 w-full sm:w-auto">
                <span className="text-muted-foreground text-xs font-mono shrink-0">
                  {(t.assetsShown || '{count} assets shown').replace('{count}', String(filteredAssets.length))}
                </span>

                {/* View Mode Switcher: Compact vs Detailed */}
                <div className="flex items-center p-0.5 rounded-lg border border-border bg-secondary/40 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleViewModeChange('compact')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                      viewMode === 'compact'
                        ? 'bg-card text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={t.compactView || 'Compact'}
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span className="text-[11px] hidden sm:inline">{t.compactView || 'Compact'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleViewModeChange('detailed')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                      viewMode === 'detailed'
                        ? 'bg-card text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={t.detailedView || 'Detailed'}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="text-[11px] hidden sm:inline">{t.detailedView || 'Detailed'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Batch Video Audio Mute Banner */}
            {videosWithAudio.length > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-xs font-semibold">
                      {language === 'ar'
                        ? `تم اكتشاف صوت في ${videosWithAudio.length} فيديو (وكالات الستوك تتطلب فيديوهات صامتة)`
                        : `Audio detected in ${videosWithAudio.length} video${videosWithAudio.length > 1 ? 's' : ''} (stock agencies require silent footage)`}
                    </p>
                    <p className="text-[11px] text-amber-200/80">
                      {language === 'ar'
                        ? 'يمكنك كتم جميع المقاطع دفعة واحدة فائق السرعة وبدون أي إعادة ترميز أو فقدان للجودة.'
                        : 'Lossless 1-click audio removal for microstock compliance without re-encoding.'}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={isMutingBatch}
                  onClick={handleMuteAllVideosInBatch}
                  className="h-8 gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold shrink-0 cursor-pointer w-full sm:w-auto"
                >
                  {isMutingBatch ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  {language === 'ar' ? '🔇 كتم جميع الفيديوهات (نقرة واحدة)' : '🔇 Mute All Videos (1-Click)'}
                </Button>
              </div>
            )}

            {/* Conditional Media Filter Bar (Revealed ONLY when >= 2 distinct media types coexist) */}
            {mediaTypeCounts.distinctTypesCount >= 2 && (
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-secondary/30 border border-border overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setMediaTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    mediaTypeFilter === 'all'
                      ? 'bg-foreground text-background font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                  }`}
                >
                  <span>{language === 'ar' ? 'الكل' : 'All'}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary text-secondary-foreground font-mono">
                    {unifiedAssets.length}
                  </span>
                </button>

                {mediaTypeCounts.images > 0 && (
                  <button
                    type="button"
                    onClick={() => setMediaTypeFilter('image')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                      mediaTypeFilter === 'image'
                        ? 'bg-foreground text-background font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'الصور' : 'Photos'}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary text-secondary-foreground font-mono">
                      {mediaTypeCounts.images}
                    </span>
                  </button>
                )}

                {mediaTypeCounts.videos > 0 && (
                  <button
                    type="button"
                    onClick={() => setMediaTypeFilter('video')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                      mediaTypeFilter === 'video'
                        ? 'bg-foreground text-background font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'الفيديو' : 'Videos'}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary text-secondary-foreground font-mono">
                      {mediaTypeCounts.videos}
                    </span>
                  </button>
                )}

                {mediaTypeCounts.vectors > 0 && (
                  <button
                    type="button"
                    onClick={() => setMediaTypeFilter('vector')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                      mediaTypeFilter === 'vector'
                        ? 'bg-foreground text-background font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'فكتور EPS' : 'EPS Vectors'}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary text-secondary-foreground font-mono">
                      {mediaTypeCounts.vectors}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Asset Cards List */}
            <div className={viewMode === 'compact' ? 'space-y-2.5' : 'space-y-4'}>
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  rec={asset.masterRecord}
                  viewMode={viewMode}
                  copiedKey={copiedKey}
                  onCopyText={handleCopyText}
                  onCopyAll={handleCopyAllRecord}
                  onDelete={handleDeleteAsset}
                  onRegenerate={handleRegenerateSingle}
                  onOpenLightbox={handleOpenLightbox}
                  onMuteSingleVideo={handleMuteSingleVideo}
                  isMuting={mutingAssetId === asset.id}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* MODALS & DIALOGS (Spacious, Clean, and Focused)          */}
      {/* ======================================================== */}

      {/* API Keys Dialog */}
      <Dialog
        open={isKeyRingOpen}
        onClose={() => setIsKeyRingOpen(false)}
        title={t.keysTitle || 'API Keys & Priority'}
        description={
          isRtl
            ? 'إضافة واختبار وترتيب أولويات مفاتيح الرؤية لمختلف المزودين.'
            : 'Add, test, and pace multiple vision keys across Gemini, OpenRouter, Groq, Mistral, and Cloudflare.'
        }
        className="max-w-3xl"
      >
        <KeyRingView />
      </Dialog>

      {/* CSV Export Dialog */}
      <Dialog
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Marketplace CSV Files"
        description="Every CSV is generated deterministically in 0.00 seconds from your local records."
        className="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              Showing CSVs for {selectedPlatforms.length} active marketplace{selectedPlatforms.length === 1 ? '' : 's'} configured in your sidebar.
            </span>
            <Button
              size="sm"
              onClick={handleZipExport}
              disabled={selectedPlatforms.length === 0}
              className="gap-1.5 text-xs font-semibold shrink-0"
            >
              <Archive className="w-3.5 h-3.5" />
              Download All Selected (.ZIP)
            </Button>
          </div>

          {selectedPlatforms.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-lg text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">No marketplaces selected</p>
              <p>Please check at least one target stock agency in the left sidebar to generate CSV exports.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.values(PLATFORMS_CONFIG)
                .filter((p) => selectedPlatforms.includes(p.id))
                .map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-lg border border-border bg-card flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {getPlatformLogo(p.id, 20)}
                      <div>
                        <div className="font-semibold text-foreground">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {p.filenameSuffix}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreviewCsv(p.id)}
                        className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="w-3 h-3" /> Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSingleExport(p.id)}
                        className="h-6 px-2 text-[10px] gap-1"
                      >
                        <Download className="w-3 h-3" /> CSV
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Dialog>

      {/* Raw CSV Preview Modal */}
      {previewPlatform && (
        <Dialog
          open={!!previewPlatform}
          onClose={() => setPreviewPlatform(null)}
          title={`CSV Preview: ${PLATFORMS_CONFIG[previewPlatform].name}`}
          description={`Delimiter: "${PLATFORMS_CONFIG[previewPlatform].delimiter}" • UTF-8`}
          className="max-w-2xl"
        >
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(previewCsvContent);
                  setPreviewCopied(true);
                  setTimeout(() => setPreviewCopied(false), 1500);
                }}
                className="h-7 text-xs gap-1"
              >
                {previewCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {previewCopied ? 'Copied to Clipboard' : 'Copy CSV'}
              </Button>
            </div>
            <pre dir="ltr" className="p-3 bg-secondary/50 rounded-lg text-[11px] font-mono text-foreground overflow-x-auto max-h-80 whitespace-pre text-left">
              {previewCsvContent}
            </pre>
          </div>
        </Dialog>
      )}

      {/* Official Stock Specs & Samples Modal */}
      <StockTemplatesModal
        open={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
      />

      {/* Dreamstime Safety Unlock Warning Dialog */}
      <ConfirmDialog
        open={isDtUnlockDialogOpen}
        onOpenChange={setIsDtUnlockDialogOpen}
        title={t.dtWarningTitle}
        description={t.dtWarningDesc}
        confirmText={t.dtWarningConfirm}
        cancelText={t.cancel}
        onConfirm={handleUnlockDtLicensing}
      />

      {/* Shutterstock Safety Unlock Warning Dialog */}
      <ConfirmDialog
        open={isShutterUnlockDialogOpen}
        onOpenChange={setIsShutterUnlockDialogOpen}
        title={t.shutterWarningTitle}
        description={t.shutterWarningDesc}
        confirmText={t.shutterWarningConfirm}
        cancelText={t.cancel}
        onConfirm={handleUnlockShutterOptions}
      />

      {/* Delete Single Asset Confirmation */}
      <ConfirmDialog
        open={!!assetToDelete}
        onOpenChange={(open) => !open && setAssetToDelete(null)}
        title="Delete Asset"
        description={`Are you sure you want to delete "${assetToDelete?.filename}"? This will remove it from the studio and database.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleConfirmDeleteAsset}
      />

      {/* Clear All Confirmation */}
      <ConfirmDialog
        open={clearAllConfirmOpen}
        onOpenChange={setClearAllConfirmOpen}
        title="Clear All Assets"
        description="Are you sure you want to clear all uploaded images, queue items, and metadata records? This action cannot be undone."
        confirmText="Clear Everything"
        variant="destructive"
        onConfirm={handleConfirmClearAll}
      />

      {/* Notification Alert (replacing window.alert) */}
      <ConfirmDialog
        open={!!noticeDialog}
        onOpenChange={(open) => !open && setNoticeDialog(null)}
        title={noticeDialog?.title || 'Notice'}
        description={noticeDialog?.message || ''}
        confirmText="OK"
        hideCancel
        onConfirm={() => setNoticeDialog(null)}
      />

      {/* Incomplete Batch CSV Export Warning */}
      <ConfirmDialog
        open={!!incompleteExportDialog}
        onOpenChange={(open) => !open && setIncompleteExportDialog(null)}
        title={language === 'ar' ? 'تصدير دفعة غير مكتملة' : 'Incomplete Batch Export'}
        description={
          language === 'ar'
            ? `تم إنشاء البيانات الوصفية لـ ${incompleteExportDialog?.completedCount || 0} من أصل ${unifiedAssets.length} ملف فقط (${incompleteExportDialog?.incompleteCount || 0} لم تكتمل بعد). هل تريد تصدير ملفات CSV للملفات المكتملة فقط؟`
            : `Only ${incompleteExportDialog?.completedCount || 0} of ${unifiedAssets.length} assets have completed metadata (${incompleteExportDialog?.incompleteCount || 0} incomplete/pending). Do you want to export CSVs for the completed assets only?`
        }
        confirmText={language === 'ar' ? 'تصدير المكتمل فقط' : 'Export Completed Only'}
        cancelText={language === 'ar' ? 'إلغاء' : 'Cancel'}
        onConfirm={() => {
          if (incompleteExportDialog) {
            incompleteExportDialog.onProceed();
            setIncompleteExportDialog(null);
          }
        }}
      />

      {/* Media Lightbox Modal */}
      {lightboxIndex !== null && (
        <MediaLightboxModal
          open={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
          assets={lightboxAssets}
          initialIndex={lightboxIndex}
        />
      )}
    </div>
  );
};
