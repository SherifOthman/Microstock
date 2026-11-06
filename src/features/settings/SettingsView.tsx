import React, { useState, useEffect } from 'react';
import { db, useSqliteQuery } from '../../db';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { KeyRingView } from '../keyring/components/KeyRingView';
import { CsvTemplatesView } from './CsvTemplatesView';
import {
  FolderOpen,
  HardDrive,
  Database,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Archive,
  KeyRound,
  FileSpreadsheet,
} from 'lucide-react';

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export interface SettingsViewProps {
  initialTab?: 'storage' | 'keys' | 'csv';
  onTabChange?: (tab: 'storage' | 'keys' | 'csv') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialTab = 'storage',
  onTabChange,
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [activeTab, setActiveTab] = useState<'storage' | 'keys' | 'csv'>(initialTab);

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (val: string) => {
    const tab = val as 'storage' | 'keys' | 'csv';
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const workspacePaths = useSqliteQuery(
    () => db.tracker.getWorkspacePaths(),
    [],
    null,
    ['master', 'settings']
  );

  const backupLogs =
    useSqliteQuery(
      () => db.tracker.getBackupLogs(10),
      [],
      [],
      ['master', 'settings']
    ) || [];

  const [isUpdatingWorkspace, setIsUpdatingWorkspace] = useState(false);
  const [isUpdatingBackupDir, setIsUpdatingBackupDir] = useState(false);
  const [isRunningBackup, setIsRunningBackup] = useState(false);
  const [statusToast, setStatusToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setStatusToast({ type, message });
    setTimeout(() => {
      setStatusToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const handleSelectMasterWorkspace = async () => {
    try {
      const api = window.electronAPI;
      if (!api?.selectDirectory) return;
      const selected = await api.selectDirectory();
      const folderPath = typeof selected === 'string' ? selected : selected?.path;
      if (!folderPath || (typeof selected === 'object' && selected.canceled)) return;
      setIsUpdatingWorkspace(true);
      await db.tracker.setMasterWorkspaceFolder(folderPath);
      showToast(
        'success',
        isAr
          ? 'تم تحديث مجلد مساحة العمل الرئيسي بنجاح.'
          : 'Master Workspace Folder updated successfully.'
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update Master Workspace Folder');
    } finally {
      setIsUpdatingWorkspace(false);
    }
  };

  const handleSelectBackupDirectory = async () => {
    try {
      const api = window.electronAPI;
      if (!api?.selectDirectory) return;
      const selected = await api.selectDirectory();
      const folderPath = typeof selected === 'string' ? selected : selected?.path;
      if (!folderPath || (typeof selected === 'object' && selected.canceled)) return;
      setIsUpdatingBackupDir(true);
      await db.tracker.setCustomBackupDirectory(folderPath);
      showToast(
        'success',
        isAr
          ? 'تم تحديث مجلد النسخ الاحتياطي بنجاح.'
          : 'Backup Directory updated successfully.'
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update Backup Directory');
    } finally {
      setIsUpdatingBackupDir(false);
    }
  };

  const handleTriggerManualBackup = async () => {
    try {
      setIsRunningBackup(true);
      const res = await db.tracker.performHotBackup('manual');
      if (res) {
        const sizeBytes = res.fileSizeBytes ?? (res as any).fileSize ?? 0;
        showToast(
          'success',
          isAr
            ? `تم إنشاء نسخة احتياطية بنجاح (${formatBytes(sizeBytes)}).`
            : `Backup snapshot created (${formatBytes(sizeBytes)}).`
        );
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Backup failed');
    } finally {
      setIsRunningBackup(false);
    }
  };

  const handleOpenFolder = async (folderPath?: string) => {
    if (!folderPath || !window.electronAPI?.openPath) return;
    await window.electronAPI.openPath(folderPath);
  };

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-6 py-4 max-w-5xl mx-auto space-y-4">
      {/* Toast Notification */}
      {statusToast && (
        <div
          className={`px-3.5 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${
            statusToast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          {statusToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusToast.message}</span>
        </div>
      )}

      {/* Centralized Settings Tabs Hub */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <TabsList className="bg-secondary/70 h-9 p-1">
            <TabsTrigger value="storage" className="gap-2 text-xs">
              <HardDrive className="w-3.5 h-3.5" />
              <span>{isAr ? 'التخزين والنسخ الاحتياطي' : 'Storage & Backup'}</span>
            </TabsTrigger>
            <TabsTrigger value="keys" className="gap-2 text-xs">
              <KeyRound className="w-3.5 h-3.5" />
              <span>{isAr ? 'مفاتيح API' : 'API Keys'}</span>
            </TabsTrigger>
            <TabsTrigger value="csv" className="gap-2 text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isAr ? 'قوالب CSV' : 'CSV Templates'}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: Storage & Backup */}
        <TabsContent value="storage" className="space-y-4 mt-0">
          {/* Main Database Card (Zero Jargon) */}
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground">
                      {isAr ? 'قاعدة البيانات الرئيسية' : 'Main Database'}
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    >
                      {isAr ? 'نشط' : 'Active'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mt-0.5">
                    <span>
                      {isAr ? 'الحجم:' : 'Size:'}{' '}
                      <strong className="text-foreground">
                        {formatBytes(workspacePaths?.userDataSizeBytes)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      {workspacePaths?.isUserDataDirty
                        ? isAr ? 'معدّل' : 'Modified'
                        : isAr ? 'متزامن' : 'Synced'}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRunningBackup}
                onClick={handleTriggerManualBackup}
                data-testid="settings-manual-backup-btn"
                className="h-8 px-3 text-xs font-semibold gap-1.5 cursor-pointer shrink-0 self-start sm:self-center"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunningBackup ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'نسخ احتياطي الآن' : 'Backup Now'}</span>
              </Button>
            </div>
          </div>

          {/* Master Workspace Directory Card */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                <span>{isAr ? 'مجلد مساحة العمل' : 'Master Workspace'}</span>
              </span>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenFolder(workspacePaths?.masterVaultDir)}
                  className="h-7 px-2 text-xs gap-1 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>{isAr ? 'فتح' : 'Open'}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUpdatingWorkspace}
                  onClick={handleSelectMasterWorkspace}
                  data-testid="settings-change-workspace-btn"
                  className="h-7 px-2.5 text-xs font-medium cursor-pointer"
                >
                  {isAr ? 'تغيير' : 'Change'}
                </Button>
              </div>
            </div>

            <div
              dir="ltr"
              data-testid="settings-master-workspace-path"
              className="px-3 py-1.5 rounded-lg bg-secondary/50 border border-border font-mono text-xs text-foreground truncate"
            >
              {workspacePaths?.masterVaultDir || '—'}
            </div>
          </div>

          {/* Backup Directory Card */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-2">
                <Archive className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{isAr ? 'مجلد النسخ الاحتياطي' : 'Backup Directory'}</span>
              </span>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenFolder(workspacePaths?.backupsDir)}
                  className="h-7 px-2 text-xs gap-1 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>{isAr ? 'فتح' : 'Open'}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUpdatingBackupDir}
                  onClick={handleSelectBackupDirectory}
                  data-testid="settings-change-backup-dir-btn"
                  className="h-7 px-2.5 text-xs font-medium cursor-pointer"
                >
                  {isAr ? 'تغيير' : 'Change'}
                </Button>
              </div>
            </div>

            <div
              dir="ltr"
              data-testid="settings-backup-dir-path"
              className="px-3 py-1.5 rounded-lg bg-secondary/50 border border-border font-mono text-xs text-foreground truncate"
            >
              {workspacePaths?.backupsDir || '—'}
            </div>
          </div>

          {/* Backup History (Constrained Height & Scrollable) */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span>
                  {isAr
                    ? `سجل النسخ الاحتياطية (${backupLogs.length})`
                    : `Backup History (${backupLogs.length})`}
                </span>
              </span>
              <span className="text-[11px] font-mono text-muted-foreground font-normal">
                {workspacePaths?.hasBackupToday
                  ? isAr ? '✓ اكتمل النسخ اليومي' : '✓ Daily backup completed'
                  : isAr ? 'في انتظار الإغلاق' : 'Scheduled on exit'}
              </span>
            </div>

            {backupLogs.length === 0 ? (
              <div className="p-4 rounded-lg border border-border bg-secondary/20 text-center text-xs text-muted-foreground">
                {isAr ? 'لا توجد نسخ احتياطية مسجلة بعد.' : 'No backup snapshots recorded yet.'}
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="max-h-48 overflow-y-auto divide-y divide-border/60">
                  {backupLogs.map((log) => (
                    <div
                      key={log.id}
                      className="px-3 py-2 bg-background flex items-center justify-between gap-3 text-xs font-mono"
                    >
                      <span className="text-foreground font-medium truncate" dir="ltr">
                        {(log.backupFilePath || '').split(/[\\/]/).pop()}
                      </span>
                      <div className="flex items-center gap-2.5 shrink-0 text-[11px] text-muted-foreground">
                        <span className="px-1.5 py-0.2 rounded bg-secondary text-foreground text-[10px]">
                          {log.triggerEvent}
                        </span>
                        <span>{formatBytes(log.fileSizeBytes)}</span>
                        <span>{new Date(log.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: API Keys */}
        <TabsContent value="keys" className="mt-0">
          <KeyRingView />
        </TabsContent>

        {/* TAB 3: CSV Templates */}
        <TabsContent value="csv" className="mt-0">
          <CsvTemplatesView />
        </TabsContent>
      </Tabs>
    </div>
  );
};
