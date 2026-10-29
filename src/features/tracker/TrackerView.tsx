import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AssetTrackerRecord,
  MediaType,
  PlatformUploadStatus,
  SupportedPlatform,
} from '../../types';
import {
  DEFAULT_PLATFORM_LIMITS,
  bulkDeleteTrackerRecords,
  bulkSaveTrackerRecords,
  bulkUpdateAssetPlatformStatus,
  createInitialPlatformStatuses,
  db,
  deleteTrackerRecord,
  exportTrackerBackup,
  getAllTrackerRecords,
  importTrackerBackup,
  updateAssetPlatformStatus,
} from '../../db';
import { extractMediaInfo } from '../../utils/mediaExtractor';
import { PlatformQuotaCard } from './components/PlatformQuotaCard';
import { TrackerRow } from './components/TrackerRow';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Check,
  CheckCheck,
  CheckCircle2,
  Copy,
  Download,
  Filter,
  FolderPlus,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { saveAs } from 'file-saver';

const ALL_PLATFORMS: SupportedPlatform[] = [
  'adobe',
  'freepik',
  'shutterstock',
  'vecteezy',
  'dreamstime',
  '123rf',
];

export const TrackerView: React.FC = () => {
  const records = useLiveQuery(() => getAllTrackerRecords(), []) || [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<SupportedPlatform | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PlatformUploadStatus | 'all'>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | 'all'>('all');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchActionPlatform, setBatchActionPlatform] = useState<SupportedPlatform>('adobe');
  const [batchActionStatus, setBatchActionStatus] = useState<PlatformUploadStatus>('uploaded');
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [copiedBatch, setCopiedBatch] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);

  // -------------------------------------------------------------
  // Data Handlers
  // -------------------------------------------------------------

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = (filteredRecords: AssetTrackerRecord[]) => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const handleStatusChange = async (
    id: string,
    platform: SupportedPlatform,
    status: PlatformUploadStatus
  ) => {
    await updateAssetPlatformStatus(id, platform, status);
  };

  const handleDelete = async (id: string) => {
    await deleteTrackerRecord(id);
    const next = new Set(selectedIds);
    next.delete(id);
    setSelectedIds(next);
  };

  const handleMarkAllPlatforms = async (id: string, status: PlatformUploadStatus) => {
    const existing = await db.trackerRecords.get(id);
    if (!existing) return;
    const now = Date.now();
    const updated = { ...existing.platforms };
    for (const p of ALL_PLATFORMS) {
      updated[p] = { status, updatedAt: now };
    }
    await db.trackerRecords.update(id, { platforms: updated, updatedAt: now });
  };

  // -------------------------------------------------------------
  // File Import Handlers
  // -------------------------------------------------------------

  const handleFilesAdded = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessingFiles(true);

    try {
      const newRecords: AssetTrackerRecord[] = [];
      const now = Date.now();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const id = `${file.name}_${file.size}_${file.lastModified}`;

        // Check if already exists in tracker
        const existing = await db.trackerRecords.get(id);
        if (existing) continue;

        try {
          const media = await extractMediaInfo(file, undefined, 256, 0.7);
          const cleanName = file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[-_]+/g, ' ')
            .trim();

          newRecords.push({
            id,
            filename: file.name,
            cleanTitle: cleanName,
            mediaType: media.mediaType,
            fileSizeBytes: file.size,
            thumbnailBase64: media.thumbnailBase64,
            videoDurationSeconds: media.videoDurationSeconds,
            videoResolution: media.videoResolution,
            platforms: createInitialPlatformStatuses(),
            createdAt: now,
            updatedAt: now,
          });
        } catch (err) {
          console.warn(`Could not process media for ${file.name}:`, err);
        }
      }

      if (newRecords.length > 0) {
        await bulkSaveTrackerRecords(newRecords);
      }
    } finally {
      setIsProcessingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  // Sync existing AI Master Records from Studio
  const handleSyncFromStudio = async () => {
    setIsProcessingFiles(true);
    try {
      const masterRecords = await db.masterRecords.toArray();
      const newTrackerRecords: AssetTrackerRecord[] = [];
      const now = Date.now();

      for (const m of masterRecords) {
        const id = m.id || m.filename;
        const existing = await db.trackerRecords.get(id);
        if (existing) continue;

        newTrackerRecords.push({
          id,
          filename: m.filename,
          cleanTitle: m.baseTitle,
          mediaType: m.mediaType || 'image',
          fileSizeBytes: m.fileSize,
          thumbnailBase64: m.thumbnailBase64,
          videoDurationSeconds: m.videoMeta?.durationSeconds,
          videoResolution: m.videoMeta?.resolution,
          masterRecordId: m.id,
          platforms: createInitialPlatformStatuses(),
          createdAt: m.createdAt || now,
          updatedAt: now,
        });
      }

      if (newTrackerRecords.length > 0) {
        await bulkSaveTrackerRecords(newTrackerRecords);
      }
    } finally {
      setIsProcessingFiles(false);
    }
  };

  // -------------------------------------------------------------
  // Quota Card Shortcut Handlers
  // -------------------------------------------------------------

  const handleFilterUnuploaded = (pid: SupportedPlatform) => {
    if (platformFilter === pid && statusFilter === 'not_uploaded') {
      setPlatformFilter('all');
      setStatusFilter('all');
    } else {
      setPlatformFilter(pid);
      setStatusFilter('not_uploaded');
    }
  };

  const handleSelectBatchUnuploaded = (pid: SupportedPlatform, count: number) => {
    const unuploaded = records.filter(
      (r) => !r.platforms[pid] || r.platforms[pid].status === 'not_uploaded'
    );
    const toSelect = unuploaded.slice(0, count).map((r) => r.id);
    setSelectedIds(new Set(toSelect));
    setPlatformFilter(pid);
    setStatusFilter('not_uploaded');
  };

  // -------------------------------------------------------------
  // Bulk Actions Handlers
  // -------------------------------------------------------------

  const handleApplyBatchStatus = async () => {
    if (selectedIds.size === 0) return;
    await bulkUpdateAssetPlatformStatus(
      Array.from(selectedIds),
      batchActionPlatform,
      batchActionStatus
    );
    setSelectedIds(new Set());
  };

  const handleCopySelectedNames = () => {
    const selectedRecords = records.filter((r) => selectedIds.has(r.id));
    const names = selectedRecords.map((r) => r.filename).join('\n');
    navigator.clipboard.writeText(names);
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 1500);
  };

  const handleDeleteSelected = () => {
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    await bulkDeleteTrackerRecords(Array.from(selectedIds));
    setSelectedIds(new Set());
    setConfirmDeleteOpen(false);
  };

  // -------------------------------------------------------------
  // Backup / Restore
  // -------------------------------------------------------------

  const handleExportBackup = async () => {
    const json = await exportTrackerBackup();
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `stock-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const res = await importTrackerBackup(text);
        setNoticeDialog({
          title: 'Backup Restored',
          message: `Successfully imported ${res.importedCount} assets into Tracker.`,
        });
      } catch (err: any) {
        setNoticeDialog({
          title: 'Import Failed',
          message: 'Failed to restore backup: ' + err.message,
        });
      }
    };
    input.click();
  };

  // -------------------------------------------------------------
  // Filtered Assets Computation
  // -------------------------------------------------------------

  const filteredRecords = records.filter((record) => {
    // 1. Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = record.filename.toLowerCase().includes(q);
      const matchTitle = record.cleanTitle?.toLowerCase().includes(q);
      if (!matchName && !matchTitle) return false;
    }

    // 2. Media type filter
    if (mediaTypeFilter !== 'all' && record.mediaType !== mediaTypeFilter) {
      return false;
    }

    // 3. Platform & Status filter
    if (platformFilter !== 'all') {
      const pStatus = record.platforms[platformFilter]?.status || 'not_uploaded';
      if (statusFilter !== 'all' && pStatus !== statusFilter) {
        return false;
      }
    } else if (statusFilter !== 'all') {
      // Any platform matching status
      const hasStatus = Object.values(record.platforms).some((p) => p.status === statusFilter);
      if (!hasStatus) return false;
    }

    return true;
  });

  return (
    <div className="space-y-5 pb-12">
      {/* Hidden File / Folder Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.eps,.ai,.svg"
        onChange={(e) => handleFilesAdded(e.target.files)}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory
        webkitdirectory=""
        directory=""
        multiple
        onChange={(e) => handleFilesAdded(e.target.files)}
        className="hidden"
      />

      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Stock Distribution & Limit Tracker
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track uploads across 6 microstock agencies, prevent duplicates, and manage varying limits effortlessly.
              </p>
            </div>
          </div>
        </div>

        {/* Global Toolbar Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncFromStudio}
            disabled={isProcessingFiles}
            className="gap-1.5 text-xs cursor-pointer"
            title="Import metadata records generated in Studio"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Sync from Studio
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => folderInputRef.current?.click()}
            disabled={isProcessingFiles}
            className="gap-1.5 text-xs cursor-pointer"
            title="Scan entire local folder of photos, videos, and EPS vectors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Import Folder
          </Button>

          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingFiles}
            className="gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Files
          </Button>

          <div className="h-4 w-px bg-border mx-0.5" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportBackup}
            className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground"
            title="Export Tracker JSON Backup"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleImportBackup}
            className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground"
            title="Restore Tracker JSON Backup"
          >
            <Upload className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 6 Platform Quotas & Progress Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {ALL_PLATFORMS.map((pid) => {
          const cfg = DEFAULT_PLATFORM_LIMITS[pid];
          const uploaded = records.filter((r) => r.platforms[pid]?.status === 'uploaded').length;
          const pending = records.filter((r) => r.platforms[pid]?.status === 'pending_review').length;
          const isActive = platformFilter === pid && statusFilter === 'not_uploaded';

          return (
            <PlatformQuotaCard
              key={pid}
              platformId={pid}
              platformName={cfg.name}
              uploadedCount={uploaded}
              pendingCount={pending}
              totalAssets={records.length}
              batchLimit={cfg.defaultBatchLimit}
              limitPeriod={cfg.limitPeriod}
              isActiveFilter={isActive}
              onFilterUnuploaded={handleFilterUnuploaded}
              onSelectBatchUnuploaded={handleSelectBatchUnuploaded}
            />
          );
        })}
      </div>

      {/* Batch Operations Bar (Floats or shows when items selected) */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-30 p-3 rounded-xl bg-primary text-primary-foreground shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs bg-primary-foreground/20 px-2 py-0.5 rounded">
              {selectedIds.size} assets selected
            </span>
            <span className="text-xs text-primary-foreground/80 hidden md:inline">
              Apply bulk status to target platform:
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Platform Selector via official Shadcn Select */}
            <Select
              value={batchActionPlatform}
              onValueChange={(val) => setBatchActionPlatform(val as SupportedPlatform)}
            >
              <SelectTrigger className="h-8 text-xs bg-primary-foreground/15 border-primary-foreground/30 text-primary-foreground w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p} className="text-xs">
                    {DEFAULT_PLATFORM_LIMITS[p].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Selector via official Shadcn Select */}
            <Select
              value={batchActionStatus}
              onValueChange={(val) => setBatchActionStatus(val as PlatformUploadStatus)}
            >
              <SelectTrigger className="h-8 text-xs bg-primary-foreground/15 border-primary-foreground/30 text-primary-foreground w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uploaded" className="text-xs">Uploaded ✓</SelectItem>
                <SelectItem value="pending_review" className="text-xs">Pending Review ⏳</SelectItem>
                <SelectItem value="not_uploaded" className="text-xs">Not Uploaded ✕</SelectItem>
                <SelectItem value="approved" className="text-xs">Approved ★</SelectItem>
                <SelectItem value="rejected" className="text-xs">Rejected ⊘</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="secondary"
              onClick={handleApplyBatchStatus}
              className="h-7 text-xs font-semibold gap-1 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Apply
            </Button>

            <div className="h-4 w-px bg-primary-foreground/30 mx-0.5" />

            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopySelectedNames}
              className="h-7 text-xs gap-1 cursor-pointer"
              title="Copy filenames of selected files"
            >
              {copiedBatch ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedBatch ? 'Copied!' : 'Copy Names'}</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleDeleteSelected}
              className="h-7 text-xs text-rose-200 hover:text-white hover:bg-rose-500/20 cursor-pointer"
              title="Remove selected files from tracker"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-primary-foreground/80 hover:text-primary-foreground p-1 cursor-pointer ml-1"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Query Filters & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
          <Input
            placeholder="Search assets by filename or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Media Type Filter */}
          <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border border-border text-xs">
            <button
              type="button"
              onClick={() => setMediaTypeFilter('all')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                mediaTypeFilter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setMediaTypeFilter('image')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                mediaTypeFilter === 'image'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Photos
            </button>
            <button
              type="button"
              onClick={() => setMediaTypeFilter('video')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                mediaTypeFilter === 'video'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              4K Videos
            </button>
            <button
              type="button"
              onClick={() => setMediaTypeFilter('vector')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                mediaTypeFilter === 'vector'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Vectors (EPS)
            </button>
          </div>

          {/* Platform Filter via official Shadcn Select */}
          <Select
            value={platformFilter}
            onValueChange={(val) => setPlatformFilter(val as SupportedPlatform | 'all')}
          >
            <SelectTrigger className="h-8 text-xs bg-secondary/50 border-border text-foreground w-[140px]">
              <SelectValue placeholder="All Agencies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Agencies</SelectItem>
              {ALL_PLATFORMS.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {DEFAULT_PLATFORM_LIMITS[p].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter via official Shadcn Select */}
          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as PlatformUploadStatus | 'all')}
          >
            <SelectTrigger className="h-8 text-xs bg-secondary/50 border-border text-foreground w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
              <SelectItem value="not_uploaded" className="text-xs">Missing / Not Uploaded</SelectItem>
              <SelectItem value="uploaded" className="text-xs">Uploaded ✓</SelectItem>
              <SelectItem value="pending_review" className="text-xs">Pending Review ⏳</SelectItem>
              <SelectItem value="approved" className="text-xs">Approved ★</SelectItem>
              <SelectItem value="rejected" className="text-xs">Rejected ⊘</SelectItem>
            </SelectContent>
          </Select>

          {/* Active Filter Clear Tag */}
          {(platformFilter !== 'all' || statusFilter !== 'all' || mediaTypeFilter !== 'all' || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPlatformFilter('all');
                setStatusFilter('all');
                setMediaTypeFilter('all');
                setSearchQuery('');
              }}
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* Assets Count Header & Select All */}
      <div className="flex items-center justify-between px-1 text-xs">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSelectAll(filteredRecords)}
            className="h-6 text-[11px] px-2 cursor-pointer"
          >
            {selectedIds.size === filteredRecords.length && filteredRecords.length > 0
              ? 'Deselect All'
              : `Select All (${filteredRecords.length})`}
          </Button>

          <span className="text-muted-foreground font-mono">
            Showing <strong className="text-foreground">{filteredRecords.length}</strong> of{' '}
            {records.length} assets
          </span>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Tip: Click any status pill to toggle • Right-click for options
        </div>
      </div>

      {/* Asset List Rows */}
      <div className="space-y-2">
        {filteredRecords.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground text-xs space-y-3">
              <UploadCloud className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="font-semibold text-foreground text-sm">
                {records.length === 0 ? 'No assets in Tracker yet' : 'No assets match the current filters'}
              </p>
              <p className="max-w-md mx-auto text-muted-foreground leading-relaxed">
                {records.length === 0
                  ? 'Import your local 4K photos, videos, or EPS vectors, or click "Sync from Studio" to track which files were uploaded to Adobe, Freepik, Shutterstock, Vecteezy, and Dreamstime.'
                  : 'Try resetting your platform or status filters above to see more assets.'}
              </p>
              {records.length === 0 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSyncFromStudio}
                    className="gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Sync from Studio
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => folderInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Import Folder
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredRecords.map((record) => (
            <TrackerRow
              key={record.id}
              record={record}
              isSelected={selectedIds.has(record.id)}
              onToggleSelect={handleToggleSelect}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onMarkAll={handleMarkAllPlatforms}
            />
          ))
        )}
      </div>

      {/* Delete Confirmation via official Shadcn ConfirmDialog */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete Selected Assets"
        description={`Are you sure you want to delete ${selectedIds.size} assets from the tracker? This action cannot be undone.`}
        confirmText="Delete Assets"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />

      {/* Notification Alert via official Shadcn ConfirmDialog */}
      <ConfirmDialog
        open={!!noticeDialog}
        onOpenChange={(open) => !open && setNoticeDialog(null)}
        title={noticeDialog?.title || 'Notification'}
        description={noticeDialog?.message || ''}
        confirmText="OK"
        hideCancel
        onConfirm={() => setNoticeDialog(null)}
      />
    </div>
  );
};
