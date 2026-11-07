import React, { useState } from 'react';
import { CSV_TEMPLATES, CsvTemplateSpec } from '../../constants/csvTemplates';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Check, Copy, Download, FileSpreadsheet, Info, CheckCircle2 } from 'lucide-react';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import { useLanguage } from '../../context/LanguageContext';

interface StockTemplatesModalProps {
  open: boolean;
  onClose: () => void;
}

export const StockTemplatesModal: React.FC<StockTemplatesModalProps> = ({ open, onClose }) => {
  const { language } = useLanguage();
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
      // Fallback to generated CSV string
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

  const rulesList = language === 'ar' ? activeTemplate.rulesAr : activeTemplate.rules;
  const tipsList = language === 'ar' ? activeTemplate.tipsAr : activeTemplate.tips;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={language === 'ar' ? 'قوالب ومعايير CSV للمنصات الست' : '6-Platform CSV Specifications & Samples'}
      size="lg"
    >
      <div className="space-y-3.5 text-xs">
        {/* Platform Selector Tabs */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1 bg-secondary rounded-lg border border-border">
          {CSV_TEMPLATES.map((tpl) => {
            const isSelected = tpl.id === selectedId;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedId(tpl.id)}
                className={`px-2.5 py-2 rounded-md text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-card text-foreground shadow-xs border border-border font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="shrink-0">{getPlatformLogo(tpl.id as any, 15)}</span>
                <span dir="ltr" className="truncate">{tpl.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Active Platform Specification Panel */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Header Row */}
          <div className="p-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                {getPlatformLogo(activeTemplate.id as any, 20)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 dir="ltr" className="text-sm font-semibold text-foreground">{activeTemplate.name}</h3>
                  <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4.5 bg-card">
                    {activeTemplate.headers.length} {language === 'ar' ? 'أعمدة' : 'Cols'}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4.5 bg-card">
                    {activeTemplate.delimiter === ';'
                      ? language === 'ar' ? 'فاصل ;' : 'Delimiter (;)'
                      : language === 'ar' ? 'فاصل ,' : 'Delimiter (,)'}
                  </Badge>
                </div>
                <p dir="ltr" className="text-[11px] text-muted-foreground font-mono mt-0.5 text-start">{activeTemplate.fileName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyHeaders(activeTemplate)}
                className="h-7.5 text-xs gap-1.5 cursor-pointer"
              >
                {copiedId === activeTemplate.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>
                  {copiedId === activeTemplate.id
                    ? language === 'ar'
                      ? 'تم النسخ'
                      : 'Copied'
                    : language === 'ar'
                    ? 'نسخ الأعمدة'
                    : 'Copy Headers'}
                </span>
              </Button>
              <Button
                size="sm"
                onClick={() => handleDownloadSample(activeTemplate)}
                className="h-7.5 text-xs gap-1.5 font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'تحميل قالب CSV' : 'Download Sample CSV'}</span>
              </Button>
            </div>
          </div>

          <div className="p-3.5 space-y-3.5">
            {/* Limits Summary Row */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-secondary/60 border border-slate-200 dark:border-border">
                <span className="text-[10px] text-muted-foreground block">
                  {language === 'ar' ? 'حد العنوان (Title)' : 'Title Limit'}
                </span>
                <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                  {activeTemplate.maxTitleChars > 0
                    ? language === 'ar'
                      ? `${activeTemplate.maxTitleChars} حرف`
                      : `${activeTemplate.maxTitleChars} chars`
                    : language === 'ar'
                    ? 'مدمج مع الوصف'
                    : 'Uses Description'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-secondary/60 border border-slate-200 dark:border-border">
                <span className="text-[10px] text-muted-foreground block">
                  {language === 'ar' ? 'حد الوصف (Description)' : 'Description Limit'}
                </span>
                <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                  {activeTemplate.maxDescChars > 0
                    ? language === 'ar'
                      ? `${activeTemplate.maxDescChars} حرف`
                      : `${activeTemplate.maxDescChars} chars`
                    : language === 'ar'
                    ? 'غير مستخدم'
                    : 'Not Required'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-secondary/60 border border-slate-200 dark:border-border">
                <span className="text-[10px] text-muted-foreground block">
                  {language === 'ar' ? 'الكلمات المفتاحية (Keywords)' : 'Max Keywords'}
                </span>
                <span className="text-xs font-mono font-semibold text-primary tabular-nums">
                  {activeTemplate.id === 'freepik'
                    ? language === 'ar' ? '49 كلمة مفردة' : '49 single words'
                    : language === 'ar' ? `${activeTemplate.maxKeywords} كلمة` : `${activeTemplate.maxKeywords} tags`}
                </span>
              </div>
            </div>

            {/* Exact Column Schema */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                <span>
                  {activeTemplate.secondaryHeaders
                    ? language === 'ar'
                      ? 'هيكل أعمدة الصور والمتجهات (15 عموداً — {batch}_dreamstime_images.csv)'
                      : 'Images & Vectors Schema (15 Columns — {batch}_dreamstime_images.csv)'
                    : language === 'ar'
                    ? 'ترتيب الأعمدة الرسمي'
                    : 'Column Schema'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-secondary/50 border border-border" dir="ltr">
                {activeTemplate.headers.map((h, i) => (
                  <Badge key={h} variant="outline" className="font-mono text-[11px] bg-card border-border text-foreground">
                    <span className="text-muted-foreground mr-1 tabular-nums">{i + 1}.</span>
                    {h}
                  </Badge>
                ))}
              </div>

              {activeTemplate.secondaryHeaders && (
                <div className="pt-1.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                    <span>
                      {language === 'ar'
                        ? activeTemplate.secondaryHeadersLabelAr || activeTemplate.secondaryHeadersLabel
                        : activeTemplate.secondaryHeadersLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-secondary/50 border border-border" dir="ltr">
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

            {/* Sample Data Preview Table */}
            <div className="space-y-1.5">
              <span className="font-semibold text-foreground block">
                {language === 'ar' ? 'معاينة الصفوف' : 'Sample Row Structure'}
              </span>
              <div className="overflow-x-auto rounded-lg border border-border" dir="ltr">
                <table className="w-full text-left border-collapse text-[11px] font-mono">
                  <thead>
                    <tr className="bg-secondary border-b border-border text-muted-foreground">
                      {activeTemplate.headers.map((h) => (
                        <th key={h} className="p-2 font-semibold whitespace-nowrap border-r border-border last:border-0">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeTemplate.sampleRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-border/60 last:border-0 bg-card">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="p-2 text-foreground max-w-[200px] truncate border-r border-border/50 last:border-0"
                          >
                            {cell || (
                              <span className="text-muted-foreground/50 italic">
                                {language === 'ar' ? 'فارغ' : 'empty'}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Platform Rules & Best Practices */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  <span>{language === 'ar' ? 'قواعد التصدير' : 'Format Rules'}</span>
                </div>
                <ul className="space-y-1.5 text-muted-foreground">
                  {rulesList.map((rule, i) => (
                    <li key={i} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-primary font-bold">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{language === 'ar' ? 'نصائح القبول' : 'Submission Tips'}</span>
                </div>
                <ul className="space-y-1.5 text-muted-foreground">
                  {tipsList.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
