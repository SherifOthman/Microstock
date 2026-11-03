import React from 'react';
import { MasterMetadataRecord } from '../../../types';
import { ADOBE_CATEGORIES } from '../../../constants/adobeCategories';
import { DREAMSTIME_CATEGORIES } from '../../../constants/dreamstimeCategories';
import { Button } from '../../../components/ui/button';
import { Layers, Copy } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

export interface AssetCategoriesBadgesProps {
  rec: MasterMetadataRecord;
  onCopyAll: (rec: MasterMetadataRecord) => void;
}

export const AssetCategoriesBadges: React.FC<AssetCategoriesBadgesProps> = React.memo(({
  rec,
  onCopyAll,
}) => {
  const { t } = useLanguage();

  const dtDisplayNames = [
    rec.categories?.dreamstimeCategory1,
    rec.categories?.dreamstimeCategory2,
    rec.categories?.dreamstimeCategory3,
  ]
    .filter((id): id is number => Boolean(id))
    .map((id) => DREAMSTIME_CATEGORIES[id] || `#${id}`)
    .join(', ');

  return (
    <div className="pt-2.5 border-t border-border flex flex-col gap-2 text-xs">
      {/* Row 1: Label, Adobe & Shutterstock Categories, and Copy All Action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="text-muted-foreground flex items-center gap-1 font-sans font-medium">
            <Layers className="w-3 h-3 text-primary" />
            {t.agencyCategories}:
          </span>

          {rec.categories?.adobeCategoryId && (
            <span className="px-2 py-0.5 rounded bg-secondary border border-border text-foreground">
              Adobe: {ADOBE_CATEGORIES[rec.categories.adobeCategoryId] || `#${rec.categories.adobeCategoryId}`}
            </span>
          )}

          {rec.categories?.shutterstockCategories?.length ? (
            <span className="px-2 py-0.5 rounded bg-secondary border border-border text-foreground">
              Shutterstock: {rec.categories.shutterstockCategories.join(', ')}
            </span>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onCopyAll(rec)}
          className="h-6.5 text-[11px] gap-1.5 px-2.5 cursor-pointer shrink-0"
        >
          <Copy className="w-3 h-3" />
          <span>{t.copyFullMetadata}</span>
        </Button>
      </div>

      {/* Row 2: Dedicated Full-Width Row for Dreamstime 3 Categories */}
      {rec.categories?.dreamstimeCategory1 && (
        <div className="flex items-center">
          <span className="px-2 py-0.5 rounded bg-secondary border border-border text-foreground text-[11px] font-mono">
            Dreamstime: {dtDisplayNames}
          </span>
        </div>
      )}
    </div>
  );
});

AssetCategoriesBadges.displayName = 'AssetCategoriesBadges';
