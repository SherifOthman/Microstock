import React, { useState } from 'react';
import { STOCK_PLATFORMS_SPEC, StockPlatformSpec } from '../../constants/csvTemplates';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { saveAs } from 'file-saver';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const StockTemplatesModal: React.FC<Props> = ({ open, onClose }) => {
  const { isRtl } = useLanguage();
  const [selectedKey, setSelectedKey] = useState<string>('vecteezy');
  const [copied, setCopied] = useState<boolean>(false);

  const spec = STOCK_PLATFORMS_SPEC[selectedKey];

  const handleDownloadSample = () => {
    if (!spec) return;
    const blob = new Blob([spec.sampleCsv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `${spec.id}_official_sample.csv`);
  };

  const handleCopySample = () => {
    if (!spec) return;
    navigator.clipboard.writeText(spec.sampleCsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isRtl ? 'مواصفات وقواعد ملفات CSV الرسمية' : 'Official Stock CSV Formats & Ingestion Rules'}
      description={
        isRtl
          ? 'المواصفات الدقيقة وقوالب الأعمدة المعتمدة لجميع منصات الميكروستوك'
          : 'Exact verified specifications, column schemas, and sample CSV files for all microstock platforms.'
      }
      className="max-w-4xl"
    >
      <div dir="ltr" className="space-y-4 text-xs text-left">
        {/* Platform Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-secondary/60 border border-border overflow-x-auto">
          {Object.values(STOCK_PLATFORMS_SPEC).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedKey(p.id)}
              className={`px-3 py-1.5 rounded-md font-medium text-xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                selectedKey === p.id
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        {spec && (
          <div className="space-y-4">
            {/* Quick Metrics & Headers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-mono block">Delimiter</span>
                <span className="font-semibold text-foreground font-mono">
                  {spec.delimiter === ';' ? 'Semicolon (;)' : 'Comma (,)'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-mono block">Encoding</span>
                <span className="font-semibold text-foreground font-mono">{spec.encoding}</span>
              </div>

              <div className="p-2.5 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-mono block">Filename Limit</span>
                <span className="font-semibold text-foreground font-mono">
                  {spec.filenameRules.maxLength} chars max
                </span>
              </div>

              <div className="p-2.5 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-mono block">Columns Count</span>
                <span className="font-semibold text-foreground font-mono">{spec.headers.length} columns</span>
              </div>
            </div>

            {/* Official Column Headers */}
            <div className="p-3 rounded-lg border border-border bg-card space-y-1.5">
              <span className="text-muted-foreground font-medium text-[11px] block">
                Official Exact Column Headers (Left to Right):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {spec.headers.map((h, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>

            {/* Sample CSV Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium text-[11px]">
                  Official Verified Sample CSV Content:
                </span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={handleCopySample} className="h-6 px-2 text-[11px] gap-1">
                    <Copy className="w-3 h-3" />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDownloadSample} className="h-6 px-2 text-[11px] gap-1">
                    <Download className="w-3 h-3" />
                    Download Sample .CSV
                  </Button>
                </div>
              </div>
              <pre className="p-3 bg-secondary/50 rounded-lg text-[11px] font-mono text-foreground overflow-x-auto max-h-48 whitespace-pre border border-border">
                {spec.sampleCsv}
              </pre>
            </div>

            {/* Common Pitfalls & Why Tools Fail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-destructive text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Why Generic CSVs Fail on {spec.name}</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                  {spec.commonFailureReasons.map((r, i) => (
                    <li key={i} className="leading-snug">{r}</li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-primary text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Stock Assistant Pro Tips</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                  {spec.tipsForUpload.map((t, i) => (
                    <li key={i} className="leading-snug">{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
