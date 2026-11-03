import React from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { Tooltip } from '../../../components/ui/tooltip';

export interface AssetAiBadgeProps {
  showAiBadge: boolean;
  isAiActive: boolean;
  hasNonAscii?: boolean;
  language?: string;
}

export const AssetAiBadge: React.FC<AssetAiBadgeProps> = React.memo(({
  showAiBadge,
  isAiActive,
  hasNonAscii = false,
  language = 'en',
}) => {
  return (
    <div className="inline-flex items-center gap-1 shrink-0">
      {showAiBadge && (
        <Tooltip
          content={
            isAiActive
              ? language === 'ar'
                ? 'مُعلّم كمحتوى AI للتصدير'
                : 'Flagged as AI-Generated for export'
              : language === 'ar'
              ? 'خيار AI غير مفعّل في إعدادات المنصة'
              : 'AI flag is disabled in platform settings'
          }
        >
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              isAiActive
                ? 'border-primary/30 text-primary bg-primary/10'
                : 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10'
            }`}
          >
            {isAiActive ? (
              <Sparkles className="w-2.5 h-2.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
            )}
            <span>{isAiActive ? 'AI' : language === 'ar' ? 'AI متوقف' : 'AI Off'}</span>
          </span>
        </Tooltip>
      )}

      {hasNonAscii && (
        <Tooltip
          content={
            language === 'ar'
              ? 'اسم الملف يحتوي على رموز غير قياسية؛ يُنصح بتنظيفه في منظم الملفات'
              : 'Filename contains non-ASCII characters; sanitize in File Cleaner'
          }
        >
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10">
            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
            <span>ASCII</span>
          </span>
        </Tooltip>
      )}
    </div>
  );
});

AssetAiBadge.displayName = 'AssetAiBadge';
