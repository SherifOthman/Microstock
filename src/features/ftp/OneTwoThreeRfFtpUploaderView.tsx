import React, { useEffect, useRef, useState, useMemo } from 'react';
import { db, useSqliteQuery } from '../../db';
import {
  ftp123rfService,
  Ftp123RFService,
} from '../../services/ftp/Ftp123RFService';
import {
  formatBytes,
  formatEta,
  formatSpeed,
  ONE_TWO_THREE_RF_FTP_HOST,
  ONE_TWO_THREE_RF_FTP_PORT,
  ONE_TWO_THREE_RF_SFTP_HOST,
  ONE_TWO_THREE_RF_SFTP_PORT,
  OneTwoThreeRfQueueItem,
  OneTwoThreeRfTelemetryFrame,
} from '../../services/ftp/oneTwoThreeRfFtpRouter';
import { Progress } from '../../components/ui/progress';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
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
  Bot,
  CheckCircle2,
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
  RotateCcw,
  Search,
  Server,
  Settings,
  Sparkles,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const OneTwoThreeRfFtpUploaderView: React.FC<{
  onSwitchAgency?: (agency: 'dreamstime' | '123rf') => void;
}> = ({ onSwitchAgency }) => {
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

  // Load saved 123RF credentials from SQLite
  const storedProfile = useSqliteQuery(
    async () => {
      try {
        if (db.ftp?.getProfile) {
          return await db.ftp.getProfile('123rf');
        }
      } catch {}
      return null;
    },
    [],
    null,
    ['ftp']
  );

  useEffect(() => {
    if (storedProfile) {
      setUsername(storedProfile.username || '');
    }
  }, [storedProfile]);

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
    await ftp123rfService.addFiles(files);
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
          await ftp123rfService.addNativeFiles(res.files);
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
      const res = await ftp123rfService.testConnection({ username, password });
      if (res.success) {
        setTestResult({
          success: true,
          message: isAr
            ? `تم الاتصال بنجاح بـ 123RF FTP (${res.latencyMs || 120}ms)`
            : `Successfully connected to 123RF FTP (${res.latencyMs || 120}ms)`,
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
    await ftp123rfService.saveCredentials({ username, password });
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
      className="flex flex-col h-full space-y-3 min-h-0"
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

      {/* Top Header Bar: Agency Switcher + 123RF Logo + Title + Status + Credentials */}
      <div className="shrink-0 h-13 px-4 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          {getPlatformLogo('123rf', 22)}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-foreground truncate whitespace-nowrap">
                {isAr ? 'رافع 123RF FTP / SFTP الديناميكي' : '123RF Dynamic FTP / SFTP Uploader'}
              </h1>
              <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                Multi-Protocol
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              {isAr
                ? 'توجيه تلقائي: صور وفيكتور (FTP:21) | فيديو (SFTP:2022)'
                : 'Auto-Routing: Photos & Vectors (FTP:21) | Videos (SFTP:2022)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onSwitchAgency && (
            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-secondary border border-slate-200 dark:border-border text-xs mr-1 rtl:mr-0 rtl:ml-1">
              <button
                type="button"
                onClick={() => onSwitchAgency('dreamstime')}
                className="px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground transition cursor-pointer flex items-center gap-1.5 font-medium"
              >
                {getPlatformLogo('dreamstime', 14)}
                <span>Dreamstime</span>
              </button>
              <button
                type="button"
                className="px-2.5 py-1 rounded-md font-bold bg-white dark:bg-card text-foreground shadow-xs cursor-default flex items-center gap-1.5 border border-slate-200 dark:border-transparent"
              >
                {getPlatformLogo('123rf', 14)}
                <span>123RF</span>
              </button>
            </div>
          )}

          {/* Sleep Prevention Indicator */}
          {telemetry.isRunning && (
            <Tooltip content={isAr ? 'حماية الجهاز من السكون نشطة' : 'Keep-awake active while uploading'}>
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                <Coffee className="w-3.5 h-3.5 animate-pulse" />
              </div>
            </Tooltip>
          )}

          {/* Connection Status Pill */}
          <Tooltip
            content={
              storedProfile?.username
                ? `${storedProfile.username}@${ONE_TWO_THREE_RF_FTP_HOST}:21 / ${ONE_TWO_THREE_RF_SFTP_HOST}:2022`
                : isAr
                ? 'غير متصل - اضغط على إعدادات الدخول'
                : 'Offline - Please configure credentials'
            }
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-secondary/50 border border-slate-200 dark:border-border text-xs font-medium cursor-help">
              <span
                className={`w-2 h-2 rounded-full ${
                  storedProfile?.hasSavedPassword ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-mono text-[11px] hidden sm:inline">
                {storedProfile?.username || (isAr ? 'غير مسجل' : 'Not logged in')}
              </span>
            </div>
          </Tooltip>

          {/* Settings Button */}
          <Button
            data-testid="123rf-credentials-button"
            variant="outline"
            size="sm"
            onClick={() => setIsCredsOpen(true)}
            className="h-8 gap-1.5 text-xs cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isAr ? 'بيانات الدخول' : 'Credentials'}</span>
          </Button>
        </div>
      </div>

      {/* CORE FEATURE: The 123RF AI Generation Routing Matrix Bar */}
      <div className="shrink-0 p-3.5 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* AI Toggle Control */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="batch-ai-toggle"
                  checked={batchIsAi}
                  onChange={handleBatchAiToggle}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
              </label>

              <div className="flex items-center gap-1.5">
                <Sparkles className={`w-4 h-4 ${batchIsAi ? 'text-amber-500 animate-spin-slow' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-foreground">
                  {isAr ? 'الدفعة مولدة بالذكاء الاصطناعي (AI-Generated)' : 'Batch is AI-Generated'}
                </span>
              </div>
            </div>

            <Badge
              variant={batchIsAi ? 'default' : 'secondary'}
              className={`text-[10px] font-semibold py-0.5 px-2 ${
                batchIsAi ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 dark:bg-secondary dark:text-muted-foreground'
              }`}
            >
              {batchIsAi ? (isAr ? 'نشط: مسارات AI' : 'Active: AI Folders') : (isAr ? 'غير نشط: مسارات أصلية' : 'Camera / Root Folders')}
            </Badge>
          </div>

          {/* Dynamic Destination Preview Pills */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            {/* Photos Route */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-secondary/40 border border-slate-200 dark:border-border">
              <FileImage className="w-3.5 h-3.5 text-sky-500" />
              <span className="text-muted-foreground">Photos (FTP:21):</span>
              <span className={`font-bold ${batchIsAi ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'}`}>
                {batchIsAi ? '/ai_image/' : '/ (root)'}
              </span>
            </div>

            {/* Videos Route */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-secondary/40 border border-slate-200 dark:border-border">
              <FileVideo className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-muted-foreground">Videos (SFTP:2022):</span>
              <span className={`font-bold ${batchIsAi ? 'text-purple-600 dark:text-purple-400' : 'text-slate-700 dark:text-slate-300'}`}>
                {batchIsAi ? '/ai_video/' : '/ (root)'}
              </span>
            </div>

            {/* Vectors Route (Strictly /vector/ - AI forbidden) */}
            <Tooltip
              content={
                isAr
                  ? 'يمنع 123RF رفع فيكتور مولد بالذكاء الاصطناعي نهائياً. يتم توجيه الفيكتور دائماً إلى /vector/'
                  : '123RF strictly forbids AI-generated vectors. Vector pairs always route to /vector/'
              }
            >
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 cursor-help">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>Vectors (FTP:21):</span>
                <span className="font-bold underline decoration-dotted">/vector/</span>
                <Lock className="w-3 h-3 text-amber-500" />
              </div>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Main Content Area: Queue List & Execution Control */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-xs overflow-hidden">
        {/* Actions Bar & Queue Filter */}
        <div className="shrink-0 p-3 border-b border-slate-200 dark:border-border flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-card">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSelectFolder}
              className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground cursor-pointer shadow-xs"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة مجلد...' : 'Add Folder...'}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة ملفات' : 'Add Files'}</span>
            </Button>

            {queue.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => ftp123rfService.clearQueue()}
                disabled={telemetry.isRunning}
                className="h-8 text-xs text-destructive hover:text-destructive cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                <span>{isAr ? 'مسح القائمة' : 'Clear Queue'}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative w-36 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-2.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder={isAr ? 'بحث...' : 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8 rtl:pl-3 rtl:pr-8 bg-white dark:bg-secondary/40"
              />
            </div>

            {/* Media Filter Tabs */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-secondary border border-slate-200 dark:border-border text-xs">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'all' ? 'bg-white dark:bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {isAr ? 'الكل' : 'All'} ({queue.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('image')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'image' ? 'bg-white dark:bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {isAr ? 'صور' : 'Photos'} ({photoCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('vector')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'vector' ? 'bg-white dark:bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {isAr ? 'فيكتور' : 'Vectors'} ({vectorCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('video')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'video' ? 'bg-white dark:bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {isAr ? 'فيديو' : 'Videos'} ({videoCount})
              </button>
            </div>
          </div>
        </div>

        {/* Global Progress Bar when Running */}
        {telemetry.isRunning && (
          <div className="shrink-0 p-3 bg-slate-50 dark:bg-secondary/20 border-b border-slate-200 dark:border-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {telemetry.statusMessage}
                </span>
                {telemetry.activeRetryAttempt > 0 && (
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">
                    Retry #{telemetry.activeRetryAttempt}
                  </Badge>
                )}
              </div>

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
          {filteredQueue.length === 0 ? (
            <div
              className={`h-full min-h-[220px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center transition ${
                isDragging ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-border bg-slate-50/50 dark:bg-card'
              }`}
            >
              <UploadCloud className="w-10 h-10 text-muted-foreground mb-3 animate-bounce" />
              <h3 className="text-sm font-semibold text-foreground">
                {isAr ? 'اسحب وأفلت الملفات هنا للرفع على 123RF' : 'Drag & drop media files here to upload to 123RF'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                {isAr
                  ? 'يدعم الصور (.jpg)، حزم الفيكتور (.eps + .jpg)، ومقاطع الفيديو (.mp4). يتم توجيه كل نوع إلى البروتوكول والمجلد الصحيح تلقائياً.'
                  : 'Supports photos (.jpg), vector pairs (.eps + .jpg), and footage (.mp4). Automatically routes to the correct protocol and remote folder.'}
              </p>
              <div className="flex items-center gap-2 mt-4">
                <Button size="sm" onClick={() => fileInputRef.current?.click()} className="cursor-pointer">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {isAr ? 'استعراض الملفات' : 'Browse Files'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleSelectFolder} className="cursor-pointer">
                  <FolderOpen className="w-3.5 h-3.5 mr-1" />
                  {isAr ? 'استعراض مجلد' : 'Browse Folder'}
                </Button>
              </div>
            </div>
          ) : (
            filteredQueue.map((item) => {
              const isVector = item.mediaType === 'vector';
              const isVideo = item.mediaType === 'video';

              return (
                <div
                  key={item.id}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card hover:bg-slate-50/70 dark:hover:bg-secondary/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                >
                  {/* Left: Thumbnail & Name & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Thumbnail preview */}
                    <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-secondary border border-border shrink-0 overflow-hidden flex items-center justify-center">
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                      ) : isVector ? (
                        <Layers className="w-5 h-5 text-amber-500" />
                      ) : isVideo ? (
                        <FileVideo className="w-5 h-5 text-purple-500" />
                      ) : (
                        <FileImage className="w-5 h-5 text-sky-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate max-w-[220px] sm:max-w-[320px]">
                          {item.filename}
                        </span>

                        {/* Vector Pair Indicator */}
                        {item.isVectorBundle && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                            Pair: JPG preview + EPS
                          </Badge>
                        )}

                        {/* Protocol Badge (FTP:21 vs SFTP:2022) */}
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono py-0 px-1.5 ${
                            item.protocol === 'sftp'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 font-bold'
                              : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                          }`}
                        >
                          {item.protocol.toUpperCase()}:{item.port}
                        </Badge>

                        {/* Remote Destination Folder */}
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-mono py-0 px-1.5 ${
                            item.remoteFolder === '/vector'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : item.remoteFolder === '/ai_image' || item.remoteFolder === '/ai_video'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold'
                              : 'bg-slate-100 text-slate-700 dark:bg-secondary dark:text-slate-300'
                          }`}
                        >
                          Folder: {item.remoteFolder}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span>{formatBytes(item.fileSize)}</span>
                        <span>•</span>
                        <span>Host: {item.host}</span>
                        {item.status === 'uploading' && (
                          <>
                            <span>•</span>
                            <span className="font-bold text-primary">
                              {item.progressPercent}% ({formatBytes(item.bytesTransferred)})
                            </span>
                          </>
                        )}
                        {item.errorMessage && (
                          <>
                            <span>•</span>
                            <span className="text-destructive font-medium truncate max-w-[200px]">
                              {item.errorMessage}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: AI Toggle / Locked Indicator & Status & Actions */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    {/* Per-Item AI Toggle (Locked for vectors) */}
                    {isVector ? (
                      <Tooltip content={isAr ? 'الفيكتور محمي: يمنع 123RF توليد الفيكتور بالذكاء الاصطناعي' : 'Vector locked: 123RF strictly forbids AI vectors'}>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground px-2 py-0.5 rounded-md bg-secondary/50 border border-border cursor-not-allowed">
                          <Lock className="w-3 h-3 text-amber-500" />
                          <span className="font-medium text-[10px]">Non-AI Vector</span>
                        </div>
                      </Tooltip>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleItemAiToggle(item.id, item.isAiGenerated)}
                        disabled={telemetry.isRunning}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                          item.isAiGenerated
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : 'bg-slate-100 dark:bg-secondary text-muted-foreground border-border hover:text-foreground'
                        }`}
                      >
                        <Sparkles className={`w-3 h-3 ${item.isAiGenerated ? 'text-amber-500' : 'text-muted-foreground'}`} />
                        <span>{item.isAiGenerated ? 'AI' : 'Standard'}</span>
                      </button>
                    )}

                    {/* Status Badge */}
                    {item.status === 'succeeded' && (
                      <Badge className="bg-emerald-500 text-white gap-1 text-[11px]">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isAr ? 'تم الرفع' : 'Uploaded'}</span>
                      </Badge>
                    )}
                    {item.status === 'failed' && (
                      <Badge variant="destructive" className="gap-1 text-[11px]">
                        <XCircle className="w-3 h-3" />
                        <span>{isAr ? 'فشل' : 'Failed'}</span>
                      </Badge>
                    )}
                    {item.status === 'skipped' && (
                      <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
                        <span>{isAr ? 'تم التخطي' : 'Skipped'}</span>
                      </Badge>
                    )}
                    {item.status === 'uploading' && (
                      <Badge className="bg-primary text-primary-foreground gap-1 text-[11px] animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>{isAr ? 'جاري الرفع...' : 'Uploading...'}</span>
                      </Badge>
                    )}
                    {item.status === 'queued' && (
                      <Badge variant="outline" className="text-muted-foreground text-[11px]">
                        {isAr ? 'في الانتظار' : 'Queued'}
                      </Badge>
                    )}

                    {/* Delete Item */}
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
            })
          )}
        </div>

        {/* Bottom Master Execution Bar */}
        <div className="shrink-0 p-3 border-t border-slate-200 dark:border-border bg-slate-50/70 dark:bg-card flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span>
              {queue.length} {isAr ? 'عنصر في القائمة' : 'items total'}
            </span>
            <span>•</span>
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
                className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>
                  {isAr ? `بدء الرفع إلى 123RF (${queue.length})` : `Upload to 123RF (${queue.length})`}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 123RF Credentials Modal */}
      <DialogRoot open={isCredsOpen} onOpenChange={setIsCredsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              {getPlatformLogo('123rf', 20)}
              <span>{isAr ? 'إعدادات اتصال 123RF FTP / SFTP' : '123RF FTP / SFTP Connection Settings'}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-secondary/40 border border-border space-y-1">
              <div className="font-semibold text-foreground">
                {isAr ? 'المضيف والمنافذ الرسمية لـ 123RF:' : 'Official 123RF Server Hosts & Ports:'}
              </div>
              <ul className="text-muted-foreground list-disc list-inside space-y-0.5 font-mono text-[11px]">
                <li>Photos & Vectors: ftp.123rf.com (Port 21 FTP)</li>
                <li>Footage / Videos: footage.ftp.123rf.com (Port 2022 SFTP)</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground">
                {isAr ? 'اسم المستخدم (Contributor Username / ID):' : 'Contributor Username / ID:'}
              </label>
              <Input
                type="text"
                placeholder="e.g. 123rf_contributor"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground">
                {isAr ? 'كلمة المرور (FTP Password):' : 'FTP / SFTP Password:'}
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={storedProfile?.hasSavedPassword ? '••••••••••••' : 'Enter FTP password'}
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
                {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
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
              {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
              <span>{isTesting ? (isAr ? 'جاري الاختبار...' : 'Testing...') : (isAr ? 'اختبار الاتصال' : 'Test Connection')}</span>
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
