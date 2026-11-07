import React, { useEffect, useRef, useState, useMemo } from 'react';
import { db, useSqliteQuery } from '../../db';
import { ftp123rfService } from '../../services/ftp/Ftp123RFService';
import {
  AGENCY_FTP_SERVER_SPECS,
  formatBytes,
  formatEta,
  formatSpeed,
  FtpSupportedAgencyId,
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
  Coffee,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  FileVideo,
  FolderOpen,
  FolderUp,
  Layers,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const SUPPORTED_AGENCIES: { id: FtpSupportedAgencyId; label: string }[] = [
  { id: 'dreamstime', label: 'Dreamstime' },
  { id: '123rf', label: '123RF' },
  { id: 'freepik', label: 'Freepik' },
  { id: 'magnific', label: 'Magnific' },
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
    const sync = () => {
      setQueue([...ftp123rfService.getQueue()]);
      setTelemetry({ ...ftp123rfService.getTelemetry() });
      setBatchIsAi(ftp123rfService.getBatchIsAiGenerated());
    };
    const unsub = ftp123rfService.subscribe(sync);
    return () => unsub();
  }, []);

  const handleBatchAiToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setBatchIsAi(checked);
    ftp123rfService.setBatchAiGenerated(checked);
  };

  const handleAddRawFiles = async (files: File[]) => {
    if (!files.length) return;
    await ftp123rfService.addFiles(files);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleAddRawFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleSelectFolder = async () => {
    try {
      if ((window as any).electronAPI?.ftp?.selectFolder) {
        const folderFiles = await (window as any).electronAPI.ftp.selectFolder();
        if (folderFiles && folderFiles.length > 0) {
          await ftp123rfService.addNativeFiles(folderFiles);
        }
      }
    } catch (err) {
      console.error('Folder selection error:', err);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleAddRawFiles(Array.from(e.dataTransfer.files));
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
        password: password || undefined,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || (isAr ? 'خطأ في الاتصال' : 'Connection error') });
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
      className="w-full flex-1 min-h-0 h-full flex flex-col gap-2.5 overflow-hidden select-none"
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
        accept="image/*,video/*,.eps,.ai,.svg,.csv"
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Clean Header Bar matching EpsConverterView & FileCleanerView */}
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
                ? `${storedProfile.username}@${agencySpec.host}`
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

      {/* Minimalist Toolbar & Subtle 123RF AI-Generated Batch Checkbox (Shown when queue has items) */}
      {queue.length > 0 && (
        <div className="shrink-0 px-3.5 py-2 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {is123Rf && (
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
            )}

            <div className={`flex items-center gap-1.5 ${is123Rf ? 'border-l border-border pl-3' : ''}`}>
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
          </div>

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
        </div>
      )}

      {/* Main Dropzone or Queue Workspace */}
      {queue.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition space-y-3 bg-card ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center mx-auto border border-border">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {isAr
                ? `اسحب الملفات أو المجلدات هنا لرفعها إلى ${agencySpec.name}`
                : `Drop files or folders here to upload to ${agencySpec.name}`}
            </h3>
          </div>
          {is123Rf && (
            <div className="flex items-center justify-center pt-0.5">
              <label className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-secondary/50 border border-border/80 text-xs text-muted-foreground hover:text-foreground transition cursor-pointer select-none">
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
            </div>
          )}
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
              <FolderUp className="w-3.5 h-3.5" />
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
              const isCsv = item.filename.toLowerCase().endsWith('.csv');

              return (
                <div
                  key={item.id}
                  className="p-2.5 rounded-lg border border-border bg-card hover:bg-secondary/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-md bg-secondary border border-border shrink-0 overflow-hidden flex items-center justify-center">
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                      ) : isCsv ? (
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
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
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground border border-border">
                          Folder: {item.remoteFolder}
                        </span>
                        {item.isVectorBundle && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Non-AI Vector
                          </span>
                        )}
                        {item.isAiGenerated && !item.isVectorBundle && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            AI-Generated
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 font-mono">
                        <span>{formatBytes(item.fileSize)}</span>
                        <span>·</span>
                        <span>{item.host}</span>
                        {item.status === 'uploading' && (
                          <>
                            <span>·</span>
                            <span className="text-primary font-semibold">{item.progressPercent}%</span>
                          </>
                        )}
                        {item.status === 'failed' && (
                          <>
                            <span>·</span>
                            <span className="text-destructive font-semibold">
                              {item.errorMessage || (isAr ? 'فشل الرفع' : 'Failed')}
                            </span>
                          </>
                        )}
                      </div>

                      {item.isVectorBundle && item.jpgPart && item.epsPart && (
                        <div className="mt-1.5 pt-1.5 border-t border-border/50 text-[10px] font-mono text-muted-foreground flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            Step 1: {item.jpgPart.filename}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary-foreground/40" />
                            Step 2: {item.epsPart.filename}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        item.status === 'succeeded'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : item.status === 'failed'
                          ? 'bg-destructive/15 text-destructive'
                          : item.status === 'uploading'
                          ? 'bg-primary/15 text-primary'
                          : item.status === 'retrying'
                          ? 'bg-amber-500/15 text-amber-500'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {item.status.toUpperCase()}
                      {item.retryCount > 0 && ` (${item.retryCount}/${item.maxRetries})`}
                    </span>

                    <button
                      type="button"
                      disabled={telemetry.isRunning && item.status === 'uploading'}
                      onClick={() => ftp123rfService.removeItem(item.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Action Bar */}
          <div className="shrink-0 p-3 bg-card border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 gap-1.5 text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة ملفات' : 'Add Files'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectFolder}
                className="h-8 gap-1.5 text-xs cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة مجلد' : 'Add Folder'}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => ftp123rfService.clearQueue()}
                disabled={telemetry.isRunning}
                className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'مسح الكل' : 'Clear All'}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {telemetry.isRunning ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (telemetry.isPaused) ftp123rfService.resume();
                      else ftp123rfService.pause();
                    }}
                    className="h-8 gap-1.5 text-xs cursor-pointer"
                  >
                    {telemetry.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    <span>
                      {telemetry.isPaused ? (isAr ? 'استئناف' : 'Resume') : isAr ? 'إيقاف مؤقت' : 'Pause'}
                    </span>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => ftp123rfService.abort()}
                    className="h-8 gap-1.5 text-xs cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إلغاء العملية' : 'Abort'}</span>
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => ftp123rfService.startUpload()}
                  disabled={queue.length === 0}
                  className="h-8 gap-1.5 text-xs font-semibold bg-primary text-primary-foreground cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>
                    {isAr
                      ? `بدء الرفع إلى ${agencySpec.name} (${queue.length})`
                      : `Start Upload to ${agencySpec.name} (${queue.length})`}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connection Dialog (Locked-down Host, Clean Domain, Hidden Port & Protocol) */}
      <DialogRoot open={isCredsOpen} onOpenChange={setIsCredsOpen}>
        <DialogContent className="fixed inset-0 m-auto h-fit max-h-[90vh] sm:max-w-md" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader className={isAr ? 'pe-2 ps-8' : 'pe-8 ps-2'}>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              {getPlatformLogo(selectedAgency, 18)}
              <span>
                {isAr
                  ? `إعدادات اتصال ${agencySpec.name}`
                  : `${agencySpec.name} Connection Settings`}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {/* Host Field - Locked down across all agencies */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center gap-1.5">
                <span>{isAr ? 'الخادم' : 'Host'}</span>
                {isAr && (
                  <span className="text-muted-foreground font-mono text-[11px]" dir="ltr">
                    (Host)
                  </span>
                )}
              </label>
              <Input
                data-testid="123rf-host-readonly-input"
                type="text"
                dir="ltr"
                value={agencySpec.host}
                readOnly
                disabled
                className="h-9 text-xs font-mono bg-muted/50 cursor-not-allowed select-all opacity-80"
              />
            </div>

            {/* Username / Account ID Field */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center gap-1.5">
                <span>{isAr ? 'اسم المستخدم' : 'Username'}</span>
                {isAr && (
                  <span className="text-muted-foreground font-mono text-[11px]" dir="ltr">
                    (Username)
                  </span>
                )}
              </label>
              <Input
                type="text"
                dir="ltr"
                placeholder={isAr ? 'اسم المستخدم' : 'Contributor username'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-medium text-foreground flex items-center gap-1.5">
                  <span>{isAr ? 'كلمة المرور' : 'Password'}</span>
                  {isAr && (
                    <span className="text-muted-foreground font-mono text-[11px]" dir="ltr">
                      (Password)
                    </span>
                  )}
                </label>
                {storedProfile?.hasSavedPassword && (
                  <span className="text-[11px] text-emerald-400 font-medium">
                    {isAr ? 'محفوظة في الخزنة' : 'Saved in Vault'}
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  placeholder={storedProfile?.hasSavedPassword ? '••••••••••••' : (isAr ? 'أدخل كلمة المرور' : 'Enter password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`h-9 text-xs font-mono ${isAr ? 'pl-8' : 'pr-8'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer ${
                    isAr ? 'left-2.5' : 'right-2.5'
                  }`}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
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
              className="h-8 text-xs gap-1.5 cursor-pointer"
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
                className="h-8 text-xs cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveCredentials}
                disabled={!username}
                className="h-8 text-xs bg-primary text-primary-foreground font-semibold cursor-pointer"
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
