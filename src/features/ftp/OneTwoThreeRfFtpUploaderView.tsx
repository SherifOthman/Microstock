import React, { useEffect, useRef, useState, useMemo } from 'react';
import { db, useSqliteQuery } from '../../db';
import { ftp123rfService } from '../../services/ftp/Ftp123RFService';
import {
  AGENCY_FTP_SERVER_SPECS,
  formatBytes,
  formatEta,
  formatSpeed,
  FtpSupportedAgencyId,
  ONE_TWO_THREE_RF_FTP_HOST,
  ONE_TWO_THREE_RF_SFTP_HOST,
  OneTwoThreeRfQueueItem,
  OneTwoThreeRfTelemetryFrame,
} from '../../services/ftp/oneTwoThreeRfFtpRouter';
import { Progress } from '../../components/ui/progress';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tooltip } from '../../components/ui/tooltip';
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../components/ui/dialog';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Coffee,
  Eye,
  EyeOff,
  FileImage,
  FileVideo,
  FolderOpen,
  Layers,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const SUPPORTED_AGENCIES: { id: FtpSupportedAgencyId; label: string }[] = [
  { id: 'dreamstime', label: 'Dreamstime' },
  { id: '123rf', label: '123RF' },
  { id: 'vecteezy', label: 'Vecteezy' },
  { id: 'shutterstock', label: 'Shutterstock' },
  { id: 'adobe', label: 'Adobe Stock' },
];

