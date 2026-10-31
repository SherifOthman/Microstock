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
  transformForFreepik,
  transformForShutterstock,
  transformForVecteezy,
} from '../rules/platformTransformers';

export type SupportedPlatform =
  | 'adobe'
  | 'freepik'
  | 'shutterstock'
  | 'vecteezy'
  | 'dreamstime'
  | '123rf';

export interface ExportPlatformConfig {
  id: SupportedPlatform;
  name: string;
  filenameSuffix: string;
  delimiter: string;
}

export const PLATFORMS_CONFIG: Record<SupportedPlatform, ExportPlatformConfig> = {
  adobe: {
    id: 'adobe',
    name: 'Adobe Stock',
    filenameSuffix: 'adobe_stock.csv',
    delimiter: ',',
  },
  freepik: {
    id: 'freepik',
    name: 'Freepik',
    filenameSuffix: 'freepik.csv',
    delimiter: ';', // Freepik standard semicolon
  },
  shutterstock: {
    id: 'shutterstock',
    name: 'Shutterstock',
    filenameSuffix: 'shutterstock.csv',
    delimiter: ',',
  },
  vecteezy: {
    id: 'vecteezy',
    name: 'Vecteezy',
    filenameSuffix: 'vecteezy.csv',
    delimiter: ',',
  },
  dreamstime: {
    id: 'dreamstime',
    name: 'Dreamstime',
    filenameSuffix: 'dreamstime.csv',
    delimiter: ',',
  },
  '123rf': {
    id: '123rf',
    name: '123RF',
    filenameSuffix: '123rf.csv',
    delimiter: ',',
  },
};

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
  const filename = `${cleanBatchName}_${config.filenameSuffix}`;

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

    case 'dreamstime':
      rows = transformForDreamstime(records, options?.dreamstime);
      break;

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

  // Pure UTF-8 without BOM: Adobe Stock strictly rejects/ignores the Filename column if a BOM is present
  const blob = new Blob([result.csvString], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, result.filename);
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
    if (res.csvString) {
      zip.file(res.filename, res.csvString);
      downloadedCount++;
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
  const valid = results.filter((r) => !r.isBlocked && r.csvString);
  if (valid.length === 0) {
    throw new Error('No valid CSV files to save.');
  }

  const filesToSave: FileToSave[] = valid.map((r) => ({
    name: r.filename,
    data: r.csvString,
  }));

  return await saveFilesToLocalDirectory(filesToSave, {
    folderName,
    onProgress: (done, total) => onProgress?.(done, total),
  });
}
