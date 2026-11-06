import React, { useState } from 'react';
import { db, useSqliteQuery } from '../../db';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  FolderOpen,
  HardDrive,
  Database,
  ShieldCheck,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Archive,
  Layers,
} from 'lucide-react';

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export const SettingsView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const workspacePaths = useSqliteQuery(
    () => db.tracker.getWorkspacePaths(),
    [],
    null,
    ['master', 'settings']
  );

  const backupLogs = useSqliteQuery(
    () => db.tracker.getBackupLogs(15),
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
    }, 4500);
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
          ? 'تم تحديث مجلد مساحة العمل الرئيسي بنجاح. يتم الآن بناء المسارات النسبية تلقائياً.'
          : 'Master Workspace Folder updated. Relative asset paths now resolve dynamically from this root.'
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
          ? 'تم تحديث مجلد النسخ الاحتياطي المخصص بنجاح.'
          : 'Custom Backup Directory updated successfully.'
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update Custom Backup Directory');
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
            ? `تم إنشاء نسخة احتياطية مضغوطة لقاعدة البيانات الدائمة (${formatBytes(sizeBytes)}).`
            : `Created clean userdata.sqlite snapshot (${formatBytes(sizeBytes)}).`
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
    <div className="h-full overflow-y-auto px-2 sm:px-4 py-3 space-y-5 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3.5">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary shrink-0" />
            <span>
              {isAr
                ? 'إعدادات البنية التحتية والتخزين والنسخ الاحتياطي'
                : 'Storage, Workspace & Smart Backup Settings'}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? 'إدارة فصل قواعد البيانات (الدائمة مقابل الطوابير المؤقتة)، مجلد مساحة العمل النسبي، والنسخ الاحتياطي اليومي الذكي.'
              : 'Manage split SQLite engines (permanent userdata vs. ephemeral queues), relative Master Workspace paths, and daily rolling backups.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={isRunningBackup}
            onClick={handleTriggerManualBackup}
            data-testid="settings-manual-backup-btn"
            className="h-8 px-3 text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningBackup ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'نسخ احتياطي الآن' : 'Backup Now'}</span>
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
      {statusToast && (
        <div
          className={`px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
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

      {/* 1. Split Database Engine Telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Permanent Database Card */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-bold text-foreground font-mono">userdata.sqlite</span>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
            >
              {isAr ? 'دائم · خالٍ من Base64' : 'PERMANENT · ZERO-BASE64'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isAr
              ? 'يخزن السجلات الرئيسية، مفاتيح API، إعدادات FTP، والمسارات النسبية فقط بدون أي صور Base64.'
              : 'Stores Master Vault records, API keys, FTP profiles, and relative file paths with strictly zero Base64 image bloat.'}
          </p>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>
              {isAr ? 'الحجم الحالي:' : 'Size:'}{' '}
              <strong className="text-foreground">
                {formatBytes(workspacePaths?.userDataSizeBytes)}
              </strong>
            </span>
            <span>
              {workspacePaths?.isUserDataDirty
                ? isAr
                  ? 'الحالة: معدّل (سيتم النسخ عند الإغلاق)'
                  : 'State: Modified (Pending Quit Backup)'
                : isAr
                ? 'الحالة: متزامن ونظيف'
                : 'State: Clean & Synced'}
            </span>
          </div>
        </div>

        {/* Ephemeral Queues Database Card */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-foreground font-mono">local_queues.sqlite</span>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
            >
              {isAr ? 'مؤقت · مستثنى من النسخ الاحتياطي' : 'EPHEMERAL · IGNORED IN BACKUPS'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isAr
              ? 'يخزن طوابير المهام النشطة لاستعادة الجلسات عند الانقطاع، ويتم تجاهله تماماً أثناء النسخ الاحتياطي.'
              : 'Isolated crash-recovery engine for active background task queues (FTP, Audio, Cleaner, EPS). Never backed up.'}
          </p>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>
              {isAr ? 'الحجم الحالي:' : 'Size:'}{' '}
              <strong className="text-foreground">
                {formatBytes(workspacePaths?.queuesSizeBytes)}
              </strong>
            </span>
            <span>{isAr ? 'معزول 100%' : '100% Isolated I/O'}</span>
          </div>
        </div>
      </div>

      {/* 2. Master Workspace Folder (Relative Path Root) */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary shrink-0" />
              <span>
                {isAr
                  ? 'مجلد مساحة العمل الرئيسي (Master Workspace Folder)'
                  : 'Master Workspace Folder (Relative Path Root)'}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'يتم حفظ مسارات الملفات في قاعدة البيانات كمسارات نسبية لهذا المجلد، مما يحافظ على عمل الصور عند نقل الملفات أو استخدام جهاز آخر.'
                : 'All asset paths in userdata.sqlite are stored relative to this root folder so moving your library or switching PCs never breaks image links.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenFolder(workspacePaths?.masterVaultDir)}
              className="h-8 px-2.5 text-xs gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isAr ? 'فتح المجلد' : 'Open Folder'}</span>
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isUpdatingWorkspace}
              onClick={handleSelectMasterWorkspace}
              data-testid="settings-change-workspace-btn"
              className="h-8 px-3 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{isAr ? 'تغيير المجلد الرئيسي' : 'Change Master Folder'}</span>
            </Button>
          </div>
        </div>

        <div
          dir="ltr"
          data-testid="settings-master-workspace-path"
          className="px-3 py-2 rounded-lg bg-secondary/50 border border-border font-mono text-xs text-foreground truncate"
        >
          {workspacePaths?.masterVaultDir || 'Loading...'}
        </div>
      </div>

      {/* 3. Custom Backup Directory & Smart 7-Day Rolling Retention */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                {isAr
                  ? 'مسار النسخ الاحتياطي الذكي وسياسة الاحتفاظ لمدة 7 أيام'
                  : 'Smart Daily Backup & Custom Cloud Sync Directory'}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'يتم إنشاء نسخة احتياطية تلقائية مرة واحدة فقط يومياً عند إغلاق التطبيق إذا تم تعديل البيانات، مع حذف النسخ الأقدم من 7 أيام تلقائياً.'
                : 'Automated backups run at most ONCE per day on app quit (only when userdata.sqlite was modified) and auto-prune files older than 7 days.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenFolder(workspacePaths?.backupsDir)}
              className="h-8 px-2.5 text-xs gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isAr ? 'فتح مجلد النسخ' : 'Open Backup Folder'}</span>
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isUpdatingBackupDir}
              onClick={handleSelectBackupDirectory}
              data-testid="settings-change-backup-dir-btn"
              className="h-8 px-3 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحديد مسار النسخ الاحتياطي' : 'Change Backup Folder'}</span>
            </Button>
          </div>
        </div>

        <div
          dir="ltr"
          data-testid="settings-backup-dir-path"
          className="px-3 py-2 rounded-lg bg-secondary/50 border border-border font-mono text-xs text-foreground truncate"
        >
          {workspacePaths?.backupsDir || 'Loading...'}
        </div>

        {/* Recent Backups Table */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {isAr
                  ? `سجل النسخ الاحتياطية الحديثة (${backupLogs.length})`
                  : `Recent userdata.sqlite Snapshots (${backupLogs.length})`}
              </span>
            </span>
            <span className="text-[11px] font-mono">
              {workspacePaths?.hasBackupToday
                ? isAr
                  ? '✓ تم إجراء النسخ اليومي بالفعل'
                  : '✓ Daily backup completed today'
                : isAr
                ? 'في انتظار النسخ عند إغلاق التطبيق'
                : 'Scheduled on app quit if modified'}
            </span>
          </div>

          {backupLogs.length === 0 ? (
            <div className="p-4 rounded-lg border border-border bg-secondary/20 text-center text-xs text-muted-foreground">
              {isAr
                ? 'لا توجد نسخ احتياطية مسجلة بعد. اضغط على "نسخ احتياطي الآن" لإنشاء نسخة فورية.'
                : 'No backup snapshots recorded yet. Click "Backup Now" to create an immediate snapshot.'}
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="max-h-48 overflow-y-auto divide-y divide-border/60">
                {backupLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-3 py-2 bg-background/50 flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="min-w-0 flex-1 truncate" dir="ltr">
                      <span className="text-foreground font-medium">
                        {(log.backupFilePath || '').split(/[\\/]/).pop()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground">
                      <span className="px-1.5 py-0.5 rounded bg-secondary text-foreground">
                        {log.triggerEvent}
                      </span>
                      <span>{formatBytes(log.fileSizeBytes)}</span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
