import React from 'react';
import { SupportedPlatform } from '../../../types';
import { getPlatformLogo } from '../../../components/icons/StockLogos';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Filter, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  platformId: SupportedPlatform;
  platformName: string;
  uploadedCount: number;
  pendingCount: number;
  totalAssets: number;
  batchLimit: number;
  limitPeriod: 'batch' | 'daily' | 'weekly';
  isActiveFilter: boolean;
  onFilterUnuploaded: (platformId: SupportedPlatform) => void;
  onSelectBatchUnuploaded: (platformId: SupportedPlatform, count: number) => void;
}

export const PlatformQuotaCard: React.FC<Props> = ({
  platformId,
  platformName,
  uploadedCount,
  pendingCount,
  totalAssets,
  batchLimit,
  limitPeriod,
  isActiveFilter,
  onFilterUnuploaded,
  onSelectBatchUnuploaded,
}) => {
  const unuploadedCount = Math.max(0, totalAssets - (uploadedCount + pendingCount));
  const percent = totalAssets > 0 ? Math.round((uploadedCount / totalAssets) * 100) : 0;

  return (
    <Card
      className={`transition border rounded-xl ${
        isActiveFilter
          ? 'border-primary ring-1 ring-primary/40 bg-accent/20'
          : 'border-border/80 bg-card/60 hover:border-border'
      }`}
    >
      <CardContent className="p-3.5 space-y-2.5">
        {/* Header: Platform logo + Name + Quota Badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0">{getPlatformLogo(platformId, 18)}</div>
            <span className="text-xs font-semibold text-foreground truncate">{platformName}</span>
          </div>

          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-muted-foreground">
            {batchLimit}/{limitPeriod}
          </Badge>
        </div>

        {/* Stats Row */}
        <div className="flex items-baseline justify-between text-xs">
          <div>
            <span className="text-lg font-bold font-mono text-emerald-400">{uploadedCount}</span>
            <span className="text-muted-foreground text-[11px] font-mono"> / {totalAssets}</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {unuploadedCount > 0 ? (
              <span className="text-amber-400 font-semibold">{unuploadedCount} missing</span>
            ) : (
              <span className="text-emerald-400">All uploaded ✓</span>
            )}
          </div>
        </div>

        {/* Mini Progress Bar */}
        <div className="w-full bg-secondary/60 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 pt-1">
          <Button
            type="button"
            size="sm"
            variant={isActiveFilter ? 'default' : 'outline'}
            onClick={() => onFilterUnuploaded(platformId)}
            className="h-6 text-[10px] flex-1 gap-1 px-1.5 cursor-pointer"
            title={`Filter only assets not uploaded to ${platformName}`}
          >
            <Filter className="w-2.5 h-2.5" />
            <span>{isActiveFilter ? 'Showing Missing' : 'Show Missing'}</span>
          </Button>

          {unuploadedCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onSelectBatchUnuploaded(platformId, batchLimit)}
              className="h-6 text-[10px] px-2 text-foreground hover:text-primary cursor-pointer shrink-0"
              title={`Select next ${batchLimit} missing files for ${platformName}`}
            >
              Select {Math.min(batchLimit, unuploadedCount)}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
