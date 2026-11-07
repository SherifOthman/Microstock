import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  MasterMetadataRecord,
  SupportedPlatform,
  TrackerAgencyStatus,
  MediaType,
} from '../../types';
import { db, useSqliteQuery, DEFAULT_PLATFORM_LIMITS, resolveAssetPreviewUrl } from '../../db';
import { generatePlatformCsv } from '../../services/export/csvExporter';
import { UniversalTransformOptions } from '../../services/rules/platformTransformers';
import {
  atomicIngestionService,
  IngestionQueueItem,
} from '../../services/tracker/atomicIngestionService';
import {
  evaluateAgencyPreflight,
  AgencyPreflightWarning,
} from '../../services/tracker/agencyPreflightValidator';
import {
  AGENCY_KEYWORD_CAPS,
  autoTrimKeywordsForAgency,
} from '../../services/tracker/bulkTrackerOperations';
import {
  getCleanAssetDisplayTitle,
  seedMassiveContributorPortfolio,
} from '../../services/tracker/portfolioSeeder';
import { RejectionReasonModal } from './RejectionReasonModal';
import { ExportBasketReconcileModal } from './ExportBasketReconcileModal';
import { BulkMetadataSurgeryModal } from './BulkMetadataSurgeryModal';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Progress } from '../../components/ui/progress';
import { Dialog } from '../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Search,
  FolderOpen,
  PackageCheck,
  Film,
  PenTool,
  Image as ImageIcon,
  Sparkles,
  Check,
  Eye,
  Wrench,
  Scissors,
  Columns,
  Focus,
  Filter,
  MoreHorizontal,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  Activity,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Settings2,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface FixAndRequeueContext {
  assetId: string;
  filename: string;
  agencyId: SupportedPlatform;
  agencyName: string;
  rejectionReasonTitle: string;
  customRejectionNote?: string;
}

export interface DistributionTrackerViewProps {
  initialFocusAgency?: SupportedPlatform;
  onFixAndRequeue?: (context: FixAndRequeueContext) => void;
}

const AGENCIES: SupportedPlatform[] = [
  'adobe',
  'freepik',
  'shutterstock',
  'vecteezy',
  'dreamstime',
  '123rf',
];

const AGENCY_DISPLAY_NAMES: Record<SupportedPlatform, { full: string; short: string }> = {
  adobe: { full: 'Adobe Stock', short: 'Adobe' },
  freepik: { full: 'Freepik', short: 'Freepik' },
  shutterstock: { full: 'Shutterstock', short: 'Shutter' },
  vecteezy: { full: 'Vecteezy', short: 'Vecteezy' },
  dreamstime: { full: 'Dreamstime', short: 'Dreams' },
  '123rf': { full: '123RF', short: '123RF' },
};

const ALL_STATUSES: TrackerAgencyStatus[] = [
  'New',
  'Pending Upload',
  'Uploaded',
  'In Review',
  'Accepted',
  'Rejected',
];

const STATUS_SHORT_LABELS: Record<TrackerAgencyStatus, string> = {
  New: 'New',
  'Pending Upload': 'Pending',
  Uploaded: 'Uploaded',
  'In Review': 'Review',
  Accepted: 'Accepted',
  Rejected: 'Rejected',
};

function getStatusBadgeClasses(status: TrackerAgencyStatus): string {
  switch (status) {
    case 'Accepted':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25';
    case 'Uploaded':
    case 'In Review':
      return 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/25';
    case 'Pending Upload':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25';
    case 'Rejected':
      return 'bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/25';
    case 'New':
    default:
      return 'bg-slate-100 dark:bg-secondary text-foreground border-slate-200 dark:border-border hover:bg-slate-200/70 dark:hover:bg-secondary/80';
  }
}

function resolveAssetBatchGroup(rec: MasterMetadataRecord): string {
  if (rec.batchId && rec.batchId.trim()) {
    return rec.batchId.trim().toUpperCase();
  }
  const match = (rec.filename || '').match(/^(B\d{2})\b/i);
  if (match) return match[1].toUpperCase();
  return 'B01';
}

function triggerBrowserCsvDownload(filename: string, csvContent: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // ignore in non-DOM test environments
  }
}

