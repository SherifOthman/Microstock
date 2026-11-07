import React, { useEffect, useState } from 'react';
import { HomeHubView } from './features/home/HomeHubView';
import { DistributionTrackerView, FixAndRequeueContext } from './features/tracker/DistributionTrackerView';
import { StudioView } from './features/studio/StudioView';
import { FileCleanerView } from './features/cleaner/FileCleanerView';
import { VideoMuterView } from './features/video/VideoMuterView';
import { EpsConverterView } from './features/eps/EpsConverterView';
import { FtpUploaderView } from './features/ftp/FtpUploaderView';
import { SettingsView } from './features/settings/SettingsView';
import { batchQueueService } from './services/queue/BatchQueueService';
import { keyRingScheduler } from './services/scheduler/KeyRingScheduler';
import { db, getAllApiKeys, updateApiKey, useSqliteQuery } from './db';
import { ApiKeyRecord, SupportedPlatform } from './types';
import {
  Wand2,
  Layers,
  KeyRound,
  Sun,
  Moon,
  LayoutGrid,
  Sparkles,
  VolumeX,
  PanelLeftClose,
  PanelLeftOpen,
  FileSpreadsheet,
  Languages,
  Database,
  HardDriveUpload,
  Settings,
} from 'lucide-react';
import { Dialog } from './components/ui/dialog';
import { Tooltip } from './components/ui/tooltip';
import { StockTemplatesModal } from './features/tools/StockTemplatesModal';
import { AppLogo } from './components/icons/AppLogo';
import { useLanguage } from './context/LanguageContext';
import { CustomTitleBar } from './components/CustomTitleBar';

export type AppTab = 'home' | 'tracker' | 'studio' | 'cleaner' | 'muter' | 'eps' | 'ftp' | 'settings';

const TAB_TO_PATH: Record<AppTab, string> = {
  home: '/',
  tracker: '/tracker',
  studio: '/metadata',
  cleaner: '/file-cleaner',
  muter: '/video-muter',
  eps: '/eps-converter',
  ftp: '/ftp-uploader',
  settings: '/settings',
};

const PATH_TO_TAB: Record<string, AppTab> = {
  '/': 'home',
  '/tracker': 'tracker',
  '/metadata': 'studio',
  '/file-cleaner': 'cleaner',
  '/video-muter': 'muter',
  '/eps-converter': 'eps',
  '/ftp-uploader': 'ftp',
  '/settings': 'settings',
};

function getInitialTab(): AppTab {
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
    if (PATH_TO_TAB[pathname]) {
      return PATH_TO_TAB[pathname];
    }
    const saved = localStorage.getItem('stock_active_tab') as AppTab;
    if (saved && TAB_TO_PATH[saved]) {
      return saved;
    }
  }
  return 'home';
}

