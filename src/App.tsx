import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { StudioView } from './features/studio/StudioView';
import { TrackerView } from './features/tracker/TrackerView';
import { keyRingScheduler } from './services/scheduler/KeyRingScheduler';
import { db, getAllApiKeys, updateApiKey } from './db';
import { ApiKeyRecord } from './types';
import { Badge } from './components/ui/badge';
import { ShieldCheck, Wand2, Layers, KeyRound, Sun, Moon } from 'lucide-react';
import { Dialog } from './components/ui/dialog';
import { KeyRingView } from './features/keyring/components/KeyRingView';
import { AppLogo } from './components/icons/AppLogo';

export function App() {
  const [, setKeys] = useState<ApiKeyRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'studio' | 'tracker'>(() => {
    return (localStorage.getItem('stock_active_tab') as 'studio' | 'tracker') || 'studio';
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

  const handleTabChange = (tab: 'studio' | 'tracker') => {
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
      {/* Sleek Minimal Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1700px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <AppLogo size={30} className="shrink-0 drop-shadow-sm" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-foreground">
                Microstock
              </span>
              <span className="text-[11px] text-muted-foreground hidden sm:inline font-mono">
                Studio
              </span>
            </div>
          </div>

          {/* Main Hub Tabs Switcher */}
          <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => handleTabChange('studio')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'studio'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="hidden xs:inline sm:inline">Metadata</span>
              <span className="xs:hidden sm:hidden">Studio</span>
              <span className="hidden sm:inline">Studio</span>
              {masterCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono hidden md:inline-flex">
                  {masterCount}
                </Badge>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('tracker')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'tracker'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="hidden xs:inline sm:inline">Distribution</span>
              <span className="xs:hidden sm:hidden">Tracker</span>
              <span className="hidden sm:inline">Tracker</span>
              {trackerCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono hidden md:inline-flex">
                  {trackerCount}
                </Badge>
              )}
            </button>
          </div>

          {/* Right Header Utilities: Manage Keys, Theme Toggle, & Local DB Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 rounded-lg bg-card hover:bg-accent border border-border flex items-center justify-center text-foreground cursor-pointer transition shadow-xs"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
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
              <span className="hidden sm:inline font-medium">API Keys</span>
            </button>

            <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground font-mono pl-1 border-l border-border">
              <ShieldCheck className="w-3.5 h-3.5 text-foreground" />
              <span>100% Local DB</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Single-Page Workspace */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto px-4 sm:px-6 py-5">
        {activeTab === 'studio' && <StudioView />}
        {activeTab === 'tracker' && <TrackerView />}
      </main>

      {/* Global API KeyRing Dialog */}
      <Dialog
        open={isKeyRingOpen}
        onClose={() => setIsKeyRingOpen(false)}
        title="API Keys Manager & Model Priority"
        description="Add, test, and set failover order across Gemini, OpenRouter, Groq, and Mistral."
        className="max-w-3xl"
      >
        <KeyRingView />
      </Dialog>
    </div>
  );
}

export default App;
