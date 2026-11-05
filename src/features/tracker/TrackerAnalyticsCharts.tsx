import React, { useMemo } from 'react';
import {
  MasterMetadataRecord,
  SupportedPlatform,
  TrackerAgencyStatus,
  TrackerSummaryStats,
} from '../../types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../components/ui/card';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { BarChart3, PieChart, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const AGENCIES: SupportedPlatform[] = [
  'adobe',
  'freepik',
  'shutterstock',
  'vecteezy',
  'dreamstime',
  '123rf',
];

const AGENCY_NAMES: Record<SupportedPlatform, string> = {
  adobe: 'Adobe Stock',
  freepik: 'Freepik',
  shutterstock: 'Shutterstock',
  vecteezy: 'Vecteezy',
  dreamstime: 'Dreamstime',
  '123rf': '123RF',
};

export interface TrackerAnalyticsChartsProps {
  records: MasterMetadataRecord[];
  stats?: TrackerSummaryStats;
  activeAgency?: SupportedPlatform;
  onSelectAgency?: (agency: SupportedPlatform) => void;
  onSelectStatusFilter?: (status: TrackerAgencyStatus | 'ALL') => void;
  compact?: boolean;
}

export const TrackerAnalyticsCharts: React.FC<TrackerAnalyticsChartsProps> = ({
  records,
  stats,
  activeAgency,
  onSelectAgency,
  onSelectStatusFilter,
  compact = false,
}) => {
  const { language } = useLanguage();

  const totalAssets = stats?.totalAssets ?? records.length;
  const totalSlots = Math.max(1, totalAssets * 6);

  const statusTotals = useMemo(() => {
    const newCount = stats?.newCount ?? 0;
    const pendingCount = stats?.pendingUploadCount ?? 0;
    const uploadedCount = (stats?.uploadedCount ?? 0) + (stats?.inReviewCount ?? 0);
    const acceptedCount = stats?.acceptedCount ?? 0;
    const rejectedCount = stats?.rejectedCount ?? 0;
    return {
      newCount,
      pendingCount,
      uploadedCount,
      acceptedCount,
      rejectedCount,
    };
  }, [stats]);

  const mediaBreakdown = useMemo(() => {
    let photos = 0;
    let vectors = 0;
    let videos = 0;
    for (const r of records) {
      if (r.mediaType === 'vector') vectors++;
      else if (r.mediaType === 'video') videos++;
      else photos++;
    }
    return { photos, vectors, videos };
  }, [records]);

  const topRejectionReasons = useMemo(() => {
    const counts = new Map<string, { title: string; count: number; agencies: Set<string> }>();
    for (const r of records) {
      if (!r.agencyTrackings) continue;
      for (const ag of AGENCIES) {
        const tr = r.agencyTrackings[ag];
        if (tr?.status === 'Rejected') {
          const title = tr.rejectionReasonTitle || 'Technical Quality / Artifacts';
          const existing = counts.get(title) || { title, count: 0, agencies: new Set<string>() };
          existing.count++;
          existing.agencies.add(AGENCY_NAMES[ag]);
          counts.set(title, existing);
        }
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [records]);

  // SVG Donut chart segments calculation
  const donutSegments = useMemo(() => {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const rawSlices = [
      {
        key: 'Accepted',
        label: 'Accepted',
        value: statusTotals.acceptedCount,
        color: '#10b981', // emerald-500
      },
      {
        key: 'Uploaded',
        label: 'Uploaded / Review',
        value: statusTotals.uploadedCount,
        color: '#3b82f6', // blue-500
      },
      {
        key: 'Pending Upload',
        label: 'Pending Upload',
        value: statusTotals.pendingCount,
        color: '#f59e0b', // amber-500
      },
      {
        key: 'Rejected',
        label: 'Rejected',
        value: statusTotals.rejectedCount,
        color: '#ef4444', // red-500
      },
      {
        key: 'New',
        label: 'New (Ready)',
        value: statusTotals.newCount,
        color: '#475569', // slate-600
      },
    ];

    const sum = rawSlices.reduce((acc, s) => acc + s.value, 0);
    if (sum === 0) {
      return {
        radius,
        circumference,
        slices: [
          {
            key: 'empty',
            label: 'Empty',
            value: 1,
            color: '#334155',
            strokeDasharray: `${circumference} 0`,
            strokeDashoffset: 0,
            pct: 0,
          },
        ],
        completionPct: 0,
      };
    }

    let accumulatedLength = 0;
    const slices = rawSlices
      .filter((s) => s.value > 0)
      .map((s) => {
        const fraction = s.value / sum;
        const segLen = fraction * circumference;
        const dashArray = `${segLen} ${Math.max(0, circumference - segLen)}`;
        const dashOffset = -accumulatedLength;
        accumulatedLength += segLen;
        return {
          ...s,
          strokeDasharray: dashArray,
          strokeDashoffset: dashOffset,
          pct: Math.round(fraction * 100),
        };
      });

    const completionPct = Math.round(
      ((statusTotals.acceptedCount + statusTotals.uploadedCount) / sum) * 100
    );

    return { radius, circumference, slices, completionPct };
  }, [statusTotals]);

  return (
    <div
      data-testid="tracker-analytics-charts"
      className={`grid grid-cols-1 ${
        compact ? 'lg:grid-cols-3 gap-2.5' : 'lg:grid-cols-3 gap-3'
      } shrink-0`}
    >
      {/* Chart 1: 6-Agency Distribution Stacked Bar Chart */}
      <Card className="bg-card border-border">
        <CardHeader className="p-3.5 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              <span>
                {language === 'ar'
                  ? 'مخطط التوزيع عبر الوكالات الست'
                  : '6-Agency Submission Progress'}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-emerald-500" /> Acc
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-blue-500" /> Upl
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-amber-500" /> Pend
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-destructive" /> Rej
              </span>
            </div>
          </div>
          <CardDescription className="text-[11px]">
            {language === 'ar'
              ? 'اضغط على أي وكالة للتركيز عليها وتصفية ملفاتها'
              : 'Stacked lifecycle breakdown per agency · Click any row to focus'}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-3.5 pt-1 space-y-1.5">
          {AGENCIES.map((ag) => {
            const agStats = stats?.perAgencyStats?.[ag] || {
              New: 0,
              'Pending Upload': 0,
              Uploaded: 0,
              'In Review': 0,
              Accepted: 0,
              Rejected: 0,
            };
            const totalForAg = Math.max(
              1,
              agStats.New +
                agStats['Pending Upload'] +
                agStats.Uploaded +
                agStats['In Review'] +
                agStats.Accepted +
                agStats.Rejected
            );
            const accPct = (agStats.Accepted / totalForAg) * 100;
            const uplPct = ((agStats.Uploaded + agStats['In Review']) / totalForAg) * 100;
            const pendPct = (agStats['Pending Upload'] / totalForAg) * 100;
            const rejPct = (agStats.Rejected / totalForAg) * 100;
            const sentCount = agStats.Accepted + agStats.Uploaded + agStats['In Review'];
            const isSelected = activeAgency === ag;

            return (
              <button
                key={ag}
                type="button"
                onClick={() => onSelectAgency?.(ag)}
                className={`w-full px-2 py-1 rounded-lg border text-start transition cursor-pointer flex items-center gap-2.5 ${
                  isSelected
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-transparent hover:bg-secondary/50'
                }`}
              >
                <div className="w-24 flex items-center gap-1.5 shrink-0 min-w-0">
                  <span className="shrink-0">{getPlatformLogo(ag, 12)}</span>
                  <span className="text-[11px] font-medium text-foreground truncate">
                    {AGENCY_NAMES[ag]}
                  </span>
                </div>

                {/* Stacked Bar */}
                <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden flex">
                  {accPct > 0 && (
                    <div
                      style={{ width: `${accPct}%` }}
                      className="bg-emerald-500 h-full transition-all"
                      title={`Accepted: ${agStats.Accepted}`}
                    />
                  )}
                  {uplPct > 0 && (
                    <div
                      style={{ width: `${uplPct}%` }}
                      className="bg-blue-500 h-full transition-all"
                      title={`Uploaded / In Review: ${agStats.Uploaded + agStats['In Review']}`}
                    />
                  )}
                  {pendPct > 0 && (
                    <div
                      style={{ width: `${pendPct}%` }}
                      className="bg-amber-500 h-full transition-all"
                      title={`Pending Upload: ${agStats['Pending Upload']}`}
                    />
                  )}
                  {rejPct > 0 && (
                    <div
                      style={{ width: `${rejPct}%` }}
                      className="bg-destructive h-full transition-all"
                      title={`Rejected: ${agStats.Rejected}`}
                    />
                  )}
                </div>

                <div className="w-16 text-end font-mono text-[10px] tabular-nums text-muted-foreground shrink-0">
                  {totalAssets === 0 ? '0/0' : `${sentCount}/${totalAssets}`}
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Chart 2: Portfolio Lifecycle Donut Chart & Media Composition */}
      <Card className="bg-card border-border">
        <CardHeader className="p-3.5 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-primary" />
              <span>
                {language === 'ar'
                  ? 'نسبة إنجاز المحفظة وأنواع الملفات'
                  : 'Portfolio Distribution & Media Mix'}
              </span>
            </CardTitle>
            <span className="text-[10px] font-mono text-muted-foreground">
              {totalAssets * 6} agency slots
            </span>
          </div>
          <CardDescription className="text-[11px]">
            {language === 'ar'
              ? 'إجمالي حالات الرفع عبر 6 وكالات وتصنيف الوسائط'
              : 'Global status ratio across all 6 agencies & asset types'}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-3.5 pt-1 flex flex-col justify-between gap-3">
          <div className="flex items-center gap-4">
            {/* SVG Donut Chart */}
            <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={donutSegments.radius}
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-secondary"
                />
                {donutSegments.slices.map((s) => (
                  <circle
                    key={s.key}
                    cx="50"
                    cy="50"
                    r={donutSegments.radius}
                    fill="transparent"
                    stroke={s.color}
                    strokeWidth="12"
                    strokeDasharray={s.strokeDasharray}
                    strokeDashoffset={s.strokeDashoffset}
                    className="transition-all duration-300"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-sm font-bold font-mono tabular-nums text-foreground">
                  {donutSegments.completionPct}%
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                  Sent
                </span>
              </div>
            </div>

            {/* Interactive Status Legend */}
            <div className="flex-1 space-y-1 text-xs">
              <button
                type="button"
                onClick={() => onSelectStatusFilter?.('Accepted')}
                className="w-full flex items-center justify-between px-2 py-0.5 rounded hover:bg-secondary/60 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Accepted
                </span>
                <span className="font-mono text-[11px] font-semibold text-foreground tabular-nums">
                  {statusTotals.acceptedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectStatusFilter?.('Uploaded')}
                className="w-full flex items-center justify-between px-2 py-0.5 rounded hover:bg-secondary/60 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Uploaded / Review
                </span>
                <span className="font-mono text-[11px] font-semibold text-foreground tabular-nums">
                  {statusTotals.uploadedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectStatusFilter?.('Pending Upload')}
                className="w-full flex items-center justify-between px-2 py-0.5 rounded hover:bg-secondary/60 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Pending Upload
                </span>
                <span className="font-mono text-[11px] font-semibold text-amber-500 tabular-nums">
                  {statusTotals.pendingCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectStatusFilter?.('New')}
                className="w-full flex items-center justify-between px-2 py-0.5 rounded hover:bg-secondary/60 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-slate-500" /> New (Unexported)
                </span>
                <span className="font-mono text-[11px] font-semibold text-foreground tabular-nums">
                  {statusTotals.newCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectStatusFilter?.('Rejected')}
                className="w-full flex items-center justify-between px-2 py-0.5 rounded hover:bg-secondary/60 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-destructive" /> Rejected
                </span>
                <span className="font-mono text-[11px] font-semibold text-destructive tabular-nums">
                  {statusTotals.rejectedCount}
                </span>
              </button>
            </div>
          </div>

          {/* Media Composition Mini Bar */}
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Layers className="w-3 h-3 text-primary" /> Media Mix:
            </span>
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <span>Photos: {mediaBreakdown.photos}</span>
              <span>Vectors: {mediaBreakdown.vectors}</span>
              <span>Videos: {mediaBreakdown.videos}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart 3: Rejection Dictionary Insights & Actionable Queue */}
      <Card className="bg-card border-border">
        <CardHeader className="p-3.5 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {language === 'ar'
                  ? 'تحليل أسباب الرفض وجودة القبول'
                  : 'Rejection Reasons & QA Telemetry'}
              </span>
            </CardTitle>
            <span className="text-[10px] font-mono text-muted-foreground">
              {statusTotals.rejectedCount} rejected
            </span>
          </div>
          <CardDescription className="text-[11px]">
            {language === 'ar'
              ? 'أكثر أسباب الرفض تكراراً عبر المنصات لتفاديها في الدفعات القادمة'
              : 'Top logged agency rejection reasons across your Master Vault'}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-3.5 pt-1 flex flex-col justify-between gap-2">
          {topRejectionReasons.length === 0 ? (
            <div className="py-5 px-3 rounded-lg bg-secondary/30 border border-border/60 flex flex-col items-center justify-center text-center gap-1.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div className="text-xs font-semibold text-foreground">
                Zero Rejections Logged
              </div>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                All submitted assets are currently clean. When an agency rejects a file, log its reason to track recurring QA patterns here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {topRejectionReasons.map((item) => {
                const maxRej = Math.max(1, statusTotals.rejectedCount);
                const pct = Math.round((item.count / maxRej) * 100);
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => onSelectStatusFilter?.('Rejected')}
                    className="w-full text-start space-y-1 p-1.5 rounded-lg hover:bg-secondary/50 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-foreground truncate">
                        {item.title}
                      </span>
                      <span className="font-mono text-[10px] text-destructive font-semibold shrink-0">
                        {item.count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-destructive rounded-full"
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      Agencies: {Array.from(item.agencies).join(', ')}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>Approval Health:</span>
            <span className="text-emerald-500 font-semibold">
              {totalSlots > 0
                ? `${Math.round(((totalSlots - statusTotals.rejectedCount) / totalSlots) * 100)}% Clean`
                : '100% Clean'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