export function App() {
  const isElectron = typeof window !== 'undefined' && Boolean((window as unknown as { electronAPI?: unknown }).electronAPI);

  const { language, setLanguage, t } = useLanguage();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>(getInitialTab);
  const [isRailCollapsed, setIsRailCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('stock_rail_collapsed') === 'true';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('stock_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'storage' | 'keys' | 'csv'>('storage');
  const [requeueContext, setRequeueContext] = useState<FixAndRequeueContext | null>(null);
  const [trackerFocusAgency, setTrackerFocusAgency] = useState<SupportedPlatform | undefined>(undefined);

  const masterCount = useSqliteQuery(() => db.masterRecords.count(), [], 0, ['master']) || 0;

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('stock_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('stock_rail_collapsed', String(isRailCollapsed));
  }, [isRailCollapsed]);

  useEffect(() => {
    const handleNavigateEvent = (e: Event) => {
      const custom = e as CustomEvent<{ tab: AppTab; settingsTab?: 'storage' | 'keys' | 'csv' }>;
      if (custom.detail?.settingsTab) {
        setSettingsTab(custom.detail.settingsTab);
      }
      if (custom.detail?.tab) {
        handleTabChange(custom.detail.tab);
      }
    };
    window.addEventListener('stockflow:navigate-tab', handleNavigateEvent);
    return () => window.removeEventListener('stockflow:navigate-tab', handleNavigateEvent);
  }, []);

  useEffect(() => {
    if (isElectron) return;
    const handlePopState = () => {
      const pathname = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
      if (PATH_TO_TAB[pathname]) {
        setActiveTab(PATH_TO_TAB[pathname]);
        localStorage.setItem('stock_active_tab', PATH_TO_TAB[pathname]);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isElectron]);

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    localStorage.setItem('stock_active_tab', tab);
    if (!isElectron) {
      const targetPath = TAB_TO_PATH[tab] || '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
      }
    }
  };

  useEffect(() => {
    if (!isElectron) return;
    const unsub = keyRingScheduler.subscribe((updated) => setKeys([...updated]));
    keyRingScheduler.init();

    getAllApiKeys().then(async (allKeys) => {
      let migrated = false;
      for (const k of allKeys) {
        if (
          k.providerId === 'gemini' &&
          (k.modelId.includes('1.5') || k.modelId.includes('2.5') || k.modelId === 'gemini-3.8-flash')
        ) {
          await updateApiKey(k.id, {
            modelId: 'gemini-3.1-flash-lite',
            status: 'healthy',
            lastError: undefined,
          });
          migrated = true;
        }
      }
      if (migrated) {
        keyRingScheduler.refreshKeys();
      }
    });

    return () => unsub();
  }, [isElectron]);

  if (!isElectron) {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex flex-col items-center justify-center p-8 text-center font-sans overflow-hidden">
        <div className="max-w-md p-6 bg-card border border-destructive/30 rounded-xl shadow-lg space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center text-destructive text-2xl font-bold">
            !
          </div>
          <h1 className="text-xl font-bold text-destructive">Desktop Client Required</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            StockFlow is a native desktop application. Please launch it via the desktop runtime.
          </p>
        </div>
      </div>
    );
  }

  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    {
      id: 'home',
      label: t.allTools,
      icon: LayoutGrid,
    },
    {
      id: 'tracker',
      label: t.distributionTracker,
      icon: Database,
      badge: masterCount > 0 ? masterCount : undefined,
    },
    {
      id: 'studio',
      label: t.metadataStudio,
      icon: Wand2,
    },
    {
      id: 'cleaner',
      label: t.fileCleaner,
      icon: Sparkles,
    },
    {
      id: 'eps',
      label: t.epsConverter,
      icon: Layers,
    },
    {
      id: 'muter',
      label: t.videoMuter,
      icon: VolumeX,
    },
    {
      id: 'ftp',
      label: t.ftpUploader,
      icon: HardDriveUpload,
    },
  ];

  const healthyKeysCount = keys.filter((k) => k.status === 'healthy').length;

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col antialiased overflow-hidden select-none">
      {/* Ultra-Clean Top Header: App Icon, StockFlow Name, and Window Controls Only */}
      <div className="shrink-0 z-50">
        <CustomTitleBar />
      </div>

      {/* Native Desktop Split Shell */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Persistent Left Navigation Rail */}
        <aside
          className={`${
            isRailCollapsed ? 'w-14' : 'w-56'
          } shrink-0 bg-card border-e border-border flex flex-col justify-between transition-[width] duration-150 ease-out z-30`}
        >
          {/* Top Brand + Workspace Navigation List */}
          <div className="flex flex-col min-h-0">
            {/* Rail Header */}
            <div
              className={`border-b border-border shrink-0 ${
                isRailCollapsed
                  ? 'py-2 px-1.5 flex flex-col items-center justify-center gap-2'
                  : 'h-11 px-3 flex items-center justify-between gap-2'
              }`}
            >
              {isRailCollapsed ? (
                <>
                  <Tooltip
                    content={language === 'ar' ? 'توسيع القائمة' : 'Expand sidebar'}
                    side={language === 'ar' ? 'left' : 'right'}
                  >
                    <button
                      type="button"
                      onClick={() => setIsRailCollapsed(false)}
                      aria-label="Expand sidebar"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer shrink-0"
                    >
                      <PanelLeftOpen className="w-4 h-4 rtl:rotate-180" />
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    onClick={() => handleTabChange('home')}
                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-90 transition shrink-0"
                    aria-label="StockFlow Home"
                  >
                    <AppLogo size={20} className="shrink-0" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleTabChange('home')}
                    className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-90 transition text-start"
                  >
                    <AppLogo size={20} className="shrink-0" />
                    <span className="font-semibold text-xs tracking-tight text-foreground truncate">
                      StockFlow
                    </span>
                  </button>

                  <Tooltip
                    content={language === 'ar' ? 'طي القائمة' : 'Collapse sidebar'}
                    side={language === 'ar' ? 'left' : 'right'}
                  >
                    <button
                      type="button"
                      onClick={() => setIsRailCollapsed(true)}
                      aria-label="Collapse sidebar"
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer shrink-0"
                    >
                      <PanelLeftClose className="w-3.5 h-3.5 rtl:rotate-180" />
                    </button>
                  </Tooltip>
                </>
              )}
            </div>

            {/* Navigation Items */}
            <nav className="p-2 space-y-1 overflow-y-auto no-scrollbar" aria-label="Workspace Navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const btn = (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabChange(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                      {!isRailCollapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!isRailCollapsed && item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                          isActive
                            ? 'bg-primary-foreground/20 text-primary-foreground font-semibold'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );

                return isRailCollapsed ? (
                  <Tooltip key={item.id} content={item.label} side={language === 'ar' ? 'left' : 'right'}>
                    {btn}
                  </Tooltip>
                ) : (
                  btn
                );
              })}
            </nav>
          </div>

          {/* Bottom System & Environment Controls: Settings, Language, and Theme */}
          <div className="p-2 border-t border-border space-y-1.5 shrink-0 bg-card">
            {/* Dedicated Settings Button */}
            <Tooltip
              content={isRailCollapsed ? (language === 'ar' ? 'الإعدادات' : 'Settings') : undefined}
              side={language === 'ar' ? 'left' : 'right'}
            >
              <button
                type="button"
                data-testid="sidebar-settings-tab"
                onClick={() => handleTabChange('settings')}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Settings
                    className={`w-4 h-4 shrink-0 ${
                      activeTab === 'settings' ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  />
                  {!isRailCollapsed && (
                    <span className="truncate">{language === 'ar' ? 'الإعدادات' : 'Settings'}</span>
                  )}
                </div>
              </button>
            </Tooltip>

            {/* Theme & Language Controls Row */}
            <div className={`pt-1.5 border-t border-border flex ${isRailCollapsed ? 'flex-col items-center gap-1.5' : 'items-center justify-between gap-1.5'}`}>
              {/* Language Switcher */}
              {isRailCollapsed ? (
                <Tooltip content={language === 'en' ? 'التبديل إلى العربية' : 'Switch to English'} side={language === 'ar' ? 'left' : 'right'}>
                  <button
                    type="button"
                    onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                    className="h-7 w-8 rounded-lg bg-secondary hover:bg-secondary/80 border border-border flex items-center justify-center text-[10px] font-mono font-semibold text-foreground cursor-pointer"
                  >
                    {language === 'en' ? 'AR' : 'EN'}
                  </button>
                </Tooltip>
              ) : (
                <div
                  dir="ltr"
                  className="inline-flex flex-1 items-center rounded-lg bg-secondary p-0.5 border border-border text-[11px] font-medium"
                >
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`flex-1 py-0.5 rounded-md transition-colors cursor-pointer font-mono text-center ${
                      language === 'en'
                        ? 'bg-card text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('ar')}
                    className={`flex-1 py-0.5 rounded-md transition-colors cursor-pointer text-center ${
                      language === 'ar'
                        ? 'bg-card text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    عربي
                  </button>
                </div>
              )}

              {/* Theme Toggle */}
              <Tooltip content={theme === 'dark' ? t.switchToLight : t.switchToDark} side={language === 'ar' ? 'left' : 'right'}>
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="h-7 w-8 rounded-lg bg-secondary hover:bg-secondary/80 border border-border flex items-center justify-center text-foreground cursor-pointer transition-colors shrink-0"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5 text-foreground" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-foreground" />
                  )}
                </button>
              </Tooltip>
            </div>
          </div>
        </aside>

        {/* Right Main Workspace Column (True Unmount on Navigation — State Preserved via Singleton Services & SQLite) */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-background overflow-hidden">
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
            {activeTab === 'home' && (
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                <HomeHubView
                  onNavigate={(tool, focusAgency) => {
                    if (focusAgency) {
                      setTrackerFocusAgency(focusAgency);
                    }
                    handleTabChange(tool);
                  }}
                  onOpenKeyRing={() => {
                    setSettingsTab('keys');
                    handleTabChange('settings');
                  }}
                  onOpenTemplates={() => {
                    setSettingsTab('csv');
                    handleTabChange('settings');
                  }}
                />
              </div>
            )}
            {activeTab === 'tracker' && (
              <div className="flex-1 min-h-0 h-full px-4 sm:px-5 py-3.5 overflow-hidden flex flex-col">
                <DistributionTrackerView
                  initialFocusAgency={trackerFocusAgency}
                  onFixAndRequeue={(ctx) => {
                    setRequeueContext(ctx);
                    handleTabChange('studio');
                  }}
                />
              </div>
            )}
            {activeTab === 'studio' && (
              <div className="flex-1 min-h-0 h-full px-3 sm:px-4 py-3 overflow-hidden flex flex-col">
                <StudioView
                  onOpenVideoMuter={() => handleTabChange('muter')}
                  requeueContext={requeueContext}
                  onCompleteRequeue={(agencyId) => {
                    setRequeueContext(null);
                    setTrackerFocusAgency(agencyId);
                    handleTabChange('tracker');
                  }}
                  onDismissRequeue={() => setRequeueContext(null)}
                  onOpenKeyRing={() => {
                    setSettingsTab('keys');
                    handleTabChange('settings');
                  }}
                  onOpenTemplates={() => {
                    setSettingsTab('csv');
                    handleTabChange('settings');
                  }}
                />
              </div>
            )}
            {activeTab === 'cleaner' && (
              <div className="flex-1 min-h-0 h-full px-4 sm:px-6 py-4 overflow-hidden flex flex-col">
                <FileCleanerView
                  onSendToStudio={async (files) => {
                    handleTabChange('studio');
                    window.dispatchEvent(new CustomEvent('stockflow:reset-media-filter'));
                    await batchQueueService.addFiles(files);
                  }}
                />
              </div>
            )}
            {activeTab === 'muter' && (
              <div className="flex-1 min-h-0 h-full px-4 sm:px-6 py-4 overflow-hidden flex flex-col">
                <VideoMuterView />
              </div>
            )}
            {activeTab === 'eps' && (
              <div className="flex-1 min-h-0 h-full px-4 sm:px-6 py-4 overflow-hidden flex flex-col">
                <EpsConverterView
                  onSendToStudio={async (files) => {
                    handleTabChange('studio');
                    window.dispatchEvent(new CustomEvent('stockflow:reset-media-filter'));
                    await batchQueueService.addFiles(files);
                  }}
                />
              </div>
            )}
            {activeTab === 'ftp' && (
              <div className="flex-1 min-h-0 h-full px-4 sm:px-5 py-3.5 overflow-hidden flex flex-col">
                <FtpUploaderView />
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
                <SettingsView initialTab={settingsTab} onTabChange={setSettingsTab} />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Global Dialogs */}
      <StockTemplatesModal open={isTemplatesOpen} onClose={() => setIsTemplatesOpen(false)} />
    </div>
  );
}

export default App;
