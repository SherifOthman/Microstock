import React from 'react';
import { Layers, Copy } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ADOBE_CATEGORIES, getDreamstimeCategoryName } from '../../../constants/categories';
import { MasterMetadataRecord } from '../../../types';
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

  if (
    !rec?.categories ||
    (!rec.categories.adobeCategoryId &&
      (!rec.categories.shutterstockCategories || rec.categories.shutterstockCategories.length === 0) &&
      !rec.categories.dreamstimeCategory1 &&
      !rec.categories.dreamstimeCategory2 &&
      !rec.categories.dreamstimeCategory3)
  ) {
    return null;
  }

  const dtCats = [
    rec.categories?.dreamstimeCategory1,
    rec.categories?.dreamstimeCategory2,
    rec.categories?.dreamstimeCategory3,
  ]
    .filter((id): id is number => typeof id === 'number' && id > 0)
    .map((id) => getDreamstimeCategoryName(id))
    .filter(Boolean);

  const uniqueDtCats = Array.from(new Set(dtCats));

  return (
    <div dir="ltr" className="flex flex-col gap-1.5 pt-2 border-t border-border/60 text-xs text-left w-full min-w-0">
      {/* Primary Row: Categories Label, Adobe, Shutterstock, and Copy All Button */}
      <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
        <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px] shrink-0">
          <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{t.categories || 'Categories:'}</span>
        </div>

        {rec.categories?.adobeCategoryId && (
          <Badge variant="outline" className="text-[11px] gap-1 font-mono shrink-0">
            <span className="text-muted-foreground">Adobe:</span>
            <span className="font-semibold text-foreground">
              {ADOBE_CATEGORIES[rec.categories.adobeCategoryId] || `#${rec.categories.adobeCategoryId}`}
            </span>
          </Badge>
        )}

        {rec.categories?.shutterstockCategories && rec.categories.shutterstockCategories.length > 0 && (
          <Badge variant="outline" className="text-[11px] gap-1 font-mono shrink-0">
            <span className="text-muted-foreground">Shutterstock:</span>
            <span className="font-semibold text-foreground">
              {rec.categories.shutterstockCategories.filter(Boolean).join(', ')}
            </span>
          </Badge>
        )}

        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => onCopyAll(rec)}
          className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer ml-auto border-border shrink-0"
        >
          <Copy className="w-3 h-3" />
          <span>{t.copyAllMetadata || 'Copy All'}</span>
        </Button>
      </div>

      {/* Dedicated Dreamstime Row: Displays all up to 3 mapped categories cleanly */}
      {uniqueDtCats.length > 0 && (
        <div className="flex items-center gap-2 pl-5 w-full min-w-0">
          <Badge variant="outline" className="text-[11px] gap-1 font-mono max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="text-muted-foreground">Dreamstime:</span>
            <span className="font-semibold text-foreground">
              {uniqueDtCats.join(', ')}
            </span>
          </Badge>
        </div>
      )}
    </div>
  );
});

AssetCategoriesBadges.displayName = 'AssetCategoriesBadges';
