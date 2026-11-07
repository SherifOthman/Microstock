import React, { useEffect, useRef, useState } from 'react';
import { db, useSqliteQuery } from '../../db';
import { ftp123rfService } from '../../services/ftp/Ftp123RFService';
import {
  AGENCY_FTP_SERVER_SPECS,
  FtpSupportedAgencyId,
  OneTwoThreeRfQueueItem,
  OneTwoThreeRfTelemetryFrame,
} from '../../services/ftp/oneTwoThreeRfFtpRouter';
import { Button } from '../../components/ui/button';
import { Play, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  extractFilesFromDataTransfer,
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

export const OneTwoThreeRfFtpUploaderView: React.FC<{
  selectedAgency?: Exclude<FtpSupportedAgencyId, 'dreamstime'>;
  onSwitchAgency?: (agency: FtpSupportedAgencyId) => void;
}> = ({ selectedAgency = '123rf', onSwitchAgency }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [queue, setQueue] = useState<OneTwoThreeRfQueueItem[]>(() =>
    ftp123rfService.getQueue(selectedAgency)
  );
  const [telemetry, setTelemetry] = useState<OneTwoThreeRfTelemetryFrame>(() =>
    ftp123rfService.getTelemetry(selectedAgency)
  );
  const [batchIsAi, setBatchIsAi] = useState<boolean>(() =>
    ftp123rfService.getBatchIsAiGenerated(selectedAgency)
  );
  const [hasRecoverableSession, setHasRecoverableSession] = useState<boolean>(() =>
    ftp123rfService.getHasRecoverableSession(selectedAgency)
  );
  const [activeSubTab, setActiveSubTab] = useState<QueueSubTab>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewModalItem, setPreviewModalItem] = useState<UnifiedFtpItemView | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [vaultStatus, setVaultStatus] = useState<{
    type: 'idle' | 'saving' | 'testing' | 'ok' | 'error';
    message?: string;
  }>({ type: 'idle' });

  const agencySpec = AGENCY_FTP_SERVER_SPECS[selectedAgency] || AGENCY_FTP_SERVER_SPECS['123rf'];
  const is123Rf = selectedAgency === '123rf';

  useEffect(() => {
    ftp123rfService.setActiveAgency(selectedAgency);
    setQueue([...ftp123rfService.getQueue(selectedAgency)]);
    setTelemetry({ ...ftp123rfService.getTelemetry(selectedAgency) });
    setBatchIsAi(ftp123rfService.getBatchIsAiGenerated(selectedAgency));
    setHasRecoverableSession(ftp123rfService.getHasRecoverableSession(selectedAgency));
    setActiveSubTab('all');
    setPreviewModalItem(null);
    setVaultStatus({ type: 'idle' });

    if (ftp123rfService.getQueue(selectedAgency).length === 0) {
      ftp123rfService.hydrateFromDisk(selectedAgency).catch(() => {});
    }
  }, [selectedAgency]);

  // Load saved credentials from SQLite for the active agency
  const storedProfile = useSqliteQuery(
    async () => {
      try {
        if (db.ftp?.getProfile) {
          return await db.ftp.getProfile(selectedAgency);
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
      if (storedProfile.hasSavedPassword) {
        setPassword('••••••••••••');
      } else {
        setPassword('');
      }
    } else {
      setUsername('');
      setPassword('');
    }
  }, [storedProfile?.updatedAt, storedProfile?.username, storedProfile?.hasSavedPassword, selectedAgency]);

  // Subscribe to FTP Service updates for the currently selected agency
  useEffect(() => {
    const sync = () => {
      setQueue([...ftp123rfService.getQueue(selectedAgency)]);
      setTelemetry({ ...ftp123rfService.getTelemetry(selectedAgency) });
      setBatchIsAi(ftp123rfService.getBatchIsAiGenerated(selectedAgency));
      setHasRecoverableSession(ftp123rfService.getHasRecoverableSession(selectedAgency));
    };
    sync();
    const unsub = ftp123rfService.subscribe(sync);
    return () => unsub();
  }, [selectedAgency]);

  const handleBatchAiToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!is123Rf) return;
    const checked = e.target.checked;
    setBatchIsAi(checked);
    ftp123rfService.setBatchAiGenerated(checked);
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    ftp123rfService.addFiles(Array.from(fileList), selectedAgency);
  };

  const handleAddFolderClick = async () => {
    if (telemetry.isRunning) return;
    const nativeItems = await ftp123rfService.selectAndAddNativeFolder(selectedAgency);
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
      await ftp123rfService.addFiles(files, selectedAgency);
    }
  };

  const handleClearAll = () => {
    setActiveSubTab('all');
    setPreviewModalItem(null);
    ftp123rfService.clearQueue(selectedAgency);
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

  const handleTestConnection = async () => {
    setVaultStatus({
      type: 'testing',
      message: isAr ? 'جارٍ اختبار الاتصال...' : 'Testing connection...',
    });
    try {
      const cleanUsername = username.trim();
      const passToSend = password === '••••••••••••' ? undefined : password;

      const res = await ftp123rfService.testConnection({
        agencyId: selectedAgency,
        host: agencySpec.host,
        port: agencySpec.port,
        protocol: agencySpec.protocol,
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
          message: res.error || res.message || (isAr ? 'فشل الاتصال' : 'Connection failed'),
        });
      }
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || (isAr ? 'خطأ في الاتصال' : 'Connection error'),
      });
    }
  };

  const handleSaveCredentials = async () => {
    setVaultStatus({
      type: 'saving',
      message: isAr ? 'جارٍ اختبار الاتصال وحفظ البيانات...' : 'Testing connection & saving...',
    });
    try {
      const cleanUsername = username.trim();
      const passToSend = password === '••••••••••••' ? undefined : password;

      const testRes = await ftp123rfService.testConnection({
        agencyId: selectedAgency,
        host: agencySpec.host,
        port: agencySpec.port,
        protocol: agencySpec.protocol,
        username: cleanUsername,
        password: passToSend,
      });

      if (!testRes.success) {
        setVaultStatus({
          type: 'error',
          message: testRes.error || testRes.message || (isAr ? 'فشل الاتصال بالخادم' : 'Connection failed'),
        });
        return;
      }

      await ftp123rfService.saveCredentials({
        agencyId: selectedAgency,
        host: agencySpec.host,
        port: agencySpec.port,
        protocol: agencySpec.protocol,
        username: cleanUsername,
        password: passToSend,
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

  const unifiedQueue: UnifiedFtpItemView[] = queue.map((item) => ({
    id: item.id,
    filename: item.filename,
    displayName: item.displayName || item.filename,
    stemName: item.stemName,
    mediaType: item.mediaType,
    isVectorBundle: item.isVectorBundle,
    isCsv: item.isCsv,
    isAiGenerated: item.isAiGenerated,
    isAiIgnored: item.isAiIgnored,
    remoteFolder: item.remoteFolder,
    remotePath: `${item.remoteFolder === '/' ? '' : item.remoteFolder}/${item.filename}`,
    fileSize: item.fileSize,
    bytesTransferred: item.bytesTransferred,
    progressPercent: item.progressPercent,
    status: item.status,
    retryCount: item.retryCount,
    maxRetries: item.maxRetries,
    errorMessage: item.errorMessage,
    localPath: item.localPath,
    previewLocalPath: item.previewLocalPath || item.jpgPart?.localPath || item.localPath,
    previewUrl: item.previewUrl,
    jpgPart: item.jpgPart
      ? {
          filename: item.jpgPart.filename,
          remoteFolder: item.jpgPart.remoteFolder,
          localPath: item.jpgPart.localPath,
        }
      : undefined,
    epsPart: item.epsPart
      ? {
          filename: item.epsPart.filename,
          remoteFolder: item.epsPart.remoteFolder,
          localPath: item.epsPart.localPath,
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

  const { elapsedSeconds, stableEtaSeconds, activeFileNumber } = useFtpTelemetryMath(telemetry);

  const visibleQueue =
    activeSubTab === 'succeeded'
      ? succeededItems
      : activeSubTab === 'failed'
      ? failedItems
      : activeSubTab === 'skipped'
      ? skippedItems
      : unifiedQueue;

  const aiToggleCheckbox = is123Rf ? (
    <div className="flex items-center justify-center">
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
  ) : null;

  return (
    <div
      data-testid="ftp-uploader-view"
      className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden select-none"
    >
      {/* Hidden File & Folder Pickers - Identical to Dreamstime */}
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
        selectedAgency={selectedAgency}
        agencyName={agencySpec.name}
        agencyHost={agencySpec.host}
        isAr={isAr}
        isRunning={telemetry.isRunning}
        storedUsername={storedProfile?.username}
        hasSavedPassword={storedProfile?.hasSavedPassword}
        onSelectAgency={onSwitchAgency}
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
            extraControls={aiToggleCheckbox}
            onAddFilesClick={() => fileInputRef.current?.click()}
            onAddFolderClick={handleAddFolderClick}
            onRetryFailedClick={() => ftp123rfService.retryAllFailed(selectedAgency)}
            onPauseClick={() => ftp123rfService.pause(selectedAgency)}
            onResumeClick={() => ftp123rfService.resume(selectedAgency)}
            onStartUploadClick={() => ftp123rfService.startUpload(selectedAgency)}
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
              onClick={() => ftp123rfService.startUpload(selectedAgency)}
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
            agencyName={agencySpec.name}
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
            extraControls={aiToggleCheckbox}
          />
        ) : (
          <FtpQueueTableWorkspace
            agencyId={selectedAgency}
            agencyName={agencySpec.name}
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
            onRetrySingleItem={(id) => ftp123rfService.retrySingleItem(id, selectedAgency)}
            onOpenFileLocation={handleOpenFileLocation}
            onRemoveItem={(id) => ftp123rfService.removeItem(id, selectedAgency)}
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
        agencyId={selectedAgency}
        agencyName={agencySpec.name}
        host={agencySpec.host}
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
