import React, { useState, useEffect } from 'react';
import { db, useSqliteQuery } from '../../db';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
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

  const handleTabChange = (tab: 'storage' | 'keys' | 'csv') => {
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
    <div className="h-full overflow-hidden flex flex-col md:flex-row bg-slate-50 dark:bg-background">
      {/* Rock-Solid Vertical Inner Navigation (Left in LTR, Right in RTL) */}
      <aside className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r rtl:md:border-r-0 rtl:md:border-l border-slate-200 dark:border-border bg-white dark:bg-card/50 p-3 sm:p-4 space-y-1">
        <div className="pb-3 px-2 border-b border-slate-100 dark:border-border/60 mb-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-foreground">
            {isAr ? 'الإعدادات' : 'Settings'}
          </h2>
        </div>
        <nav className="space-y-1">
          <button
            type="button"
            onClick={() => handleTabChange('storage')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'storage'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100 dark:hover:bg-secondary/60'
            }`}
          >
            <HardDrive className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'التخزين والنسخ الاحتياطي' : 'Storage & Backup'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('keys')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'keys'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100 dark:hover:bg-secondary/60'
            }`}
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'مفاتيح API' : 'API Keys'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('csv')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'csv'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100 dark:hover:bg-secondary/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'قوالب CSV' : 'CSV Templates'}</span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area with Fixed Min-Height and Independent Smooth Scrolling */}
      <main className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto p-4 sm:p-6 relative">
        <div className="max-w-4xl mx-auto min-h-[70vh] relative space-y-4">
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

          {/* TAB 1: Storage & Backup */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              {/* Main Database Card (Zero Jargon, Pure Contrast) */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Database className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-foreground">
                          {isAr ? 'قاعدة البيانات الرئيسية' : 'Main Database'}
                        </h3>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        >
                          {isAr ? 'نشط' : 'Active'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-muted-foreground font-mono mt-0.5">
                        <span>
                          {isAr ? 'الحجم:' : 'Size:'}{' '}
                          <strong className="text-slate-800 dark:text-foreground">
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
                    className="h-8 px-3 text-xs font-semibold gap-1.5 cursor-pointer shrink-0 self-start sm:self-center bg-white dark:bg-card border-slate-200 dark:border-border"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRunningBackup ? 'animate-spin' : ''}`} />
                    <span>{isAr ? 'نسخ احتياطي الآن' : 'Backup Now'}</span>
                  </Button>
                </div>
              </div>

              {/* Master Workspace Directory Card */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                    <span>{isAr ? 'مجلد مساحة العمل' : 'Master Workspace'}</span>
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenFolder(workspacePaths?.masterVaultDir)}
                      className="h-7 px-2 text-xs gap-1 cursor-pointer text-slate-500 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground"
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
                      className="h-7 px-2.5 text-xs font-medium cursor-pointer bg-white dark:bg-card border-slate-200 dark:border-border"
                    >
                      {isAr ? 'تغيير' : 'Change'}
                    </Button>
                  </div>
                </div>

                <div
                  dir="ltr"
                  data-testid="settings-master-workspace-path"
                  className="px-3 py-1.5 rounded-lg bg-slate-100/70 dark:bg-secondary/50 border border-slate-200 dark:border-border font-mono text-xs text-slate-800 dark:text-foreground truncate"
                >
                  {workspacePaths?.masterVaultDir || '—'}
                </div>
              </div>

              {/* Backup Directory Card */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
                    <Archive className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{isAr ? 'مجلد النسخ الاحتياطي' : 'Backup Directory'}</span>
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenFolder(workspacePaths?.backupsDir)}
                      className="h-7 px-2 text-xs gap-1 cursor-pointer text-slate-500 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground"
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
                      className="h-7 px-2.5 text-xs font-medium cursor-pointer bg-white dark:bg-card border-slate-200 dark:border-border"
                    >
                      {isAr ? 'تغيير' : 'Change'}
                    </Button>
                  </div>
                </div>

                <div
                  dir="ltr"
                  data-testid="settings-backup-dir-path"
                  className="px-3 py-1.5 rounded-lg bg-slate-100/70 dark:bg-secondary/50 border border-slate-200 dark:border-border font-mono text-xs text-slate-800 dark:text-foreground truncate"
                >
                  {workspacePaths?.backupsDir || '—'}
                </div>
              </div>

              {/* Backup History (Constrained Height & Scrollable) */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-muted-foreground" />
                    <span>
                      {isAr
                        ? `سجل النسخ الاحتياطية (${backupLogs.length})`
                        : `Backup History (${backupLogs.length})`}
                    </span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-muted-foreground font-normal">
                    {workspacePaths?.hasBackupToday
                      ? isAr ? '✓ اكتمل النسخ اليومي' : '✓ Daily backup completed'
                      : isAr ? 'في انتظار الإغلاق' : 'Scheduled on exit'}
                  </span>
                </div>

                {backupLogs.length === 0 ? (
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-secondary/20 text-center text-xs text-slate-500 dark:text-muted-foreground">
                    {isAr ? 'لا توجد نسخ احتياطية مسجلة بعد.' : 'No backup snapshots recorded yet.'}
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 dark:border-border overflow-hidden">
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-border/60">
                      {backupLogs.map((log) => (
                        <div
                          key={log.id}
                          className="px-3 py-2 bg-white dark:bg-background flex items-center justify-between gap-3 text-xs font-mono"
                        >
                          <span className="text-slate-800 dark:text-foreground font-medium truncate" dir="ltr">
                            {(log.backupFilePath || '').split(/[\\/]/).pop()}
                          </span>
                          <div className="flex items-center gap-2.5 shrink-0 text-[11px] text-slate-500 dark:text-muted-foreground">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-secondary text-slate-700 dark:text-foreground text-[10px]">
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
            </div>
          )}

          {/* TAB 2: API Keys */}
          {activeTab === 'keys' && (
            <div className="space-y-4">
              <KeyRingView />
            </div>
          )}

          {/* TAB 3: CSV Templates */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <CsvTemplatesView />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
