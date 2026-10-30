import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HomeHubView } from './features/home/HomeHubView';
import { StudioView } from './features/studio/StudioView';
import { TrackerView } from './features/tracker/TrackerView';
import { FileCleanerView } from './features/cleaner/FileCleanerView';
import { VideoMuterView } from './features/video/VideoMuterView';
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

export type AppTab = 'home' | 'studio' | 'tracker' | 'cleaner' | 'muter';

export function App() {
  const { language, setLanguage, t } = useLanguage();
  const [, setKeys] = useState<ApiKeyRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    return (localStorage.getItem('stock_active_tab') as AppTab) || 'home';
  });
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

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    localStorage.setItem('stock_active_tab', tab);
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
      {/* Sleek Minimal Responsive Header */}
      <header className="border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-40 w-full overflow-hidden">
        <div className="max-w-[1700px] w-full mx-auto px-3 sm:px-6 py-2 sm:py-0 sm:h-14 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-4">
          {/* Mobile Top Row / Desktop Left: Logo & Brand + Mobile Quick Utilities */}
          <div className="flex items-center justify-between w-full sm:w-auto min-w-0">
            <button
              type="button"
              onClick={() => handleTabChange('home')}
              className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0 cursor-pointer text-start hover:opacity-90 transition"
              title="Return to Home Hub"
            >
              <AppLogo size={28} className="shrink-0 drop-shadow-xs" />
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="font-semibold text-sm tracking-tight text-foreground truncate">
                  {t.brandTitle}
                </span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline font-mono">
                  {t.brandSubtitle}
                </span>
              </div>
            </button>

            {/* Mobile-only utilities on top row (Home, Language, Theme, API Keys) */}
            <div className="flex sm:hidden items-center gap-1.5 shrink-0">
              {/* Home Hub shortcut */}
              <button
                type="button"
                onClick={() => handleTabChange('home')}
                className={`w-7.5 h-7.5 rounded-lg border flex items-center justify-center cursor-pointer transition shadow-2xs ${
                  activeTab === 'home'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-foreground border-border hover:bg-accent'
                }`}
                title="All Tools Dashboard"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>

              {/* Language Switcher */}
              <button
                type="button"
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                className="px-2 h-7.5 rounded-lg bg-card hover:bg-accent border border-border flex items-center gap-1 text-xs font-semibold text-foreground cursor-pointer transition shadow-2xs"
                title="Toggle Language / تبديل اللغة"
              >
                <Languages className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-mono">{language === 'en' ? 'عربي' : 'EN'}</span>
              </button>

              {/* Theme Toggle */}
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-7.5 h-7.5 rounded-lg bg-card hover:bg-accent border border-border flex items-center justify-center text-foreground cursor-pointer transition shadow-2xs"
                title={theme === 'dark' ? t.switchToLight : t.switchToDark}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-slate-700" />
                )}
              </button>

              {/* API Keys Icon Button */}
              <button
                type="button"
                onClick={() => setIsKeyRingOpen(true)}
                className="w-7.5 h-7.5 rounded-lg bg-card hover:bg-accent border border-border flex items-center justify-center text-foreground cursor-pointer transition shadow-2xs"
                title="Manage API Keys"
              >
                <KeyRound className="w-3.5 h-3.5 text-primary" />
              </button>
            </div>
          </div>

          {/* Row 2 on Mobile (Horizontal Scroll Tabs) / Center on Desktop */}
          <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border shrink-0 min-w-0 w-full sm:w-auto overflow-x-auto no-scrollbar">
            {/* All Tools Hub Tab */}
            <button
              type="button"
              onClick={() => handleTabChange('home')}
              className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                activeTab === 'home'
                  ? 'bg-card text-foreground shadow-2xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="whitespace-nowrap">{t.allTools || 'All Tools'}</span>
            </button>

            {/* Tool 1: Metadata Studio */}
            <button
              type="button"
              onClick={() => handleTabChange('studio')}
              className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                activeTab === 'studio'
                  ? 'bg-card text-foreground shadow-2xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="whitespace-nowrap">{t.metadataStudio}</span>
              {masterCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono hidden md:inline-flex">
                  {masterCount}
                </Badge>
              )}
            </button>

            {/* Tool 2: Distribution Tracker */}
            <button
              type="button"
              onClick={() => handleTabChange('tracker')}
              className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                activeTab === 'tracker'
                  ? 'bg-card text-foreground shadow-2xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="whitespace-nowrap">{t.distributionTracker}</span>
              {trackerCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono hidden md:inline-flex">
                  {trackerCount}
                </Badge>
              )}
            </button>

            {/* Tool 3: Smart File Cleaner & Renamer */}
            <button
              type="button"
              onClick={() => handleTabChange('cleaner')}
              className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                activeTab === 'cleaner'
                  ? 'bg-card text-foreground shadow-2xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="whitespace-nowrap">{t.fileCleaner || 'File Cleaner'}</span>
            </button>

            {/* Tool 4: Lossless Video Muter */}
            <button
              type="button"
              onClick={() => handleTabChange('muter')}
              className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                activeTab === 'muter'
                  ? 'bg-card text-foreground shadow-2xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <VolumeX className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="whitespace-nowrap">{t.videoMuter || 'Video Muter'}</span>
            </button>
          </div>

          {/* Desktop-only Right Header Utilities (Language, Manage Keys, Theme Toggle, & Local DB Indicator) */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {/* Language Switcher */}
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="px-2.5 h-8 rounded-lg bg-card hover:bg-accent border border-border flex items-center gap-1.5 text-xs font-semibold text-foreground cursor-pointer transition shadow-2xs"
              title="Toggle Language / تبديل اللغة"
            >
              <Languages className="w-3.5 h-3.5 text-primary" />
              <span>{t.switchLanguage}</span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 rounded-lg bg-card hover:bg-accent border border-border flex items-center justify-center text-foreground cursor-pointer transition shadow-2xs"
              title={theme === 'dark' ? t.switchToLight : t.switchToDark}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-700" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsKeyRingOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card hover:bg-accent border border-border text-xs text-foreground cursor-pointer transition"
              title="Manage API Keys & Priority Cascade"
            >
              <KeyRound className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">{t.apiKeys}</span>
            </button>

            <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground font-mono pl-1 border-l border-border">
              <ShieldCheck className="w-3.5 h-3.5 text-foreground" />
              <span>{t.localDb}</span>
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
