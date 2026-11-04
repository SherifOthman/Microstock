import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  MasterMetadataRecord,
  SupportedPlatform,
  TrackerAgencyStatus,
  MediaType,
} from '../../types';
import { db, useSqliteQuery, DEFAULT_PLATFORM_LIMITS } from '../../db';
import { PLATFORMS_CONFIG } from '../../constants/platforms';
import { generatePlatformCsv } from '../../services/export/csvExporter';
import {
  atomicIngestionService,
  IngestionQueueItem,
} from '../../services/tracker/atomicIngestionService';
import { RejectionReasonModal } from './RejectionReasonModal';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Tooltip } from '../../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Database,
  FolderPlus,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
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
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const AGENCIES: SupportedPlatform[] = [
  'adobe',
  'freepik',
  'shutterstock',
  'vecteezy',
  'dreamstime',
  '123rf',
];

const STATUS_CYCLE: TrackerAgencyStatus[] = [
  'New',
  'Pending Upload',
  'Uploaded',
  'In Review',
  'Accepted',
  'Rejected',
];

export const DistributionTrackerView: React.FC = () => {
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

  // Filter & Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAgency, setActiveAgency] = useState<SupportedPlatform>('adobe');
  const [statusFilter, setStatusFilter] = useState<TrackerAgencyStatus | 'ALL'>('ALL');
  const [mediaFilter, setMediaFilter] = useState<MediaType | 'ALL'>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);

  // Rejection Modal State
  const [rejectionModalState, setRejectionModalState] = useState<{
    open: boolean;
    agencyId: SupportedPlatform;
    assetIds: string[];
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

  // Filtered records for the Virtualized Grid
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return masterRecords.filter((rec) => {
      if (mediaFilter !== 'ALL' && (rec.mediaType || 'image') !== mediaFilter) {
        return false;
      }
      if (statusFilter !== 'ALL') {
        const agencySt = rec.agencyTrackings?.[activeAgency]?.status || 'New';
        if (agencySt !== statusFilter) return false;
      }
      if (q) {
        const inName = rec.filename.toLowerCase().includes(q);
        const inTitle = (rec.baseTitle || '').toLowerCase().includes(q);
        const inHash = (rec.fileHash || '').toLowerCase().includes(q);
        const inTags = (rec.rankedKeywords || []).some((k) => k.toLowerCase().includes(q));
        if (!inName && !inTitle && !inHash && !inTags) return false;
      }
      return true;
    });
  }, [masterRecords, mediaFilter, statusFilter, activeAgency, searchQuery]);

  // Virtualizer for 60fps scrolling on 50,000+ rows
  const rowVirtualizer = useVirtualizer({
    count: filteredRecords.length,
    getScrollElement: () => parentScrollRef.current,
    estimateSize: () => 74,
    overscan: 12,
  });

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
    const eligible = masterRecords
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
          ? `تم تحديد ${eligible.length} ملف جاهز للتصدير إلى ${PLATFORMS_CONFIG[activeAgency].name}`
          : `Selected ${eligible.length} 'New' assets ready for ${PLATFORMS_CONFIG[activeAgency].name} export (limit: ${limit}).`,
    });
  };

  const handleSelectPendingUploadsForAgency = () => {
    const pending = masterRecords.filter(
      (r) => (r.agencyTrackings?.[activeAgency]?.status || 'New') === 'Pending Upload'
    );
    setStatusFilter('Pending Upload');
    setSelectedIds(new Set(pending.map((r) => r.id)));
  };

  // Export Basket Creation -> Marks as 'Pending Upload'
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

    setActionBanner({
      type: 'warning',
      message:
        language === 'ar'
          ? `تم إنشاء سلة التصدير (${basket.itemCount} ملف) وتحديث الحالة إلى Pending Upload. قم بتأكيد الرفع بعد الانتهاء.`
          : `Export Basket staged (${basket.itemCount} files + CSV). Status set to Pending Upload awaiting portal reconciliation.`,
      folderPath: basket.stagingFolderPath,
    });
  };

  // Reconciliation Actions
  const handleBulkReconcileStatus = async (
    targetStatus: TrackerAgencyStatus,
    overrideAssetIds?: string[],
    overrideAgencyId?: SupportedPlatform
  ) => {
    const targetAgency = overrideAgencyId || activeAgency;
    const ids = overrideAssetIds || Array.from(selectedIds);
    if (ids.length === 0) return;

    if (targetStatus === 'Rejected') {
      setRejectionModalState({
        open: true,
        agencyId: targetAgency,
        assetIds: ids,
      });
      return;
    }

    await db.tracker.reconcileAgencyStatuses({
      assetIds: ids,
      agencyId: targetAgency,
      targetStatus,
    });

    setActionBanner({
      type: 'success',
      message:
        language === 'ar'
          ? `تم تحديث حالة ${ids.length} ملف في ${PLATFORMS_CONFIG[targetAgency].name} إلى ${targetStatus}`
          : `Reconciled ${ids.length} ${ids.length === 1 ? 'asset' : 'assets'} on ${PLATFORMS_CONFIG[targetAgency].name} → ${targetStatus}.`,
    });
  };

  const handleConfirmRejection = async (payload: {
    rejectionReasonId?: string;
    customRejectionNote?: string;
  }) => {
    const { agencyId, assetIds } = rejectionModalState;
    await db.tracker.reconcileAgencyStatuses({
      assetIds,
      agencyId,
      targetStatus: 'Rejected',
      rejectionReasonId: payload.rejectionReasonId || null,
      customRejectionNote: payload.customRejectionNote || null,
    });
    setActionBanner({
      type: 'error',
      message:
        language === 'ar'
          ? `تم تسجيل رفض ${assetIds.length} ملف في ${PLATFORMS_CONFIG[agencyId].name} وحفظ النسخة الاحتياطية.`
          : `Logged ${assetIds.length} Rejected ${assetIds.length === 1 ? 'asset' : 'assets'} on ${PLATFORMS_CONFIG[agencyId].name}.`,
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

  const renderAgencyStatusButton = (rec: MasterMetadataRecord, agencyId: SupportedPlatform) => {
    const tracking = rec.agencyTrackings?.[agencyId];
    const status: TrackerAgencyStatus = tracking?.status || 'New';

    let colorClasses = 'bg-secondary/70 text-muted-foreground border-border hover:text-foreground';
    if (status === 'Pending Upload') {
      colorClasses =
        'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-semibold';
    } else if (status === 'Uploaded' || status === 'In Review') {
      colorClasses = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/40 font-semibold';
    } else if (status === 'Accepted') {
      colorClasses =
        'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-semibold';
    } else if (status === 'Rejected') {
      colorClasses = 'bg-destructive/15 text-destructive border-destructive/40 font-semibold';
    }

    const handleCycleStatus = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const idx = STATUS_CYCLE.indexOf(status);
      const nextStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      await handleBulkReconcileStatus(nextStatus, [rec.id], agencyId);
    };

    const tooltipContent =
      status === 'Rejected'
        ? `${PLATFORMS_CONFIG[agencyId].name}: Rejected — ${
            tracking?.rejectionReasonTitle || 'Unspecified Reason'
          }${tracking?.customRejectionNote ? ` (${tracking.customRejectionNote})` : ''}`
        : `${PLATFORMS_CONFIG[agencyId].name}: ${status} (Click to advance status)`;

    return (
      <Tooltip key={agencyId} content={tooltipContent}>
        <button
          type="button"
          data-testid={`agency-cell-${rec.id}-${agencyId}`}
          onClick={handleCycleStatus}
          className={`h-7 px-2 rounded-md border text-[10px] font-mono flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 ${colorClasses}`}
        >
          <span className="shrink-0">{getPlatformLogo(agencyId, 11)}</span>
          <span className="truncate max-w-[68px]">{status}</span>
        </button>
      </Tooltip>
    );
  };

  const pendingForActiveAgency =
    trackerStats?.perAgencyStats?.[activeAgency]?.['Pending Upload'] || 0;

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
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

      {/* Top KPI Telemetry & Event-Driven Hot Backup Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 shrink-0">
        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{language === 'ar' ? 'إجمالي Master Vault' : 'Master Vault Assets'}</span>
            <Database className="w-3.5 h-3.5 text-primary" />
          </div>
          <div
            data-testid="tracker-kpi-total"
            className="text-base font-semibold font-mono tabular-nums text-foreground"
          >
            {trackerStats?.totalAssets ?? masterRecords.length}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {language === 'ar' ? 'فحص SHA-256 ضد التكرار' : 'SHA-256 deduplicated'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'New' ? 'ALL' : 'New')}
          className={`p-2.5 rounded-xl border text-start transition cursor-pointer space-y-0.5 ${
            statusFilter === 'New'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-card hover:bg-secondary/40'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{language === 'ar' ? 'جاهز للرفع (New)' : 'Ready (New Slots)'}</span>
            <UploadCloud className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div
            data-testid="tracker-kpi-new"
            className="text-base font-semibold font-mono tabular-nums text-foreground"
          >
            {trackerStats?.perAgencyStats?.[activeAgency]?.New ?? 0}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {PLATFORMS_CONFIG[activeAgency].name} ({trackerStats?.newCount ?? 0} total)
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'Pending Upload' ? 'ALL' : 'Pending Upload')
          }
          className={`p-2.5 rounded-xl border text-start transition cursor-pointer space-y-0.5 ${
            statusFilter === 'Pending Upload'
              ? 'border-amber-500 bg-amber-500/15'
              : pendingForActiveAgency > 0
              ? 'border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10'
              : 'border-border bg-card hover:bg-secondary/40'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            <span>{language === 'ar' ? 'بانتظار المطابقة' : 'Pending Upload'}</span>
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div
            data-testid="tracker-kpi-pending"
            className="text-base font-semibold font-mono tabular-nums text-foreground"
          >
            {pendingForActiveAgency}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {language === 'ar' ? 'اضغط للمطابقة بعد الرفع' : 'Click to reconcile batch'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'Uploaded' ? 'ALL' : 'Uploaded')}
          className={`p-2.5 rounded-xl border text-start transition cursor-pointer space-y-0.5 ${
            statusFilter === 'Uploaded'
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-border bg-card hover:bg-secondary/40'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-blue-600 dark:text-blue-400">
            <span>{language === 'ar' ? 'تم الرفع / مقبول' : 'Uploaded & Accepted'}</span>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div
            data-testid="tracker-kpi-uploaded"
            className="text-base font-semibold font-mono tabular-nums text-foreground"
          >
            {(trackerStats?.perAgencyStats?.[activeAgency]?.Uploaded ?? 0) +
              (trackerStats?.perAgencyStats?.[activeAgency]?.Accepted ?? 0)}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {PLATFORMS_CONFIG[activeAgency].name} live portfolio
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'Rejected' ? 'ALL' : 'Rejected')}
          className={`p-2.5 rounded-xl border text-start transition cursor-pointer space-y-0.5 ${
            statusFilter === 'Rejected'
              ? 'border-destructive bg-destructive/10'
              : 'border-border bg-card hover:bg-secondary/40'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-destructive">
            <span>{language === 'ar' ? 'مرفوض (Rejected)' : 'Rejected'}</span>
            <XCircle className="w-3.5 h-3.5" />
          </div>
          <div
            data-testid="tracker-kpi-rejected"
            className="text-base font-semibold font-mono tabular-nums text-foreground"
          >
            {trackerStats?.perAgencyStats?.[activeAgency]?.Rejected ?? 0}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {trackerStats?.rejectedCount ?? 0} across all 6 agencies
          </p>
        </button>

        {/* Event-Driven Hot Backup Widget */}
        <div className="p-2.5 rounded-xl border border-border bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{language === 'ar' ? 'النسخ الاحتياطي' : 'Event Hot Backup'}</span>
            </span>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
              {trackerStats?.backupCount ?? 0}/30
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5 pt-1">
            <span
              data-testid="last-backup-trigger"
              className="text-[10px] font-mono text-muted-foreground truncate"
              dir="ltr"
            >
              {trackerStats?.lastBackup
                ? `Last: ${trackerStats.lastBackup.triggerEvent}`
                : 'WAL Ready'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="manual-hot-backup-btn"
                onClick={handleManualHotBackup}
                className="h-6 px-2 text-[10px] cursor-pointer"
              >
                <HardDrive className="w-3 h-3 mr-1" />
                {language === 'ar' ? 'نسخ الآن' : 'Backup'}
              </Button>
              {workspacePaths?.backupsDir && (
                <Tooltip content="Open Google Drive Sync Backups Folder">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenFolder(workspacePaths.backupsDir)}
                    className="h-6 w-6 cursor-pointer"
                  >
                    <FolderOpen className="w-3 h-3" />
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionBanner && (
        <div
          className={`px-3.5 py-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 shrink-0 ${
            actionBanner.type === 'error'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : actionBanner.type === 'warning'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          <span className="font-medium">{actionBanner.message}</span>
          <div className="flex items-center gap-2">
            {actionBanner.folderPath && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenFolder(actionBanner.folderPath)}
                className="h-6 text-[11px] gap-1 cursor-pointer"
              >
                <FolderOpen className="w-3 h-3" />
                <span>{language === 'ar' ? 'فتح المجلد' : 'Open Staging Folder'}</span>
              </Button>
            )}
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="text-[11px] underline cursor-pointer"
            >
              {language === 'ar' ? 'إغلاق' : 'Dismiss'}
            </button>
          </div>
        </div>
      )}

      {/* Real-Time Atomic Ingestion Pipeline Stream (Visible when items are in flight or failed) */}
      {ingestionItems.length > 0 && (
        <div
          data-testid="atomic-ingestion-pipeline-panel"
          className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2 shrink-0 max-h-44 overflow-y-auto"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <span>
                {language === 'ar'
                  ? 'مسار الاستيراد الذري المباشر (Copy → SHA-256 → EPS/Audio → AI → Master Vault)'
                  : 'Atomic Ingestion Pipeline (Source Read-Only → .stockflow_temp → Master Vault)'}
              </span>
              {isIngesting && (
                <span className="text-[11px] font-mono text-primary">Running...</span>
              )}
            </div>
            {!isIngesting && (
              <button
                type="button"
                onClick={() => atomicIngestionService.clearCompletedAndDuplicates()}
                className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                {language === 'ar' ? 'إخفاء المكتمل' : 'Clear Completed'}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {ingestionItems.map((item) => {
              const isFailed = item.stage === 'failed';
              const isDone = item.stage === 'committed';
              const isDup = item.stage === 'duplicate_skipped';
              return (
                <div
                  key={item.id}
                  data-testid={`ingestion-row-${item.filename}`}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-medium text-foreground truncate">
                      {item.filename}
                    </span>
                    {item.fileHash && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        #{item.fileHash.slice(0, 8)}
                      </span>
                    )}
                    {item.error && (
                      <span className="text-[11px] text-destructive truncate">
                        — {item.error}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      data-testid={`ingestion-stage-badge-${item.filename}`}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
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
                    {isFailed && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid={`retry-ingestion-${item.filename}`}
                        onClick={() => atomicIngestionService.retryItem(item.id)}
                        className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Command Bar: Ingestion, Target Agency Selector, Export Basket & Reconciliation Controls */}
      <div className="p-3 rounded-xl border border-border bg-card space-y-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Atomic Ingest Controls + Search */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            <Button
              type="button"
              size="sm"
              data-testid="tracker-ingest-files-btn"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'استيراد ملفات للخزنة' : 'Ingest Files'}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => folderInputRef.current?.click()}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-primary" />
              <span>{language === 'ar' ? 'استيراد مجلد (نسخ آمن)' : 'Ingest Folder (Copy-Safe)'}</span>
            </Button>

            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'بحث بالاسم أو العنوان أو الكلمات أو SHA-256...'
                    : 'Search filename, title, tag, or hash...'
                }
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>

            <Select
              value={mediaFilter}
              onValueChange={(v) => setMediaFilter(v as MediaType | 'ALL')}
            >
              <SelectTrigger className="h-8 w-28 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Media</SelectItem>
                <SelectItem value="image">Photos</SelectItem>
                <SelectItem value="vector">Vectors</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Right: Target Agency Selector & Export Basket / Auto-Select */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                {language === 'ar' ? 'المنصة النشطة:' : 'Target Agency:'}
              </span>
              <Select
                value={activeAgency}
                onValueChange={(v) => setActiveAgency(v as SupportedPlatform)}
              >
                <SelectTrigger
                  data-testid="tracker-agency-select"
                  className="h-8 w-40 text-xs font-semibold bg-background"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENCIES.map((ag) => (
                    <SelectItem key={ag} value={ag} className="text-xs">
                      {PLATFORMS_CONFIG[ag].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="auto-select-batch-btn"
              onClick={handleAutoSelectNextAgencyBatch}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <PackageCheck className="w-3.5 h-3.5 text-primary" />
              <span>
                {language === 'ar'
                  ? `تحديد دفعة ${PLATFORMS_CONFIG[activeAgency].name}`
                  : `Auto-Fill ${PLATFORMS_CONFIG[activeAgency].name} Batch`}
              </span>
            </Button>

            <Button
              type="button"
              size="sm"
              data-testid="create-export-basket-btn"
              disabled={selectedIds.size === 0}
              onClick={handleCreateExportBasket}
              className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>
                {language === 'ar'
                  ? `تصدير إلى ${PLATFORMS_CONFIG[activeAgency].name} (${selectedIds.size})`
                  : `Export to ${PLATFORMS_CONFIG[activeAgency].name} (${selectedIds.size})`}
              </span>
            </Button>
          </div>
        </div>

        {/* Reconciliation Bar (Pending Upload -> Uploaded / Accepted / Revert to New / Rejected) */}
        <div className="pt-2 border-t border-border/70 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-foreground">
              {language === 'ar'
                ? `مطابقة حالة ${PLATFORMS_CONFIG[activeAgency].name} (${selectedIds.size} محدد):`
                : `Reconcile ${PLATFORMS_CONFIG[activeAgency].name} (${selectedIds.size} selected):`}
            </span>

            {pendingForActiveAgency > 0 && (
              <button
                type="button"
                data-testid="filter-pending-uploads-btn"
                onClick={handleSelectPendingUploadsForAgency}
                className="text-[11px] font-mono text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                {language === 'ar'
                  ? `تحديد ${pendingForActiveAgency} ملف Pending Upload`
                  : `Select all ${pendingForActiveAgency} Pending Upload`}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-mark-uploaded-btn"
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkReconcileStatus('Uploaded')}
              className="h-7 px-2.5 text-[11px] gap-1 cursor-pointer"
            >
              <UploadCloud className="w-3 h-3 text-blue-500" />
              <span>{language === 'ar' ? 'تأكيد الرفع (Uploaded)' : 'Mark Uploaded'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-mark-accepted-btn"
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkReconcileStatus('Accepted')}
              className="h-7 px-2.5 text-[11px] gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>{language === 'ar' ? 'مقبول (Accepted)' : 'Mark Accepted'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-revert-new-btn"
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkReconcileStatus('New')}
              className="h-7 px-2.5 text-[11px] gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-muted-foreground" />
              <span>{language === 'ar' ? 'إرجاع كـ New' : 'Revert to New'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="reconcile-mark-rejected-btn"
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkReconcileStatus('Rejected')}
              className="h-7 px-2.5 text-[11px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer"
            >
              <AlertCircle className="w-3 h-3" />
              <span>{language === 'ar' ? 'تسجيل رفض (Rejected)' : 'Mark Rejected'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* High-Density Virtualized 6-Agency Distribution Grid */}
      <div className="flex-1 min-h-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden">
        {/* Sticky Grid Header */}
        <div className="px-3 py-2 border-b border-border bg-secondary/40 grid grid-cols-12 items-center gap-3 text-[11px] font-semibold text-muted-foreground shrink-0">
          <div className="col-span-5 sm:col-span-4 flex items-center gap-2.5 min-w-0">
            <Checkbox
              checked={
                filteredRecords.length > 0 && selectedIds.size === filteredRecords.length
              }
              onCheckedChange={(checked) => handleSelectAllFiltered(Boolean(checked))}
              aria-label="Select all assets"
            />
            <span>{language === 'ar' ? 'الملف الرئيسي والمواصفات' : 'Master Asset & Telemetry'}</span>
          </div>

          <div className="hidden sm:block sm:col-span-3">
            <span>{language === 'ar' ? 'العنوان والكلمات المفتاحية' : 'SEO Title & Keywords'}</span>
          </div>

          <div className="col-span-7 sm:col-span-5 flex items-center justify-between">
            <span>{language === 'ar' ? 'مصفوفة المنصات الست' : '6-Agency Distribution Matrix'}</span>
            {exportBaskets.length > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {exportBaskets.length} {language === 'ar' ? 'سلة تصدير' : 'Baskets'}
              </span>
            )}
          </div>
        </div>

        {/* Virtualized Scroll Viewport */}
        {filteredRecords.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2.5">
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
            <Button
              type="button"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'استيراد أول دفعة' : 'Ingest First Batch'}</span>
            </Button>
          </div>
        ) : (
          <div
            ref={parentScrollRef}
            data-testid="virtualized-tracker-grid"
            className="flex-1 overflow-y-auto"
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
                    {/* Col 1: Checkbox + Thumbnail + Master Filename & Hash */}
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-2.5 min-w-0">
                      <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() =>
                            handleToggleSelectRow(rec.id, virtualRow.index, false)
                          }
                        />
                      </div>

                      <div className="w-12 h-12 rounded-lg border border-border bg-secondary/50 overflow-hidden shrink-0 flex items-center justify-center relative">
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
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="font-mono font-semibold text-foreground truncate" dir="ltr">
                          {rec.filename}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono tabular-nums truncate">
                          <span>{mediaType.toUpperCase()}</span>
                          <span>·</span>
                          <span>{rec.isAiGenerated ? 'AI' : 'Real'}</span>
                          {rec.fileHash && (
                            <>
                              <span>·</span>
                              <span title={`SHA-256: ${rec.fileHash}`}>
                                #{rec.fileHash.slice(0, 7)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Col 2: SEO Title & Keyword Count */}
                    <div className="hidden sm:block sm:col-span-3 min-w-0 space-y-0.5">
                      <div className="text-xs font-medium text-foreground truncate">
                        {rec.baseTitle || 'Untitled Asset'}
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-muted-foreground truncate">
                        {(rec.rankedKeywords || []).length} keywords ·{' '}
                        {(rec.rankedKeywords || []).slice(0, 4).join(', ')}
                      </div>
                    </div>

                    {/* Col 3: 6-Agency Interactive Status Matrix */}
                    <div
                      className="col-span-7 sm:col-span-5 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {AGENCIES.map((agencyId) => renderAgencyStatusButton(rec, agencyId))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
