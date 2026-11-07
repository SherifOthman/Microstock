import { db } from '../../db';
import {
  AgencyTrackingRecord,
  MasterMetadataRecord,
  MediaType,
  SupportedPlatform,
  TrackerAgencyStatus,
} from '../../types';

const ALL_AGENCIES: SupportedPlatform[] = [
  'adobe',
  'freepik',
  'shutterstock',
  'vecteezy',
  'dreamstime',
  '123rf',
];

interface SeedTemplate {
  subject: string;
  category: string;
  batchId: string;
  mediaType: MediaType;
  isAi: boolean;
  palette: [string, string, string];
  keywords: string[];
}

const SEED_TEMPLATES: SeedTemplate[] = [
  {
    subject: 'Minimalist Travertine Kitchen Island Morning Sun',
    category: 'Architecture',
    batchId: 'B01',
    mediaType: 'image',
    isAi: true,
    palette: ['#1e293b', '#475569', '#f59e0b'],
    keywords: ['kitchen', 'travertine', 'minimalist', 'interior', 'architecture', 'marble', 'sunlight', 'modern', 'luxury', 'home'],
  },
  {
    subject: 'Nordic Walnut Living Room Panoramic Window',
    category: 'Interiors',
    batchId: 'B01',
    mediaType: 'image',
    isAi: false,
    palette: ['#0f172a', '#334155', '#38bdf8'],
    keywords: ['nordic', 'scandinavian', 'living room', 'walnut', 'sofa', 'interior design', 'minimal', 'cozy', 'daylight', 'decor'],
  },
  {
    subject: 'Aerial Dolomites Mountain Ridge Golden Hour 4K',
    category: 'Nature Drone',
    batchId: 'B02',
    mediaType: 'video',
    isAi: false,
    palette: ['#0c4a6e', '#0284c7', '#fbbf24'],
    keywords: ['aerial', 'drone', 'mountains', 'dolomites', 'sunrise', 'golden hour', 'landscape', 'cinema', '4k', 'nature'],
  },
  {
    subject: 'Isometric Cloud Cybersecurity Analytics Vector',
    category: 'Fintech Vector',
    batchId: 'B03',
    mediaType: 'vector',
    isAi: false,
    palette: ['#1e1b4b', '#4338ca', '#22d3ee'],
    keywords: ['isometric', 'cybersecurity', 'cloud', 'fintech', 'vector', 'infographic', 'data', 'network', 'shield', 'technology'],
  },
  {
    subject: 'Artisan Espresso Pour Crema Macro Slow Motion',
    category: 'Culinary',
    batchId: 'B04',
    mediaType: 'video',
    isAi: false,
    palette: ['#271c19', '#78350f', '#d97706'],
    keywords: ['espresso', 'coffee', 'barista', 'macro', 'crema', 'roastery', 'cafe', 'slow motion', 'beverage', 'artisan'],
  },
  {
    subject: 'Bioluminescent Botanical Glasshouse Atrium',
    category: 'Concept Art',
    batchId: 'B05',
    mediaType: 'image',
    isAi: true,
    palette: ['#022c22', '#059669', '#34d399'],
    keywords: ['botanical', 'glasshouse', 'greenhouse', 'plants', 'architecture', 'biophilic', 'sustainable', 'tropical', 'garden', 'light'],
  },
  {
    subject: 'GeometricBauhaus Brand Identity Badge Collection',
    category: 'Vector Pack',
    batchId: 'B03',
    mediaType: 'vector',
    isAi: false,
    palette: ['#18181b', '#3f3f46', '#f43f5e'],
    keywords: ['bauhaus', 'geometric', 'vector', 'branding', 'logo', 'badges', 'minimal', 'typography', 'grid', 'design'],
  },
  {
    subject: 'Solar Farm Photovoltaic Panels Desert Sunset',
    category: 'Renewable Energy',
    batchId: 'B02',
    mediaType: 'image',
    isAi: false,
    palette: ['#172554', '#1d4ed8', '#fb923c'],
    keywords: ['solar', 'renewable', 'energy', 'photovoltaic', 'sustainability', 'clean energy', 'power', 'sunset', 'grid', 'ecology'],
  },
  {
    subject: 'Matcha Whisking Ceramic Bowl Zen Tea Ceremony',
    category: 'Culinary',
    batchId: 'B04',
    mediaType: 'image',
    isAi: false,
    palette: ['#14532d', '#16a34a', '#bbf7d0'],
    keywords: ['matcha', 'green tea', 'ceremony', 'ceramic', 'zen', 'organic', 'wellness', 'antioxidant', 'japanese', 'culinary'],
  },
  {
    subject: 'Futuristic Autonomous Electric Vehicle Studio Profile',
    category: 'Mobility',
    batchId: 'B05',
    mediaType: 'image',
    isAi: true,
    palette: ['#09090b', '#27272a', '#60a5fa'],
    keywords: ['electric vehicle', 'automotive', 'autonomous', 'concept car', 'studio lighting', 'mobility', 'transport', 'aerodynamic', 'sleek', 'future'],
  },
];

