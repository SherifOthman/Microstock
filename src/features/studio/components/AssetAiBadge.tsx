import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';

export interface AssetAiBadgeProps {
  showAiBadge: boolean;
  isAiActive: boolean;
  hasNonAscii: boolean;
  language: string;
}

export const AssetAiBadge: React.FC<AssetAiBadgeProps> = React.memo(({
  showAiBadge,
  isAiActive,
  hasNonAscii,
  language,
}) => {
  return (
    <>
      {showAiBadge && (
        isAiActive ? (
          <Badge variant="outline" className="h-4 px-1.5 text-[9px] gap-1 font-semibold text-blue-500 border-blue-500/30 bg-blue-500/10 shrink-0">
            <span>🤖 AI Generated</span>
          </Badge>
        ) : (
          <Badge variant="outline" className="h-4 px-1.5 text-[9px] gap-1 font-bold text-amber-600 border-amber-500/40 bg-amber-500/15 shrink-0 animate-pulse" title="Active platforms (Freepik/Dreamstime) require AI declaration">
            <span>⚠️ AI Not Flagged</span>
          </Badge>
        )
      )}

      {hasNonAscii && (
        <Badge
          variant="outline"
          className="h-4 px-1 text-[9px] gap-0.5 font-semibold text-amber-500 border-amber-500/30 bg-amber-500/10 shrink-0"
          title={language === 'ar' ? 'اسم الملف يحتوي على أحرف غير إنجليزية أو نقاط حذف (…) مما قد يعطل مطابقة CSV' : 'Filename contains non-ASCII characters or ellipsis (…) which may fail CSV matching'}
        >
          <AlertTriangle className="w-2.5 h-2.5" />
          <span>Non-ASCII</span>
        </Badge>
      )}
    </>
  );
});

AssetAiBadge.displayName = 'AssetAiBadge';
