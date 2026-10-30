import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MasterMetadataRecord } from '../../../types';
import { db } from '../../../db';
import {
  PLATFORMS_CONFIG,
  SupportedPlatform,
  downloadAllCsvsAsZip,
  downloadSingleCsv,
  generatePlatformCsv,
} from '../../../services/export/csvExporter';
import { UniversalTransformOptions } from '../../../services/rules/platformTransformers';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { Dialog } from '../../../components/ui/dialog';
import { ConfirmDialog } from '../../../components/ui/alert-dialog';
import {
  Archive,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  Lock,
} from 'lucide-react';

export const ExportView: React.FC = () => {
  const liveRecords = useLiveQuery(() => db.masterRecords.toArray(), []) || [];
  const records = [...liveRecords];

  const [selectedPlatforms, setSelectedPlatforms] = useState<SupportedPlatform[]>([
    'adobe',
    'freepik',
    'shutterstock',
    'vecteezy',
    'dreamstime',
    '123rf',
  ]);
  const [isZipping, setIsZipping] = useState(false);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<SupportedPlatform | null>(null);
  const [previewCsvContent, setPreviewCsvContent] = useState<string>('');
  const [previewCopied, setPreviewCopied] = useState<boolean>(false);

  const getTransformOptions = (): UniversalTransformOptions => {
    try {
      const dtAi = JSON.parse(localStorage.getItem('stock_dt_ai') ?? 'true');
      const dtFree = JSON.parse(localStorage.getItem('stock_dt_free') ?? 'false');
      const dtEditorial = JSON.parse(localStorage.getItem('stock_dt_editorial') ?? 'false');
      const dtWel = JSON.parse(localStorage.getItem('stock_dt_wel') ?? 'true');
      const dtPel = JSON.parse(localStorage.getItem('stock_dt_pel') ?? 'true');
      const dtSrel = JSON.parse(localStorage.getItem('stock_dt_srel') ?? 'false');
      const shutterEditorial = JSON.parse(localStorage.getItem('stock_shutter_editorial') ?? 'false');
      const shutterMature = JSON.parse(localStorage.getItem('stock_shutter_mature') ?? 'false');
      const shutterIllustration = JSON.parse(localStorage.getItem('stock_shutter_illustration') ?? 'false');
      const rfCountry = localStorage.getItem('stock_123rf_country') || 'EG';
      const vecLicense = (localStorage.getItem('stock_vec_license') as 'pro' | 'free') || 'pro';
      const freepikAi = JSON.parse(localStorage.getItem('stock_freepik_ai') ?? 'true');
      const freepikModel = localStorage.getItem('stock_freepik_model') || 'Google Nano Banana';
      const customFreepikModel = localStorage.getItem('stock_custom_freepik_model') || '';
      const finalFreepikModel =
        freepikModel === 'Other' ? (customFreepikModel.trim() || 'Google Nano Banana') : freepikModel;

      return {
        dreamstime: {
          isAiGenerated: dtAi,
          free: dtFree,
          editorial: dtEditorial,
          wel: dtWel,
          pel: dtPel,
          srel: dtSrel,
        },
        shutterstock: {
          editorial: shutterEditorial,
          matureContent: shutterMature,
          illustration: shutterIllustration,
        },
        vecteezy: {
          license: vecLicense,
        },
        freepik: {
          modelName: finalFreepikModel,
          isAiGenerated: freepikAi,
        },
        '123rf': {
          countryCode: rfCountry,
        },
      };
    } catch {
      return {};
    }
  };

  const handleTogglePlatform = (pid: SupportedPlatform) => {
    if (selectedPlatforms.includes(pid)) {
      setSelectedPlatforms(selectedPlatforms.filter((p) => p !== pid));
    } else {
      setSelectedPlatforms([...selectedPlatforms, pid]);
    }
  };

  const handleSingleExport = (pid: SupportedPlatform) => {
    const res = generatePlatformCsv(pid, records, 'stock_metadata', getTransformOptions());
    if (res.isBlocked) {
      setNoticeDialog({
        title: 'Export Blocked',
        message: res.blockedReason || 'Platform export requirements not met.',
      });
      return;
    }
    try {
      downloadSingleCsv(res);
    } catch (err: any) {
      setNoticeDialog({
        title: 'Download Failed',
        message: err.message || 'Failed to download CSV.',
      });
    }
  };

  const handlePreviewCsv = (pid: SupportedPlatform) => {
    const res = generatePlatformCsv(pid, records, 'stock_metadata', getTransformOptions());
    if (res.isBlocked) {
      setNoticeDialog({
        title: 'Preview Blocked',
        message: res.blockedReason || 'Platform export requirements not met.',
      });
      return;
    }
    setPreviewPlatform(pid);
    setPreviewCsvContent(res.csvString);
    setPreviewCopied(false);
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(previewCsvContent);
    setPreviewCopied(true);
    setTimeout(() => setPreviewCopied(false), 1500);
  };

  const handleZipExport = async () => {
    if (selectedPlatforms.length === 0) {
      setNoticeDialog({
        title: 'No Platform Selected',
        message: 'Please select at least one platform to bundle into ZIP.',
      });
      return;
    }
    setIsZipping(true);
    try {
      await downloadAllCsvsAsZip(selectedPlatforms, records, 'stock_metadata', getTransformOptions());
    } catch (err: any) {
      setNoticeDialog({
        title: 'ZIP Export Failed',
        message: err.message || 'Export failed.',
      });
    } finally {
      setIsZipping(false);
    }
  };

  const handleToggleAllAi = async (makeAi: boolean) => {
    for (const rec of records) {
      await db.masterRecords.update(rec.id, { isAiGenerated: makeAi });
    }
  };

  const hasAiRecords = records.some((r) => r.isAiGenerated);
  const platformsList = Object.values(PLATFORMS_CONFIG);

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {records.length} assets
          </Badge>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Tag All:</span>
            <button
              type="button"
              onClick={() => handleToggleAllAi(true)}
              className="text-primary hover:underline cursor-pointer"
            >
              AI
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => handleToggleAllAi(false)}
              className="text-emerald-400 hover:underline cursor-pointer"
            >
              Photo (Unlocks Shutterstock)
            </button>
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleZipExport}
          disabled={isZipping || records.length === 0}
          className="gap-1.5"
        >
          <Archive className="w-3.5 h-3.5" />
          Download All Selected (.ZIP)
        </Button>
      </div>

      {/* Supported Platforms Minimalist Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {platformsList.map((p) => {
          const isSelected = selectedPlatforms.includes(p.id);

          return (
            <Card
              key={p.id}
              className={`p-4 flex flex-col justify-between space-y-3 transition ${
                isSelected ? 'border-primary/40' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleTogglePlatform(p.id)}
                      className="rounded border-border text-primary focus:ring-ring cursor-pointer"
                    />
                    <span className="font-semibold text-xs text-foreground">{p.name}</span>
                  </label>

                  <Badge variant="secondary" className="font-mono text-[10px] py-0">
                    {records.length} rows
                  </Badge>
                </div>

                <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5 font-mono">
                  {p.id === 'adobe' && <div>• Official 5-Col • Comma • 1-21 IDs • Releases</div>}
                  {p.id === 'freepik' && <div>• Semicolon (;) • Prompt & Model</div>}
                  {p.id === 'shutterstock' && <div>• Official 7-Col • Desc (5-200) • Categories</div>}
                  {p.id === 'vecteezy' && <div>• Title Case • Top 5 priority keywords</div>}
                  {p.id === 'dreamstime' && <div>• 15-Col • Desc &gt; Title • Category 3: 114</div>}
                  {p.id === '123rf' && <div>• Official 5-Col • Country: EG (Egypt)</div>}
                </div>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">{p.filenameSuffix}</span>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreviewCsv(p.id)}
                    disabled={records.length === 0}
                    className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSingleExport(p.id)}
                    disabled={records.length === 0}
                    className="h-7 px-2 text-[11px] gap-1"
                  >
                    <Download className="w-3 h-3" /> CSV
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* CSV Preview Dialog */}
      {previewPlatform && (
        <Dialog
          open={!!previewPlatform}
          onClose={() => setPreviewPlatform(null)}
          title={`CSV Preview: ${PLATFORMS_CONFIG[previewPlatform].name}`}
          description={`Delimiter: "${PLATFORMS_CONFIG[previewPlatform].delimiter}" • UTF-8 BOM`}
          className="max-w-2xl"
        >
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={handleCopyPreview} className="h-7 text-xs gap-1">
                <Copy className="w-3 h-3" />
                {previewCopied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="p-3 bg-secondary/50 rounded-lg text-[11px] font-mono text-foreground overflow-x-auto max-h-80 whitespace-pre">
              {previewCsvContent}
            </pre>
          </div>
        </Dialog>
      )}

      <ConfirmDialog
        open={!!noticeDialog}
        onOpenChange={(open) => !open && setNoticeDialog(null)}
        title={noticeDialog?.title || 'Notice'}
        description={noticeDialog?.message || ''}
        confirmText="OK"
        hideCancel
        onConfirm={() => setNoticeDialog(null)}
      />
    </div>
  );
};
