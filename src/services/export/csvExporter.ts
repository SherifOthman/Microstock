import Papa from 'papaparse';
import JSZip from 'jszip';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any).saveAs || fileSaver;
import { MasterMetadataRecord } from '../../types';
import { saveFilesToLocalDirectory, FileToSave } from '../desktop/desktopFs';
import {
  PlatformExportResult,
  UniversalTransformOptions,
  transformFor123rf,
  transformForAdobeStock,
  transformForDreamstime,
  transformForDreamstimeVideos,
  transformForFreepik,
  transformForShutterstock,
  transformForVecteezy,
} from '../rules/platformTransformers';

import {
  SupportedPlatform,
  ExportPlatformConfig,
  PLATFORMS_CONFIG,
} from '../../constants/platforms';
export type { SupportedPlatform, ExportPlatformConfig };
export { PLATFORMS_CONFIG };

/**
 * Deterministically generates CSV strings for selected platforms from the single Master Metadata records
 */
export function generatePlatformCsv(
  platformId: SupportedPlatform,
  records: MasterMetadataRecord[],
  batchName = 'stock_metadata',
  options?: UniversalTransformOptions
): PlatformExportResult {
  const config = PLATFORMS_CONFIG[platformId];
  const cleanBatchName = (batchName ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  let filename = `${cleanBatchName}_${config.filenameSuffix}`;

  if (records.length === 0) {
    return {
      platformId,
      platformName: config.name,
      filename,
      csvString: '',
      rowCount: 0,
    };
  }

  let rows: any[] = [];
  let isBlocked = false;
  let blockedReason: string | undefined;
  const additionalResults: PlatformExportResult[] = [];

  switch (platformId) {
    case 'adobe':
      rows = transformForAdobeStock(records);
      break;

    case 'freepik':
      rows = transformForFreepik(records, options?.freepik);
      break;

    case 'shutterstock': {
      const res = transformForShutterstock(records, options?.shutterstock);
      rows = res.rows;
      isBlocked = res.isBlocked;
      blockedReason = res.blockedReason;
      break;
    }

    case 'vecteezy':
      rows = transformForVecteezy(records, options?.vecteezy);
      break;

    case 'dreamstime': {
      // Split export: Dreamstime strictly requires different schemas for Images vs Videos
      // Images (.jpg, .png, .eps): 15-column schema (includes Free, W-EL, P-EL, SR-EL) with 'Image Name'
      // Videos (.mp4, .mov): 13-column schema (NO Free, NO P-EL) with 'Video Name'
      const isVideoRec = (r: MasterMetadataRecord) =>
        r.mediaType === 'video' || /\.(mp4|mov|webm|mkv|m4v)$/i.test(r.filename ?? '');

      const imageRecords = records.filter((r) => !isVideoRec(r));
      const videoRecords = records.filter((r) => isVideoRec(r));

      if (imageRecords.length === 0 && videoRecords.length > 0) {
        // Pure video batch
        rows = transformForDreamstimeVideos(videoRecords, options?.dreamstime);
        filename = `${cleanBatchName}_dreamstime_videos.csv`;
      } else if (videoRecords.length === 0) {
        // Pure image / vector batch
        rows = transformForDreamstime(imageRecords, options?.dreamstime);
        filename = `${cleanBatchName}_dreamstime_images.csv`;
      } else {
        // Mixed media batch: Primary is Images, Additional is Videos
        rows = transformForDreamstime(imageRecords, options?.dreamstime);
        filename = `${cleanBatchName}_dreamstime_images.csv`;

        const videoRows = transformForDreamstimeVideos(videoRecords, options?.dreamstime);
        const videoCsv = Papa.unparse(videoRows, {
          delimiter: config.delimiter,
          newline: '\n',
        });
        const finalVideoCsv = videoCsv.endsWith('\n') ? videoCsv : `${videoCsv}\n`;

        additionalResults.push({
          platformId: 'dreamstime',
          platformName: `${config.name} (Videos)`,
          filename: `${cleanBatchName}_dreamstime_videos.csv`,
          csvString: finalVideoCsv,
          rowCount: videoRows.length,
        });
      }
      break;
    }

    case '123rf':
      rows = transformFor123rf(records, options?.['123rf']);
      break;
  }

  if (isBlocked) {
    return {
      platformId,
      platformName: config.name,
      filename,
      csvString: '',
      isBlocked: true,
      blockedReason,
      rowCount: 0,
    };
  }

  // Line endings: Adobe Stock's parser explicitly requires CRLF (\r\n) with a trailing newline
  // Other platforms like Vecteezy / Rails prefer Unix LF (\n)
  const isCrlf = platformId === 'adobe';
  const newlineChar = isCrlf ? '\r\n' : '\n';

  let cleanCsv = Papa.unparse(rows, {
    delimiter: config.delimiter,
    newline: newlineChar,
  });

  // Guarantee trailing newline at the end of the file for strict parsers like Adobe Stock
  if (!cleanCsv.endsWith(newlineChar)) {
    cleanCsv += newlineChar;
  }

  return {
    platformId,
    platformName: config.name,
    filename,
    csvString: cleanCsv,
    rowCount: rows.length,
    additionalResults: additionalResults.length > 0 ? additionalResults : undefined,
  };
}

/**
 * Downloads a single platform CSV
 * Pure UTF-8 without BOM (Adobe Stock and other agencies strictly reject CSVs with a BOM).
 */
export function downloadSingleCsv(result: PlatformExportResult): void {
  if (result.isBlocked) {
    throw new Error(result.blockedReason || 'Export blocked for this platform');
  }

  // Primary CSV download
  if (result.csvString && result.rowCount > 0) {
    const blob = new Blob([result.csvString], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, result.filename);
  }

  // Any additional split CSVs (e.g. Dreamstime Videos alongside Images)
  if (result.additionalResults && result.additionalResults.length > 0) {
    for (const addRes of result.additionalResults) {
      if (!addRes.isBlocked && addRes.csvString && addRes.rowCount > 0) {
        const blob = new Blob([addRes.csvString], { type: 'text/csv;charset=utf-8' });
        saveAs(blob, addRes.filename);
      }
    }
  }
}

/**
 * Bundles all selected platform CSVs into a single .ZIP file
 */
export async function downloadAllCsvsAsZip(
  platforms: SupportedPlatform[],
  records: MasterMetadataRecord[],
  batchName = 'stock_metadata',
  options?: UniversalTransformOptions
): Promise<{ downloadedCount: number; blockedCount: number }> {
  const zip = new JSZip();
  let downloadedCount = 0;
  let blockedCount = 0;

  for (const pid of platforms) {
    const res = generatePlatformCsv(pid, records, batchName, options);
    if (res.isBlocked) {
      blockedCount++;
      continue;
    }
    if (res.csvString && res.rowCount > 0) {
      zip.file(res.filename, res.csvString);
      downloadedCount++;
    }
    if (res.additionalResults && res.additionalResults.length > 0) {
      for (const addRes of res.additionalResults) {
        if (!addRes.isBlocked && addRes.csvString && addRes.rowCount > 0) {
          zip.file(addRes.filename, addRes.csvString);
          downloadedCount++;
        }
      }
    }
  }

  if (downloadedCount === 0) {
    throw new Error('No valid CSV files were generated to zip');
  }

  const cleanBatchName = (batchName ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, `${cleanBatchName}_all_platforms_csv.zip`);

  return { downloadedCount, blockedCount };
}

/**
 * Saves generated CSV files directly to a local directory via Native Desktop FS Bridge
 */
export async function saveCsvToDirectory(
  results: PlatformExportResult[],
  folderName = '_Metadata_CSVs',
  onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; savedCount: number; error?: string; canceled?: boolean }> {
  const allResults: PlatformExportResult[] = [];
  for (const r of results) {
    if (!r.isBlocked && r.csvString && r.rowCount > 0) {
      allResults.push(r);
    }
    if (r.additionalResults && r.additionalResults.length > 0) {
      for (const ar of r.additionalResults) {
        if (!ar.isBlocked && ar.csvString && ar.rowCount > 0) {
          allResults.push(ar);
        }
      }
    }
  }

  if (allResults.length === 0) {
    throw new Error('No valid CSV files to save.');
  }

  const filesToSave: FileToSave[] = allResults.map((r) => ({
    name: r.filename,
    data: r.csvString,
  }));

  return await saveFilesToLocalDirectory(filesToSave, {
    folderName,
    onProgress: (done, total) => onProgress?.(done, total),
  });
}
