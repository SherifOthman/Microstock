import React, { useState } from 'react';
import { db, useSqliteQuery } from '../../db';
import { SupportedPlatform } from '../../types';
import { AppLogo } from '../../components/icons/AppLogo';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { Button } from '../../components/ui/button';
import {
  ArrowUpRight,
  FileSpreadsheet,
  KeyRound,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { TrackerAnalyticsCharts } from '../tracker/TrackerAnalyticsCharts';
import { seedMassiveContributorPortfolio } from '../../services/tracker/portfolioSeeder';

export interface HomeHubViewProps {
  onNavigate?: (
    tool: 'tracker' | 'studio' | 'cleaner' | 'muter' | 'eps' | 'ftp',
    focusAgency?: SupportedPlatform
  ) => void;
  onOpenKeyRing?: () => void;
  onOpenTemplates?: () => void;
}

const AGENCY_CARDS: Array<{
  id: SupportedPlatform;
  name: string;
}> = [
  { id: 'adobe', name: 'Adobe Stock' },
  { id: 'freepik', name: 'Freepik' },
  { id: 'shutterstock', name: 'Shutterstock' },
  { id: 'vecteezy', name: 'Vecteezy' },
  { id: 'dreamstime', name: 'Dreamstime' },
  { id: '123rf', name: '123RF' },
];

/**
 * Contributor Morning Command Center (Overview)
 * 100% data-driven: 6 Agency Readiness Cards (1-click jump to Tracker Focus Mode) + Portfolio Analytics Charts.
 */
export const HomeHubView: React.FC<HomeHubViewProps> = ({
  onNavigate,
  onOpenKeyRing,
  onOpenTemplates,
}) => {
  const { language } = useLanguage();
  const [isSeeding, setIsSeeding] = useState(false);

  const masterRecords = useSqliteQuery(() => db.masterRecords.toArray(), [], []) || [];
  const masterCount = masterRecords.length;
  const trackerStats = useSqliteQuery(() => db.tracker.getStats(), [masterCount], undefined);

  const handleSeedDemoPortfolio = async () => {
    if (isSeeding) return;
    setIsSeeding(true);
    try {
      await seedMassiveContributorPortfolio(50);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Compact Top Command Bar with Global Portfolio Counters */}
      <div className="px-4 py-3 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AppLogo size={28} className="shrink-0" />
          <div>
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground">
              {language === 'ar' ? 'مركز عمليات المساهم' : 'Contributor Overview'}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono tabular-nums">
              <span>{masterCount} Assets in Vault</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">
                {trackerStats?.acceptedCount ?? 0} Accepted
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400">
                {trackerStats?.pendingUploadCount ?? 0} Pending
              </span>
              {(trackerStats?.rejectedCount ?? 0) > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-destructive font-semibold">
                    {trackerStats?.rejectedCount} Needs Fix
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant={masterCount === 0 ? 'default' : 'outline'}
            size="sm"
            disabled={isSeeding}
            onClick={handleSeedDemoPortfolio}
            data-testid="seed-50-portfolio-btn"
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            {isSeeding ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            )}
            <span>
              {masterCount === 0 ? 'Load 50 Sample Assets' : 'Reset 50 Sample Assets'}
            </span>
          </Button>

          {onOpenKeyRing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenKeyRing}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-primary" />
              <span>{language === 'ar' ? 'مفاتيح AI' : 'AI Keys'}</span>
            </Button>
          )}

          {onOpenTemplates && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenTemplates}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
              <span>{language === 'ar' ? 'قوالب CSV' : 'CSV Specs'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Section 1: 6 Agency Readiness Cards (1-Click Jump -> Opens Tracker Focused on Selected Agency) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold text-foreground">
            {language === 'ar'
              ? 'جاهزية الوكالات الست (اضغط للفتح والتصدير فوراً)'
              : 'Agency Upload Readiness — Click any agency to jump to Tracker'}
          </h2>
          <span className="text-xs text-muted-foreground">
            {language === 'ar' ? 'توجيه فوري بضغطة واحدة' : '1-Click Focus Mode Jump'}
          </span>
        </div>

        <div
          data-testid="agency-readiness-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5"
        >
          {AGENCY_CARDS.map((agency) => {
            const agStats = trackerStats?.perAgencyStats?.[agency.id] || {
              New: 0,
              'Pending Upload': 0,
              Uploaded: 0,
              'In Review': 0,
              Accepted: 0,
              Rejected: 0,
            };
            const newReady = agStats.New;
            const pending = agStats['Pending Upload'];
            const accepted = agStats.Accepted + agStats.Uploaded + agStats['In Review'];
            const rejected = agStats.Rejected;
            const total = Math.max(1, masterCount);
            const sentPct = Math.min(100, Math.round((accepted / total) * 100));

            return (
              <button
                key={agency.id}
                type="button"
                data-testid={`agency-readiness-card-${agency.id}`}
                onClick={() => onNavigate?.('tracker', agency.id)}
                className="group p-3.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-secondary/30 transition-all text-start flex flex-col justify-between gap-3 cursor-pointer"
              >
                {/* Agency Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{getPlatformLogo(agency.id, 18)}</span>
                    <span className="text-xs font-bold text-foreground truncate">
                      {agency.name}
                    </span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                </div>

                {/* Primary Hero Metric: Ready to Export (New) */}
                <div className="space-y-0.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-bold font-mono tabular-nums text-foreground">
                      {newReady}
                    </span>
                    <span className="text-[11px] font-medium text-primary">
                      Ready to Export
                    </span>
                  </div>

                  {/* Secondary Unboxed Metrics Line */}
                  <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-muted-foreground pt-0.5">
                    <span className={pending > 0 ? 'text-amber-400 font-medium' : ''}>
                      {pending} Pending
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={rejected > 0 ? 'text-destructive font-semibold' : ''}>
                      {rejected > 0 ? `${rejected} Rejected` : `${accepted} Sent`}
                    </span>
                  </div>
                </div>

                {/* Slim Completion Bar */}
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden flex">
                  {sentPct > 0 && (
                    <div
                      style={{ width: `${sentPct}%` }}
                      className="h-full bg-emerald-500 transition-all"
                    />
                  )}
                  {pending > 0 && (
                    <div
                      style={{ width: `${Math.min(100 - sentPct, Math.round((pending / total) * 100))}%` }}
                      className="h-full bg-amber-500 transition-all"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Portfolio Health & Distribution Analytics Charts */}
      <TrackerAnalyticsCharts
        records={masterRecords}
        stats={trackerStats}
        onSelectAgency={(agency) => onNavigate?.('tracker', agency)}
        onSelectStatusFilter={() => onNavigate?.('tracker')}
      />
    </div>
  );
};
