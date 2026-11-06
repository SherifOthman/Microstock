import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  MasterMetadataRecord,
  SupportedPlatform,
  TrackerAgencyStatus,
  MediaType,
} from '../../types';
import { db, useSqliteQuery, DEFAULT_PLATFORM_LIMITS } from '../../db';
import { generatePlatformCsv } from '../../services/export/csvExporter';
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
  FileText,
  Tag,
  Type,
  Scissors,
  Columns,
  Focus,
  Filter,
  MoreHorizontal,
  LayoutGrid,
  List,
  Plus,
  Trash2,
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
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25';
    case 'Uploaded':
    case 'In Review':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25';
    case 'Pending Upload':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25';
    case 'Rejected':
      return 'bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/25';
    case 'New':
    default:
      return 'bg-secondary text-foreground border-border hover:bg-secondary/80';
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
  onFixAndRequeue,
}) => {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const parentScrollRef = useRef<HTMLDivElement | null>(null);

  // Reactive SQLite queries (scoped strictly to 'master' and 'settings' changes)
  const masterRecords = useSqliteQuery(() => db.masterRecords.toArray(), [], [], ['master']) || [];
  const trackerStats = useSqliteQuery(() => db.tracker.getStats(), [masterRecords.length], undefined, ['master']);
  const workspacePaths = useSqliteQuery(() => db.tracker.getWorkspacePaths(), [], undefined, ['settings']);
  const exportBaskets = useSqliteQuery(() => db.tracker.getExportBaskets(), [masterRecords.length], [], ['master']) || [];

  // View Mode: Visual Gallery Grid (default) vs Clean Compact List
  const [viewMode, setViewMode] = useState<'gallery' | 'list'>('gallery');

  // Auto-disappearing Ingestion Progress Bar state
  const [ingestionItems, setIngestionItems] = useState<IngestionQueueItem[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);

  // Filter, Batch Grouping, Focus Mode & Selection State
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

  // Modals & Copy Feedback State
  const [isBasketsModalOpen, setIsBasketsModalOpen] = useState(false);
  const [isBulkSeoModalOpen, setIsBulkSeoModalOpen] = useState(false);
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Editable state inside Metadata Inspector Modal
  const [editTitle, setEditTitle] = useState('');
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
        const matchKw = (rec.rankedKeywords || []).some((k) => k.toLowerCase().includes(q));
        if (!matchFile && !matchTitle && !matchKw) return false;
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
      setEditTitle(inspectedAsset.baseTitle || getCleanAssetDisplayTitle(inspectedAsset));
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
    await db.masterRecords.update(inspectedAsset.id, {
      baseTitle: editTitle.trim(),
      detailedDescription: editDesc.trim(),
      rankedKeywords: cleanedKeywords,
      updatedAt: Date.now(),
    });
    setInspectedAssetId(null);
    setActionBanner({
      type: 'success',
      message: `Saved metadata updates for "${editTitle.trim()}".`,
    });
  };

  // Granular 1-Click Copy Helpers (Title, Description, Keywords)
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

  // Selection with Shift+Click range & Ctrl/Cmd+Click multi-select
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
    if (selectedIds.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
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

  // Export Basket for Active Agency (New assets or selected assets)
  const handleExportActiveAgencyBasket = async () => {
    const candidates =
      selectedIds.size > 0
        ? filteredRecords.filter((r) => selectedIds.has(r.id))
        : filteredRecords.filter((r) => (r.agencyTrackings?.[activeAgency]?.status || 'New') === 'New');

    if (candidates.length === 0) {
      setActionBanner({
        type: 'warning',
        message: `No "New" or selected assets available to export for ${AGENCY_DISPLAY_NAMES[activeAgency].full}.`,
      });
      return;
    }

    const limit = DEFAULT_PLATFORM_LIMITS[activeAgency]?.defaultBatchLimit || 50;
    const batchSlice = candidates.slice(0, limit);
    const csvOut = generatePlatformCsv(activeAgency, batchSlice);

    const basket = await db.tracker.createExportBasket({
      agencyId: activeAgency,
      basketName: `${activeAgency}_batch_${new Date().toISOString().slice(0, 10)}`,
      assetIds: batchSlice.map((r) => r.id),
      csvFilename: csvOut.filename,
      csvContent: csvOut.csvString,
    });

    triggerBrowserCsvDownload(csvOut.filename, csvOut.csvString);

    setActionBanner({
      type: 'success',
      message: `Exported ${batchSlice.length} assets to ${AGENCY_DISPLAY_NAMES[activeAgency].full} CSV & staged in Pending Upload Basket.`,
      folderPath: basket.stagingFolderPath,
    });
  };

  // Auto-trim keywords for active agency cap
  const handleAutoTrimForActiveAgency = async () => {
    const targets =
      selectedIds.size > 0
        ? filteredRecords.filter((r) => selectedIds.has(r.id))
        : filteredRecords;
    const res = await autoTrimKeywordsForAgency(targets, activeAgency);
    setActionBanner({
      type: 'success',
      message: `Trimmed ${res.updatedCount} assets to ${AGENCY_DISPLAY_NAMES[activeAgency].short}'s ${res.cap}-keyword limit.`,
    });
  };

  // Ingestion progress metrics (only visible while isIngesting === true)
  const ingestionPercent = useMemo(() => {
    if (!isIngesting || ingestionItems.length === 0) return 0;
    const done = ingestionItems.filter(
      (i) => i.stage === 'committed' || i.stage === 'duplicate_skipped' || i.stage === 'failed'
    ).length;
    return Math.round((done / ingestionItems.length) * 100);
  }, [isIngesting, ingestionItems]);

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
    <div className="flex-1 min-h-0 h-full flex flex-col gap-2.5 overflow-hidden select-none">
      {/* Hidden File/Folder Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.eps,.ai,.mp4,.mov"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            atomicIngestionService.enqueueFiles(Array.from(e.target.files));
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
            atomicIngestionService.enqueueFiles(Array.from(e.target.files));
            e.currentTarget.value = '';
          }
        }}
      />

      {/* Auto-Disappearing Slim Ingestion Progress Bar (ONLY visible during active import) */}
      {isIngesting && (
        <div
          data-testid="slim-ingestion-progress"
          className="shrink-0 px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-foreground shrink-0">
            <UploadCloud className="w-4 h-4 text-primary animate-bounce" />
            <span>
              Importing into Master Vault ({ingestionPercent}%)
            </span>
          </div>
          <Progress value={ingestionPercent} className="h-2 flex-1 max-w-md" />
        </div>
      )}

      {/* Single Flattened Command & Agency Bar */}
      <div className="shrink-0 px-3 py-2 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-2">
        {/* Left Zone: Search + 6-Agency Focus Switcher */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {/* Search Input */}
          <div className="relative w-48 sm:w-56">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'ar' ? 'بحث في العناوين...' : 'Search clean titles or tags...'}
              className="h-8 pl-8 pr-2.5 text-xs"
            />
          </div>

          {/* 6-Agency Switcher Bar */}
          <div
            dir="ltr"
            className="inline-flex items-center rounded-lg bg-secondary/70 p-0.5 border border-border"
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
                      ? 'bg-card text-foreground shadow-2xs font-semibold'
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
            <DropdownMenuContent align="start" className="w-64 p-2 space-y-2">
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
                MEDIA & SHOOT BATCH
              </DropdownMenuLabel>
              <div className="flex flex-wrap gap-1 px-1">
                {(['ALL', 'image', 'vector', 'video'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMediaFilter(m)}
                    className={`px-2 py-1 rounded text-xs cursor-pointer ${
                      mediaFilter === m
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m === 'ALL' ? 'All Media' : m === 'image' ? 'Photos' : m === 'vector' ? 'Vectors' : 'Videos'}
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

        {/* Right Zone: View Toggle (Gallery vs List) + Open Master Folder + Primary Export + (...) More */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Gallery Grid vs Compact List Toggle */}
          <div
            dir="ltr"
            className="inline-flex items-center rounded-lg bg-secondary p-0.5 border border-border"
          >
            <button
              type="button"
              data-testid="view-mode-gallery-btn"
              onClick={() => setViewMode('gallery')}
              title="Visual Photo Gallery Grid"
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'gallery'
                  ? 'bg-card text-foreground shadow-2xs font-semibold'
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
                  ? 'bg-card text-foreground shadow-2xs font-semibold'
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
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>

          {/* Primary CTA: Export Active Agency CSV & Basket */}
          <Button
            type="button"
            variant="default"
            size="sm"
            data-testid="export-active-agency-btn"
            onClick={handleExportActiveAgencyBasket}
            className="h-8 text-xs gap-1.5 cursor-pointer font-semibold"
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>
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
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-[11px] font-mono text-muted-foreground">
                CONTRIBUTOR TOOLS
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setIsBasketsModalOpen(true)}
                className="text-xs gap-2 cursor-pointer"
              >
                <PackageCheck className="w-3.5 h-3.5 text-amber-400" />
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
                <Scissors className="w-3.5 h-3.5 text-emerald-400" />
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
                  db.masterRecords.clear();
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

      {/* Contextual Bulk Selection Bar (Only shown when items are selected or Pending Upload basket notice) */}
      {(selectedIds.size > 0 || pendingBasketsForAgency.length > 0 || actionBanner) && (
        <div className="shrink-0 px-3 py-1.5 rounded-xl border border-border bg-card/90 flex flex-wrap items-center justify-between gap-2 text-xs">
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground font-mono tabular-nums">
                {selectedIds.size} Selected
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
              <span className="text-xs text-amber-400 font-medium">
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
        className="flex-1 min-h-0 rounded-xl border border-border bg-card overflow-y-auto"
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
           * MODE 1: VISUAL GALLERY GRID (Default — Lightroom-Style Photo Cards)
           * Strictly displays: Large Thumbnail + Clean Title + Single Active Agency Status
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
                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      handleToggleItemSelect(rec.id, idx, e);
                    }
                  }}
                  className={`group rounded-xl border bg-background/60 overflow-hidden flex flex-col justify-between transition-all ${
                    isSelected
                      ? 'border-primary ring-1 ring-primary/40'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  {/* Large 4:3 Visual Thumbnail Frame */}
                  <div className="relative aspect-[4/3] w-full bg-secondary overflow-hidden">
                    {rec.thumbnailBase64 ? (
                      <img
                        src={rec.thumbnailBase64}
                        alt={cleanTitle}
                        referrerPolicy="no-referrer"
                        onClick={() => setInspectedAssetId(rec.id)}
                        className="w-full h-full object-cover cursor-pointer group-hover:scale-[1.02] transition-transform duration-200"
                      />
                    ) : (
                      <div
                        onClick={() => setInspectedAssetId(rec.id)}
                        className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground cursor-pointer"
                      >
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

                    {/* Top-Right Metadata Inspector Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectedAssetId(rec.id);
                      }}
                      title="Inspect & Edit Metadata"
                      className="absolute top-2.5 right-2.5 h-6 px-2 rounded-md bg-black/65 hover:bg-black/85 backdrop-blur-xs border border-white/20 text-white text-[10px] font-medium flex items-center gap-1 opacity-85 group-hover:opacity-100 transition cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Metadata</span>
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

                  {/* Clean Card Body: Human Title + Single Active Agency Status + Granular Copy */}
                  <div className="p-3 space-y-2.5">
                    <div className="space-y-0.5">
                      <h3
                        onClick={() => setInspectedAssetId(rec.id)}
                        title={cleanTitle}
                        className="text-xs font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                      >
                        {cleanTitle}
                      </h3>

                      {isRejected && agencyTracking?.rejectionReasonTitle && (
                        <p
                          title={agencyTracking.customRejectionNote || agencyTracking.rejectionReasonTitle}
                          className="text-[11px] text-destructive font-medium truncate"
                        >
                          {agencyTracking.rejectionReasonTitle}
                        </p>
                      )}
                    </div>

                    {/* Single Active Agency Status Selector + Fix & Re-Queue Button */}
                    <div className="flex items-center justify-between gap-1.5">
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
                        <DropdownMenuContent align="start" className="w-44">
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

                      {isRejected && onFixAndRequeue && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            onFixAndRequeue({
                              assetId: rec.id,
                              filename: rec.filename,
                              agencyId: activeAgency,
                              agencyName: AGENCY_DISPLAY_NAMES[activeAgency].full,
                              rejectionReasonTitle:
                                agencyTracking?.rejectionReasonTitle || 'Technical Quality / Artifacts',
                              customRejectionNote: agencyTracking?.customRejectionNote,
                            })
                          }
                          className="h-7 px-2 text-[11px] font-semibold cursor-pointer shrink-0"
                        >
                          Fix
                        </Button>
                      )}
                    </div>

                    {/* Compact Granular 1-Click Copy Row (Title · Desc · Keywords) */}
                    <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-mono text-[10px]">
                        {(rec.rankedKeywords || []).length} tags
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copyField(`${rec.id}_title`, rec.baseTitle || cleanTitle)}
                          title="Copy Title"
                          className="px-1.5 py-0.5 rounded hover:bg-secondary hover:text-foreground transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `${rec.id}_title` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Type className="w-3 h-3" />
                          )}
                          <span className="text-[10px]">Title</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            copyField(
                              `${rec.id}_desc`,
                              rec.detailedDescription || rec.baseTitle || cleanTitle
                            )
                          }
                          title="Copy Description"
                          className="px-1.5 py-0.5 rounded hover:bg-secondary hover:text-foreground transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `${rec.id}_desc` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <FileText className="w-3 h-3" />
                          )}
                          <span className="text-[10px]">Desc</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            copyField(`${rec.id}_kw`, (rec.rankedKeywords || []).join(', '))
                          }
                          title="Copy Keywords"
                          className="px-1.5 py-0.5 rounded hover:bg-secondary hover:text-foreground transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `${rec.id}_kw` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Tag className="w-3 h-3" />
                          )}
                          <span className="text-[10px]">Tags</span>
                        </button>
                      </div>
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
            <div className="sticky top-0 z-20 h-9 px-3 bg-card border-b border-border flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
              <div className="w-6 flex items-center justify-center shrink-0">
                <Checkbox
                  checked={
                    filteredRecords.length > 0 && selectedIds.size === filteredRecords.length
                  }
                  onCheckedChange={handleToggleSelectAll}
                />
              </div>
              <div className="flex-1 min-w-[200px]">ASSET TITLE</div>
              <div className="w-36 shrink-0">1-CLICK COPY</div>
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
                const activeTrack = rec.agencyTrackings?.[activeAgency];
                const activeSt: TrackerAgencyStatus = activeTrack?.status || 'New';

                return (
                  <div
                    key={rec.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`px-3 border-b border-border/60 flex items-center gap-3 text-xs transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-secondary/40'
                    }`}
                  >
                    <div
                      onClick={(e) => handleToggleItemSelect(rec.id, virtualRow.index, e)}
                      className="w-6 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                    </div>

                    {/* Thumbnail + Clean Title */}
                    <div
                      onClick={() => setInspectedAssetId(rec.id)}
                      className="flex-1 min-w-[200px] flex items-center gap-2.5 cursor-pointer truncate"
                    >
                      {rec.thumbnailBase64 ? (
                        <img
                          src={rec.thumbnailBase64}
                          alt={cleanTitle}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded bg-secondary flex items-center justify-center shrink-0">
                          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-medium text-foreground truncate hover:text-primary">
                        {cleanTitle}
                      </span>
                    </div>

                    {/* Granular 1-Click Copy Buttons */}
                    <div className="w-36 shrink-0 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyField(`${rec.id}_t`, rec.baseTitle || cleanTitle)}
                        title="Copy Title"
                        className="h-6 px-1.5 rounded bg-secondary/60 hover:bg-secondary text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === `${rec.id}_t` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Type className="w-3 h-3" />
                        )}
                        <span>T</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          copyField(
                            `${rec.id}_d`,
                            rec.detailedDescription || rec.baseTitle || cleanTitle
                          )
                        }
                        title="Copy Description"
                        className="h-6 px-1.5 rounded bg-secondary/60 hover:bg-secondary text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === `${rec.id}_d` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        <span>D</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          copyField(`${rec.id}_k`, (rec.rankedKeywords || []).join(', '))
                        }
                        title="Copy Keywords"
                        className="h-6 px-1.5 rounded bg-secondary/60 hover:bg-secondary text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === `${rec.id}_k` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Tag className="w-3 h-3" />
                        )}
                        <span>K</span>
                      </button>
                    </div>

                    {/* Status Column(s) */}
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
                          <DropdownMenuContent align="end" className="w-40">
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

                        {activeSt === 'Rejected' && onFixAndRequeue && (
                          <button
                            type="button"
                            onClick={() =>
                              onFixAndRequeue({
                                assetId: rec.id,
                                filename: rec.filename,
                                agencyId: activeAgency,
                                agencyName: AGENCY_DISPLAY_NAMES[activeAgency].full,
                                rejectionReasonTitle:
                                  activeTrack?.rejectionReasonTitle || 'Technical Quality / Artifacts',
                                customRejectionNote: activeTrack?.customRejectionNote,
                              })
                            }
                            className="h-6 px-2 rounded bg-destructive text-destructive-foreground text-[10px] font-semibold cursor-pointer"
                          >
                            Fix
                          </button>
                        )}
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
                              <DropdownMenuContent align="end" className="w-36">
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
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Clean Lightbox & Metadata Inspector Modal (Opened when clicking any image or Metadata button) */}
      <Dialog
        open={Boolean(inspectedAsset)}
        onClose={() => setInspectedAssetId(null)}
        title={inspectedAsset ? getCleanAssetDisplayTitle(inspectedAsset) : 'Asset Metadata'}
        size="lg"
      >
        {inspectedAsset && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left Preview Column */}
            <div className="md:col-span-5 space-y-2.5">
              <div className="aspect-[4/3] rounded-xl border border-border overflow-hidden bg-secondary">
                {inspectedAsset.thumbnailBase64 && (
                  <img
                    src={inspectedAsset.thumbnailBase64}
                    alt={getCleanAssetDisplayTitle(inspectedAsset)}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-2.5 rounded-lg bg-secondary/40 border border-border space-y-1 text-[11px] font-mono text-muted-foreground">
                <div className="truncate" title={inspectedAsset.filename}>
                  File: {inspectedAsset.filename}
                </div>
                <div>
                  Vault Path: {inspectedAsset.masterPath || `/StockFlow/Master_Vault/${inspectedAsset.filename}`}
                </div>
              </div>
            </div>

            {/* Right Metadata Form & 1-Click Copy Column */}
            <div className="md:col-span-7 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Title</label>
                  <button
                    type="button"
                    onClick={() => copyField('modal_title', editTitle)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal_title' ? <Check className="w-3 h-3" /> : null}
                    <span>{copiedKey === 'modal_title' ? 'Copied!' : 'Copy Title'}</span>
                  </button>
                </div>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
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
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
          selectedIds.size > 0
            ? filteredRecords.filter((r) => selectedIds.has(r.id))
            : filteredRecords
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
