import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HomeHubView } from './features/home/HomeHubView';
import { StudioView } from './features/studio/StudioView';
import { TrackerView } from './features/tracker/TrackerView';
import { FileCleanerView } from './features/cleaner/FileCleanerView';
import { VideoMuterView } from './features/video/VideoMuterView';
import { EpsConverterView } from './features/eps/EpsConverterView';
import { batchQueueService } from './services/queue/BatchQueueService';
import { keyRingScheduler } from './services/scheduler/KeyRingScheduler';
import { db, getAllApiKeys, updateApiKey } from './db';
import { ApiKeyRecord } from './types';
import { Badge } from './components/ui/badge';
import {
  ShieldCheck,
  Wand2,
  Layers,
  KeyRound,
  Sun,
  Moon,
  LayoutGrid,
  Sparkles,
  VolumeX,
  Languages,
} from 'lucide-react';
import { Dialog } from './components/ui/dialog';
import { KeyRingView } from './features/keyring/components/KeyRingView';
import { AppLogo } from './components/icons/AppLogo';
import { useLanguage } from './context/LanguageContext';

export type AppTab = 'home' | 'studio' | 'tracker' | 'cleaner' | 'muter' | 'eps';

const TAB_TO_PATH: Record<AppTab, string> = {
  home: '/',
  studio: '/metadata',
  tracker: '/tracker',
  cleaner: '/file-cleaner',
  muter: '/video-muter',
  eps: '/eps-converter',
};

const PATH_TO_TAB: Record<string, AppTab> = {
  '/': 'home',
  '/metadata': 'studio',
  '/tracker': 'tracker',
  '/file-cleaner': 'cleaner',
  '/video-muter': 'muter',
  '/eps-converter': 'eps',
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
  const { language, setLanguage, t } = useLanguage();
  const [, setKeys] = useState<ApiKeyRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>(getInitialTab);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('stock_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark'; // Dark mode is default
  });
  const [isKeyRingOpen, setIsKeyRingOpen] = useState(false);

  const trackerCount = useLiveQuery(() => db.trackerRecords.count(), []) || 0;
  const masterCount = useLiveQuery(() => db.masterRecords.count(), []) || 0;

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('stock_theme', theme);
  }, [theme]);

  // Handle browser popstate (Back/Forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
      if (PATH_TO_TAB[pathname]) {
        setActiveTab(PATH_TO_TAB[pathname]);
        localStorage.setItem('stock_active_tab', PATH_TO_TAB[pathname]);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    localStorage.setItem('stock_active_tab', tab);
    const targetPath = TAB_TO_PATH[tab] || '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ tab }, '', targetPath);
    }
  };

  useEffect(() => {
    const unsub = keyRingScheduler.subscribe((updated) => setKeys([...updated]));
    keyRingScheduler.init();

    // Auto-migrate any legacy/deprecated models to active gemini-3.1-flash-lite
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
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased">
      {/* Sleek Minimal Responsive Header (Level 1 Surface) */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#1E1F20]/95 backdrop-blur-md sticky top-0 z-40 w-full overflow-hidden text-zinc-900 dark:text-zinc-100">
        <div className="max-w-[1700px] w-full mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left: Brand Logo & Title (Clickable) + Return to Hub Grid Button */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => handleTabChange('home')}
              className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0 cursor-pointer text-start hover:opacity-90 transition"
              title="Return to Home Hub"
            >
              <AppLogo size={28} className="shrink-0 drop-shadow-xs" />
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
                  {t.brandTitle}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:inline font-mono">
                  {t.brandSubtitle}
                </span>
              </div>
            </button>

            {/* Hub / All Tools Button */}
            <button
              type="button"
              onClick={() => handleTabChange('home')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer shrink-0 ${
                activeTab === 'home'
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-white hover:bg-zinc-100 dark:bg-card dark:hover:bg-accent text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800'
              }`}
              title="All Tools Dashboard / لوحة جميع الأدوات"
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t.allTools || 'All Tools'}</span>
            </button>
          </div>

          {/* Right Header Utilities (Language, Manage Keys, Theme Toggle, & Local DB Indicator) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Language Switcher */}
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="px-2 sm:px-2.5 h-8 rounded-lg bg-white hover:bg-zinc-100 dark:bg-card dark:hover:bg-accent border border-zinc-200 dark:border-zinc-800 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-100 cursor-pointer transition shadow-2xs"
              title="Toggle Language / تبديل اللغة"
            >
              <Languages className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] sm:text-xs font-mono sm:font-sans">
                {language === 'en' ? 'عربي' : 'EN'}
              </span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 rounded-lg bg-white hover:bg-zinc-100 dark:bg-card dark:hover:bg-accent border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-100 cursor-pointer transition shadow-2xs"
              title={theme === 'dark' ? t.switchToLight : t.switchToDark}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-zinc-700" />
              )}
            </button>

            {/* API Keys (Only displayed in tools that require AI keys, like Metadata Studio) */}
            {activeTab === 'studio' && (
              <button
                type="button"
                onClick={() => setIsKeyRingOpen(true)}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-white hover:bg-zinc-100 dark:bg-card dark:hover:bg-accent border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-100 cursor-pointer transition shadow-2xs"
                title="Manage API Keys & Priority Cascade"
              >
                <KeyRound className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-medium hidden sm:inline">{t.apiKeys}</span>
              </button>
            )}

            {/* 100% Local DB badge on desktop */}
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono pl-2 border-l border-zinc-200 dark:border-zinc-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">{t.localDb}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace (Dedicated Standalone Views) */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-5 min-w-0 overflow-x-hidden">
        {activeTab === 'home' && <HomeHubView onNavigate={(tool) => handleTabChange(tool)} />}
        {activeTab === 'studio' && <StudioView />}
        {activeTab === 'tracker' && <TrackerView />}
        {activeTab === 'cleaner' && <FileCleanerView />}
        {activeTab === 'muter' && <VideoMuterView />}
        {activeTab === 'eps' && (
          <EpsConverterView
            onSendToStudio={(files) => {
              batchQueueService.addFiles(files);
              handleTabChange('studio');
            }}
          />
        )}
      </main>

      {/* Global API KeyRing Dialog */}
      <Dialog
        open={isKeyRingOpen}
        onClose={() => setIsKeyRingOpen(false)}
        title="API Keys & Priority"
        className="max-w-2xl"
      >
        <KeyRingView />
      </Dialog>
    </div>
  );
}

export default App;
