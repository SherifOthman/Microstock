import { MasterMetadataRecord, SupportedPlatform } from '../../types';

export interface AgencyPreflightWarning {
  agencyId: SupportedPlatform;
  code: string;
  shortLabel: string;
  detail: string;
  severity: 'warning' | 'error';
}

/**
 * Evaluates a single MasterMetadataRecord against the strict structural, character,
 * and keyword rules of the specified stock agency.
 */
export function evaluateAgencyPreflight(
  rec: MasterMetadataRecord,
  agencyId: SupportedPlatform
): AgencyPreflightWarning[] {
  const warnings: AgencyPreflightWarning[] = [];
  const title = (rec.baseTitle || '').trim();
  const desc = (rec.detailedDescription || '').trim();
  const keywords = rec.rankedKeywords || [];
  const titleLen = title.length;
  const descLen = desc.length;
  const kwCount = keywords.length;
  const titleWords = title ? title.split(/\s+/).filter(Boolean).length : 0;
  const descWords = desc ? desc.split(/\s+/).filter(Boolean).length : 0;
  const isVideo = (rec.mediaType || 'image') === 'video';
  const hasAudio = Boolean(rec.videoMeta?.hasAudio);

  switch (agencyId) {
    case 'adobe': {
      if (titleLen > 200) {
        warnings.push({
          agencyId: 'adobe',
          code: 'ADOBE_TITLE_OVER_200',
          shortLabel: `Title ${titleLen}/200 chars`,
          detail: `Adobe Stock maximum title length is 200 characters (current: ${titleLen}).`,
          severity: 'warning',
        });
      }
      if (kwCount > 49) {
        warnings.push({
          agencyId: 'adobe',
          code: 'ADOBE_KEYWORDS_OVER_49',
          shortLabel: `${kwCount}/49 Keywords`,
          detail: `Adobe Stock allows up to 49 keywords (current: ${kwCount}). Excess tags may be truncated or rejected.`,
          severity: 'warning',
        });
      } else if (kwCount < 5) {
        warnings.push({
          agencyId: 'adobe',
          code: 'ADOBE_KEYWORDS_UNDER_5',
          shortLabel: `${kwCount} Keywords (Min 5)`,
          detail: `Adobe Stock requires at least 5 relevant keywords (current: ${kwCount}).`,
          severity: 'warning',
        });
      }
      break;
    }

    case 'shutterstock': {
      if (kwCount > 50) {
        warnings.push({
          agencyId: 'shutterstock',
          code: 'SHUTTER_KEYWORDS_OVER_50',
          shortLabel: `${kwCount}/50 Keywords`,
          detail: `Shutterstock strictly enforces a 50-keyword maximum (current: ${kwCount}).`,
          severity: 'warning',
        });
      } else if (kwCount < 7) {
        warnings.push({
          agencyId: 'shutterstock',
          code: 'SHUTTER_KEYWORDS_UNDER_7',
          shortLabel: `${kwCount} Keywords (Min 7)`,
          detail: `Shutterstock requires at least 7 keywords for indexing (current: ${kwCount}).`,
          severity: 'warning',
        });
      }
      if (descLen > 200 && titleLen > 200) {
        warnings.push({
          agencyId: 'shutterstock',
          code: 'SHUTTER_DESC_OVER_200',
          shortLabel: `Desc ${descLen}/200 chars`,
          detail: `Shutterstock description field caps at 200 characters (current: ${descLen}).`,
          severity: 'warning',
        });
      }
      if (isVideo && hasAudio) {
        warnings.push({
          agencyId: 'shutterstock',
          code: 'SHUTTER_VIDEO_AUDIO',
          shortLabel: 'Unstripped Audio',
          detail: 'Shutterstock rejects footage containing unlicensed ambient or mic audio.',
          severity: 'error',
        });
      }
      break;
    }

    case 'freepik': {
      if (isVideo) {
        warnings.push({
          agencyId: 'freepik',
          code: 'FREEPIK_NO_VIDEO_CSV',
          shortLabel: 'Video Blocked on Freepik',
          detail: 'Freepik CSV pipeline supports Photos and Vectors only.',
          severity: 'error',
        });
      }
      if (titleLen > 100) {
        warnings.push({
          agencyId: 'freepik',
          code: 'FREEPIK_TITLE_OVER_100',
          shortLabel: `Title ${titleLen}/100 chars`,
          detail: `Freepik recommends titles under 100 characters (current: ${titleLen}).`,
          severity: 'warning',
        });
      }
      if (kwCount > 50) {
        warnings.push({
          agencyId: 'freepik',
          code: 'FREEPIK_KEYWORDS_OVER_50',
          shortLabel: `${kwCount}/50 Keywords`,
          detail: `Freepik caps keywords at 50 tags (current: ${kwCount}).`,
          severity: 'warning',
        });
      } else if (kwCount < 10) {
        warnings.push({
          agencyId: 'freepik',
          code: 'FREEPIK_KEYWORDS_UNDER_10',
          shortLabel: `${kwCount} Keywords (Min 10)`,
          detail: `Freepik requires at least 10 keywords per asset (current: ${kwCount}).`,
          severity: 'warning',
        });
      }
      break;
    }

    case 'vecteezy': {
      if (titleWords > 0 && titleWords < 3) {
        warnings.push({
          agencyId: 'vecteezy',
          code: 'VECTEEZY_TITLE_SHORT',
          shortLabel: `Title < 3 words`,
          detail: `Vecteezy requires descriptive titles with at least 3 words (current: ${titleWords}).`,
          severity: 'warning',
        });
      } else if (titleLen > 200) {
        warnings.push({
          agencyId: 'vecteezy',
          code: 'VECTEEZY_TITLE_OVER_200',
          shortLabel: `Title ${titleLen}/200 chars`,
          detail: `Vecteezy maximum title length is 200 characters (current: ${titleLen}).`,
          severity: 'warning',
        });
      }
      if (kwCount > 50) {
        warnings.push({
          agencyId: 'vecteezy',
          code: 'VECTEEZY_KEYWORDS_OVER_50',
          shortLabel: `${kwCount}/50 Keywords`,
          detail: `Vecteezy allows a maximum of 50 keywords (current: ${kwCount}).`,
          severity: 'warning',
        });
      } else if (kwCount < 5) {
        warnings.push({
          agencyId: 'vecteezy',
          code: 'VECTEEZY_KEYWORDS_UNDER_5',
          shortLabel: `${kwCount} Keywords (Min 5)`,
          detail: `Vecteezy requires at least 5 keywords (current: ${kwCount}).`,
          severity: 'warning',
        });
      }
      break;
    }

    case 'dreamstime': {
      if (titleLen > 130) {
        warnings.push({
          agencyId: 'dreamstime',
          code: 'DT_TITLE_OVER_130',
          shortLabel: `Title ${titleLen}/130 chars`,
          detail: `Dreamstime caps titles at 130 characters (current: ${titleLen}).`,
          severity: 'warning',
        });
      }
      if (descWords < 5) {
        warnings.push({
          agencyId: 'dreamstime',
          code: 'DT_DESC_SHORT',
          shortLabel: `Desc < 5 words`,
          detail: `Dreamstime requires a detailed description of at least 5 words (current: ${descWords}).`,
          severity: 'warning',
        });
      }
      if (kwCount > 80) {
        warnings.push({
          agencyId: 'dreamstime',
          code: 'DT_KEYWORDS_OVER_80',
          shortLabel: `${kwCount}/80 Keywords`,
          detail: `Dreamstime allows up to 80 keywords (current: ${kwCount}).`,
          severity: 'warning',
        });
      } else if (kwCount < 10) {
        warnings.push({
          agencyId: 'dreamstime',
          code: 'DT_KEYWORDS_UNDER_10',
          shortLabel: `${kwCount} Keywords (Min 10)`,
          detail: `Dreamstime requires at least 10 keywords (current: ${kwCount}).`,
          severity: 'warning',
        });
      }
      break;
    }

    case '123rf': {
      if (titleLen > 110) {
        warnings.push({
          agencyId: '123rf',
          code: 'RF_TITLE_OVER_110',
          shortLabel: `Title ${titleLen}/110 chars`,
          detail: `123RF recommends titles under 110 characters (current: ${titleLen}).`,
          severity: 'warning',
        });
      }
      if (!desc) {
        warnings.push({
          agencyId: '123rf',
          code: 'RF_DESC_EMPTY',
          shortLabel: 'Missing Description',
          detail: '123RF requires a non-empty commercial description.',
          severity: 'warning',
        });
      }
      if (kwCount > 50) {
        warnings.push({
          agencyId: '123rf',
          code: 'RF_KEYWORDS_OVER_50',
          shortLabel: `${kwCount}/50 Keywords`,
          detail: `123RF caps keywords at 50 tags (current: ${kwCount}).`,
          severity: 'warning',
        });
      } else if (kwCount < 7) {
        warnings.push({
          agencyId: '123rf',
          code: 'RF_KEYWORDS_UNDER_7',
          shortLabel: `${kwCount} Keywords (Min 7)`,
          detail: `123RF requires at least 7 keywords (current: ${kwCount}).`,
          severity: 'warning',
        });
      }
      break;
    }
  }

  return warnings;
}
