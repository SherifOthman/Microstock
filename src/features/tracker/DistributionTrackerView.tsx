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
import { RejectionReasonModal } from './RejectionReasonModal';
import { ExportBasketReconcileModal } from './ExportBasketReconcileModal';
import { BulkMetadataSurgeryModal } from './BulkMetadataSurgeryModal';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Tooltip } from '../../components/ui/tooltip';
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
  Database,
  FolderPlus,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  RotateCcw,
  Search,
  HardDrive,
  FolderOpen,
  XCircle,
  PackageCheck,
  ShieldCheck,
  Film,
  PenTool,
  Image as ImageIcon,
  ArrowUpRight,
  Sparkles,
  Copy,
  Check,
  Archive,
  Eye,
  Layers,
  Wrench,
  FileText,
  Tag,
  Type,
  Scissors,
  Columns,
  Focus,
  Filter,
  MoreHorizontal,
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

  // Reactive SQLite queries
  const masterRecords = useSqliteQuery(() => db.masterRecords.toArray(), [], []) || [];
  const trackerStats = useSqliteQuery(() => db.tracker.getStats(), [masterRecords.length], undefined);
  const workspacePaths = useSqliteQuery(() => db.tracker.getWorkspacePaths(), [], undefined);
  const exportBaskets = useSqliteQuery(() => db.tracker.getExportBaskets(), [masterRecords.length], []) || [];

  // Live Atomic Ingestion Pipeline state
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
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);

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

  // Modals & Copy Feedback State
  const [isBasketsModalOpen, setIsBasketsModalOpen] = useState(false);
  const [isBulkSeoModalOpen, setIsBulkSeoModalOpen] = useState(false);
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialFocusAgency) {
      setActiveAgency(initialFocusAgency);
    }
  }, [initialFocusAgency]);

  // Rejection Modal State
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

  // Feedback banner
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

  // Smart Batch / Shoot Groups extracted from masterRecords
  const batchGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rec of masterRecords) {
      const b = resolveAssetBatchGroup(rec);
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [masterRecords]);

  // Pre-compute 6-Agency Pre-Flight Warnings for the active agency
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

  const activeAgencyWarningCount = preflightByAssetId.size;
  const activeAgencyCap = AGENCY_KEYWORD_CAPS[activeAgency] || 50;
  const overKeywordCapRecords = useMemo(
    () => masterRecords.filter((r) => (r.rankedKeywords || []).length > activeAgencyCap),
    [masterRecords, activeAgencyCap]
  );

  // Filtered records for the Virtualized Grid
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return masterRecords.filter((rec) => {
      if (mediaFilter !== 'ALL' && (rec.mediaType || 'image') !== mediaFilter) {
        return false;
      }
      if (originFilter !== 'ALL') {
        const isAi = Boolean(rec.isAiGenerated);
        if (originFilter === 'AI' && !isAi) return false;
        if (originFilter === 'REAL' && isAi) return false;
      }
      if (batchFilter !== 'ALL') {
        if (batchFilter === 'TODAY') {
          if ((rec.createdAt || 0) < oneDayAgo) return false;
        } else if (resolveAssetBatchGroup(rec) !== batchFilter) {
          return false;
        }
      }
      if (statusFilter !== 'ALL') {
        const agencySt = rec.agencyTrackings?.[activeAgency]?.status || 'New';
        if (agencySt !== statusFilter) return false;
      }
      if (onlyWarningsFilter && !preflightByAssetId.has(rec.id)) {
        return false;
      }
      if (q) {
        const inName = rec.filename.toLowerCase().includes(q);
        const inTitle = (rec.baseTitle || '').toLowerCase().includes(q);
        const inDesc = (rec.detailedDescription || '').toLowerCase().includes(q);
        const inHash = (rec.fileHash || '').toLowerCase().includes(q);
        const inTags = (rec.rankedKeywords || []).some((k) => k.toLowerCase().includes(q));
        if (!inName && !inTitle && !inDesc && !inHash && !inTags) return false;
      }
      return true;
    });
  }, [
    masterRecords,
    mediaFilter,
    originFilter,
    batchFilter,
    statusFilter,
    onlyWarningsFilter,
    preflightByAssetId,
    activeAgency,
    searchQuery,
  ]);

  const inspectedAsset = useMemo(
    () => masterRecords.find((r) => r.id === inspectedAssetId) || null,
    [masterRecords, inspectedAssetId]
  );

  // Target records for Bulk SEO Surgery (selected rows if any, otherwise filtered rows)
  const surgeryTargetRecords = useMemo(() => {
    if (selectedIds.size > 0) {
      return masterRecords.filter((r) => selectedIds.has(r.id));
    }
    return filteredRecords;
  }, [masterRecords, filteredRecords, selectedIds]);

  // Virtualizer for 60fps scrolling on 50,000+ rows
  const rowVirtualizer = useVirtualizer({
    count: filteredRecords.length,
    getScrollElement: () => parentScrollRef.current,
    estimateSize: () => 82,
    overscan: 12,
  });

  // Native Shift+Click (Range Select) and Ctrl/Meta+Click (Multi-Toggle Select)
  const handleToggleSelectRow = (id: string, index: number, shiftKey = false) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIdx !== null && filteredRecords.length > 0) {
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

  const handleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleAutoSelectNextAgencyBatch = () => {
    const limit = DEFAULT_PLATFORM_LIMITS[activeAgency]?.defaultBatchLimit || 50;
    const eligible = filteredRecords
      .filter((r) => {
        const st = r.agencyTrackings?.[activeAgency]?.status || 'New';
        if (st !== 'New') return false;
        if (activeAgency === 'freepik' && r.mediaType === 'video') return false;
        return true;
      })
      .slice(0, limit);

    setSelectedIds(new Set(eligible.map((r) => r.id)));
    setActionBanner({
      type: 'success',
      message:
        language === 'ar'
          ? `تم تحديد ${eligible.length} ملف جاهز للتصدير إلى ${AGENCY_DISPLAY_NAMES[activeAgency].full}`
          : `Selected ${eligible.length} 'New' assets ready for ${AGENCY_DISPLAY_NAMES[activeAgency].full} export (batch limit: ${limit}).`,
    });
  };

  const handleSelectByStatusForActiveAgency = (targetSt: TrackerAgencyStatus) => {
    const matching = masterRecords.filter(
      (r) => (r.agencyTrackings?.[activeAgency]?.status || 'New') === targetSt
    );
    setStatusFilter(targetSt);
    setSelectedIds(new Set(matching.map((r) => r.id)));
  };

  const handleQuickAutoTrimKeywords = async () => {
    const targetPool =
      selectedIds.size > 0
        ? masterRecords.filter((r) => selectedIds.has(r.id))
        : overKeywordCapRecords;
    const res = await autoTrimKeywordsForAgency(targetPool, activeAgency);
    setActionBanner({
      type: 'success',
      message: `Auto-trimmed ${res.updatedCount} asset(s) to ${AGENCY_DISPLAY_NAMES[activeAgency].full} maximum keyword cap (${res.cap} tags).`,
    });
  };

  // Sample Demo Batch Seeder (Seeds across B01 and B02 batches with realistic Pre-Flight edge cases)
  const handleLoadSampleBatch = async () => {
    const batch1Definitions = [
      {
        name: 'B01-AI-PH-001_Golden_Hour_Solar_Panels.jpg',
        mime: 'image/jpeg',
        payload: `sample-solar-panel-001-${Date.now()}`,
      },
      {
        name: 'B01-AI-PH-002_Minimalist_Nordic_Office_Desk.jpg',
        mime: 'image/jpeg',
        payload: `sample-nordic-office-002-${Date.now()}`,
      },
      {
        name: 'B01-AI-PH-005_Luxury_Marble_Cosmetic_Podium.jpg',
        mime: 'image/jpeg',
        payload: `sample-marble-podium-005-${Date.now()}`,
      },
    ];

    const batch2Definitions = [
      {
        name: 'B02-AI-VC-003_Geometric_Abstract_Brand_Icons.svg',
        mime: 'image/svg+xml',
        payload: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#1e293b"/><circle cx="100" cy="100" r="60" fill="#38bdf8"/></svg><!--${Date.now()}-->`,
      },
      {
        name: 'B02-AI-VD-004_Aerial_Mountain_Highway_Drone.mp4',
        mime: 'video/mp4',
        payload: `sample-aerial-drone-video-004-${Date.now()}`,
      },
      {
        name: 'B02-AI-VC-006_Isometric_Cloud_Security_Infographic.eps',
        mime: 'application/postscript',
        payload: `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 500 500\n% sample-cloud-vector-006-${Date.now()}`,
      },
    ];

    const filesB01 = batch1Definitions.map(
      (d) => new File([d.payload], d.name, { type: d.mime })
    );
    const filesB02 = batch2Definitions.map(
      (d) => new File([d.payload], d.name, { type: d.mime })
    );

    const res1 = await atomicIngestionService.enqueueFiles(filesB01, {
      isAiGenerated: true,
      useAiMetadata: false,
      batchId: 'B01',
    });
    const res2 = await atomicIngestionService.enqueueFiles(filesB02, {
      isAiGenerated: true,
      useAiMetadata: false,
      batchId: 'B02',
    });

    // Enrich 2 sample records so contributors can immediately test Pre-Flight Warnings & 1-Click Auto-Trim
    const allRecs = await db.masterRecords.toArray();
    const solarRec = allRecs.find((r) => r.filename.includes('Golden_Hour_Solar_Panels'));
    if (solarRec) {
      const fiftyThreeTags = Array.from({ length: 53 }, (_, idx) =>
        idx < (solarRec.rankedKeywords || []).length
          ? solarRec.rankedKeywords[idx]
          : `renewable_tag_${idx + 1}`
      );
      await db.masterRecords.update(solarRec.id, {
        rankedKeywords: fiftyThreeTags,
      });
    }

    const nordicRec = allRecs.find((r) => r.filename.includes('Minimalist_Nordic_Office_Desk'));
    if (nordicRec) {
      await db.masterRecords.update(nordicRec.id, {
        baseTitle:
          'Minimalist Nordic Home Office Wooden Desk With Ergonomic Chair Natural Window Daylight Scandinavian Interior Architecture Commercial Workspace Studio Photography High Resolution Background Banner For Corporate Presentations',
      });
    }

    const totalCommitted = res1.committedCount + res2.committedCount;
    setActionBanner({
      type: 'success',
      message:
        language === 'ar'
          ? `تم استيراد ${totalCommitted} ملفات تجريبية عبر دفعتين (B01 و B02) إلى Master Vault بنجاح.`
          : `Ingested ${totalCommitted} sample assets across Batches B01 & B02 with SHA-256 verification and 6-agency Pre-Flight checks.`,
    });
  };

  // Export Basket Creation -> Marks as 'Pending Upload' + Downloads CSV
  const handleCreateExportBasket = async () => {
    const targetRecords = masterRecords.filter((r) => selectedIds.has(r.id));
    if (targetRecords.length === 0) return;

    const batchStamp = `${activeAgency}_${new Date().toISOString().slice(0, 10)}`;
    const csvResult = generatePlatformCsv(activeAgency, targetRecords, batchStamp);

    if (csvResult.isBlocked) {
      setActionBanner({
        type: 'error',
        message: csvResult.blockedReason || 'Export blocked for selected agency.',
      });
      return;
    }

    const basket = await db.tracker.createExportBasket({
      agencyId: activeAgency,
      basketName: batchStamp,
      assetIds: targetRecords.map((r) => r.id),
      csvFilename: csvResult.filename,
      csvContent: csvResult.csvString,
      additionalCsvs: csvResult.additionalResults?.map((ar) => ({
        filename: ar.filename,
        csvString: ar.csvString,
      })),
    });

    if (csvResult.csvString) {
      triggerBrowserCsvDownload(csvResult.filename, csvResult.csvString);
    }

    setActionBanner({
      type: 'warning',
      message:
        language === 'ar'
          ? `تم إنشاء سلة التصدير (${basket.itemCount} ملف) وتحميل CSV وتحديث الحالة إلى Pending Upload.`
          : `Export Basket staged (${basket.itemCount} files + ${csvResult.filename}). Status set to Pending Upload awaiting portal confirmation.`,
      folderPath: basket.stagingFolderPath,
    });
  };

  // Reconciliation Actions (Supports Single Agency OR All 6 Agencies)
  const handleBulkReconcileStatus = async (
    targetStatus: TrackerAgencyStatus,
    overrideAssetIds?: string[],
    overrideAgencyId?: SupportedPlatform,
    forceAllAgencies?: boolean
  ) => {
    const useAll = forceAllAgencies ?? (overrideAgencyId ? false : applyToAllAgencies);
    const targetAgency = overrideAgencyId || activeAgency;
    const ids = overrideAssetIds || Array.from(selectedIds);
    if (ids.length === 0) return;

    if (targetStatus === 'Rejected') {
      setRejectionModalState({
        open: true,
        agencyId: targetAgency,
        assetIds: ids,
        allAgencies: useAll,
      });
      return;
    }

    if (useAll) {
      for (const ag of AGENCIES) {
        await db.tracker.reconcileAgencyStatuses({
          assetIds: ids,
          agencyId: ag,
          targetStatus,
        });
      }
      setActionBanner({
        type: 'success',
        message:
          language === 'ar'
            ? `تم تحديث حالة ${ids.length} ملف عبر جميع المنصات الست إلى ${targetStatus}`
            : `Updated ${ids.length} ${ids.length === 1 ? 'asset' : 'assets'} across ALL 6 agencies → ${targetStatus}.`,
      });
    } else {
      await db.tracker.reconcileAgencyStatuses({
        assetIds: ids,
        agencyId: targetAgency,
        targetStatus,
      });
      setActionBanner({
        type: 'success',
        message:
          language === 'ar'
            ? `تم تحديث حالة ${ids.length} ملف في ${AGENCY_DISPLAY_NAMES[targetAgency].full} إلى ${targetStatus}`
            : `Updated ${ids.length} ${ids.length === 1 ? 'asset' : 'assets'} on ${AGENCY_DISPLAY_NAMES[targetAgency].full} → ${targetStatus}.`,
      });
    }
  };

  const handleConfirmRejection = async (payload: {
    rejectionReasonId?: string;
    customRejectionNote?: string;
  }) => {
    const { agencyId, assetIds, allAgencies } = rejectionModalState;
    const targetAgencies = allAgencies ? AGENCIES : [agencyId];

    for (const ag of targetAgencies) {
      await db.tracker.reconcileAgencyStatuses({
        assetIds,
        agencyId: ag,
        targetStatus: 'Rejected',
        rejectionReasonId: payload.rejectionReasonId || null,
        customRejectionNote: payload.customRejectionNote || null,
      });
    }

    setActionBanner({
      type: 'error',
      message:
        language === 'ar'
          ? `تم تسجيل رفض ${assetIds.length} ملف في ${AGENCY_DISPLAY_NAMES[agencyId].full} وحفظ النسخة الاحتياطية.`
          : `Logged ${assetIds.length} Rejected ${assetIds.length === 1 ? 'asset' : 'assets'} on ${
              allAgencies ? 'All 6 Agencies' : AGENCY_DISPLAY_NAMES[agencyId].full
            }.`,
    });
  };

  const handleTriggerFixAndRequeue = (rec: MasterMetadataRecord, agencyId: SupportedPlatform) => {
    const tracking = rec.agencyTrackings?.[agencyId];
    const context: FixAndRequeueContext = {
      assetId: rec.id,
      filename: rec.filename,
      agencyId,
      agencyName: AGENCY_DISPLAY_NAMES[agencyId].full,
      rejectionReasonTitle:
        tracking?.rejectionReasonTitle || 'Agency Quality / Metadata Rejection',
      customRejectionNote: tracking?.customRejectionNote,
    };

    if (onFixAndRequeue) {
      onFixAndRequeue(context);
    } else {
      setInspectedAssetId(rec.id);
    }
  };

  const handleSplitReconcileBasket = async (payload: {
    agencyId: SupportedPlatform;
    revertToNewIds: string[];
    markUploadedIds: string[];
  }) => {
    const { agencyId, revertToNewIds, markUploadedIds } = payload;
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
    setActionBanner({
      type: 'success',
      message: `Reconciled ${AGENCY_DISPLAY_NAMES[agencyId].full}: ${revertToNewIds.length} failed item(s) reverted to New · ${markUploadedIds.length} item(s) confirmed Uploaded.`,
    });
  };

  const handleManualHotBackup = async () => {
    const log = await db.tracker.performHotBackup('manual');
    if (log) {
      setActionBanner({
        type: 'success',
        message:
          language === 'ar'
            ? `تم حفظ نسخة احتياطية فورية لقاعدة البيانات (${log.assetCountSnapshot} ملف).`
            : `Event-driven SQLite snapshot saved (${log.assetCountSnapshot} assets · Rolling 30-file retention).`,
        folderPath: workspacePaths?.backupsDir,
      });
    }
  };

  const handleOpenFolder = async (folderPath?: string) => {
    if (!folderPath) return;
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openPath) {
      await (window as any).electronAPI.openPath(folderPath);
    }
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';
    const res = await atomicIngestionService.enqueueFiles(files, {
      isAiGenerated: true,
      useAiMetadata: true,
    });
    setActionBanner({
      type: res.failedCount > 0 ? 'warning' : 'success',
      message: `Ingestion complete: ${res.committedCount} committed to Master Vault, ${res.duplicateCount} duplicates skipped, ${res.failedCount} rolled back.`,
    });
  };

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const renderAgencyStatusCell = (rec: MasterMetadataRecord, agencyId: SupportedPlatform) => {
    const tracking = rec.agencyTrackings?.[agencyId];
    const status: TrackerAgencyStatus = tracking?.status || 'New';
    const isFocusedAgency = activeAgency === agencyId;

    let colorClasses =
      'bg-secondary/60 text-muted-foreground border-border/80 hover:border-primary/50 hover:text-foreground';
    if (status === 'Pending Upload') {
      colorClasses =
        'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-semibold';
    } else if (status === 'Uploaded' || status === 'In Review') {
      colorClasses =
        'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/40 font-semibold';
    } else if (status === 'Accepted') {
      colorClasses =
        'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-semibold';
    } else if (status === 'Rejected') {
      colorClasses = 'bg-destructive/15 text-destructive border-destructive/40 font-semibold';
    }

    return (
      <DropdownMenu key={agencyId}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid={`agency-cell-${rec.id}-${agencyId}`}
            onClick={(e) => e.stopPropagation()}
            title={
              status === 'Rejected'
                ? `${AGENCY_DISPLAY_NAMES[agencyId].full}: Rejected — ${
                    tracking?.rejectionReasonTitle || 'Unspecified Reason'
                  }`
                : `${AGENCY_DISPLAY_NAMES[agencyId].full}: ${status} (Click to set status)`
            }
            className={`h-7 w-full px-1.5 rounded-md border text-[10px] font-mono flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${colorClasses} ${
              isFocusedAgency ? 'ring-1 ring-primary/35' : ''
            }`}
          >
            <span className="shrink-0">{getPlatformLogo(agencyId, 11)}</span>
            <span className="truncate">{STATUS_SHORT_LABELS[status]}</span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 truncate">
              {getPlatformLogo(agencyId, 13)}
              <span>{AGENCY_DISPLAY_NAMES[agencyId].full}</span>
            </span>
            <span className="text-[10px] font-mono font-normal text-muted-foreground truncate max-w-[95px]">
              {rec.filename}
            </span>
          </DropdownMenuLabel>

          {status === 'Rejected' && (
            <div className="mx-1.5 my-1 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-[11px] text-destructive space-y-1.5">
              <div className="font-semibold">
                {tracking?.rejectionReasonTitle || 'Rejected by Agency'}
              </div>
              {tracking?.customRejectionNote && (
                <div className="text-[10px] opacity-90">{tracking.customRejectionNote}</div>
              )}
              <Button
                type="button"
                size="sm"
                data-testid={`menu-fix-requeue-${rec.id}-${agencyId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTriggerFixAndRequeue(rec, agencyId);
                }}
                className="w-full h-6 text-[10px] font-semibold gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              >
                <Wrench className="w-3 h-3" />
                <span>Fix & Re-Queue in Studio</span>
              </Button>
            </div>
          )}

          <DropdownMenuSeparator />

          {ALL_STATUSES.map((st) => {
            const isCurrent = status === st;
            return (
              <DropdownMenuItem
                key={st}
                data-testid={`cell-menu-status-${rec.id}-${agencyId}-${st}`}
                onSelect={() => {
                  handleBulkReconcileStatus(st, [rec.id], agencyId, false);
                }}
                className={`flex items-center justify-between ${
                  isCurrent
                    ? 'bg-primary/15 text-primary font-semibold'
                    : st === 'Rejected'
                    ? 'text-destructive focus:text-destructive'
                    : ''
                }`}
              >
                <span>{st === 'Rejected' ? 'Rejected (Log Reason...)' : st}</span>
                {isCurrent && <Check className="w-3.5 h-3.5 text-primary" />}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            data-testid="popover-mark-all-agencies-uploaded"
            onSelect={() => {
              handleBulkReconcileStatus('Uploaded', [rec.id], undefined, true);
            }}
            className="text-blue-500 focus:text-blue-500 font-medium gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Mark Uploaded on All 6 Agencies</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Proposal 3: Single-Agency Focus Mode Cell Renderer
  const renderFocusedAgencyControlCell = (rec: MasterMetadataRecord) => {
    const tracking = rec.agencyTrackings?.[activeAgency];
    const status: TrackerAgencyStatus = tracking?.status || 'New';
    const otherSentCount = AGENCIES.filter((ag) => {
      if (ag === activeAgency) return false;
      const st = rec.agencyTrackings?.[ag]?.status || 'New';
      return st === 'Uploaded' || st === 'In Review' || st === 'Accepted';
    }).length;

    return (
      <div className="flex items-center justify-between gap-2 w-full">
        <div className="w-28 shrink-0">{renderAgencyStatusCell(rec, activeAgency)}</div>

        <div className="flex items-center gap-1 shrink-0">
          {(['Uploaded', 'Accepted', 'Rejected', 'New'] as TrackerAgencyStatus[]).map((st) => {
            const isCurrent = status === st;
            return (
              <button
                key={st}
                type="button"
                data-testid={`focus-quick-status-${rec.id}-${st}`}
                onClick={() => handleBulkReconcileStatus(st, [rec.id], activeAgency, false)}
                className={`h-6 px-2 rounded text-[10px] font-mono border transition cursor-pointer ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : st === 'Rejected'
                    ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                    : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                }`}
              >
                {STATUS_SHORT_LABELS[st]}
              </button>
            );
          })}
        </div>

        <span
          className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0"
          title="Accepted/Uploaded count across the other 5 agencies"
        >
          Other 5: {otherSentCount}/5
        </span>
      </div>
    );
  };

  const pendingForActiveAgency =
    trackerStats?.perAgencyStats?.[activeAgency]?.['Pending Upload'] || 0;
  const newForActiveAgency = trackerStats?.perAgencyStats?.[activeAgency]?.New || 0;

  return (
    <div className="h-full flex flex-col gap-1.5 overflow-hidden">
      {/* Hidden File & Folder Inputs for Atomic Copy-First Ingestion */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.eps,.ai,.svg,.mp4,.mov,.webm"
        onChange={handleFilesSelected}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported in Chromium/Electron
        webkitdirectory=""
        onChange={handleFilesSelected}
        className="hidden"
      />

      {/* Ultra-Slim Single-Line KPI & Hot Backup Ribbon */}
      <div
        data-testid="tracker-slim-kpi-ribbon"
        className="px-2.5 py-1 rounded-lg border border-border bg-card/80 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetAllFilters}
            className={`h-6 px-2 rounded-md border inline-flex items-center gap-1.5 font-mono transition cursor-pointer ${
              activeFilterCount === 0
                ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'
            }`}
            title="Show All Master Vault Assets (SHA-256 Deduplicated)"
          >
            <Database className="w-3 h-3 text-primary shrink-0" />
            <span>Vault:</span>
            <span data-testid="tracker-kpi-total" className="font-bold text-foreground tabular-nums">
              {trackerStats?.totalAssets ?? masterRecords.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'New' ? 'ALL' : 'New')}
            className={`h-6 px-2 rounded-md border inline-flex items-center gap-1.5 font-mono transition cursor-pointer ${
              statusFilter === 'New'
                ? 'border-primary bg-primary/15 text-primary font-semibold'
                : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <UploadCloud className="w-3 h-3 shrink-0" />
            <span>New ({AGENCY_DISPLAY_NAMES[activeAgency].short}):</span>
            <span data-testid="tracker-kpi-new" className="font-bold text-foreground tabular-nums">
              {newForActiveAgency}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (statusFilter === 'Pending Upload') {
                setStatusFilter('ALL');
              } else {
                handleSelectByStatusForActiveAgency('Pending Upload');
              }
            }}
            className={`h-6 px-2 rounded-md border inline-flex items-center gap-1.5 font-mono transition cursor-pointer ${
              statusFilter === 'Pending Upload'
                ? 'border-amber-500 bg-amber-500/20 text-amber-500 font-semibold'
                : pendingForActiveAgency > 0
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="w-3 h-3 shrink-0" />
            <span>Pending:</span>
            <span data-testid="tracker-kpi-pending" className="font-bold tabular-nums">
              {pendingForActiveAgency}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Uploaded' ? 'ALL' : 'Uploaded')}
            className={`h-6 px-2 rounded-md border inline-flex items-center gap-1.5 font-mono transition cursor-pointer ${
              statusFilter === 'Uploaded'
                ? 'border-blue-500 bg-blue-500/15 text-blue-500 font-semibold'
                : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
            <span>Live:</span>
            <span data-testid="tracker-kpi-uploaded" className="font-bold text-foreground tabular-nums">
              {(trackerStats?.perAgencyStats?.[activeAgency]?.Uploaded ?? 0) +
                (trackerStats?.perAgencyStats?.[activeAgency]?.Accepted ?? 0)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Rejected' ? 'ALL' : 'Rejected')}
            className={`h-6 px-2 rounded-md border inline-flex items-center gap-1.5 font-mono transition cursor-pointer ${
              statusFilter === 'Rejected'
                ? 'border-destructive bg-destructive/15 text-destructive font-semibold'
                : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <XCircle className="w-3 h-3 text-destructive shrink-0" />
            <span>Rejected:</span>
            <span data-testid="tracker-kpi-rejected" className="font-bold text-foreground tabular-nums">
              {trackerStats?.perAgencyStats?.[activeAgency]?.Rejected ?? 0}
            </span>
          </button>

          {overKeywordCapRecords.length > 0 && (
            <button
              type="button"
              data-testid="bulk-autotrim-keywords-btn"
              onClick={handleQuickAutoTrimKeywords}
              className="h-6 px-2 rounded-md text-[10px] font-mono inline-flex items-center gap-1 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 font-semibold transition cursor-pointer"
              title={`1-Click trim keywords on ${overKeywordCapRecords.length} asset(s) down to ${activeAgencyCap} tags`}
            >
              <Scissors className="w-3 h-3 shrink-0" />
              <span>
                Trim &gt;{activeAgencyCap} Tags ({overKeywordCapRecords.length})
              </span>
            </button>
          )}

          {activeAgencyWarningCount > 0 && (
            <button
              type="button"
              data-testid="preflight-warnings-filter-pill"
              onClick={() => setOnlyWarningsFilter((prev) => !prev)}
              className={`h-6 px-2 rounded-md text-[10px] font-mono inline-flex items-center gap-1 transition cursor-pointer border ${
                onlyWarningsFilter
                  ? 'bg-amber-500 text-black border-amber-500 font-semibold'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/25'
              }`}
              title={`Filter ${activeAgencyWarningCount} assets with ${AGENCY_DISPLAY_NAMES[activeAgency].full} Pre-Flight rule warnings`}
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>
                {AGENCY_DISPLAY_NAMES[activeAgency].short} Warnings ({activeAgencyWarningCount})
              </span>
            </button>
          )}
        </div>

        {/* Right of Slim Ribbon: Inline Action Banner OR Event-Driven Hot Backup Status */}
        <div className="flex items-center gap-2">
          {actionBanner && (
            <div
              className={`h-6 px-2 rounded-md border text-[10px] inline-flex items-center gap-1.5 ${
                actionBanner.type === 'error'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : actionBanner.type === 'warning'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <span className="truncate max-w-[320px] font-medium">{actionBanner.message}</span>
              <button
                type="button"
                onClick={() => setActionBanner(null)}
                className="underline opacity-80 hover:opacity-100 cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
            <span data-testid="last-backup-trigger" className="hidden xl:inline" dir="ltr">
              {trackerStats?.lastBackup
                ? `WAL: ${trackerStats.lastBackup.triggerEvent} (${trackerStats?.backupCount ?? 0}/30)`
                : `WAL (${trackerStats?.backupCount ?? 0}/30)`}
            </span>
            <button
              type="button"
              data-testid="manual-hot-backup-btn"
              onClick={handleManualHotBackup}
              className="h-5 px-1.5 rounded border border-border bg-secondary/50 hover:bg-secondary text-foreground transition cursor-pointer inline-flex items-center gap-1"
              title="Trigger immediate SQLite WAL hot backup"
            >
              <HardDrive className="w-2.5 h-2.5" />
              <span>Backup</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Atomic Ingestion Pipeline Stream (Only shown while active) */}
      {ingestionItems.length > 0 && (
        <div
          data-testid="atomic-ingestion-pipeline-panel"
          className="px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs"
        >
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span>Atomic Ingestion ({ingestionItems.length} files)</span>
            {isIngesting && <span className="text-[10px] font-mono text-primary">Running...</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 max-h-14 overflow-y-auto">
            {ingestionItems.map((item) => {
              const isFailed = item.stage === 'failed';
              const isDone = item.stage === 'committed';
              const isDup = item.stage === 'duplicate_skipped';
              return (
                <div
                  key={item.id}
                  data-testid={`ingestion-row-${item.filename}`}
                  className="px-2 py-0.5 rounded bg-background border border-border inline-flex items-center gap-1.5 text-[10px] font-mono"
                >
                  <span className="truncate max-w-[140px]">{item.filename}</span>
                  <span
                    data-testid={`ingestion-stage-badge-${item.filename}`}
                    className={`px-1.5 py-0.2 rounded font-semibold ${
                      isFailed
                        ? 'bg-destructive/15 text-destructive'
                        : isDone
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : isDup
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-primary/15 text-primary'
                    }`}
                  >
                    {item.stageLabel}
                  </span>
                </div>
              );
            })}
            {!isIngesting && (
              <button
                type="button"
                onClick={() => atomicIngestionService.clearCompletedAndDuplicates()}
                className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Flattened Single-Row Primary Command Bar */}
      <div
        data-testid="tracker-primary-command-bar"
        className="px-2.5 py-1.5 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-2 shrink-0"
      >
        {/* Left: Search + Consolidated Filter Dropdown + Active Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative w-40 sm:w-48">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'ar' ? 'بحث بالاسم أو الكلمات...' : 'Search file, title, tag...'
              }
              className="h-7 pl-8 text-xs bg-background"
            />
          </div>

          {/* Consolidated Filter Dropdown (Media, AI/Real, Batch/Shoot, Status) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant={activeFilterCount > 0 ? 'default' : 'outline'}
                size="sm"
                data-testid="tracker-filters-dropdown-btn"
                className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-background/20 text-[10px] font-mono font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-2 space-y-2 text-xs">
              <div className="flex items-center justify-between px-1">
                <span className="font-semibold text-foreground">Filter Distribution Grid</span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAllFilters}
                    className="text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Reset All
                  </button>
                )}
              </div>

              <DropdownMenuSeparator />

              {/* Status Filter */}
              <div className="space-y-1 px-1">
                <span className="text-[10px] font-mono uppercase text-muted-foreground">
                  {AGENCY_DISPLAY_NAMES[activeAgency].short} Status
                </span>
                <div className="flex flex-wrap gap-1">
                  {(['ALL', ...ALL_STATUSES] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      data-testid={`status-filter-pill-${st}`}
                      onClick={() => setStatusFilter(st)}
                      className={`h-6 px-2 rounded text-[10px] font-mono transition cursor-pointer ${
                        statusFilter === st
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {st === 'ALL' ? 'All' : STATUS_SHORT_LABELS[st]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shoot / Batch Filter */}
              <div className="space-y-1 px-1">
                <span className="text-[10px] font-mono uppercase text-muted-foreground">
                  Shoot / Batch Group
                </span>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    data-testid="batch-pill-ALL"
                    onClick={() => setBatchFilter('ALL')}
                    className={`h-6 px-2 rounded text-[10px] font-mono transition cursor-pointer ${
                      batchFilter === 'ALL'
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    All ({masterRecords.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchFilter('TODAY')}
                    className={`h-6 px-2 rounded text-[10px] font-mono transition cursor-pointer ${
                      batchFilter === 'TODAY'
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Today&apos;s Ingest
                  </button>
                  {batchGroups.map(([batchCode, cnt]) => (
                    <button
                      key={batchCode}
                      type="button"
                      data-testid={`batch-pill-${batchCode}`}
                      onClick={() => setBatchFilter(batchFilter === batchCode ? 'ALL' : batchCode)}
                      className={`h-6 px-2 rounded text-[10px] font-mono transition cursor-pointer ${
                        batchFilter === batchCode
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {batchCode} ({cnt})
                    </button>
                  ))}
                </div>
              </div>

              {/* Media Type Filter */}
              <div className="space-y-1 px-1">
                <span className="text-[10px] font-mono uppercase text-muted-foreground">
                  Media Type
                </span>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['ALL', 'All Media'],
                      ['image', 'Photos'],
                      ['vector', 'Vectors'],
                      ['video', 'Videos'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMediaFilter(val)}
                      className={`h-6 px-2 rounded text-[10px] font-mono transition cursor-pointer ${
                        mediaFilter === val
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI vs Real Filter */}
              <div className="space-y-1 px-1">
                <span className="text-[10px] font-mono uppercase text-muted-foreground">
                  Asset Origin (AI / Real)
                </span>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['ALL', 'All Origins'],
                      ['AI', 'AI Generated'],
                      ['REAL', 'Real / Camera'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setOriginFilter(val)}
                      className={`h-6 px-2 rounded text-[10px] font-mono transition cursor-pointer ${
                        originFilter === val
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Compact Removable Active Filter Chips */}
          {batchFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setBatchFilter('ALL')}
              className="h-6 px-2 rounded-md bg-primary/15 text-primary border border-primary/30 text-[10px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Shoot: {batchFilter}</span>
              <span>×</span>
            </button>
          )}
          {mediaFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setMediaFilter('ALL')}
              className="h-6 px-2 rounded-md bg-primary/15 text-primary border border-primary/30 text-[10px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Media: {mediaFilter}</span>
              <span>×</span>
            </button>
          )}
          {originFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setOriginFilter('ALL')}
              className="h-6 px-2 rounded-md bg-primary/15 text-primary border border-primary/30 text-[10px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Origin: {originFilter}</span>
              <span>×</span>
            </button>
          )}
        </div>

        {/* Center: Compact 6-Agency Switcher Pill Bar + Focus Mode Toggle */}
        <div
          className="flex flex-wrap items-center gap-1"
          role="tablist"
          aria-label="Target Stock Agency"
        >
          {AGENCIES.map((ag) => {
            const isSelectedAg = activeAgency === ag;
            const agStats = trackerStats?.perAgencyStats?.[ag];
            const agPending = agStats?.['Pending Upload'] || 0;
            const agNew = agStats?.New || 0;
            return (
              <button
                key={ag}
                type="button"
                data-testid={`agency-tab-${ag}`}
                onClick={() => setActiveAgency(ag)}
                className={`h-7 px-2 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition cursor-pointer ${
                  isSelectedAg
                    ? 'bg-primary text-primary-foreground border-primary shadow-2xs font-semibold'
                    : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-secondary/60'
                }`}
              >
                <span className="shrink-0">{getPlatformLogo(ag, 11)}</span>
                <span>{AGENCY_DISPLAY_NAMES[ag].short}</span>
                <span
                  className={`text-[10px] font-mono tabular-nums px-1 rounded ${
                    isSelectedAg
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : agPending > 0
                      ? 'bg-amber-500/20 text-amber-500 font-semibold'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {agPending > 0 ? `${agPending}⏳` : agNew}
                </span>
              </button>
            );
          })}

          <Button
            type="button"
            variant={isFocusMode ? 'default' : 'outline'}
            size="sm"
            data-testid="toggle-focus-mode-btn"
            onClick={() => setIsFocusMode((prev) => !prev)}
            className="h-7 px-2 text-[11px] gap-1 cursor-pointer ml-0.5"
            title="Toggle between 6-Agency Matrix and Single-Agency Focus Mode"
          >
            {isFocusMode ? (
              <Focus className="w-3.5 h-3.5" />
            ) : (
              <Columns className="w-3.5 h-3.5 text-primary" />
            )}
            <span>{isFocusMode ? 'Focus On' : 'Focus'}</span>
          </Button>
        </div>

        {/* Right: Primary Actions (Ingest, Auto-Fill, Export) + Consolidated Actions (...) Dropdown */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="tracker-ingest-files-btn"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 px-2.5 text-xs gap-1 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-primary" />
            <span>{language === 'ar' ? 'استيراد' : 'Ingest'}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="auto-fill-batch-btn"
            onClick={handleAutoSelectNextAgencyBatch}
            className="h-7 px-2 text-xs gap-1 cursor-pointer"
          >
            <PackageCheck className="w-3.5 h-3.5 text-primary" />
            <span>Auto-Fill ({newForActiveAgency})</span>
          </Button>

          <Button
            type="button"
            size="sm"
            data-testid="export-agency-btn"
            disabled={selectedIds.size === 0}
            onClick={handleCreateExportBasket}
            className="h-7 px-2.5 text-xs font-semibold gap-1 cursor-pointer"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>
              Export {AGENCY_DISPLAY_NAMES[activeAgency].short} ({selectedIds.size})
            </span>
          </Button>

          {/* Consolidated Secondary Actions (...) Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tracker-more-actions-btn"
                className="h-7 px-2 text-xs gap-1 cursor-pointer"
                title="More Actions & Bulk Tools"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
                <span>Actions</span>
                {exportBaskets.length > 0 && (
                  <span className="px-1 rounded bg-amber-500/20 text-amber-500 text-[10px] font-mono font-bold">
                    {exportBaskets.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 text-xs">
              <DropdownMenuLabel>Contributor Bulk Tools</DropdownMenuLabel>
              <DropdownMenuItem
                data-testid="open-bulk-seo-modal-btn"
                disabled={masterRecords.length === 0}
                onSelect={() => setIsBulkSeoModalOpen(true)}
                className="gap-2 cursor-pointer"
              >
                <Scissors className="w-3.5 h-3.5 text-primary" />
                <span>
                  Bulk Edit SEO & Keywords ({selectedIds.size > 0 ? selectedIds.size : filteredRecords.length})
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                data-testid="open-baskets-modal-btn"
                onSelect={() => setIsBasketsModalOpen(true)}
                className="gap-2 cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5 text-amber-500" />
                <span>Export Baskets & Reconcile ({exportBaskets.length})</span>
              </DropdownMenuItem>

              {overKeywordCapRecords.length > 0 && (
                <DropdownMenuItem
                  onSelect={handleQuickAutoTrimKeywords}
                  className="gap-2 cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5 text-primary" />
                  <span>
                    Auto-Trim &gt;{activeAgencyCap} Tags ({overKeywordCapRecords.length})
                  </span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Workspace & Ingestion</DropdownMenuLabel>

              <DropdownMenuItem
                onSelect={() => folderInputRef.current?.click()}
                className="gap-2 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-primary" />
                <span>Ingest Entire Folder...</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                data-testid="seed-demo-portfolio-btn"
                onSelect={handleLoadSampleBatch}
                className="gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Load Sample Batch (6 Assets)</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={handleManualHotBackup}
                className="gap-2 cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                <span>Save SQLite Hot Backup Now</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Slim Contextual Bulk Selection & Reconciliation Strip (Only visible when items are selected) */}
      {selectedIds.size > 0 && (
        <div
          data-testid="contextual-bulk-status-bar"
          className="px-2.5 py-1 rounded-lg border border-primary/40 bg-primary/5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[11px] font-semibold text-primary font-mono">
              {selectedIds.size} Selected
            </span>

            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={applyToAllAgencies}
                onCheckedChange={(v) => setApplyToAllAgencies(Boolean(v))}
              />
              <span className={applyToAllAgencies ? 'text-primary font-semibold' : ''}>
                All 6 Agencies
              </span>
            </label>

            <button
              type="button"
              onClick={() => setIsBulkSeoModalOpen(true)}
              className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Scissors className="w-3 h-3" />
              <span>Bulk SEO Surgery</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-mark-uploaded-btn"
              onClick={() => handleBulkReconcileStatus('Uploaded')}
              className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
            >
              <UploadCloud className="w-3 h-3 text-blue-500" />
              <span>Uploaded</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-mark-in-review-btn"
              onClick={() => handleBulkReconcileStatus('In Review')}
              className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
            >
              <Clock className="w-3 h-3 text-blue-400" />
              <span>In Review</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-mark-accepted-btn"
              onClick={() => handleBulkReconcileStatus('Accepted')}
              className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>Accepted</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-revert-new-btn"
              onClick={() => handleBulkReconcileStatus('New')}
              className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-muted-foreground" />
              <span>Revert New</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-mark-rejected-btn"
              onClick={() => handleBulkReconcileStatus('Rejected')}
              className="h-6 px-2 text-[11px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer"
            >
              <AlertCircle className="w-3 h-3" />
              <span>Rejected</span>
            </Button>
          </div>
        </div>
      )}

      {/* High-Density Virtualized 6-Agency Distribution Grid (Takes ~85% of Vertical Screen Height) */}
      <div className="flex-1 min-h-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden">
        {/* Sticky Grid Header (Adapts dynamically to 6-Agency Matrix vs Single-Agency Focus Mode) */}
        <div className="px-3 py-2 border-b border-border bg-secondary/40 grid grid-cols-12 items-center gap-3 text-[11px] font-semibold text-muted-foreground shrink-0">
          <div className="col-span-5 sm:col-span-4 flex items-center gap-2.5 min-w-0">
            <Checkbox
              checked={
                filteredRecords.length > 0 && selectedIds.size === filteredRecords.length
              }
              onCheckedChange={(checked) => handleSelectAllFiltered(Boolean(checked))}
            />
            <span>
              {language === 'ar'
                ? 'الملف الرئيسي وفحص Pre-Flight'
                : 'Master Asset & Pre-Flight Checks'}
            </span>
          </div>

          <div className={isFocusMode ? 'hidden sm:block sm:col-span-4' : 'hidden sm:block sm:col-span-3'}>
            <span>
              {language === 'ar'
                ? 'البيانات والنسخ السريع (Title · Desc · Tags)'
                : 'Granular 1-Click Copy & Remediation'}
            </span>
          </div>

          {isFocusMode ? (
            <div className="col-span-7 sm:col-span-4 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-primary font-bold">
                {getPlatformLogo(activeAgency, 12)}
                <span>Focused Agency: {AGENCY_DISPLAY_NAMES[activeAgency].full}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsFocusMode(false)}
                className="text-[10px] font-mono text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                Show All 6 Columns
              </button>
            </div>
          ) : (
            <div className="col-span-7 sm:col-span-5 grid grid-cols-6 gap-1.5">
              {AGENCIES.map((ag) => {
                const isFocused = activeAgency === ag;
                return (
                  <button
                    key={ag}
                    type="button"
                    onClick={() => setActiveAgency(ag)}
                    className={`flex items-center justify-center gap-1 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                      isFocused
                        ? 'bg-primary/15 text-primary font-bold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={`Focus ${AGENCY_DISPLAY_NAMES[ag].full}`}
                  >
                    <span className="shrink-0">{getPlatformLogo(ag, 11)}</span>
                    <span className="truncate">{AGENCY_DISPLAY_NAMES[ag].short}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Virtualized Scroll Viewport */}
        {filteredRecords.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border">
              <Database className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-xs font-semibold text-foreground">
                {language === 'ar'
                  ? 'لا توجد ملفات مطابقة في متتبع التوزيع'
                  : 'No Assets in Master Distribution Tracker'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {language === 'ar'
                  ? 'استورد مجلداً أو ملفات لنسخها بأمان إلى المجلد المؤقت وفحص SHA-256 وتوليد الكلمات المفتاحية وحفظها في Master Vault.'
                  : 'Ingest a source folder or files to run atomic SHA-256 deduplication, EPS/Video preparation, and track status across all 6 stock agencies.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'استيراد ملفات' : 'Ingest First Batch'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadSampleBatch}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>
                  {language === 'ar' ? 'تحميل بيانات تجريبية' : 'Load Sample Portfolio (6 Assets)'}
                </span>
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={parentScrollRef}
            data-testid="virtualized-tracker-grid"
            className="flex-1 overflow-y-auto select-none"
          >
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
                const mediaType = rec.mediaType || 'image';
                const cleanHash = (rec.fileHash || '').replace(/^sha256_/, '');
                const batchCode = resolveAssetBatchGroup(rec);
                const rowWarnings = preflightByAssetId.get(rec.id) || [];

                // Check if this asset is Rejected on the active agency (or any agency)
                const activeAgencyTracking = rec.agencyTrackings?.[activeAgency];
                const rejectedAgencyId: SupportedPlatform | null =
                  activeAgencyTracking?.status === 'Rejected'
                    ? activeAgency
                    : AGENCIES.find((ag) => rec.agencyTrackings?.[ag]?.status === 'Rejected') ||
                      null;

                const isCopiedTitle = copiedKey === `title-${rec.id}`;
                const isCopiedDesc = copiedKey === `desc-${rec.id}`;
                const isCopiedTags = copiedKey === `tags-${rec.id}`;
                const kwCount = (rec.rankedKeywords || []).length;

                return (
                  <div
                    key={rec.id}
                    data-testid={`tracker-row-${rec.filename}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={(e) => handleToggleSelectRow(rec.id, virtualRow.index, e.shiftKey)}
                    className={`px-3 border-b border-border/70 grid grid-cols-12 items-center gap-3 text-xs transition-colors cursor-pointer ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-secondary/30'
                    }`}
                  >
                    {/* Col 1: Checkbox + Thumbnail + Master Filename, Shoot Batch, Hash & Pre-Flight Warning Badges */}
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-2.5 min-w-0">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelectRow(rec.id, virtualRow.index, e.shiftKey);
                        }}
                        className="shrink-0 flex items-center"
                      >
                        <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedAssetId(rec.id);
                        }}
                        className="w-12 h-12 rounded-lg border border-border bg-secondary/50 overflow-hidden shrink-0 flex items-center justify-center relative group cursor-pointer"
                        title="Inspect Asset Metadata & Agency History"
                      >
                        {rec.thumbnailBase64 ? (
                          <img
                            src={
                              rec.thumbnailBase64.startsWith('data:')
                                ? rec.thumbnailBase64
                                : `data:image/jpeg;base64,${rec.thumbnailBase64}`
                            }
                            alt={rec.filename}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : mediaType === 'video' ? (
                          <Film className="w-4 h-4 text-muted-foreground" />
                        ) : mediaType === 'vector' ? (
                          <PenTool className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-3.5 h-3.5 text-white" />
                        </span>
                      </button>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-mono font-semibold text-foreground truncate" dir="ltr">
                          {rec.filename}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground font-mono tabular-nums">
                          <span className="text-primary font-semibold">{batchCode}</span>
                          <span>·</span>
                          <span className="text-foreground font-semibold">
                            {mediaType.toUpperCase()}
                          </span>
                          <span>·</span>
                          <span>{rec.isAiGenerated ? 'AI' : 'Real'}</span>
                          {cleanHash && (
                            <>
                              <span>·</span>
                              <span title={`SHA-256: ${cleanHash}`}>
                                #{cleanHash.slice(0, 8)}
                              </span>
                            </>
                          )}

                          {/* 6-Agency Pre-Flight Warning Badges */}
                          {rowWarnings.map((w) => (
                            <Tooltip key={w.code} content={w.detail}>
                              <span
                                data-testid={`preflight-warning-${rec.id}-${w.code}`}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded border text-[10px] font-mono font-semibold ${
                                  w.severity === 'error'
                                    ? 'bg-destructive/15 text-destructive border-destructive/40'
                                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40'
                                }`}
                              >
                                <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                <span>{w.shortLabel}</span>
                              </span>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Col 2: SEO Title + Granular 1-Click Copy (Title · Desc · Keywords) + Fix & Re-Queue Button */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={
                        isFocusMode
                          ? 'hidden sm:flex sm:col-span-4 min-w-0 flex-col justify-center gap-1'
                          : 'hidden sm:flex sm:col-span-3 min-w-0 flex-col justify-center gap-1.5'
                      }
                    >
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => setInspectedAssetId(rec.id)}
                          className="text-xs font-medium text-foreground truncate text-start hover:text-primary transition cursor-pointer"
                          title={rec.baseTitle}
                        >
                          {rec.baseTitle || 'Untitled Asset'}
                        </button>

                        {rejectedAgencyId && (
                          <Button
                            type="button"
                            size="sm"
                            data-testid={`fix-and-requeue-btn-${rec.id}`}
                            onClick={() => handleTriggerFixAndRequeue(rec, rejectedAgencyId)}
                            className="h-5 px-2 text-[10px] font-semibold gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 shrink-0 cursor-pointer"
                            title={`Rejected on ${AGENCY_DISPLAY_NAMES[rejectedAgencyId].full} — Open in Metadata Studio to fix and auto-requeue to New`}
                          >
                            <Wrench className="w-2.5 h-2.5" />
                            <span>Fix & Re-Queue</span>
                          </Button>
                        )}
                      </div>

                      {isFocusMode && rec.detailedDescription && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {rec.detailedDescription}
                        </div>
                      )}

                      {/* 3 Distinct Granular 1-Click Copy Buttons: Title | Desc | Keywords */}
                      <div className="flex items-center gap-1 text-[10px] font-mono tabular-nums">
                        <button
                          type="button"
                          data-testid={`copy-title-btn-${rec.id}`}
                          onClick={() => handleCopyText(`title-${rec.id}`, rec.baseTitle || '')}
                          className={`px-1.5 py-0.5 rounded border inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                            isCopiedTitle
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'bg-secondary/70 border-border/70 hover:bg-secondary text-foreground'
                          }`}
                          title="Copy SEO Title"
                        >
                          {isCopiedTitle ? (
                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                          ) : (
                            <Type className="w-2.5 h-2.5 text-muted-foreground" />
                          )}
                          <span>{isCopiedTitle ? 'Copied!' : 'Title'}</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`copy-desc-btn-${rec.id}`}
                          onClick={() =>
                            handleCopyText(
                              `desc-${rec.id}`,
                              rec.detailedDescription || rec.baseTitle || ''
                            )
                          }
                          className={`px-1.5 py-0.5 rounded border inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                            isCopiedDesc
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'bg-secondary/70 border-border/70 hover:bg-secondary text-foreground'
                          }`}
                          title="Copy Detailed Description"
                        >
                          {isCopiedDesc ? (
                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                          ) : (
                            <FileText className="w-2.5 h-2.5 text-muted-foreground" />
                          )}
                          <span>{isCopiedDesc ? 'Copied!' : 'Desc'}</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`copy-keywords-btn-${rec.id}`}
                          onClick={() =>
                            handleCopyText(
                              `tags-${rec.id}`,
                              (rec.rankedKeywords || []).join(', ')
                            )
                          }
                          className={`px-1.5 py-0.5 rounded border inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                            isCopiedTags
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'bg-secondary/70 border-border/70 hover:bg-secondary text-foreground'
                          }`}
                          title="Copy comma-separated Keywords"
                        >
                          {isCopiedTags ? (
                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                          ) : (
                            <Tag className="w-2.5 h-2.5 text-muted-foreground" />
                          )}
                          <span>{isCopiedTags ? 'Copied!' : `${kwCount} Keywords`}</span>
                        </button>
                      </div>
                    </div>

                    {/* Col 3: Either Single-Agency Focus Mode OR 6-Column Agency Status Matrix */}
                    {isFocusMode ? (
                      <div
                        className="col-span-7 sm:col-span-4 flex items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderFocusedAgencyControlCell(rec)}
                      </div>
                    ) : (
                      <div
                        className="col-span-7 sm:col-span-5 grid grid-cols-6 gap-1.5 items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {AGENCIES.map((agencyId) => renderAgencyStatusCell(rec, agencyId))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Proposal 2 (Modified): Visual Thumbnail Grid + Drag & Drop Matching Reconciliation Modal */}
      <ExportBasketReconcileModal
        open={isBasketsModalOpen}
        onClose={() => setIsBasketsModalOpen(false)}
        baskets={exportBaskets}
        masterRecords={masterRecords}
        activeAgency={activeAgency}
        onSplitReconcile={handleSplitReconcileBasket}
      />

      {/* Proposal 1: Bulk Find & Replace / Keyword Sanitizer Modal */}
      <BulkMetadataSurgeryModal
        open={isBulkSeoModalOpen}
        onClose={() => setIsBulkSeoModalOpen(false)}
        targetRecords={surgeryTargetRecords}
        activeAgency={activeAgency}
        onCompleted={(msg) => {
          setActionBanner({
            type: 'success',
            message: msg,
          });
        }}
      />

      {/* Asset Metadata & 6-Agency Inspector Modal */}
      <Dialog
        open={Boolean(inspectedAsset)}
        onClose={() => setInspectedAssetId(null)}
        title={inspectedAsset?.filename || 'Asset Inspector'}
        size="lg"
      >
        {inspectedAsset && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-28 h-28 rounded-xl border border-border bg-secondary/40 overflow-hidden shrink-0 flex items-center justify-center">
                {inspectedAsset.thumbnailBase64 ? (
                  <img
                    src={
                      inspectedAsset.thumbnailBase64.startsWith('data:')
                        ? inspectedAsset.thumbnailBase64
                        : `data:image/jpeg;base64,${inspectedAsset.thumbnailBase64}`
                    }
                    alt={inspectedAsset.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-muted-foreground">SEO Title</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyText('modal-title', inspectedAsset.baseTitle || '')}
                    className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal-title' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'modal-title' ? 'Copied!' : 'Copy Title'}</span>
                  </Button>
                </div>
                <div className="p-2 rounded-lg border border-border bg-secondary/20 font-medium text-foreground">
                  {inspectedAsset.baseTitle}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-semibold text-muted-foreground">Detailed Description</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleCopyText(
                        'modal-desc',
                        inspectedAsset.detailedDescription || inspectedAsset.baseTitle || ''
                      )
                    }
                    className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal-desc' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'modal-desc' ? 'Copied!' : 'Copy Description'}</span>
                  </Button>
                </div>
                <div className="p-2 rounded-lg border border-border bg-secondary/20 text-muted-foreground">
                  {inspectedAsset.detailedDescription || inspectedAsset.baseTitle}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-semibold text-muted-foreground">
                    Keywords ({(inspectedAsset.rankedKeywords || []).length})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleCopyText('modal-keywords', (inspectedAsset.rankedKeywords || []).join(', '))
                    }
                    className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal-keywords' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'modal-keywords' ? 'Copied!' : 'Copy Keywords'}</span>
                  </Button>
                </div>
                <div className="p-2 rounded-lg border border-border bg-secondary/20 font-mono text-[11px] text-muted-foreground leading-relaxed max-h-24 overflow-y-auto">
                  {(inspectedAsset.rankedKeywords || []).join(', ')}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="font-semibold text-foreground">6-Agency Distribution Status</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AGENCIES.map((ag) => {
                  const tr = inspectedAsset.agencyTrackings?.[ag];
                  const st = tr?.status || 'New';
                  return (
                    <div
                      key={ag}
                      className="p-2 rounded-lg border border-border bg-secondary/20 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-semibold">
                          {getPlatformLogo(ag, 12)}
                          {AGENCY_DISPLAY_NAMES[ag].full}
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-secondary">
                          {st}
                        </span>
                      </div>
                      {st === 'Rejected' && (
                        <div className="flex items-center justify-between gap-1 pt-1">
                          <span className="text-[10px] text-destructive truncate">
                            {tr?.rejectionReasonTitle || 'Rejected'}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setInspectedAssetId(null);
                              handleTriggerFixAndRequeue(inspectedAsset, ag);
                            }}
                            className="h-5 px-1.5 text-[10px] bg-destructive text-destructive-foreground cursor-pointer"
                          >
                            Fix & Re-Queue
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Rejection Dictionary Modal */}
      <RejectionReasonModal
        open={rejectionModalState.open}
        onClose={() => setRejectionModalState((s) => ({ ...s, open: false }))}
        agencyId={rejectionModalState.agencyId}
        assetCount={rejectionModalState.assetIds.length}
        onConfirmRejection={handleConfirmRejection}
      />
    </div>
  );
};