export const OneTwoThreeRfFtpUploaderView: React.FC<{
  selectedAgency?: Exclude<FtpSupportedAgencyId, 'dreamstime'>;
  onSwitchAgency?: (agency: FtpSupportedAgencyId) => void;
}> = ({ selectedAgency = '123rf', onSwitchAgency }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [queue, setQueue] = useState<OneTwoThreeRfQueueItem[]>(() => ftp123rfService.getQueue());
  const [telemetry, setTelemetry] = useState<OneTwoThreeRfTelemetryFrame>(() =>
    ftp123rfService.getTelemetry()
  );
  const [batchIsAi, setBatchIsAi] = useState<boolean>(() => ftp123rfService.getBatchIsAiGenerated());
  const [filterType, setFilterType] = useState<'all' | 'image' | 'vector' | 'video'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Credentials dialog state
  const [isCredsOpen, setIsCredsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const agencySpec = AGENCY_FTP_SERVER_SPECS[selectedAgency] || AGENCY_FTP_SERVER_SPECS['123rf'];
  const is123Rf = selectedAgency === '123rf';

  useEffect(() => {
    if (ftp123rfService.getActiveAgency() !== selectedAgency) {
      ftp123rfService.setActiveAgency(selectedAgency);
    }
  }, [selectedAgency]);

  // Load saved credentials from SQLite for the active agency
  const storedProfile = useSqliteQuery(
    async () => {
      try {
        if (db.ftp?.getProfile) {
          return await db.ftp.getProfile(selectedAgency as any);
        }
      } catch {}
      return null;
    },
    [selectedAgency],
    null,
    ['ftp']
  );

  useEffect(() => {
    if (storedProfile) {
      setUsername(storedProfile.username || '');
    } else {
      setUsername('');
    }
  }, [storedProfile, selectedAgency]);

  // Subscribe to FTP Service updates
  useEffect(() => {
    const unsub = ftp123rfService.subscribe(() => {
      setQueue(ftp123rfService.getQueue());
      setTelemetry(ftp123rfService.getTelemetry());
      setBatchIsAi(ftp123rfService.getBatchIsAiGenerated());
    });
    return () => unsub();
  }, []);

  const handleBatchAiToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setBatchIsAi(checked);
    ftp123rfService.setBatchAiGenerated(checked);
  };

  const handleItemAiToggle = (id: string, current: boolean) => {
    ftp123rfService.setItemAiGenerated(id, !current);
  };

  const handleFilesAdded = async (files: File[]) => {
    if (files.length === 0) return;
    await ftp123rfService.addFiles(files, selectedAgency);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFilesAdded(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFilesAdded(Array.from(e.dataTransfer.files));
    }
  };

  const handleSelectFolder = async () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.selectFolderFiles) {
      try {
        const res = await (window as any).electronAPI.ftp.selectFolderFiles();
        if (!res.canceled && res.files && res.files.length > 0) {
          await ftp123rfService.addNativeFiles(res.files, selectedAgency);
        }
      } catch (err) {
        console.error('Failed to select folder:', err);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await ftp123rfService.testConnection({
        agencyId: selectedAgency,
        host: agencySpec.host,
        port: agencySpec.port,
        protocol: agencySpec.protocol,
        username,
        password,
      });
      if (res.success) {
        setTestResult({
          success: true,
          message: isAr
            ? `تم الاتصال بنجاح بـ ${agencySpec.name} (${res.latencyMs || 120}ms)`
            : `Connected to ${agencySpec.name} (${res.latencyMs || 120}ms)`,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || (isAr ? 'فشل الاتصال بالخادم' : 'Connection failed'),
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Connection error' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCredentials = async () => {
    await ftp123rfService.saveCredentials({
      agencyId: selectedAgency,
      host: agencySpec.host,
      port: agencySpec.port,
      protocol: agencySpec.protocol,
      username,
      password,
    });
    setIsCredsOpen(false);
    setTestResult(null);
  };

  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      if (filterType !== 'all' && item.mediaType !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.filename.toLowerCase().includes(q) ||
          item.stemName.toLowerCase().includes(q) ||
          item.remoteFolder.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [queue, filterType, searchQuery]);

  const vectorCount = useMemo(() => queue.filter((q) => q.mediaType === 'vector').length, [queue]);
  const photoCount = useMemo(() => queue.filter((q) => q.mediaType === 'image').length, [queue]);
  const videoCount = useMemo(() => queue.filter((q) => q.mediaType === 'video').length, [queue]);

  return (
    <div
      className="flex flex-col h-full gap-3 min-h-0 select-none"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.eps,.ai,.svg"
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Clean Minimalist Header Bar matching Dreamstime & EPS Engine */}
      <div className="shrink-0 h-12 px-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {getPlatformLogo(selectedAgency, 18)}
          <h1 className="text-sm font-bold tracking-tight text-foreground truncate whitespace-nowrap">
            {isAr ? `رافع خادم ${agencySpec.name}` : `${agencySpec.name} FTP Uploader`}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onSwitchAgency && (
            <div className="flex items-center p-0.5 rounded-lg bg-secondary border border-border text-xs">
              {SUPPORTED_AGENCIES.map((agency) => {
                const isActive = agency.id === selectedAgency;
                return (
                  <button
                    key={agency.id}
                    type="button"
                    onClick={() => onSwitchAgency(agency.id)}
                    className={`px-2 py-1 rounded-md transition flex items-center gap-1.5 ${
                      isActive
                        ? 'font-bold bg-card text-foreground shadow-xs cursor-default'
                        : 'text-muted-foreground hover:text-foreground cursor-pointer font-medium'
                    }`}
                  >
                    {getPlatformLogo(agency.id, 13)}
                    <span className="hidden md:inline">{agency.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {telemetry.isRunning && (
            <Tooltip content={isAr ? 'حماية الجهاز من السكون نشطة' : 'Keep-awake active while uploading'}>
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                <Coffee className="w-3.5 h-3.5" />
              </div>
            </Tooltip>
          )}

          <Tooltip
            content={
              storedProfile?.username
                ? is123Rf
                  ? `${storedProfile.username}@${ONE_TWO_THREE_RF_FTP_HOST}:21 / ${ONE_TWO_THREE_RF_SFTP_HOST}:2022`
                  : `${storedProfile.username}@${agencySpec.host}:${agencySpec.port} (${agencySpec.protocol.toUpperCase()})`
                : isAr
                ? 'غير متصل - يرجى حفظ بيانات الدخول'
                : 'Offline - Please configure credentials'
            }
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/50 border border-border text-xs font-medium cursor-help">
              <span
                className={`w-2 h-2 rounded-full ${
                  storedProfile?.hasSavedPassword ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-mono text-[11px] hidden sm:inline">
                {storedProfile?.username || (isAr ? 'غير متصل' : 'Offline')}
              </span>
            </div>
          </Tooltip>

          <Button
            data-testid="123rf-credentials-button"
            variant="outline"
            size="sm"
            onClick={() => setIsCredsOpen(true)}
            className="h-8 gap-1.5 text-xs cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">{isAr ? 'إعدادات الموقع' : 'Site Settings'}</span>
          </Button>
        </div>
      </div>

      {/* Minimalist Toolbar & Subtle 123RF AI-Generated Batch Checkbox */}
      <div className="shrink-0 px-3.5 py-2 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {is123Rf ? (
            <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="batch-ai-toggle"
                checked={batchIsAi}
                onChange={handleBatchAiToggle}
                className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
              />
              <span className="font-medium">
                {isAr ? 'دفعة مولدة بالذكاء الاصطناعي (AI-Generated Batch)' : 'AI-Generated Batch'}
              </span>
            </label>
          ) : (
            <span className="text-xs font-mono text-muted-foreground">
              {agencySpec.host}:{agencySpec.port} ({agencySpec.protocol.toUpperCase()} → /)
            </span>
          )}

          {queue.length > 0 && (
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="h-7 px-2.5 gap-1.5 text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة ملفات' : 'Add Files'}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSelectFolder}
                className="h-7 px-2.5 gap-1.5 text-xs cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة مجلد' : 'Add Folder'}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => ftp123rfService.clearQueue()}
                disabled={telemetry.isRunning}
                className="h-7 px-2 text-xs text-destructive hover:text-destructive cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                <span>{isAr ? 'مسح الكل' : 'Clear All'}</span>
              </Button>
            </div>
          )}
        </div>

        {queue.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative w-36 sm:w-44">
              <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={isAr ? 'بحث...' : 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-8 rtl:pl-3 rtl:pr-8 bg-secondary/40"
              />
            </div>

            <div className="flex items-center p-0.5 rounded-lg bg-secondary border border-border text-xs">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'all' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {isAr ? 'الكل' : 'All'} ({queue.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('image')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'image' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {isAr ? 'صور' : 'Photos'} ({photoCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('vector')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'vector' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {isAr ? 'فيكتور' : 'Vectors'} ({vectorCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('video')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'video' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {isAr ? 'فيديو' : 'Videos'} ({videoCount})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Dropzone or Queue Workspace */}
      {queue.length === 0 ? (
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center transition space-y-3 bg-card ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center mx-auto border border-border">
            <CloudUpload className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {isAr
                ? `اسحب الملفات أو المجلدات هنا للرفع إلى ${agencySpec.name}`
                : `Drop files or folders here to upload to ${agencySpec.name}`}
            </h3>
            <p dir="ltr" className="text-xs text-muted-foreground font-mono">
              .jpg · .eps + .jpg · .mp4 · .mov
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة ملفات' : 'Add Files'}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSelectFolder}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة مجلد' : 'Add Folder'}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          {telemetry.isRunning && (
            <div className="shrink-0 p-3 bg-secondary/20 border-b border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{telemetry.statusMessage}</span>
                <div className="flex items-center gap-3 text-muted-foreground font-mono text-[11px]">
                  <span>{formatSpeed(telemetry.speedBytesPerSec)}</span>
                  <span>ETA: {formatEta(telemetry.etaSeconds)}</span>
                  <span className="font-bold text-foreground">
                    {telemetry.completedFiles}/{telemetry.totalFiles} ({telemetry.batchPercent}%)
                  </span>
                </div>
              </div>
              <Progress value={telemetry.batchPercent} className="h-2" />
            </div>
          )}

          {/* File Queue List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {filteredQueue.map((item) => {
              const isVector = item.mediaType === 'vector';
              const isVideo = item.mediaType === 'video';

              return (
                <div
                  key={item.id}
                  className="p-2.5 rounded-lg border border-border bg-card hover:bg-secondary/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-md bg-secondary border border-border shrink-0 overflow-hidden flex items-center justify-center">
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                      ) : isVector ? (
                        <Layers className="w-4 h-4 text-amber-500" />
                      ) : isVideo ? (
                        <FileVideo className="w-4 h-4 text-purple-500" />
                      ) : (
                        <FileImage className="w-4 h-4 text-sky-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate max-w-[260px]">
                          {item.filename}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                          {item.protocol.toUpperCase()}:{item.port}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground border border-border">
                          Folder: {item.remoteFolder}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 font-mono">
                        <span>{formatBytes(item.fileSize)}</span>
                        <span>·</span>
                        <span>{item.host}</span>
                        {item.status === 'uploading' && (
                          <>
                            <span>·</span>
                            <span className="font-bold text-primary">
                              {item.progressPercent}% ({formatBytes(item.bytesTransferred)})
                            </span>
                          </>
                        )}
                        {item.errorMessage && (
                          <>
                            <span>·</span>
                            <span className="text-destructive font-sans truncate max-w-[200px]">
                              {item.errorMessage}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                    {is123Rf &&
                      (isVector ? (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground px-2 py-0.5 rounded bg-secondary/50 border border-border">
                          <Lock className="w-3 h-3 text-amber-500" />
                          <span>Non-AI Vector</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleItemAiToggle(item.id, item.isAiGenerated)}
                          disabled={telemetry.isRunning}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border transition cursor-pointer ${
                            item.isAiGenerated
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                              : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                          }`}
                        >
                          {item.isAiGenerated ? 'AI' : 'Standard'}
                        </button>
                      ))}

                    <span className="text-[11px] font-medium text-muted-foreground">
                      {item.status === 'succeeded' && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {isAr ? 'تم الرفع' : 'Uploaded'}
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="w-3.5 h-3.5" />
                          {isAr ? 'فشل' : 'Failed'}
                        </span>
                      )}
                      {item.status === 'skipped' && (isAr ? 'تم التخطي' : 'Skipped')}
                      {item.status === 'uploading' && (isAr ? 'جاري الرفع...' : 'Uploading...')}
                      {item.status === 'queued' && (isAr ? 'في الانتظار' : 'Queued')}
                    </span>

                    {!telemetry.isRunning && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => ftp123rfService.removeItem(item.id)}
                        className="w-7 h-7 text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Execution Bar */}
          <div className="shrink-0 p-3 border-t border-border bg-card flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span>
                {queue.length} {isAr ? 'ملف' : 'files'}
              </span>
              <span>·</span>
              <span>{formatBytes(telemetry.batchTotalBytes)}</span>
            </div>

            <div className="flex items-center gap-2">
              {telemetry.isRunning ? (
                <>
                  {telemetry.isPaused ? (
                    <Button
                      size="sm"
                      onClick={() => ftp123rfService.resume()}
                      className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isAr ? 'استئناف' : 'Resume'}</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ftp123rfService.pause()}
                      className="h-8 gap-1.5 text-xs cursor-pointer"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>{isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => ftp123rfService.abort()}
                    className="h-8 gap-1.5 text-xs cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إلغاء' : 'Abort'}</span>
                  </Button>
                </>
              ) : (
                <Button
                  data-testid="start-123rf-upload-btn"
                  size="sm"
                  onClick={() => ftp123rfService.startUpload()}
                  disabled={queue.length === 0}
                  className="h-8 gap-1.5 text-xs font-semibold cursor-pointer"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>
                    {isAr
                      ? `بدء الرفع إلى ${agencySpec.name} (${queue.length})`
                      : `Upload to ${agencySpec.name} (${queue.length})`}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      <DialogRoot open={isCredsOpen} onOpenChange={setIsCredsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              {getPlatformLogo(selectedAgency, 20)}
              <span>
                {isAr
                  ? `إعدادات اتصال ${agencySpec.name}`
                  : `${agencySpec.name} Connection Settings`}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded-lg bg-secondary/40 border border-border space-y-1 font-mono text-[11px] text-muted-foreground">
              {is123Rf ? (
                <>
                  <div>Photos & Vectors: ftp.123rf.com (Port 21 FTP)</div>
                  <div>Footage / Videos: footage.ftp.123rf.com (Port 2022 SFTP)</div>
                </>
              ) : (
                <div>
                  Host: {agencySpec.host} (Port {agencySpec.port}{' '}
                  {agencySpec.protocol.toUpperCase()}
                  {agencySpec.explicitTls ? ' Explicit TLS' : ''})
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground">
                {isAr ? 'اسم المستخدم (Username / ID):' : 'Username / ID:'}
              </label>
              <Input
                type="text"
                placeholder="Contributor username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground">
                {isAr ? 'كلمة المرور (Password):' : 'Password:'}
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={storedProfile?.hasSavedPassword ? '••••••••••••' : 'Enter password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 text-xs pr-9 rtl:pr-3 rtl:pl-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    : 'bg-destructive/10 text-destructive border-destructive/30'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting || !username}
              className="text-xs gap-1.5 cursor-pointer"
            >
              {isTesting ? <RefreshCw className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
              <span>
                {isTesting
                  ? isAr
                    ? 'جاري الاختبار...'
                    : 'Testing...'
                  : isAr
                  ? 'اختبار الاتصال'
                  : 'Test Connection'}
              </span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCredsOpen(false)}
                className="text-xs cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveCredentials}
                disabled={!username}
                className="text-xs bg-primary text-primary-foreground cursor-pointer"
              >
                {isAr ? 'حفظ البيانات' : 'Save Credentials'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </div>
  );
};