/**
 * Generates a high-contrast photographic/vector/video SVG scene data URI
 * so every Gallery Card has a distinct, crisp visual preview without external network dependencies.
 */
function buildSceneDataUri(
  index: number,
  title: string,
  category: string,
  mediaType: MediaType,
  palette: [string, string, string]
): string {
  const [c1, c2, accent] = palette;
  const sunX = 160 + ((index * 47) % 280);
  const sunY = 75 + ((index * 23) % 60);
  const waveOffset = (index * 19) % 45;

  const badgeText =
    mediaType === 'video' ? '4K 60FPS' : mediaType === 'vector' ? 'EPS VECTOR' : 'RAW PHOTO';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <defs>
      <linearGradient id="bg_${index}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="65%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="#09090b"/>
      </linearGradient>
      <radialGradient id="glow_${index}" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.48"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="640" height="480" fill="url(#bg_${index})"/>
    <circle cx="${sunX}" cy="${sunY}" r="150" fill="url(#glow_${index})"/>
    <circle cx="${sunX}" cy="${sunY}" r="42" fill="${accent}" fill-opacity="0.82"/>
    <path d="M0 ${320 - waveOffset} Q 180 ${240 + waveOffset}, 360 ${310 - waveOffset} T 640 ${290 + waveOffset} L 640 480 L 0 480 Z" fill="#09090b" fill-opacity="0.45"/>
    <path d="M0 ${365 + waveOffset / 2} Q 240 ${300 - waveOffset}, 450 ${360 + waveOffset} T 640 355 L 640 480 L 0 480 Z" fill="#09090b" fill-opacity="0.78"/>
    <rect x="24" y="24" width="110" height="28" rx="6" fill="#09090b" fill-opacity="0.65" stroke="${accent}" stroke-opacity="0.5"/>
    <text x="79" y="42" fill="#f8fafc" font-family="monospace" font-size="11" font-weight="bold" text-anchor="middle">${badgeText}</text>
    <text x="28" y="426" fill="${accent}" font-family="sans-serif" font-size="12" font-weight="600" letter-spacing="1">${category.toUpperCase()}</text>
    <text x="28" y="450" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="700">${title.slice(0, 38)}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Strips raw batch prefixes (e.g., `B01_AI_PH_001_`) and extensions from filenames
 * so the contributor never has to read ugly database strings.
 */
export function getCleanAssetDisplayTitle(rec: MasterMetadataRecord): string {
  if (rec.baseTitle && rec.baseTitle.trim().length > 0) {
    return rec.baseTitle.trim();
  }
  const raw = (rec.filename || '').replace(/\.[^.]+$/, '');
  const stripped = raw
    .replace(/^B\d{2}[-_](?:(?:AI|NT)[-_][A-Z]{2}[-_])?\d{3}[-_]+/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!stripped) return rec.filename;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * Seeds 50 realistic heterogeneous microstock assets into SQLite covering:
 * - 20 `New` assets (Ready for 1-click export)
 * - 15 `Pending Upload` assets (Staged in Export Baskets)
 * - 10 `Accepted` / `Uploaded` assets
 * - 5 `Rejected` assets (With specific agency rejection reasons & notes for Fix & Re-Queue)
 */
export async function seedMassiveContributorPortfolio(count = 50): Promise<{ seededCount: number }> {
  const existing = await db.masterRecords.toArray();
  const trackerIdsToClear = existing.filter((r) => r.workspaceScope !== 'studio').map((r) => r.id);
  if (trackerIdsToClear.length === existing.length) {
    await db.masterRecords.clear();
  } else if (trackerIdsToClear.length > 0) {
    await db.masterRecords.bulkDelete(trackerIdsToClear);
  }
  const now = Date.now();
  const records: MasterMetadataRecord[] = [];

  const rejectionReasons = [
    {
      id: 'rej_tech_quality',
      title: 'Technical Quality / Artifacts',
      note: 'Minor chromatic aberration & shadow noise at 100% zoom.',
    },
    {
      id: 'rej_similar_content',
      title: 'Similar / Duplicate Submission',
      note: 'Composition is too close to an existing approved series asset.',
    },
    {
      id: 'rej_missing_release',
      title: 'Missing Model / Property Release',
      note: 'Distinctive modern architectural interior requires property release.',
    },
  ];

  for (let i = 0; i < count; i++) {
    const tpl = SEED_TEMPLATES[i % SEED_TEMPLATES.length];
    const seqNum = String(i + 1).padStart(3, '0');
    const variationLabel = i >= SEED_TEMPLATES.length ? ` — Angle ${Math.floor(i / SEED_TEMPLATES.length) + 1}` : '';
    const cleanTitle = `${tpl.subject}${variationLabel}`;
    const ext = tpl.mediaType === 'video' ? 'mp4' : tpl.mediaType === 'vector' ? 'eps' : 'jpg';
    const originCode = tpl.isAi ? 'AI' : 'NT';
    const mediaCode = tpl.mediaType === 'video' ? 'VD' : tpl.mediaType === 'vector' ? 'VC' : 'PH';
    const filename = `${tpl.batchId}_${originCode}_${mediaCode}_${seqNum}_${tpl.subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 32)}.${ext}`;

    // Determine primary status bucket for Adobe Stock (and realistic variations across the other 5 agencies):
    // 0..19 -> New (20 assets)
    // 20..34 -> Pending Upload (15 assets)
    // 35..44 -> Accepted / Uploaded (10 assets)
    // 45..49 -> Rejected (5 assets)
    let primaryStatus: TrackerAgencyStatus = 'New';
    if (i >= 20 && i < 35) primaryStatus = 'Pending Upload';
    else if (i >= 35 && i < 42) primaryStatus = 'Accepted';
    else if (i >= 42 && i < 45) primaryStatus = 'Uploaded';
    else if (i >= 45) primaryStatus = 'Rejected';

    const assetId = `vault_asset_${seqNum}`;
    const agencyTrackings = {} as Record<SupportedPlatform, AgencyTrackingRecord>;

    for (let agIdx = 0; agIdx < ALL_AGENCIES.length; agIdx++) {
      const ag = ALL_AGENCIES[agIdx];
      let agStatus: TrackerAgencyStatus = primaryStatus;

      // Introduce realistic cross-agency variance so each of the 6 Agency Readiness Cards has rich stats
      if (ag !== 'adobe') {
        if (primaryStatus === 'Pending Upload' && (i + agIdx) % 3 === 0) {
          agStatus = 'New';
        } else if (primaryStatus === 'Accepted' && (i + agIdx) % 4 === 0) {
          agStatus = 'In Review';
        } else if (primaryStatus === 'New' && (i + agIdx) % 7 === 0) {
          agStatus = 'Pending Upload';
        }
      }

      const rejInfo =
        agStatus === 'Rejected' ? rejectionReasons[(i + agIdx) % rejectionReasons.length] : undefined;

      agencyTrackings[ag] = {
        id: `${assetId}_${ag}`,
        assetId,
        agencyId: ag,
        status: agStatus,
        rejectionReasonId: rejInfo?.id,
        rejectionReasonTitle: rejInfo?.title,
        customRejectionNote: rejInfo?.note,
        rejectionCount: agStatus === 'Rejected' ? 1 : 0,
        scrapedDownloads: agStatus === 'Accepted' ? 12 + ((i * 7) % 85) : 0,
        scrapedEarningsCents: agStatus === 'Accepted' ? 1850 + ((i * 310) % 9400) : 0,
        scrapedViews: agStatus === 'Accepted' ? 140 + ((i * 29) % 600) : 0,
        createdAt: now - (count - i) * 60000,
        updatedAt: now - (count - i) * 30000,
      };
    }

    const extraTags = [
      'commercial',
      'stock',
      'high resolution',
      'copy space',
      'professional',
      'studio',
      'background',
      'concept',
      'modern',
      'clean',
      'editorial',
      'design',
      'creative',
      'visual',
      'premium',
      'lifestyle',
      'no people',
      'indoors',
      'lighting',
      'texture',
      'detail',
      'horizontal',
      'color',
      'vibrant',
      'contemporary',
      'aesthetic',
      'minimalism',
      'composition',
      'art',
      'industry',
      'business',
      'digital',
      'future',
      'nature',
      'organic',
      'craft',
    ];

    const rankedKeywords = Array.from(new Set([...tpl.keywords, ...extraTags])).slice(0, 45);

    records.push({
      id: assetId,
      batchId: tpl.batchId,
      filename,
      fileSize: tpl.mediaType === 'video' ? 24_800_000 : tpl.mediaType === 'vector' ? 4_600_000 : 7_200_000,
      thumbnailBase64: buildSceneDataUri(i + 1, cleanTitle, tpl.category, tpl.mediaType, tpl.palette),
      mediaType: tpl.mediaType,
      videoMeta:
        tpl.mediaType === 'video'
          ? {
              durationSeconds: 18 + (i % 15),
              resolution: '3840x2160',
              width: 3840,
              height: 2160,
              hasAudio: false,
            }
          : undefined,
      isAiGenerated: tpl.isAi,
      baseTitle: cleanTitle,
      detailedDescription: `${cleanTitle} captured in high resolution for commercial microstock agencies and editorial layouts.`,
      rankedKeywords,
      categories: {
        adobeCategoryId: 1 + (i % 19),
        shutterstockCategories: ['Interiors', 'Backgrounds/Textures'],
        dreamstimeCategory1: 112,
        dreamstimeCategory2: 145,
        dreamstimeCategory3: tpl.isAi ? 114 : 104,
      },
      status: 'completed',
      workspaceScope: 'tracker',
      pipelineStage: 'committed',
      masterPath: `/StockFlow/Master_Vault/${filename}`,
      fileHash: `sha256_seed_${seqNum}_${tpl.batchId.toLowerCase()}`,
      agencyTrackings,
      createdAt: now - (count - i) * 60000,
      updatedAt: now,
    });
  }

  await db.masterRecords.bulkPut(records);

  // Persist the non-New agency statuses into SQLite agency_tracking so getTrackerStats reflects all 50 items accurately
  const pendingAdobeIds = records
    .filter((r) => r.agencyTrackings?.adobe?.status === 'Pending Upload')
    .map((r) => r.id);
  const acceptedAdobeIds = records
    .filter((r) => r.agencyTrackings?.adobe?.status === 'Accepted')
    .map((r) => r.id);
  const uploadedAdobeIds = records
    .filter((r) => r.agencyTrackings?.adobe?.status === 'Uploaded')
    .map((r) => r.id);
  const rejectedAdobeIds = records
    .filter((r) => r.agencyTrackings?.adobe?.status === 'Rejected')
    .map((r) => r.id);

  if (pendingAdobeIds.length > 0) {
    await db.tracker.createExportBasket({
      agencyId: 'adobe',
      basketName: 'adobe_B01_pending_shoot',
      assetIds: pendingAdobeIds,
      csvFilename: 'adobe_stock_B01.csv',
      csvContent: 'Filename,Title,Keywords,Category\n',
    });
  }

  for (const ag of ALL_AGENCIES) {
    const byStatus = new Map<TrackerAgencyStatus, string[]>();
    for (const rec of records) {
      const st = rec.agencyTrackings?.[ag]?.status || 'New';
      if (st === 'New') continue;
      if (ag === 'adobe' && st === 'Pending Upload') continue;
      const list = byStatus.get(st) || [];
      list.push(rec.id);
      byStatus.set(st, list);
    }

    for (const [st, ids] of byStatus.entries()) {
      if (ids.length === 0) continue;
      const sampleReason =
        st === 'Rejected'
          ? rejectionReasons[0]
          : undefined;
      await db.tracker.reconcileAgencyStatuses({
        assetIds: ids,
        agencyId: ag,
        targetStatus: st,
        rejectionReasonId: sampleReason?.id,
        customRejectionNote: sampleReason?.note,
      });
    }
  }

  // Ensure exact Adobe counts match the 20 New / 15 Pending / 10 Uploaded+Accepted / 5 Rejected breakdown
  if (acceptedAdobeIds.length > 0) {
    await db.tracker.reconcileAgencyStatuses({
      assetIds: acceptedAdobeIds,
      agencyId: 'adobe',
      targetStatus: 'Accepted',
    });
  }
  if (uploadedAdobeIds.length > 0) {
    await db.tracker.reconcileAgencyStatuses({
      assetIds: uploadedAdobeIds,
      agencyId: 'adobe',
      targetStatus: 'Uploaded',
    });
  }
  if (rejectedAdobeIds.length > 0) {
    await db.tracker.reconcileAgencyStatuses({
      assetIds: rejectedAdobeIds,
      agencyId: 'adobe',
      targetStatus: 'Rejected',
      rejectionReasonId: 'rej_tech_quality',
      customRejectionNote: 'Minor chromatic aberration & shadow noise at 100% zoom.',
    });
  }

  return { seededCount: records.length };
}
