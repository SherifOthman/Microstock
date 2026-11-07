import React, { useEffect, useRef, useState } from 'react';
import { db, useSqliteQuery } from '../../db';
import {
  FtpQueueItem,
  FtpTelemetryFrame,
} from '../../services/ftp/dreamstimeFtpRouter';
import { dreamstimeFtpService } from '../../services/ftp/ftpClientService';
import { Button } from '../../components/ui/button';
import { Play, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { OneTwoThreeRfFtpUploaderView } from './OneTwoThreeRfFtpUploaderView';
import { FtpSupportedAgencyId } from '../../services/ftp/oneTwoThreeRfFtpRouter';
import {
  extractFilesFromDataTransfer,
  formatElapsedMmSs,
  FtpCompletionAlertBar,
  FtpEmptyDropzone,
  FtpMediaLightboxModal,
  FtpProgressAndControlsBar,
  FtpQueueTableWorkspace,
  FtpSiteSettingsModal,
  FtpTopHeaderBar,
  QueueSubTab,
  UnifiedFtpItemView,
  useFtpTelemetryMath,
} from './components/FtpSharedComponents';

export { formatElapsedMmSs, useFtpTelemetryMath };

export const FtpUploaderView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [selectedAgency, setSelectedAgency] = useState<FtpSupportedAgencyId>(() => {
    try {
      return (localStorage.getItem('stock_ftp_agency') as FtpSupportedAgencyId) || 'dreamstime';
    } catch {
      return 'dreamstime';
    }
  });

  const handleAgencyChange = (agency: FtpSupportedAgencyId) => {
    setSelectedAgency(agency);
    try {
      localStorage.setItem('stock_ftp_agency', agency);
    } catch {}
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [queue, setQueue] = useState<FtpQueueItem[]>(() => dreamstimeFtpService.getQueue());
  const [telemetry, setTelemetry] = useState<FtpTelemetryFrame>(() =>
    dreamstimeFtpService.getTelemetry()
  );
  const [activeSubTab, setActiveSubTab] = useState<QueueSubTab>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewModalItem, setPreviewModalItem] = useState<UnifiedFtpItemView | null>(null);
  const [hasRecoverableSession, setHasRecoverableSession] = useState<boolean>(() =>
    dreamstimeFtpService.getHasRecoverableSession()
  );

  const storedProfile = useSqliteQuery(() => db.ftp.getProfile('dreamstime'), [], undefined, ['ftp']);

  const [host, setHost] = useState('upload.dreamstime.com');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [vaultStatus, setVaultStatus] = useState<{
    type: 'idle' | 'saving' | 'testing' | 'ok' | 'error';
    message?: string;
  }>({ type: 'idle' });

  useEffect(() => {
    const sync = () => {
      setQueue([...dreamstimeFtpService.getQueue()]);
      setTelemetry({ ...dreamstimeFtpService.getTelemetry() });
      setHasRecoverableSession(dreamstimeFtpService.getHasRecoverableSession());
    };
    const unsub = dreamstimeFtpService.subscribe(sync);

    if (dreamstimeFtpService.getQueue().length === 0) {
      dreamstimeFtpService.hydrateFromDisk().catch(() => {});
    }

    return () => unsub();
  }, []);

  useEffect(() => {
    if (storedProfile) {
      setHost(storedProfile.host || 'upload.dreamstime.com');
      if (storedProfile.username) {
        setUsername(storedProfile.username);
      }
      if (storedProfile.hasSavedPassword && !password) {
        setPassword('••••••••••••');
      }
    }
  }, [storedProfile?.updatedAt]);

  const handleSaveCredentials = async () => {
    setVaultStatus({
      type: 'testing',
      message: isAr ? 'جارٍ اختبار الاتصال وحفظ البيانات...' : 'Testing connection & saving...',
    });
    try {
      const cleanHost = host.trim() || 'upload.dreamstime.com';
      const cleanUsername = username.trim();
      const passToSend = password === '••••••••••••' ? undefined : password;

      const testRes = await dreamstimeFtpService.testDreamstimeConnection({
        protocol: 'ftp',
        host: cleanHost,
        port: 21,
        username: cleanUsername,
        password: passToSend,
      });

      if (!testRes.success) {
        setVaultStatus({
          type: 'error',
          message: testRes.error || (isAr ? 'فشل الاتصال بخادم FTP' : 'Connection failed'),
        });
        return;
      }

      await dreamstimeFtpService.saveDreamstimeCredentials({
        protocol: 'ftp',
        host: cleanHost,
        port: 21,
        username: cleanUsername,
        password: passToSend,
        passiveMode: true,
      });

      setVaultStatus({
        type: 'ok',
        message: isAr ? 'تم الاتصال وحفظ البيانات بنجاح' : 'Connected & Saved Successfully',
      });

      setTimeout(() => {
        setIsSettingsOpen(false);
      }, 600);
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || (isAr ? 'فشل الحفظ' : 'Failed to save credentials'),
      });
    }
  };

  const handleTestConnection = async () => {
    setVaultStatus({
      type: 'testing',
      message: isAr ? 'جارٍ اختبار الاتصال...' : 'Testing connection...',
    });
    try {
      const cleanHost = host.trim() || 'upload.dreamstime.com';
      const cleanUsername = username.trim();
      const passToSend = password === '••••••••••••' ? undefined : password;

      const res = await dreamstimeFtpService.testDreamstimeConnection({
        protocol: 'ftp',
        host: cleanHost,
        port: 21,
        username: cleanUsername,
        password: passToSend,
      });

      if (res.success) {
        setVaultStatus({
          type: 'ok',
          message: isAr
            ? `متصل بنجاح (${res.latencyMs || 35}ms)`
            : `Connected (${res.latencyMs || 35}ms)`,
        });
      } else {
        setVaultStatus({
          type: 'error',
          message: res.error || (isAr ? 'فشل الاتصال' : 'Connection failed'),
        });
      }
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || (isAr ? 'خطأ في الاتصال' : 'Connection error'),
      });
    }
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    dreamstimeFtpService.addFiles(Array.from(fileList));
  };

  const handleAddFolderClick = async () => {
    if (telemetry.isRunning) return;
    const nativeItems = await dreamstimeFtpService.selectAndAddNativeFolder();
    if (nativeItems === null) {
      folderInputRef.current?.click();
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (!e.dataTransfer) return;
    const files = await extractFilesFromDataTransfer(e.dataTransfer);
    if (files.length > 0) {
      dreamstimeFtpService.addFiles(files);
    }
  };

  const handleClearAll = () => {
    setActiveSubTab('all');
    setPreviewModalItem(null);
    dreamstimeFtpService.clearQueue();
  };

  const handleOpenFileLocation = (localPath?: string) => {
    if (!localPath) return;
    try {
      const electronAPI = (window as any).electronAPI;
      if (typeof electronAPI?.shell?.showItemInFolder === 'function') {
        electronAPI.shell.showItemInFolder(localPath);
      } else if (typeof electronAPI?.showItemInFolder === 'function') {
        electronAPI.showItemInFolder(localPath);
      }
    } catch (err) {
      console.warn('Failed to open file location:', err);
    }
  };

  const {
    elapsedSeconds,
    stableEtaSeconds,
    activeFileNumber,
  } = useFtpTelemetryMath(telemetry);

  if (selectedAgency !== 'dreamstime') {
    return (
      <OneTwoThreeRfFtpUploaderView
        selectedAgency={selectedAgency}
        onSwitchAgency={handleAgencyChange}
      />
    );
  }

  const unifiedQueue: UnifiedFtpItemView[] = queue.map((item) => ({
    id: item.id,
    filename: item.filename,
    displayName: item.displayName || item.filename,
    mediaType: item.mediaType,
    isVectorBundle: item.isVectorBundle,
    remoteFolder: item.remoteFolder,
    remotePath: item.remotePath,
    fileSize: item.fileSize,
    bytesTransferred: item.bytesTransferred,
    progressPercent: item.progressPercent,
    status: item.status,
    retryCount: item.retryCount,
    maxRetries: item.maxRetries,
    errorMessage: item.errorMessage,
    localPath: item.localPath,
    previewUrl: item.previewUrl,
    jpgPart: item.jpgPart
      ? {
          filename: item.jpgPart.filename,
          remoteFolder: item.jpgPart.remoteFolder,
        }
      : undefined,
    epsPart: item.epsPart
      ? {
          filename: item.epsPart.filename,
          remoteFolder: item.epsPart.remoteFolder,
        }
      : undefined,
  }));

  const succeededItems = unifiedQueue.filter((i) => i.status === 'succeeded');
  const failedItems = unifiedQueue.filter((i) => i.status === 'failed');
  const skippedItems = unifiedQueue.filter((i) => i.status === 'skipped');
  const pendingUploadItems = unifiedQueue.filter(
    (i) => i.status === 'queued' || i.status === 'retry' || i.status === 'retrying'
  );
  const isBatchFinished =
    telemetry.totalFiles > 0 &&
    telemetry.completedFiles === telemetry.totalFiles &&
    !telemetry.isRunning;

  const visibleQueue =
    activeSubTab === 'succeeded'
      ? succeededItems
      : activeSubTab === 'failed'
      ? failedItems
      : activeSubTab === 'skipped'
      ? skippedItems
      : unifiedQueue;

  return (
    <div
      data-testid="ftp-uploader-view"
      className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden select-none"
    >
      {/* Hidden File & Folder Pickers */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,.eps,.ai,.svg,.cdr,.mp4,.mov,.webm,.avi,.mkv,.m4v,.csv"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.currentTarget.value = '';
        }}
      />

      {/* Unified Top Header Bar */}
      <FtpTopHeaderBar
        selectedAgency="dreamstime"
        agencyName="Dreamstime"
        agencyHost={storedProfile?.host || 'upload.dreamstime.com'}
        isAr={isAr}
        isRunning={telemetry.isRunning}
        storedUsername={storedProfile?.username}
        hasSavedPassword={storedProfile?.hasSavedPassword}
        onSelectAgency={handleAgencyChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Full-Width Main Workspace */}
      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        {unifiedQueue.length > 0 && (
          <FtpProgressAndControlsBar
            telemetry={telemetry}
            activeFileNumber={activeFileNumber}
            stableEtaSeconds={stableEtaSeconds}
            elapsedSeconds={elapsedSeconds}
            isBatchFinished={isBatchFinished}
            hasSavedPassword={storedProfile?.hasSavedPassword}
            hasRecoverableSession={hasRecoverableSession}
            failedCount={failedItems.length}
            pendingCount={pendingUploadItems.length}
            isAr={isAr}
            onAddFilesClick={() => fileInputRef.current?.click()}
            onAddFolderClick={handleAddFolderClick}
            onRetryFailedClick={() => dreamstimeFtpService.retryAllFailed()}
            onPauseClick={() => dreamstimeFtpService.pauseBatch()}
            onResumeClick={() => dreamstimeFtpService.resumeBatch()}
            onStartUploadClick={() => dreamstimeFtpService.startBatchUpload()}
            onClearAllClick={handleClearAll}
          />
        )}

        {/* Crash Recovery / Interrupted Session Banner */}
        {hasRecoverableSession && !telemetry.isRunning && pendingUploadItems.length > 0 && (
          <div
            data-testid="ftp-crash-recovery-banner"
            className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200"
          >
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="font-semibold">
                {isAr
                  ? `تم استعادة الجلسة المتوقفة في وضع الإيقاف المؤقت — ${pendingUploadItems.length} ملفات جاهزة للاستئناف`
                  : `Interrupted session restored in Paused state — ${pendingUploadItems.length} file(s) ready to resume`}
              </span>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => dreamstimeFtpService.startBatchUpload()}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 cursor-pointer gap-1.5"
            >
              <Play className="w-3 h-3" />
              <span>{isAr ? 'استئناف الآن' : 'Resume Now'}</span>
            </Button>
          </div>
        )}

        {isBatchFinished && unifiedQueue.length > 0 && (
          <FtpCompletionAlertBar
            telemetry={telemetry}
            isAr={isAr}
            onClearAll={handleClearAll}
          />
        )}

        {unifiedQueue.length === 0 ? (
          <FtpEmptyDropzone
            agencyName="Dreamstime"
            isAr={isAr}
            isDraggingOver={isDraggingOver}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            onAddFilesClick={() => fileInputRef.current?.click()}
            onAddFolderClick={handleAddFolderClick}
          />
        ) : (
          <FtpQueueTableWorkspace
            agencyId="dreamstime"
            agencyName="Dreamstime"
            queue={unifiedQueue}
            visibleQueue={visibleQueue}
            succeededCount={succeededItems.length}
            failedCount={failedItems.length}
            skippedCount={skippedItems.length}
            activeSubTab={activeSubTab}
            onSelectSubTab={setActiveSubTab}
            isDraggingOver={isDraggingOver}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            isRunning={telemetry.isRunning}
            language={language}
            isAr={isAr}
            onPreviewItem={(item) => setPreviewModalItem(item)}
            onRetrySingleItem={(id) => dreamstimeFtpService.retrySingleItem(id)}
            onOpenFileLocation={handleOpenFileLocation}
            onRemoveItem={(id) => dreamstimeFtpService.removeItem(id)}
          />
        )}
      </div>

      {/* Media Lightbox Preview Modal */}
      <FtpMediaLightboxModal
        item={previewModalItem}
        onClose={() => setPreviewModalItem(null)}
        language={language}
        isAr={isAr}
      />

      {/* Unified Site Settings / Connection Modal */}
      <FtpSiteSettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        agencyId="dreamstime"
        agencyName="Dreamstime"
        host="upload.dreamstime.com"
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        hasSavedPassword={storedProfile?.hasSavedPassword}
        vaultStatus={vaultStatus}
        isAr={isAr}
        onTestConnection={handleTestConnection}
        onSaveCredentials={handleSaveCredentials}
      />
    </div>
  );
};
