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
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Dialog } from '../../components/ui/dialog';
import { ConfirmDialog } from '../../components/ui/alert-dialog';
import { Switch } from '../../components/ui/switch';
import { Tooltip } from '../../components/ui/tooltip';
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
import { KeywordPhrasing } from '../../services/ai/metadataParser';
import {
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
  FolderUp,
  Image as ImageIcon,
  Info,
  KeyRound,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  UploadCloud,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

export const StudioView: React.FC = () => {
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

  // Workflow Configurations (Persisted in localStorage)
  const isAiGenerated = true; // Microstock AI Assistant generates full AI metadata

  const [keywordPhrasing, setKeywordPhrasing] = useState<KeywordPhrasing>(() => {
    return (localStorage.getItem('stock_keyword_phrasing') as KeywordPhrasing) || 'single';
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

  // Vecteezy Settings
  const [vecLicense, setVecLicense] = useState<'pro' | 'free'>(() => {
    return (localStorage.getItem('stock_vec_license') as 'pro' | 'free') || 'pro';
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

  // Dialog & Confirmation States (replaces native alert/confirm)
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; filename: string } | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState<boolean>(false);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);

  // Search Filter
  const [searchQuery, setSearchQuery] = useState<string>('');

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
      vecteezy: {
        license: vecLicense,
      },
      freepik: {
        modelName: finalFreepikModel,
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
        // If in-memory item is finished or queue is idle, adopt DB status
        if (queueState.status === 'idle' || existing.status === 'queued') {
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

  // Filter unified assets by search query
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return unifiedAssets;
    const q = searchQuery.toLowerCase();
    return unifiedAssets.filter(
      (a) =>
        a.filename.toLowerCase().includes(q) ||
        a.masterRecord?.baseTitle.toLowerCase().includes(q) ||
        a.masterRecord?.rankedKeywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [unifiedAssets, searchQuery]);

  // Counts
  const pendingCount = unifiedAssets.filter(
    (a) => a.status === 'queued' || a.status === 'processing'
  ).length;
  const completedCount = unifiedAssets.filter((a) => a.status === 'completed').length;

  // Handlers
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      await batchQueueService.addFiles(files);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
      await batchQueueService.addFiles(files);
      e.target.value = '';
    }
  };

  const handleStartQueue = () => {
    batchQueueService.start(isAiGenerated, '', 'Nano Banana', keywordPhrasing, titleLengthPreset);
  };

  const handleCopyText = (text: string, keyIdentifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyIdentifier);
    setTimeout(() => setCopiedKey(null), 1200);
  };

  const handleCopyAllRecord = (rec: MasterMetadataRecord) => {
    const text = `Title: ${rec.baseTitle}\n\nDescription: ${rec.detailedDescription}\n\nKeywords: ${rec.rankedKeywords.join(', ')}`;
    handleCopyText(text, `${rec.id}_all`);
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
    await batchQueueService.reprocessItem(id, isAiGenerated, '', 'Nano Banana', keywordPhrasing, titleLengthPreset);
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

  const handleSingleExport = (pid: SupportedPlatform) => {
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

  const handleZipExport = async () => {
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
          <span className="font-semibold text-xs text-foreground">Marketplaces & Settings</span>
          <Badge variant="outline" className="text-[10px] py-0 font-mono">
            {selectedPlatforms.length} active
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          className="h-7 text-xs gap-1"
        >
          {isMobileSidebarOpen ? 'Hide' : 'Configure'}
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
        {/* Card 0: SEO & Keyword Phrasing Settings */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="font-semibold text-xs text-foreground">SEO & Metadata Controls</span>
            <Badge variant="outline" className="text-[10px] font-mono capitalize">
              {keywordPhrasing === 'single' ? 'Single Words' : keywordPhrasing === 'double' ? 'Double Words' : 'Mixed'}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-foreground">Keyword Phrasing</label>
              <Tooltip content="Single words are strongly recommended for stock agencies to maximize search relevance and prevent tag rejection.">
                <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
              </Tooltip>
            </div>

            <Select
              value={keywordPhrasing}
              onValueChange={(val) => setKeywordPhrasing(val as KeywordPhrasing)}
            >
              <SelectTrigger className="h-8 text-xs bg-secondary/30">
                <SelectValue placeholder="Keyword Phrasing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single" className="text-xs">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-foreground">Single Words (Recommended)</span>
                    <span className="text-[10px] text-muted-foreground">e.g. copper, metal, texture, macro</span>
                  </div>
                </SelectItem>
                <SelectItem value="double" className="text-xs">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-foreground">Double Words</span>
                    <span className="text-[10px] text-muted-foreground">e.g. copper metal, brushed texture</span>
                  </div>
                </SelectItem>
                <SelectItem value="mixed" className="text-xs">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-foreground">Mixed (Single & Phrases)</span>
                    <span className="text-[10px] text-muted-foreground">Natural mix of singles and pairs</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title Target Length Preset */}
          <div className="space-y-1.5 pt-1 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-foreground">Title Target Length</label>
              <Tooltip content="Set target title length. Automatically tuned to comply with Adobe (200), Vecteezy (100), and Shutterstock guidelines.">
                <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
              </Tooltip>
            </div>

            <Select
              value={titleLengthPreset}
              onValueChange={(val) => setTitleLengthPreset(val as any)}
            >
              <SelectTrigger className="h-8 text-xs bg-secondary/30">
                <SelectValue placeholder="Title Length" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="optimal" className="text-xs">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-foreground">Auto (Platform Optimal)</span>
                    <span className="text-[10px] text-muted-foreground">60-95 chars • Fits all agencies cleanly</span>
                  </div>
                </SelectItem>
                <SelectItem value="short" className="text-xs">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-foreground">Short (45-65 chars)</span>
                    <span className="text-[10px] text-muted-foreground">Adobe Stock & Vecteezy sweet spot</span>
                  </div>
                </SelectItem>
                <SelectItem value="standard" className="text-xs">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-foreground">Standard (65-95 chars)</span>
                    <span className="text-[10px] text-muted-foreground">Universal safe zone</span>
                  </div>
                </SelectItem>
                <SelectItem value="extended" className="text-xs">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-foreground">Extended (95-140 chars)</span>
                    <span className="text-[10px] text-muted-foreground">Detailed scene & context description</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Card 1: Target Marketplaces & Authentic Logos */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs text-foreground">Marketplaces</span>
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
                          <span className="text-[11px] text-muted-foreground font-medium">License:</span>
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
                            <SelectContent>
                              <SelectItem value="pro" className="text-xs">
                                Pro (Default)
                              </SelectItem>
                              <SelectItem value="free" className="text-xs">
                                Free
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
                    <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground font-medium">Base Model:</span>
                          <Tooltip content="Select the AI base model required by the Freepik Contributor portal (Default: Nano Banana).">
                            <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </Tooltip>
                        </div>
                        <div className="w-48 sm:w-52">
                          <Select
                            value={freepikModel}
                            onValueChange={setFreepikModel}
                          >
                            <SelectTrigger className="h-7 text-xs bg-card">
                              <SelectValue placeholder="Base model" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
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
                      </div>
                    </div>
                  )}

                  {/* Contextual Dreamstime Options */}
                  {p.id === 'dreamstime' && isSelected && (
                    <div className="p-2.5 ml-4 rounded-md border border-border bg-secondary/20 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground font-medium">AI Generated</span>
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

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Free Images</span>
                        <Switch checked={dtFree} onCheckedChange={setDtFree} />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Editorial</span>
                        <Switch checked={dtEditorial} onCheckedChange={setDtEditorial} />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">W-EL (Extended)</span>
                        <Switch checked={dtWel} onCheckedChange={setDtWel} />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">P-EL (Extended)</span>
                        <Switch checked={dtPel} onCheckedChange={setDtPel} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground">SR-EL</span>
                          <Tooltip content="Sell-the-Right: Transfers complete copyright ownership to the buyer. Recommended: OFF.">
                            <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </Tooltip>
                        </div>
                        <Switch checked={dtSrel} onCheckedChange={setDtSrel} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 2: API Keys Status Widget */}
        <div className="p-3.5 bg-card rounded-xl border border-border flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground">API Keys</span>
            <p className="text-[11px] text-muted-foreground font-mono">
              {healthyKeys.length > 0 ? `${healthyKeys.length} Ready (${combinedRpm} RPM)` : 'No active keys'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsKeyRingOpen(true)}
            className="h-7 text-xs font-semibold"
          >
            Manage Keys
          </Button>
        </div>

        {/* Card 4: Quick Smart Utilities */}
        <div className="p-3.5 bg-card rounded-xl border border-border space-y-2 text-xs">
          <span className="font-semibold text-foreground block pb-1 border-b border-border">
            Utilities
          </span>
          <button
            type="button"
            onClick={() => setIsTemplatesOpen(true)}
            className="w-full p-1.5 rounded-md text-left text-muted-foreground hover:text-foreground hover:bg-secondary/40 flex items-center gap-2 cursor-pointer transition"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">CSV Specs & Samples</span>
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* RIGHT WORKSPACE: Batch Action Bar, Live Progress, Table   */}
      {/* ======================================================== */}
      <main className="flex-1 w-full min-w-0 space-y-4">
        {/* Top Action Toolbar */}
        <div className="p-3 bg-card rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          {/* File Ingestion Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Images
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => folderInputRef.current?.click()}
              disabled={isRunning}
              className="gap-1.5 text-xs"
            >
              <FolderUp className="w-3.5 h-3.5" />
              Select Folder
            </Button>

            {unifiedAssets.length > 0 && (
              <span className="text-xs text-muted-foreground font-mono ml-1">
                {unifiedAssets.length} assets ({completedCount} ready, {pendingCount} queued)
              </span>
            )}
          </div>

          {/* Queue Execution & Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Start / Pause / Resume Controls */}
            {!isRunning && !isPaused && (
              <Button
                size="sm"
                onClick={handleStartQueue}
                disabled={pendingCount === 0 || healthyKeys.length === 0}
                className="gap-1.5 text-xs font-semibold"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Generation ({pendingCount})
              </Button>
            )}

            {isRunning && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => batchQueueService.pause()}
                className="gap-1.5 text-xs"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </Button>
            )}

            {isPaused && (
              <Button
                size="sm"
                onClick={() => batchQueueService.resume(isAiGenerated, '', 'gemini-3.8-flash')}
                className="gap-1.5 text-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Resume
              </Button>
            )}

            {/* Export All CSVs (.ZIP) */}
            <Button
              size="sm"
              variant="default"
              onClick={() => setIsExportOpen(true)}
              disabled={completedCount === 0}
              className="gap-1.5 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSVs ({completedCount})
            </Button>

            {unifiedAssets.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setClearAllConfirmOpen(true)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
                title="Clear All"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Real-time Progress Bar */}
        {queueState.totalCount > 0 && (
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
                      onClick={() =>
                        batchQueueService.retryFailed(
                          isAiGenerated,
                          '',
                          'Nano Banana',
                          keywordPhrasing,
                          titleLengthPreset
                        )
                      }
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
                <FolderUp className="w-3.5 h-3.5" /> Select Folder
              </Button>
            </div>
          </div>
        ) : (
          /* Populated State: Full-Width Unified Data Grid Table */
          <div className="space-y-3">
            {/* Search Filter Bar */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" />
                <Input
                  placeholder="Filter by filename, title, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7.5 pl-8 w-64 text-xs"
                />
              </div>

              <span className="text-muted-foreground text-xs font-mono">
                {filteredAssets.length} assets shown
              </span>
            </div>

            {/* Spacious Asset Cards List matching user's reference design */}
            <div className="space-y-4">
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  rec={asset.masterRecord}
                  copiedKey={copiedKey}
                  onCopyText={handleCopyText}
                  onCopyAll={handleCopyAllRecord}
                  onDelete={handleDeleteAsset}
                  onRegenerate={handleRegenerateSingle}
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
        title="API Keys Manager"
        description="Add, test, and pace multiple vision keys across Gemini, OpenRouter, Groq, and Mistral."
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
            <pre className="p-3 bg-secondary/50 rounded-lg text-[11px] font-mono text-foreground overflow-x-auto max-h-80 whitespace-pre">
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
    </div>
  );
};