export const DistributionTrackerView: React.FC<DistributionTrackerViewProps> = ({
  initialFocusAgency,
}) => {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const parentScrollRef = useRef<HTMLDivElement | null>(null);

  // Pillar 1: Reactive SQLite queries strictly isolated from Metadata Studio ('studio' records excluded)
  const rawMasterRecords = useSqliteQuery(() => db.masterRecords.toArray(), [], [], ['master']) || [];
  const masterRecords = useMemo(
    () => rawMasterRecords.filter((rec) => rec.workspaceScope !== 'studio'),
    [rawMasterRecords]
  );
  const trackerStats = useSqliteQuery(() => db.tracker.getStats(), [masterRecords.length], undefined, ['master']);
  const workspacePaths = useSqliteQuery(() => db.tracker.getWorkspacePaths(), [], undefined, ['settings']);
  const exportBaskets = useSqliteQuery(() => db.tracker.getExportBaskets(), [masterRecords.length], [], ['master']) || [];

  // View Mode: Visual Gallery Grid (default) vs Clean Compact List
  const [viewMode, setViewMode] = useState<'gallery' | 'list'>('gallery');

  // Pillar 3: Pipeline Transparency & Collapsible Drawer State
  const [ingestionItems, setIngestionItems] = useState<IngestionQueueItem[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isPipelineDrawerOpen, setIsPipelineDrawerOpen] = useState(false);

  // Pillar 2: Ingestion Origin Prompt Modal ("Are these AI-generated or Real?")
  const [pendingIngestFiles, setPendingIngestFiles] = useState<File[]>([]);
  const [isIngestOriginModalOpen, setIsIngestOriginModalOpen] = useState(false);
  const [ingestOriginChoice, setIngestOriginChoice] = useState<'AI' | 'REAL'>('AI');
  const [ingestBatchIdInput, setIngestBatchIdInput] = useState<string>('B01');
  const [isDragOverWorkspace, setIsDragOverWorkspace] = useState(false);

  // Filter, Batch Grouping, Focus Mode & Cross-Tab Persistent Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAgency, setActiveAgency] = useState<SupportedPlatform>(initialFocusAgency || 'adobe');
  const [applyToAllAgencies, setApplyToAllAgencies] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TrackerAgencyStatus | 'ALL'>('ALL');
  const [onlyWarningsFilter, setOnlyWarningsFilter] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaType | 'ALL'>('ALL');
  const [originFilter, setOriginFilter] = useState<'ALL' | 'AI' | 'REAL'>('ALL');
  const [batchFilter, setBatchFilter] = useState<string>('ALL');
  const [isFocusMode, setIsFocusMode] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);

  // Pillar 4: Export Configuration Modal State
  const [isExportConfigModalOpen, setIsExportConfigModalOpen] = useState(false);
  const [freepikAiToggle, setFreepikAiToggle] = useState<boolean>(true);
  const [freepikModelName, setFreepikModelName] = useState<string>('Google Nano Banana');
  const [vecteezyLicense, setVecteezyLicense] = useState<'pro' | 'free'>('pro');
  const [vecteezyMatchUpload, setVecteezyMatchUpload] = useState<boolean>(false);
  const [shutterEditorial, setShutterEditorial] = useState<'yes' | 'no'>('no');
  const [shutterMature, setShutterMature] = useState<'yes' | 'no'>('no');
  const [shutterIllustration, setShutterIllustration] = useState<'yes' | 'no'>('no');
  const [dtWel, setDtWel] = useState<boolean>(true);
  const [dtPel, setDtPel] = useState<boolean>(false);
  const [dtFree, setDtFree] = useState<boolean>(false);
  const [dtEditorial, setDtEditorial] = useState<boolean>(false);
  const [dtAiFlag, setDtAiFlag] = useState<boolean>(true);
  const [rfCountryCode, setRfCountryCode] = useState<string>('EG');

  // Modals & Copy Feedback State
  const [isBasketsModalOpen, setIsBasketsModalOpen] = useState(false);
  const [isBulkSeoModalOpen, setIsBulkSeoModalOpen] = useState(false);
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Editable state inside Metadata Inspector Modal (Two Titles + Description + Keywords)
  const [editShortTitle, setEditShortTitle] = useState('');
  const [editLongTitle, setEditLongTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editKeywords, setEditKeywords] = useState('');

  useEffect(() => {
    if (initialFocusAgency) {
      setActiveAgency(initialFocusAgency);
      setIsFocusMode(true);
    }
  }, [initialFocusAgency]);

  const [rejectionModalState, setRejectionModalState] = useState<{
    open: boolean;
    agencyId: SupportedPlatform;
    assetIds: string[];
    allAgencies?: boolean;
  }>({
    open: false,
    agencyId: 'adobe',
    assetIds: [],
  });

  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    folderPath?: string;
  } | null>(null);

  useEffect(() => {
    const unsub = atomicIngestionService.subscribe((items, running) => {
      setIngestionItems(items);
      setIsIngesting(running);
      if (items.some((i) => i.stage === 'failed')) {
        setIsPipelineDrawerOpen(true);
      }
    });
    return () => unsub();
  }, []);

  const batchGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rec of masterRecords) {
      const b = resolveAssetBatchGroup(rec);
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [masterRecords]);

  const mediaTypeCounts = useMemo(() => {
    let image = 0;
    let vector = 0;
    let video = 0;
    for (const rec of masterRecords) {
      const m = rec.mediaType || 'image';
      if (m === 'video') video++;
      else if (m === 'vector') vector++;
      else image++;
    }
    return {
      ALL: masterRecords.length,
      image,
      vector,
      video,
    };
  }, [masterRecords]);

  const preflightByAssetId = useMemo(() => {
    const map = new Map<string, AgencyPreflightWarning[]>();
    for (const rec of masterRecords) {
      const warnings = evaluateAgencyPreflight(rec, activeAgency);
      if (warnings.length > 0) {
        map.set(rec.id, warnings);
      }
    }
    return map;
  }, [masterRecords, activeAgency]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return masterRecords.filter((rec) => {
      if (mediaFilter !== 'ALL' && (rec.mediaType || 'image') !== mediaFilter) return false;
      if (originFilter === 'AI' && !rec.isAiGenerated) return false;
      if (originFilter === 'REAL' && rec.isAiGenerated) return false;
      if (batchFilter !== 'ALL' && resolveAssetBatchGroup(rec) !== batchFilter) return false;

      if (statusFilter !== 'ALL') {
        const agencyTrack = rec.agencyTrackings?.[activeAgency];
        const currentSt = agencyTrack?.status || 'New';
        if (currentSt !== statusFilter) return false;
      }

      if (onlyWarningsFilter && !preflightByAssetId.has(rec.id)) {
        return false;
      }

      if (q) {
        const matchFile = rec.filename.toLowerCase().includes(q);
        const matchTitle = (rec.baseTitle || '').toLowerCase().includes(q);
        const matchShort = (rec.shortTitle || '').toLowerCase().includes(q);
        const matchLong = (rec.longTitle || '').toLowerCase().includes(q);
        const matchKw = (rec.rankedKeywords || []).some((k) => k.toLowerCase().includes(q));
        if (!matchFile && !matchTitle && !matchShort && !matchLong && !matchKw) return false;
      }
      return true;
    });
  }, [
    masterRecords,
    searchQuery,
    mediaFilter,
    originFilter,
    batchFilter,
    statusFilter,
    onlyWarningsFilter,
    activeAgency,
    preflightByAssetId,
  ]);

  // Selected records resolved across ALL media tabs so cross-tab selections are preserved
  const selectedRecordsAcrossVault = useMemo(
    () => masterRecords.filter((r) => selectedIds.has(r.id)),
    [masterRecords, selectedIds]
  );

  const selectedMediaBreakdown = useMemo(() => {
    let photos = 0;
    let vectors = 0;
    let videos = 0;
    for (const rec of selectedRecordsAcrossVault) {
      const m = rec.mediaType || 'image';
      if (m === 'video') videos++;
      else if (m === 'vector') vectors++;
      else photos++;
    }
    return { photos, vectors, videos };
  }, [selectedRecordsAcrossVault]);

  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (mediaFilter !== 'ALL' ? 1 : 0) +
    (originFilter !== 'ALL' ? 1 : 0) +
    (batchFilter !== 'ALL' ? 1 : 0) +
    (onlyWarningsFilter ? 1 : 0);

  const handleResetAllFilters = () => {
    setStatusFilter('ALL');
    setMediaFilter('ALL');
    setOriginFilter('ALL');
    setBatchFilter('ALL');
    setOnlyWarningsFilter(false);
  };

  // Virtualizer for Compact List Mode (44px compressed rows)
  const rowVirtualizer = useVirtualizer({
    count: filteredRecords.length,
    getScrollElement: () => parentScrollRef.current,
    estimateSize: () => 44,
    overscan: 14,
  });

  const inspectedAsset = useMemo(
    () => masterRecords.find((r) => r.id === inspectedAssetId) || null,
    [masterRecords, inspectedAssetId]
  );

  useEffect(() => {
    if (inspectedAsset) {
      const resolvedLong =
        inspectedAsset.longTitle ||
        inspectedAsset.baseTitle ||
        getCleanAssetDisplayTitle(inspectedAsset);
      const resolvedShort =
        inspectedAsset.shortTitle ||
        (resolvedLong.length < 100
          ? resolvedLong
          : resolvedLong.slice(0, 99).replace(/\s+\S*$/, '').trim());
      setEditShortTitle(resolvedShort);
      setEditLongTitle(resolvedLong);
      setEditDesc(inspectedAsset.detailedDescription || '');
      setEditKeywords((inspectedAsset.rankedKeywords || []).join(', '));
    }
  }, [inspectedAsset?.id]);

  const handleSaveInspectedMetadata = async () => {
    if (!inspectedAsset) return;
    const cleanedKeywords = editKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const nextLong = editLongTitle.trim() || editShortTitle.trim();
    const nextShort =
      editShortTitle.trim() ||
      (nextLong.length < 100 ? nextLong : nextLong.slice(0, 99).replace(/\s+\S*$/, '').trim());

    await db.masterRecords.update(inspectedAsset.id, {
      baseTitle: nextLong,
      shortTitle: nextShort,
      longTitle: nextLong,
      detailedDescription: editDesc.trim(),
      rankedKeywords: cleanedKeywords,
      updatedAt: Date.now(),
    });
    setInspectedAssetId(null);
    setActionBanner({
      type: 'success',
      message: `Saved metadata updates for "${nextLong}".`,
    });
  };

  // Granular 1-Click Copy Helpers (inside Metadata Inspector Modal)
  const copyField = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  // Pillar 2: Intercept dropped or selected files -> Prompt "Are these AI-generated or Real?"
  const handleStageFilesForOriginPrompt = (files: File[]) => {
    if (!files || files.length === 0) return;
    setPendingIngestFiles(files);
    // Infer default origin if folder path has AI_ vs Photos/Vectors/Videos
    const samplePath = String(
      (files[0] as any)?.__nativePath ||
        (files[0] as any)?.path ||
        (files[0] as any)?.webkitRelativePath ||
        ''
    );
    if (/(?:^|[\\/])(?:Real|Photos|Videos|Vectors)(?:[\\/]|$)/i.test(samplePath) && !/AI/i.test(samplePath)) {
      setIngestOriginChoice('REAL');
    } else {
      setIngestOriginChoice('AI');
    }
    setIsIngestOriginModalOpen(true);
  };

  const handleConfirmIngestionOrigin = async () => {
    if (pendingIngestFiles.length === 0) {
      setIsIngestOriginModalOpen(false);
      return;
    }
    const filesToProcess = [...pendingIngestFiles];
    const isAi = ingestOriginChoice === 'AI';
    const cleanBatch = (ingestBatchIdInput || 'B01').trim().toUpperCase() || 'B01';

    setPendingIngestFiles([]);
    setIsIngestOriginModalOpen(false);
    setIsPipelineDrawerOpen(true);

    await atomicIngestionService.enqueueFiles(filesToProcess, {
      isAiGenerated: isAi,
      batchId: cleanBatch,
      useAiMetadata: true,
    });
  };

  // Open Master Vault Folder in OS File Explorer
  const handleOpenMasterVaultFolder = async () => {
    const folder = workspacePaths?.masterVaultDir || '/StockFlow/Master_Vault';
    if (typeof window !== 'undefined' && window.electronAPI?.openPath) {
      const res = await window.electronAPI.openPath(folder);
      if (!res?.success) {
        setActionBanner({
          type: 'warning',
          message: `Master Vault folder path: ${folder}`,
          folderPath: folder,
        });
      }
    } else {
      setActionBanner({
        type: 'success',
        message: `Master Vault Location: ${folder}`,
        folderPath: folder,
      });
    }
  };

  // Pillar 5: Selection-First UX (Single Click, Shift+Click range, Ctrl/Cmd+Click)
  const handleToggleItemSelect = (
    id: string,
    index: number,
    event?: React.MouseEvent
  ) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (event?.shiftKey && lastSelectedIdx !== null && filteredRecords.length > 0) {
        const start = Math.min(lastSelectedIdx, index);
        const end = Math.max(lastSelectedIdx, index);
        for (let i = start; i <= end; i++) {
          const item = filteredRecords[i];
          if (item) next.add(item.id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastSelectedIdx(index);
  };

  const handleToggleSelectAll = () => {
    const allFilteredSelected =
      filteredRecords.length > 0 && filteredRecords.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const r of filteredRecords) next.delete(r.id);
      } else {
        for (const r of filteredRecords) next.add(r.id);
      }
      return next;
    });
  };

  // Update agency status (single or bulk)
  const handleStatusChange = async (
    assetIds: string[],
    agencyId: SupportedPlatform,
    targetStatus: TrackerAgencyStatus,
    allAgencies = false
  ) => {
    if (assetIds.length === 0) return;
    if (targetStatus === 'Rejected') {
      setRejectionModalState({
        open: true,
        agencyId,
        assetIds,
        allAgencies,
      });
      return;
    }

    const targets = allAgencies ? AGENCIES : [agencyId];
    for (const ag of targets) {
      await db.tracker.reconcileAgencyStatuses({
        assetIds,
        agencyId: ag,
        targetStatus,
      });
    }
  };

  // Candidates for export: if user has cross-tab selections (`selectedIds.size > 0`), use all selected across vault!
  // Otherwise use 'New' assets in the current filtered view.
  const exportCandidates = useMemo(() => {
    if (selectedIds.size > 0) {
      return selectedRecordsAcrossVault;
    }
    return filteredRecords.filter(
      (r) => (r.agencyTrackings?.[activeAgency]?.status || 'New') === 'New'
    );
  }, [selectedIds, selectedRecordsAcrossVault, filteredRecords, activeAgency]);

  // Pillar 4: Open Export Configuration Step Modal before generating CSV
  const handleOpenExportConfigStep = () => {
    if (exportCandidates.length === 0) {
      setActionBanner({
        type: 'warning',
        message: `No "New" or selected assets available to export for ${AGENCY_DISPLAY_NAMES[activeAgency].full}.`,
      });
      return;
    }
    const anyAi = exportCandidates.some((r) => r.isAiGenerated);
    setFreepikAiToggle(anyAi);
    setDtAiFlag(anyAi);
    setIsExportConfigModalOpen(true);
  };

  // Pillar 2 & 4: Execute Configured Export & Mixed-Media Batch Split (e.g. Dreamstime _images.csv + _videos.csv)
  const handleConfirmConfiguredExport = async () => {
    if (exportCandidates.length === 0) {
      setIsExportConfigModalOpen(false);
      return;
    }

    const limit = DEFAULT_PLATFORM_LIMITS[activeAgency]?.defaultBatchLimit || 50;
    const batchSlice = exportCandidates.slice(0, limit);

    // For Freepik, videos are unsupported so only non-video assets are exported and staged
    const eligibleSlice =
      activeAgency === 'freepik'
        ? batchSlice.filter((r) => (r.mediaType || 'image') !== 'video')
        : batchSlice;

    if (eligibleSlice.length === 0) {
      setIsExportConfigModalOpen(false);
      setActionBanner({
        type: 'warning',
        message: `Freepik does not support video files. All ${batchSlice.length} selected assets are videos.`,
      });
      return;
    }

    const exportOptions: UniversalTransformOptions = {
      freepik: {
        isAiGenerated: freepikAiToggle,
        modelName: freepikModelName.trim() || 'Google Nano Banana',
      },
      vecteezy: {
        license: vecteezyLicense,
        webUploaderParity: vecteezyMatchUpload,
      },
      shutterstock: {
        editorial: shutterEditorial === 'yes',
        matureContent: shutterMature === 'yes',
        illustration: shutterIllustration === 'yes',
      },
      dreamstime: {
        wel: dtWel,
        pel: dtPel,
        free: dtFree,
        editorial: dtEditorial,
        isAiGenerated: dtAiFlag,
      },
      '123rf': {
        countryCode: rfCountryCode === 'none' ? undefined : rfCountryCode,
      },
    };

    const basketName = `${activeAgency}_batch_${new Date().toISOString().slice(0, 10)}`;
    const csvOut = generatePlatformCsv(activeAgency, eligibleSlice, basketName, exportOptions);

    if (csvOut.isBlocked) {
      setIsExportConfigModalOpen(false);
      setActionBanner({
        type: 'error',
        message: csvOut.blockedReason || `Export blocked for ${AGENCY_DISPLAY_NAMES[activeAgency].full}.`,
      });
      return;
    }

    const additionalCsvs =
      csvOut.additionalResults?.map((ar) => ({
        filename: ar.filename,
        csvString: ar.csvString,
      })) || [];

    const basket = await db.tracker.createExportBasket({
      agencyId: activeAgency,
      basketName,
      assetIds: eligibleSlice.map((r) => r.id),
      csvFilename: csvOut.filename,
      csvContent: csvOut.csvString,
      additionalCsvs,
    });

    // Download primary CSV and any mixed-media split CSVs (e.g. Dreamstime _images.csv + _videos.csv)
    triggerBrowserCsvDownload(csvOut.filename, csvOut.csvString);
    for (const extra of additionalCsvs) {
      triggerBrowserCsvDownload(extra.filename, extra.csvString);
    }

    setIsExportConfigModalOpen(false);

    const exportedFileSummary =
      additionalCsvs.length > 0
        ? `${csvOut.filename} + ${additionalCsvs.map((a) => a.filename).join(', ')}`
        : csvOut.filename;

    setActionBanner({
      type: 'success',
      message: `Exported ${eligibleSlice.length} assets (${exportedFileSummary}) & staged in ${AGENCY_DISPLAY_NAMES[activeAgency].full} Pending Upload Basket.`,
      folderPath: basket.stagingFolderPath,
    });
  };

  // Auto-trim keywords for active agency cap
  const handleAutoTrimForActiveAgency = async () => {
    const targets =
      selectedIds.size > 0 ? selectedRecordsAcrossVault : filteredRecords;
    const res = await autoTrimKeywordsForAgency(targets, activeAgency);
    setActionBanner({
      type: 'success',
      message: `Trimmed ${res.updatedCount} assets to ${AGENCY_DISPLAY_NAMES[activeAgency].short}'s ${res.cap}-keyword limit.`,
    });
  };

  // Pillar 3: Pipeline Telemetry Metrics
  const pipelineMetrics = useMemo(() => {
    const total = ingestionItems.length;
    const committed = ingestionItems.filter((i) => i.stage === 'committed').length;
    const duplicates = ingestionItems.filter((i) => i.stage === 'duplicate_skipped').length;
    const failed = ingestionItems.filter((i) => i.stage === 'failed').length;
    const done = committed + duplicates + failed;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, committed, duplicates, failed, done, percent };
  }, [ingestionItems]);

  const activeAgencyStats = trackerStats?.perAgencyStats?.[activeAgency] || {
    New: 0,
    'Pending Upload': 0,
    Uploaded: 0,
    'In Review': 0,
    Accepted: 0,
    Rejected: 0,
  };

  const pendingBasketsForAgency = exportBaskets.filter(
    (b) => b.agencyId === activeAgency && b.status === 'pending_reconciliation'
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOverWorkspace(true);
      }}
      onDragLeave={() => setIsDragOverWorkspace(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOverWorkspace(false);
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          handleStageFilesForOriginPrompt(Array.from(e.dataTransfer.files));
        }
      }}
      className={`flex-1 min-h-0 h-full flex flex-col gap-2.5 overflow-hidden select-none ${
        isDragOverWorkspace ? 'ring-2 ring-primary/60 rounded-xl' : ''
      }`}
    >
      {/* Hidden File/Folder Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.eps,.ai,.svg,.mp4,.mov,.webm"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleStageFilesForOriginPrompt(Array.from(e.target.files));
            e.currentTarget.value = '';
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported in Chromium/Electron
        webkitdirectory="true"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleStageFilesForOriginPrompt(Array.from(e.target.files));
            e.currentTarget.value = '';
          }
        }}
      />

      {/* Auto-Disappearing Slim Ingestion Progress Bar (visible during active import) */}
      {isIngesting && (
        <div
          data-testid="slim-ingestion-progress"
          className="shrink-0 px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-foreground shrink-0">
            <UploadCloud className="w-4 h-4 text-primary" />
            <span className="font-mono tabular-nums">
              Importing into Master Vault ({pipelineMetrics.done}/{pipelineMetrics.total} · {pipelineMetrics.percent}%)
            </span>
          </div>
          <Progress value={pipelineMetrics.percent} className="h-2 flex-1 max-w-md" />
        </div>
      )}

      {/* Single Flattened Command, Media & Agency Bar */}
      <div className="shrink-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card flex flex-wrap items-center justify-between gap-2">
        {/* Left Zone: Search + Media Type Tabs + 6-Agency Focus Switcher */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {/* Search Input */}
          <div className="relative w-44 sm:w-52">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'ar' ? 'بحث في العناوين...' : 'Search clean titles or tags...'}
              className="h-8 pl-8 pr-2.5 text-xs bg-white dark:bg-background"
            />
          </div>

          {/* Pillar 2: Top-Level Media Tabs (All Media / Photos / Vectors / Videos) with Persistent Cross-Tab Selection */}
          <div
            dir="ltr"
            data-testid="tracker-media-tabs"
            className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-secondary/70 p-0.5 border border-slate-200 dark:border-border"
          >
            {(
              [
                { id: 'ALL', label: 'All', count: mediaTypeCounts.ALL },
                { id: 'image', label: 'Photos', count: mediaTypeCounts.image },
                { id: 'vector', label: 'Vectors', count: mediaTypeCounts.vector },
                { id: 'video', label: 'Videos', count: mediaTypeCounts.video },
              ] as const
            ).map((tab) => {
              const isSelected = mediaFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`media-tab-${tab.id}`}
                  onClick={() => setMediaFilter(tab.id)}
                  className={`h-7 px-2 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-white dark:bg-card text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 6-Agency Switcher Bar */}
          <div
            dir="ltr"
            className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-secondary/70 p-0.5 border border-slate-200 dark:border-border"
          >
            {AGENCIES.map((ag) => {
              const isSelected = activeAgency === ag;
              const newCount = trackerStats?.perAgencyStats?.[ag]?.New ?? 0;
              return (
                <button
                  key={ag}
                  type="button"
                  data-testid={`agency-tab-${ag}`}
                  onClick={() => setActiveAgency(ag)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-white dark:bg-card text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="shrink-0">{getPlatformLogo(ag, 13)}</span>
                  <span className="hidden xl:inline">{AGENCY_DISPLAY_NAMES[ag].short}</span>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    {newCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Consolidated Filters Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant={activeFilterCount > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-black/20">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-2 space-y-2 bg-white dark:bg-card">
              <DropdownMenuLabel className="text-[11px] font-mono text-muted-foreground flex items-center justify-between">
                <span>STATUS ({AGENCY_DISPLAY_NAMES[activeAgency].short})</span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAllFilters}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    Reset All
                  </button>
                )}
              </DropdownMenuLabel>
              <div className="grid grid-cols-2 gap-1 px-1">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2 py-1 rounded text-xs text-start cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'hover:bg-secondary text-muted-foreground'
                  }`}
                >
                  All ({masterRecords.length})
                </button>
                {ALL_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2 py-1 rounded text-xs text-start cursor-pointer truncate ${
                      statusFilter === st
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    {STATUS_SHORT_LABELS[st]} ({activeAgencyStats[st] ?? 0})
                  </button>
                ))}
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-mono text-muted-foreground">
                ORIGIN & SHOOT BATCH
              </DropdownMenuLabel>
              <div className="flex flex-wrap gap-1 px-1">
                {(['ALL', 'AI', 'REAL'] as const).map((orig) => (
                  <button
                    key={orig}
                    type="button"
                    onClick={() => setOriginFilter(orig)}
                    className={`px-2 py-1 rounded text-xs cursor-pointer ${
                      originFilter === orig
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {orig === 'ALL' ? 'All Origins' : orig === 'AI' ? 'AI Generated' : 'Real Media'}
                  </button>
                ))}
              </div>

              {batchGroups.length > 0 && (
                <div className="flex flex-wrap gap-1 px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setBatchFilter('ALL')}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer ${
                      batchFilter === 'ALL'
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-secondary/60 text-muted-foreground'
                    }`}
                  >
                    All Shoots
                  </button>
                  {batchGroups.map(([b, cnt]) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBatchFilter(b)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer ${
                        batchFilter === b
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'bg-secondary/60 text-muted-foreground'
                      }`}
                    >
                      {b} ({cnt})
                    </button>
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right Zone: Pipeline Drawer Badge + View Toggle + Open Master Folder + Import + Export + More */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Pillar 3: Collapsible Pipeline Drawer Trigger with Live Status Badge */}
          <Button
            type="button"
            variant={pipelineMetrics.failed > 0 ? 'destructive' : isPipelineDrawerOpen ? 'default' : 'outline'}
            size="sm"
            data-testid="tracker-pipeline-drawer-toggle"
            onClick={() => setIsPipelineDrawerOpen((prev) => !prev)}
            className="h-8 text-xs gap-1.5 cursor-pointer font-mono tabular-nums"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pipeline</span>
            {pipelineMetrics.total > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-black/15 text-[10px]">
                {pipelineMetrics.done}/{pipelineMetrics.total}
              </span>
            )}
            {pipelineMetrics.failed > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-bold">
                {pipelineMetrics.failed} Err
              </span>
            )}
            {isPipelineDrawerOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </Button>

          {/* Gallery Grid vs Compact List Toggle */}
          <div
            dir="ltr"
            className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-secondary p-0.5 border border-slate-200 dark:border-border"
          >
            <button
              type="button"
              data-testid="view-mode-gallery-btn"
              onClick={() => setViewMode('gallery')}
              title="Visual Photo Gallery Grid"
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'gallery'
                  ? 'bg-white dark:bg-card text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gallery</span>
            </button>
            <button
              type="button"
              data-testid="view-mode-list-btn"
              onClick={() => setViewMode('list')}
              title="Clean Compact List View"
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-card text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          {/* Open Master Folder on OS */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="open-master-folder-btn"
            onClick={handleOpenMasterVaultFolder}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-primary" />
            <span className="hidden md:inline">Open Master Folder</span>
          </Button>

          {/* Import Files Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="tracker-import-files-btn"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>

          {/* Primary CTA: Export Active Agency CSV & Basket (Opens Export Configuration Step) */}
          <Button
            type="button"
            variant="default"
            size="sm"
            data-testid="export-active-agency-btn"
            onClick={handleOpenExportConfigStep}
            className="h-8 text-xs gap-1.5 cursor-pointer font-semibold"
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              Export {AGENCY_DISPLAY_NAMES[activeAgency].short} (
              {selectedIds.size > 0 ? selectedIds.size : activeAgencyStats.New})
            </span>
          </Button>

          {/* Consolidated (...) More Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tracker-more-actions-btn"
                className="h-8 w-8 p-0 cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 bg-white dark:bg-card">
              <DropdownMenuLabel className="text-[11px] font-mono text-muted-foreground">
                CONTRIBUTOR TOOLS
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setIsBasketsModalOpen(true)}
                className="text-xs gap-2 cursor-pointer"
              >
                <PackageCheck className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  Reconcile Pending Uploads ({activeAgencyStats['Pending Upload']})
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsBulkSeoModalOpen(true)}
                className="text-xs gap-2 cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-primary" />
                <span>Bulk Find & Replace SEO</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleAutoTrimForActiveAgency}
                className="text-xs gap-2 cursor-pointer"
              >
                <Scissors className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  Auto-Trim Keywords ({AGENCY_KEYWORD_CAPS[activeAgency]} max)
                </span>
              </DropdownMenuItem>
              {viewMode === 'list' && (
                <DropdownMenuItem
                  onClick={() => setIsFocusMode((prev) => !prev)}
                  className="text-xs gap-2 cursor-pointer"
                >
                  {isFocusMode ? (
                    <>
                      <Columns className="w-3.5 h-3.5 text-primary" />
                      <span>Show All 6 Agencies Matrix</span>
                    </>
                  ) : (
                    <>
                      <Focus className="w-3.5 h-3.5 text-primary" />
                      <span>Focus on {AGENCY_DISPLAY_NAMES[activeAgency].short} Only</span>
                    </>
                  )}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => folderInputRef.current?.click()}
                className="text-xs gap-2 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Import Entire Shoot Folder</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => seedMassiveContributorPortfolio(50)}
                className="text-xs gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Reset / Seed 50 Sample Assets</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  const ids = masterRecords.map((r) => r.id);
                  if (ids.length > 0) {
                    db.masterRecords.bulkDelete(ids);
                  }
                  setSelectedIds(new Set());
                }}
                className="text-xs gap-2 text-destructive cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Master Vault</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Pillar 3: Collapsible Pipeline Drawer (Real-Time Progress, Per-Asset Logs & Atomic Retry Failed Assets) */}
      {isPipelineDrawerOpen && (
        <div
          data-testid="tracker-pipeline-drawer"
          className="shrink-0 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card p-3 space-y-2.5 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span>Vault Pipeline Monitor</span>
              </span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {pipelineMetrics.done} / {pipelineMetrics.total} Processed ({pipelineMetrics.percent}%)
              </span>
              <span className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {pipelineMetrics.committed} Committed
              </span>
              {pipelineMetrics.duplicates > 0 && (
                <span className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {pipelineMetrics.duplicates} Duplicates
                </span>
              )}
              {pipelineMetrics.failed > 0 && (
                <span className="text-[11px] font-mono tabular-nums text-destructive font-semibold">
                  {pipelineMetrics.failed} Failed
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {pipelineMetrics.failed > 0 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  data-testid="pipeline-retry-failed-btn"
                  disabled={isIngesting}
                  onClick={() => atomicIngestionService.retryAllFailed()}
                  className="h-7 text-xs gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry Failed Assets ({pipelineMetrics.failed})</span>
                </Button>
              )}
              {(pipelineMetrics.committed > 0 || pipelineMetrics.duplicates > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="pipeline-clear-completed-btn"
                  disabled={isIngesting}
                  onClick={() => atomicIngestionService.clearCompletedAndDuplicates()}
                  className="h-7 text-xs cursor-pointer"
                >
                  Clear Completed
                </Button>
              )}
            </div>
          </div>

          <Progress value={pipelineMetrics.percent} className="h-1.5" />

          {ingestionItems.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              No active or recent ingestion jobs in pipeline queue. Drop files or click Import to begin.
            </div>
          ) : (
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-200 dark:divide-border/60 border border-slate-200 dark:border-border rounded-lg">
              {ingestionItems.map((item) => {
                const isFailed = item.stage === 'failed';
                const isCommitted = item.stage === 'committed';
                return (
                  <div
                    key={item.id}
                    data-testid={`pipeline-item-${item.id}`}
                    className="px-3 py-1.5 flex items-center justify-between gap-3 text-xs bg-white dark:bg-card"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-secondary text-[10px] font-mono uppercase shrink-0">
                        {item.mediaType}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono shrink-0">
                        {item.isAiGenerated ? 'AI' : 'REAL'}
                      </span>
                      <span className="font-medium text-foreground truncate">{item.filename}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isFailed ? (
                        <span className="text-destructive font-medium flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-xs" title={item.error}>
                            {item.error || item.stageLabel}
                          </span>
                        </span>
                      ) : isCommitted ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{item.stageLabel}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {item.stageLabel}
                        </span>
                      )}

                      {isFailed && (
                        <button
                          type="button"
                          onClick={() => atomicIngestionService.retryItem(item.id)}
                          className="px-2 py-0.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 text-[11px] font-medium cursor-pointer"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Contextual Bulk Selection Bar (Shows cross-tab media breakdown when items are selected) */}
      {(selectedIds.size > 0 || pendingBasketsForAgency.length > 0 || actionBanner) && (
        <div className="shrink-0 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card flex flex-wrap items-center justify-between gap-2 text-xs">
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="tracker-selection-summary"
                className="font-semibold text-foreground font-mono tabular-nums"
              >
                {selectedIds.size} Selected
                {(selectedMediaBreakdown.photos > 0 ||
                  selectedMediaBreakdown.vectors > 0 ||
                  selectedMediaBreakdown.videos > 0) && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    ({selectedMediaBreakdown.photos}P · {selectedMediaBreakdown.vectors}V · {selectedMediaBreakdown.videos}Vid)
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                Clear
              </button>
              <span className="text-muted-foreground">·</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground">
                <Checkbox
                  checked={applyToAllAgencies}
                  onCheckedChange={(v) => setApplyToAllAgencies(Boolean(v))}
                />
                <span>Apply to all 6 agencies</span>
              </label>
              <div className="flex items-center gap-1">
                {ALL_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() =>
                      handleStatusChange(
                        Array.from(selectedIds),
                        activeAgency,
                        st,
                        applyToAllAgencies
                      )
                    }
                    className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${getStatusBadgeClasses(
                      st
                    )}`}
                  >
                    Set {STATUS_SHORT_LABELS[st]}
                  </button>
                ))}
              </div>
            </div>
          ) : actionBanner ? (
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-xs text-foreground truncate">{actionBanner.message}</span>
              <button
                type="button"
                onClick={() => setActionBanner(null)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {AGENCY_DISPLAY_NAMES[activeAgency].full} has {activeAgencyStats['Pending Upload']} assets waiting in Pending Upload.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsBasketsModalOpen(true)}
                className="h-6 text-[11px] px-2.5 cursor-pointer"
              >
                Reconcile Uploads
              </Button>
            </div>
          )}
        </div>
      )}

      {/* MAIN WORKSPACE CANVAS (85%+ Vertical Viewport) */}
      <div
        ref={parentScrollRef}
        className="flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card overflow-y-auto"
      >
        {filteredRecords.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
              <ImageIcon className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {masterRecords.length === 0
                ? 'Your Master Vault is Empty'
                : 'No Assets Match Your Current Filters'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {masterRecords.length === 0
                ? 'Import local photos, vectors, or videos, or load the 50-asset contributor portfolio to explore the visual gallery.'
                : 'Clear your active search or status filters to view all assets.'}
            </p>
            <div className="flex items-center gap-2 mt-4">
              {masterRecords.length === 0 ? (
                <>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => seedMassiveContributorPortfolio(50)}
                    className="h-8 text-xs gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Load 50 Sample Assets</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Import Local Files</span>
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetAllFilters}
                  className="h-8 text-xs cursor-pointer"
                >
                  Reset Filters
                </Button>
              )}
            </div>
          </div>
        ) : viewMode === 'gallery' ? (
          /* =====================================================================
           * MODE 1: VISUAL GALLERY GRID (Minimalist, Selection-First Cards)
           * Pillar 5:
           * - Clicking the card, thumbnail, or title toggles selection!
           * - Only the explicit top-right Eye button opens the Metadata Inspector Modal.
           * - Cluttered 3-button copy bar removed from card face.
           * ===================================================================== */
          <div
            data-testid="tracker-gallery-grid"
            className="p-3.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5"
          >
            {filteredRecords.map((rec, idx) => {
              const isSelected = selectedIds.has(rec.id);
              const cleanTitle = getCleanAssetDisplayTitle(rec);
              const agencyTracking = rec.agencyTrackings?.[activeAgency];
              const currentStatus: TrackerAgencyStatus = agencyTracking?.status || 'New';
              const isRejected = currentStatus === 'Rejected';
              const warnings = preflightByAssetId.get(rec.id) || [];

              return (
                <div
                  key={rec.id}
                  data-testid={`gallery-card-${rec.id}`}
                  onClick={(e) => {
                    handleToggleItemSelect(rec.id, idx, e);
                  }}
                  className={`group rounded-xl border bg-white dark:bg-card overflow-hidden flex flex-col justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/35'
                      : 'border-slate-200 dark:border-border hover:border-primary/40'
                  }`}
                >
                  {/* Large 4:3 Visual Thumbnail Frame */}
                  <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-secondary overflow-hidden">
                    {resolveAssetPreviewUrl(rec) ? (
                      <img
                        src={resolveAssetPreviewUrl(rec)}
                        alt={cleanTitle}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                        {rec.mediaType === 'video' ? (
                          <Film className="w-7 h-7" />
                        ) : rec.mediaType === 'vector' ? (
                          <PenTool className="w-7 h-7" />
                        ) : (
                          <ImageIcon className="w-7 h-7" />
                        )}
                      </div>
                    )}

                    {/* Top-Left Selection Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleItemSelect(rec.id, idx, e);
                      }}
                      className={`absolute top-2.5 left-2.5 w-6 h-6 rounded-md bg-black/65 backdrop-blur-xs border border-white/20 flex items-center justify-center cursor-pointer transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
                      }`}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                    </div>

                    {/* Top-Right Dedicated View/Edit (Eye) Icon Button — ONLY trigger for Metadata Modal */}
                    <button
                      type="button"
                      data-testid={`inspect-asset-btn-${rec.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectedAssetId(rec.id);
                      }}
                      title="Inspect & Edit Metadata"
                      className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md bg-black/65 hover:bg-black/85 backdrop-blur-xs border border-white/20 text-white flex items-center justify-center opacity-85 group-hover:opacity-100 transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Pre-flight Warning Indicator (if any) */}
                    {warnings.length > 0 && (
                      <div
                        title={warnings.map((w) => w.detail).join(' • ')}
                        className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-amber-500/90 text-black text-[10px] font-mono font-bold flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>{warnings.length}</span>
                      </div>
                    )}
                  </div>

                  {/* Minimalist Card Body: Clean Title + Tag Count + Single Active Agency Status */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        title={cleanTitle}
                        className="text-xs font-semibold text-foreground truncate flex-1"
                      >
                        {cleanTitle}
                      </h3>
                      <span className="font-mono tabular-nums text-[10px] text-muted-foreground shrink-0">
                        {(rec.rankedKeywords || []).length} tags
                      </span>
                    </div>

                    {isRejected && agencyTracking?.rejectionReasonTitle && (
                      <p
                        title={agencyTracking.customRejectionNote || agencyTracking.rejectionReasonTitle}
                        className="text-[11px] text-destructive font-medium truncate"
                      >
                        {agencyTracking.rejectionReasonTitle}
                      </p>
                    )}

                    {/* Single Active Agency Status Selector */}
                    <div
                      className="flex items-center justify-between gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            data-testid={`card-status-trigger-${rec.id}`}
                            className={`flex-1 h-7 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-1.5 transition cursor-pointer ${getStatusBadgeClasses(
                              currentStatus
                            )}`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="shrink-0">{getPlatformLogo(activeAgency, 12)}</span>
                              <span className="truncate">{STATUS_SHORT_LABELS[currentStatus]}</span>
                            </span>
                            <span className="text-[10px] opacity-70">▾</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44 bg-white dark:bg-card">
                          <DropdownMenuLabel className="text-[10px] font-mono text-muted-foreground">
                            {AGENCY_DISPLAY_NAMES[activeAgency].full.toUpperCase()}
                          </DropdownMenuLabel>
                          {ALL_STATUSES.map((st) => (
                            <DropdownMenuItem
                              key={st}
                              onClick={() => handleStatusChange([rec.id], activeAgency, st)}
                              className="text-xs flex items-center justify-between cursor-pointer"
                            >
                              <span>{st}</span>
                              {currentStatus === st && <Check className="w-3.5 h-3.5 text-primary" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {isRejected && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedAssetId(rec.id);
                          }}
                          className="h-7 px-2 text-[11px] font-semibold cursor-pointer shrink-0"
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* =====================================================================
           * MODE 2: CLEAN COMPACT LIST VIEW (44px High-Density Admin Table)
           * ===================================================================== */
          <div data-testid="tracker-compact-list" className="min-w-[760px]">
            {/* Sticky Table Header */}
            <div className="sticky top-0 z-20 h-9 px-3 bg-white dark:bg-card border-b border-slate-200 dark:border-border flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
              <div className="w-6 flex items-center justify-center shrink-0">
                <Checkbox
                  checked={
                    filteredRecords.length > 0 &&
                    filteredRecords.every((r) => selectedIds.has(r.id))
                  }
                  onCheckedChange={handleToggleSelectAll}
                />
              </div>
              <div className="flex-1 min-w-[200px]">ASSET TITLE</div>
              <div className="w-24 shrink-0">TAGS</div>
              <div className="w-16 shrink-0 text-center">INSPECT</div>
              {isFocusMode ? (
                <div className="w-48 shrink-0 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-foreground font-semibold">
                    {getPlatformLogo(activeAgency, 12)}
                    {AGENCY_DISPLAY_NAMES[activeAgency].full}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFocusMode(false)}
                    className="text-[10px] text-primary hover:underline cursor-pointer"
                  >
                    6-Matrix
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  {AGENCIES.map((ag) => (
                    <div
                      key={ag}
                      className="w-24 text-center flex items-center justify-center gap-1"
                    >
                      {getPlatformLogo(ag, 11)}
                      <span>{AGENCY_DISPLAY_NAMES[ag].short}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsFocusMode(true)}
                    className="text-[10px] text-primary hover:underline ml-1 cursor-pointer"
                  >
                    1-Focus
                  </button>
                </div>
              )}
            </div>

            {/* Virtualized 44px Rows */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const rec = filteredRecords[virtualRow.index];
                if (!rec) return null;
                const isSelected = selectedIds.has(rec.id);
                const cleanTitle = getCleanAssetDisplayTitle(rec);
                const activeSt: TrackerAgencyStatus =
                  rec.agencyTrackings?.[activeAgency]?.status || 'New';

                return (
                  <div
                    key={rec.id}
                    onClick={(e) => handleToggleItemSelect(rec.id, virtualRow.index, e)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`px-3 border-b border-slate-200 dark:border-border/60 flex items-center gap-3 text-xs transition-colors cursor-pointer ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-slate-50 dark:hover:bg-secondary/40'
                    }`}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleItemSelect(rec.id, virtualRow.index, e);
                      }}
                      className="w-6 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                    </div>

                    {/* Thumbnail + Clean Title (Clicking row toggles selection) */}
                    <div className="flex-1 min-w-[200px] flex items-center gap-2.5 truncate">
                      {resolveAssetPreviewUrl(rec) ? (
                        <img
                          src={resolveAssetPreviewUrl(rec)}
                          alt={cleanTitle}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded object-cover shrink-0 border border-slate-200 dark:border-border"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded bg-slate-100 dark:bg-secondary flex items-center justify-center shrink-0">
                          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-medium text-foreground truncate">
                        {cleanTitle}
                      </span>
                    </div>

                    <div className="w-24 shrink-0 font-mono tabular-nums text-[11px] text-muted-foreground">
                      {(rec.rankedKeywords || []).length} tags
                    </div>

                    {/* Dedicated Inspect / Edit Icon Button */}
                    <div className="w-16 shrink-0 flex items-center justify-center">
                      <button
                        type="button"
                        data-testid={`list-inspect-btn-${rec.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedAssetId(rec.id);
                        }}
                        title="Inspect & Edit Metadata"
                        className="h-6 w-7 rounded border border-slate-200 dark:border-border bg-white dark:bg-secondary/60 hover:bg-slate-100 dark:hover:bg-secondary flex items-center justify-center cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-foreground" />
                      </button>
                    </div>

                    {/* Status Column(s) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 flex items-center"
                    >
                      {isFocusMode ? (
                        <div className="w-48 shrink-0 flex items-center gap-1.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={`flex-1 h-6 px-2 rounded border text-[11px] font-medium flex items-center justify-between cursor-pointer ${getStatusBadgeClasses(
                                  activeSt
                                )}`}
                              >
                                <span className="truncate">{STATUS_SHORT_LABELS[activeSt]}</span>
                                <span className="text-[9px] opacity-70">▾</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 bg-white dark:bg-card">
                              {ALL_STATUSES.map((st) => (
                                <DropdownMenuItem
                                  key={st}
                                  onClick={() => handleStatusChange([rec.id], activeAgency, st)}
                                  className="text-xs cursor-pointer"
                                >
                                  {st}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {AGENCIES.map((ag) => {
                            const st = rec.agencyTrackings?.[ag]?.status || 'New';
                            return (
                              <DropdownMenu key={ag}>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className={`w-24 h-6 px-1.5 rounded border text-[10px] font-medium truncate cursor-pointer ${getStatusBadgeClasses(
                                      st
                                    )}`}
                                  >
                                    {STATUS_SHORT_LABELS[st]}
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-36 bg-white dark:bg-card">
                                  {ALL_STATUSES.map((opt) => (
                                    <DropdownMenuItem
                                      key={opt}
                                      onClick={() => handleStatusChange([rec.id], ag, opt)}
                                      className="text-xs cursor-pointer"
                                    >
                                      {opt}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Pillar 2: Ingestion Origin Prompt Modal ("Are these AI-generated or Real?") */}
      <Dialog
        open={isIngestOriginModalOpen}
        onClose={() => {
          setPendingIngestFiles([]);
          setIsIngestOriginModalOpen(false);
        }}
        title="Are these AI-generated or Real?"
        size="md"
      >
        <div data-testid="tracker-ingest-origin-modal" className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Routing <span className="font-mono font-semibold text-foreground">{pendingIngestFiles.length}</span> dropped file(s) into the Master Vault. Select their origin so StockFlow places them in the correct directory and applies accurate agency compliance flags.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              data-testid="ingest-origin-ai-btn"
              onClick={() => setIngestOriginChoice('AI')}
              className={`p-3 rounded-xl border text-start transition cursor-pointer ${
                ingestOriginChoice === 'AI'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                  : 'border-slate-200 dark:border-border bg-white dark:bg-card hover:border-primary/40'
              }`}
            >
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>AI-Generated Media</span>
                {ingestOriginChoice === 'AI' && <CheckCircle2 className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Routes to <span className="font-mono">Master_Vault/AI/</span> & enables Generative AI flags (e.g. Dreamstime Cat 114, Freepik AI).
              </p>
            </button>

            <button
              type="button"
              data-testid="ingest-origin-real-btn"
              onClick={() => setIngestOriginChoice('REAL')}
              className={`p-3 rounded-xl border text-start transition cursor-pointer ${
                ingestOriginChoice === 'REAL'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                  : 'border-slate-200 dark:border-border bg-white dark:bg-card hover:border-primary/40'
              }`}
            >
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Real / Authentic</span>
                {ingestOriginChoice === 'REAL' && <CheckCircle2 className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Routes to <span className="font-mono">Master_Vault/Real/</span> & marks assets as authentic camera/vector artwork.
              </p>
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Shoot / Batch ID</label>
            <Input
              data-testid="ingest-batch-id-input"
              value={ingestBatchIdInput}
              onChange={(e) => setIngestBatchIdInput(e.target.value)}
              placeholder="e.g. B01"
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingIngestFiles([]);
                setIsIngestOriginModalOpen(false);
              }}
              className="h-8 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              data-testid="confirm-ingest-origin-btn"
              onClick={handleConfirmIngestionOrigin}
              className="h-8 text-xs gap-1.5 cursor-pointer font-semibold"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Start Vault Ingestion ({pendingIngestFiles.length})</span>
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Pillar 4: Export Configuration Step Modal */}
      <Dialog
        open={isExportConfigModalOpen}
        onClose={() => setIsExportConfigModalOpen(false)}
        title={`Export Configuration — ${AGENCY_DISPLAY_NAMES[activeAgency].full}`}
        size="md"
      >
        <div data-testid="tracker-export-config-modal" className="space-y-4">
          {/* Batch Summary */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-border bg-slate-50 dark:bg-secondary/40 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <div className="font-semibold text-foreground">
                Ready to Export: <span className="font-mono tabular-nums">{exportCandidates.length}</span> Asset(s)
              </div>
              <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
                {exportCandidates.filter((r) => (r.mediaType || 'image') === 'image').length} Photos ·{' '}
                {exportCandidates.filter((r) => r.mediaType === 'vector').length} Vectors ·{' '}
                {exportCandidates.filter((r) => r.mediaType === 'video').length} Videos
              </div>
            </div>
            <span className="px-2 py-1 rounded bg-primary/10 text-primary font-mono text-[11px] font-semibold">
              {AGENCY_DISPLAY_NAMES[activeAgency].short.toUpperCase()}
            </span>
          </div>

          {/* Agency-Specific Export Controls */}
          {activeAgency === 'freepik' && (
            <div className="space-y-3">
              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card cursor-pointer text-xs">
                <span className="font-medium text-foreground">Mark Batch as AI-Generated (Freepik)</span>
                <Checkbox
                  checked={freepikAiToggle}
                  onCheckedChange={(v) => setFreepikAiToggle(Boolean(v))}
                />
              </label>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">AI Model Name (Magnific / Freepik)</label>
                <Input
                  data-testid="export-opt-freepik-model"
                  value={freepikModelName}
                  onChange={(e) => setFreepikModelName(e.target.value)}
                  placeholder="Google Nano Banana, Midjourney v6, Flux.1..."
                  className="h-8 text-xs"
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {['Google Nano Banana', 'Midjourney v6', 'Flux.1', 'DALL-E 3'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFreepikModelName(preset)}
                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-secondary text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Uses <span className="font-mono">Short Title (&lt;100c)</span> and automatically splits compound tags into deduplicated single-word keywords (max 49).
              </p>
            </div>
          )}

          {activeAgency === 'vecteezy' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Vecteezy License Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['pro', 'free'] as const).map((lic) => (
                    <button
                      key={lic}
                      type="button"
                      data-testid={`export-opt-vecteezy-${lic}`}
                      onClick={() => setVecteezyLicense(lic)}
                      className={`h-8 rounded-lg border text-xs font-semibold uppercase cursor-pointer ${
                        vecteezyLicense === lic
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-slate-200 dark:border-border bg-white dark:bg-card text-muted-foreground'
                      }`}
                    >
                      {lic} License
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card cursor-pointer text-xs">
                <span className="font-medium text-foreground">Normalize Filenames for Web Uploader</span>
                <Checkbox
                  checked={vecteezyMatchUpload}
                  onCheckedChange={(v) => setVecteezyMatchUpload(Boolean(v))}
                />
              </label>
            </div>
          )}

          {activeAgency === 'shutterstock' && (
            <div className="space-y-2.5">
              {(
                [
                  { label: 'Editorial Content', val: shutterEditorial, set: setShutterEditorial },
                  { label: 'Mature Content', val: shutterMature, set: setShutterMature },
                  { label: 'Illustration Flag', val: shutterIllustration, set: setShutterIllustration },
                ] as const
              ).map((row) => (
                <label
                  key={row.label}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card cursor-pointer text-xs"
                >
                  <span className="font-medium text-foreground">{row.label}</span>
                  <Checkbox
                    checked={row.val === 'yes'}
                    onCheckedChange={(v) => row.set(v ? 'yes' : 'no')}
                  />
                </label>
              ))}
            </div>
          )}

          {activeAgency === 'dreamstime' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card cursor-pointer text-xs">
                  <span>W-EL (Web Extended)</span>
                  <Checkbox checked={dtWel} onCheckedChange={(v) => setDtWel(Boolean(v))} />
                </label>
                <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card cursor-pointer text-xs">
                  <span>P-EL (Print Extended)</span>
                  <Checkbox checked={dtPel} onCheckedChange={(v) => setDtPel(Boolean(v))} />
                </label>
                <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card cursor-pointer text-xs">
                  <span>Free Distribution</span>
                  <Checkbox checked={dtFree} onCheckedChange={(v) => setDtFree(Boolean(v))} />
                </label>
                <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card cursor-pointer text-xs">
                  <span>Editorial</span>
                  <Checkbox checked={dtEditorial} onCheckedChange={(v) => setDtEditorial(Boolean(v))} />
                </label>
              </div>
              <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card cursor-pointer text-xs">
                <span>AI-Generated Category 114 Override</span>
                <Checkbox checked={dtAiFlag} onCheckedChange={(v) => setDtAiFlag(Boolean(v))} />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Mixed media batches automatically generate both <span className="font-mono">_dreamstime_images.csv</span> (15 cols) and <span className="font-mono">_dreamstime_videos.csv</span> (13 cols) in one run.
              </p>
            </div>
          )}

          {activeAgency === '123rf' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Origin Country Code (ISO)</label>
              <Input
                data-testid="export-opt-123rf-country"
                value={rfCountryCode}
                onChange={(e) => setRfCountryCode(e.target.value)}
                placeholder="EG, US, GB, or none"
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {activeAgency === 'adobe' && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-primary" />
                <span>Adobe Stock 4-Column CRLF Schema</span>
              </div>
              <p className="text-[11px]">
                Exports <span className="font-mono">Long Title (&lt;=200c)</span>, top <span className="font-mono">49 ranked keywords</span>, and mapped Adobe Category ID (1–21).
              </p>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsExportConfigModalOpen(false)}
              className="h-8 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              data-testid="confirm-tracker-export-btn"
              onClick={handleConfirmConfiguredExport}
              className="h-8 text-xs gap-1.5 cursor-pointer font-semibold"
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>Generate CSV & Stage Basket</span>
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Clean Lightbox & Metadata Inspector Modal (Opened ONLY via the dedicated Eye button) */}
      <Dialog
        open={Boolean(inspectedAsset)}
        onClose={() => setInspectedAssetId(null)}
        title={inspectedAsset ? getCleanAssetDisplayTitle(inspectedAsset) : 'Asset Metadata'}
        size="lg"
      >
        {inspectedAsset && (
          <div data-testid="tracker-metadata-inspector-modal" className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left Preview Column */}
            <div className="md:col-span-5 space-y-2.5">
              <div className="aspect-[4/3] rounded-xl border border-slate-200 dark:border-border overflow-hidden bg-slate-100 dark:bg-secondary">
                {resolveAssetPreviewUrl(inspectedAsset) && (
                  <img
                    src={resolveAssetPreviewUrl(inspectedAsset)}
                    alt={getCleanAssetDisplayTitle(inspectedAsset)}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-secondary/40 border border-slate-200 dark:border-border space-y-1 text-[11px] font-mono text-muted-foreground">
                <div className="truncate" title={inspectedAsset.filename}>
                  File: {inspectedAsset.filename}
                </div>
                <div>
                  Vault Path: {inspectedAsset.masterPath || `/StockFlow/Master_Vault/${inspectedAsset.filename}`}
                </div>
              </div>
            </div>

            {/* Right Metadata Form (Short Title + Long Title + Description + Keywords) & 1-Click Copy Column */}
            <div className="md:col-span-7 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Short Title — Freepik & Vecteezy ({editShortTitle.length}/99)
                  </label>
                  <button
                    type="button"
                    onClick={() => copyField('modal_short_title', editShortTitle)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal_short_title' ? <Check className="w-3 h-3" /> : null}
                    <span>{copiedKey === 'modal_short_title' ? 'Copied!' : 'Copy Short Title'}</span>
                  </button>
                </div>
                <Input
                  value={editShortTitle}
                  onChange={(e) => setEditShortTitle(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Long Title — Adobe, Shutterstock, Dreamstime, 123RF ({editLongTitle.length}/200)
                  </label>
                  <button
                    type="button"
                    onClick={() => copyField('modal_title', editLongTitle)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal_title' ? <Check className="w-3 h-3" /> : null}
                    <span>{copiedKey === 'modal_title' ? 'Copied!' : 'Copy Long Title'}</span>
                  </button>
                </div>
                <Input
                  value={editLongTitle}
                  onChange={(e) => setEditLongTitle(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Description</label>
                  <button
                    type="button"
                    onClick={() => copyField('modal_desc', editDesc)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal_desc' ? <Check className="w-3 h-3" /> : null}
                    <span>{copiedKey === 'modal_desc' ? 'Copied!' : 'Copy Description'}</span>
                  </button>
                </div>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Keywords ({editKeywords.split(',').filter((k) => k.trim()).length})
                  </label>
                  <button
                    type="button"
                    onClick={() => copyField('modal_kw', editKeywords)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal_kw' ? <Check className="w-3 h-3" /> : null}
                    <span>{copiedKey === 'modal_kw' ? 'Copied!' : 'Copy All Keywords'}</span>
                  </button>
                </div>
                <textarea
                  value={editKeywords}
                  onChange={(e) => setEditKeywords(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background p-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInspectedAssetId(null)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleSaveInspectedMetadata}
                  className="h-8 text-xs gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Modals for Rejection Logging, Export Basket Reconciliation & Bulk SEO Surgery */}
      <RejectionReasonModal
        open={rejectionModalState.open}
        agencyId={rejectionModalState.agencyId}
        assetCount={rejectionModalState.assetIds.length}
        onClose={() =>
          setRejectionModalState((prev) => ({ ...prev, open: false, assetIds: [] }))
        }
        onConfirmRejection={async ({ rejectionReasonId, customRejectionNote }) => {
          const targets = rejectionModalState.allAgencies
            ? AGENCIES
            : [rejectionModalState.agencyId];
          for (const ag of targets) {
            await db.tracker.reconcileAgencyStatuses({
              assetIds: rejectionModalState.assetIds,
              agencyId: ag,
              targetStatus: 'Rejected',
              rejectionReasonId,
              customRejectionNote,
            });
          }
          setRejectionModalState((prev) => ({ ...prev, open: false, assetIds: [] }));
        }}
      />

      <ExportBasketReconcileModal
        open={isBasketsModalOpen}
        onClose={() => setIsBasketsModalOpen(false)}
        baskets={exportBaskets}
        masterRecords={masterRecords}
        activeAgency={activeAgency}
        onSplitReconcile={async ({ agencyId, revertToNewIds, markUploadedIds }) => {
          if (revertToNewIds.length > 0) {
            await db.tracker.reconcileAgencyStatuses({
              assetIds: revertToNewIds,
              agencyId,
              targetStatus: 'New',
            });
          }
          if (markUploadedIds.length > 0) {
            await db.tracker.reconcileAgencyStatuses({
              assetIds: markUploadedIds,
              agencyId,
              targetStatus: 'Uploaded',
            });
          }
          setIsBasketsModalOpen(false);
          setActionBanner({
            type: 'success',
            message: `Reconciled ${AGENCY_DISPLAY_NAMES[agencyId].full}: ${markUploadedIds.length} marked Uploaded, ${revertToNewIds.length} reverted to New.`,
          });
        }}
      />

      <BulkMetadataSurgeryModal
        open={isBulkSeoModalOpen}
        onClose={() => setIsBulkSeoModalOpen(false)}
        targetRecords={
          selectedIds.size > 0 ? selectedRecordsAcrossVault : filteredRecords
        }
        activeAgency={activeAgency}
        onCompleted={(summaryMessage) => {
          setIsBulkSeoModalOpen(false);
          setActionBanner({
            type: 'success',
            message: summaryMessage,
          });
        }}
      />
    </div>
  );
};
