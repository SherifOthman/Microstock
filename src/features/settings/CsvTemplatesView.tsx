import React, { useState } from 'react';
import { CSV_TEMPLATES, CsvTemplateSpec } from '../../constants/csvTemplates';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Check, Copy, Download, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { useLanguage } from '../../context/LanguageContext';

export const CsvTemplatesView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [selectedId, setSelectedId] = useState<string>('adobe');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeTemplate = CSV_TEMPLATES.find((t) => t.id === selectedId) || CSV_TEMPLATES[0];

  const generateCsvString = (tpl: CsvTemplateSpec): string => {
    const delimiter = tpl.delimiter || (tpl.id === 'freepik' ? ';' : ',');
    const escapeCell = (val: string) => {
      if (val.includes(delimiter) || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const headerRow = tpl.headers.map(escapeCell).join(delimiter);
    const dataRows = tpl.sampleRows.map((row) => row.map(escapeCell).join(delimiter));
    const newline = tpl.id === 'adobe' ? '\r\n' : '\n';
    return [headerRow, ...dataRows].join(newline) + newline;
  };

  const handleDownloadSample = async (tpl: CsvTemplateSpec) => {
    const cleanDownloadName = tpl.fileName.split(' ')[0].replace('{batch}_', 'sample_');
    try {
      const response = await fetch(tpl.sampleUrl);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', cleanDownloadName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // Fallback to generated CSV
    }

    const csvContent = generateCsvString(tpl);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', cleanDownloadName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyHeaders = (tpl: CsvTemplateSpec) => {
    const delimiter = tpl.delimiter || (tpl.id === 'freepik' ? ';' : ',');
    navigator.clipboard.writeText(tpl.headers.join(delimiter));
    setCopiedId(tpl.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const rulesList = isAr ? activeTemplate.rulesAr : activeTemplate.rules;

  return (
    <div className="space-y-4">
      {/* Platform Selector Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1 bg-secondary/60 rounded-xl border border-border">
        {CSV_TEMPLATES.map((tpl) => {
          const isSelected = tpl.id === selectedId;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelectedId(tpl.id)}
              className={`px-2.5 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-card text-foreground shadow-xs border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
              }`}
            >
              <span className="shrink-0">{getPlatformLogo(tpl.id as any, 16)}</span>
              <span dir="ltr" className="truncate">{tpl.name.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Active Platform Specification Card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Top Header Row */}
        <div className="p-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0">
              {getPlatformLogo(activeTemplate.id as any, 22)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 dir="ltr" className="text-sm font-bold text-foreground">{activeTemplate.name}</h3>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4.5 bg-card">
                  {activeTemplate.headers.length} {isAr ? 'أعمدة' : 'Columns'}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4.5 bg-card">
                  {activeTemplate.delimiter === ';' ? (isAr ? 'فاصل ;' : 'Delimiter (;)') : (isAr ? 'فاصل ,' : 'Delimiter (,)')}
                </Badge>
              </div>
              <p dir="ltr" className="text-xs text-muted-foreground font-mono mt-0.5 text-start">{activeTemplate.fileName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyHeaders(activeTemplate)}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              {copiedId === activeTemplate.id ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>
                {copiedId === activeTemplate.id
                  ? isAr ? 'تم النسخ' : 'Copied'
                  : isAr ? 'نسخ الأعمدة' : 'Copy Headers'}
              </span>
            </Button>
            <Button
              size="sm"
              onClick={() => handleDownloadSample(activeTemplate)}
              className="h-8 text-xs gap-1.5 font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحميل نموذج CSV' : 'Download Sample CSV'}</span>
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Limits Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-[11px] text-muted-foreground block">
                {isAr ? 'حد العنوان' : 'Title Limit'}
              </span>
              <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                {activeTemplate.maxTitleChars > 0
                  ? isAr ? `${activeTemplate.maxTitleChars} حرف` : `${activeTemplate.maxTitleChars} chars`
                  : isAr ? 'مدمج مع الوصف' : 'Uses Description'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-[11px] text-muted-foreground block">
                {isAr ? 'حد الوصف' : 'Description Limit'}
              </span>
              <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                {activeTemplate.maxDescChars > 0
                  ? isAr ? `${activeTemplate.maxDescChars} حرف` : `${activeTemplate.maxDescChars} chars`
                  : isAr ? 'غير مطلوب' : 'Not Required'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-[11px] text-muted-foreground block">
                {isAr ? 'الكلمات المفتاحية' : 'Max Keywords'}
              </span>
              <span className="text-xs font-mono font-semibold text-primary tabular-nums">
                {activeTemplate.id === 'freepik'
                  ? isAr ? '49 (AI) / 50 (أصلي)' : '49 (AI) / 50 (Real)'
                  : isAr ? `${activeTemplate.maxKeywords} كلمة` : `${activeTemplate.maxKeywords} tags`}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-[11px] text-muted-foreground block">
                {isAr ? 'الفاصل المعتمد' : 'Delimiter'}
              </span>
              <span className="text-xs font-mono font-semibold text-foreground">
                {activeTemplate.delimiter === ';' ? 'Semicolon (;)' : 'Comma (,)'}
              </span>
            </div>
          </div>

          {/* Column Schema Badges */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
              <span>
                {activeTemplate.secondaryHeaders
                  ? isAr
                    ? 'هيكل أعمدة الصور والمتجهات (15 عموداً)'
                    : 'Images & Vectors Schema (15 Columns)'
                  : isAr
                  ? 'ترتيب الأعمدة الرسمي'
                  : 'Official Column Schema'}
              </span>
            </span>
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-secondary/40 border border-border" dir="ltr">
              {activeTemplate.headers.map((h, i) => (
                <Badge key={h} variant="outline" className="font-mono text-[11px] bg-card border-border text-foreground">
                  <span className="text-muted-foreground mr-1 tabular-nums">{i + 1}.</span>
                  {h}
                </Badge>
              ))}
            </div>

            {activeTemplate.secondaryHeaders && (
              <div className="pt-2 space-y-1.5">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                  <span>
                    {isAr
                      ? activeTemplate.secondaryHeadersLabelAr || activeTemplate.secondaryHeadersLabel
                      : activeTemplate.secondaryHeadersLabel}
                  </span>
                </span>
                <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-secondary/40 border border-border" dir="ltr">
                  {activeTemplate.secondaryHeaders.map((h, i) => (
                    <Badge key={h} variant="outline" className="font-mono text-[11px] bg-card border-border text-foreground">
                      <span className="text-muted-foreground mr-1 tabular-nums">{i + 1}.</span>
                      {h}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Clean Rules / Specifications (Concise Bullet Points) */}
          {rulesList.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-semibold text-foreground">
                {isAr ? 'شروط وقواعد التصدير' : 'Export Specifications'}
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
                {rulesList.map((r, idx) => (
                  <li key={idx} className="leading-relaxed">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
