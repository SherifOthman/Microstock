import React, { useRef, useState, useMemo } from 'react';
import {
  CleanedFileItem,
  CleanerOptions,
  DEFAULT_CLEANER_OPTIONS,
  autoDetectLastNumber,
  downloadRenamedFilesAsZip,
  processFilesForRenaming,
  saveRenamedFilesToDirectory,
} from '../../services/cleaner/fileCleanerEngine';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  FolderPlus,
  FolderUp,
  Hash,
  Image as ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const FileCleanerView: React.FC = () => {
  const { t, language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<CleanerOptions>(DEFAULT_CLEANER_OPTIONS);
  const [searchFilter, setSearchFilter] = useState('');
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isFSSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const handleAddFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    const combined = [...rawFiles, ...newFiles];
    // Deduplicate by name + size
    const uniqueMap = new Map<string, File>();
    for (const f of combined) {
      uniqueMap.set(`${f.name}-${f.size}`, f);
    }
    const deduped = Array.from(uniqueMap.values());
    setRawFiles(deduped);

    // Auto-detect last number if user has sequential mode
    const detected = autoDetectLastNumber(deduped.map((f) => f.name));
    if (detected > 1 && options.startCounter === 1) {
      setOptions((prev) => ({ ...prev, startCounter: detected }));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Re-process items whenever files or options change
  const cleanedItems: CleanedFileItem[] = useMemo(() => {
    if (rawFiles.length === 0) return [];
    const processed = processFilesForRenaming(rawFiles, options);
    return processed.map((item) => {
      const custom = manualOverrides[item.id];
      const finalName = custom || item.cleanedName;
      return {
        ...item,
        customName: custom,
        charCount: finalName.length,
      };
    });
  }, [rawFiles, options, manualOverrides]);

  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return cleanedItems;
    const q = searchFilter.toLowerCase();
    return cleanedItems.filter(
      (item) =>
        item.originalName.toLowerCase().includes(q) ||
        (item.customName || item.cleanedName).toLowerCase().includes(q)
    );
  }, [cleanedItems, searchFilter]);

  const handleManualNameChange = (id: string, newName: string) => {
    setManualOverrides((prev) => ({ ...prev, [id]: newName }));
  };

  const handleRemoveItem = (id: string) => {
    setRawFiles((prev) => prev.filter((_, idx) => `${prev[idx].name}-${prev[idx].lastModified}-${idx}` !== id));
    setManualOverrides((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleClearAll = () => {
    setRawFiles([]);
    setManualOverrides({});
    setStatusNotification(null);
  };

  const handleSaveToDirectory = async () => {
    if (cleanedItems.length === 0) return;
    setIsProcessing(true);
    setProgressMsg('Saving files to folder...');
    setStatusNotification(null);

    const res = await saveRenamedFilesToDirectory(
      cleanedItems,
      options.folderName,
      (done, total) => {
        setProgressMsg(`Saved ${done} of ${total} files...`);
      }
    );

    setIsProcessing(false);
    setProgressMsg(null);

    if (res.success) {
      setStatusNotification({
        type: 'success',
        message: `Successfully saved ${res.savedCount} cleaned files into folder "${options.folderName}"!`,
      });
    } else if (res.error && !res.error.includes('cancelled')) {
      setStatusNotification({ type: 'error', message: res.error });
    }
  };

  const handleDownloadZip = async () => {
    if (cleanedItems.length === 0) return;
    setIsProcessing(true);
    setProgressMsg('Creating ZIP archive...');
    setStatusNotification(null);

    try {
      await downloadRenamedFilesAsZip(cleanedItems, 'Cleaned_Microstock_Files.zip', (percent) => {
        setProgressMsg(`Compressing ZIP: ${percent}%`);
      });
      setStatusNotification({
        type: 'success',
        message: `ZIP archive with ${cleanedItems.length} cleaned files downloaded successfully!`,
      });
    } catch (err: any) {
      setStatusNotification({ type: 'error', message: err.message || 'Failed to create ZIP.' });
    } finally {
      setIsProcessing(false);
      setProgressMsg(null);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto py-2 px-1">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInput}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory folder upload
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-foreground">
              {language === 'ar' ? 'منظف ومُسمّي الملفات الذكي' : 'Smart Batch File Cleaner & Renamer'}
            </h1>
            <Badge variant="secondary" className="text-[11px] font-mono">
              Microstock SEO
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {language === 'ar'
              ? 'إزالة التواريخ ومخلفات الذكاء الاصطناعي وتنسيق الأسماء بتسلسل رقمي أنيق متوافق مع شروط وكالات الستوك (≤ 55 حرف).'
              : 'Strips camera timestamps, dates, AI boilerplate, and truncates safely to <= 55 chars with zero-padded sequencing.'}
          </p>
        </div>

        {rawFiles.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.clearAll || 'Clear All'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Configuration Controls Bar */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
          <span>{language === 'ar' ? 'خيارات التسمية والتسلسل' : 'Renaming & Sequencing Rules'}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Mode Selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {language === 'ar' ? 'نمط التسمية:' : 'Naming Mode:'}
            </label>
            <Select
              value={options.mode}
              onValueChange={(val) => setOptions((prev) => ({ ...prev, mode: val as any }))}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                <SelectItem value="sequential" className="text-xs">
                  {language === 'ar' ? 'ترقيم تسلسلي (001_name)' : 'Sequential Prefix (001_name)'}
                </SelectItem>
                <SelectItem value="clean_only" className="text-xs">
                  {language === 'ar' ? 'الاسم النظيف فقط (name_01)' : 'Clean Name Only (name_01)'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Separator Selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {language === 'ar' ? 'الفاصل بين الكلمات:' : 'Word Separator:'}
            </label>
            <Select
              value={options.separator}
              onValueChange={(val) => setOptions((prev) => ({ ...prev, separator: val as any }))}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                <SelectItem value="_" className="text-xs">
                  {language === 'ar' ? 'شرطة سفلية ( _ ) افتراضي' : 'Underscore ( _ ) Default'}
                </SelectItem>
                <SelectItem value="-" className="text-xs">
                  {language === 'ar' ? 'شرطة عادية ( - )' : 'Hyphen ( - )'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Start Counter (for Sequential mode) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground">
                {language === 'ar' ? 'بدء العدّاد من:' : 'Start Counter At:'}
              </label>
              {rawFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const detected = autoDetectLastNumber(rawFiles.map((f) => f.name));
                    setOptions((prev) => ({ ...prev, startCounter: detected }));
                  }}
                  className="text-[10px] text-primary hover:underline cursor-pointer"
                  title="Detect highest number in folder"
                >
                  {language === 'ar' ? 'اكتشاف تلقائي' : 'Auto-detect'}
                </button>
              )}
            </div>
            <Input
              type="number"
              min={1}
              value={options.startCounter}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, startCounter: Math.max(1, parseInt(e.target.value, 10) || 1) }))
              }
              disabled={options.mode !== 'sequential'}
              className="h-8 text-xs font-mono bg-background"
            />
          </div>

          {/* Case Style */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {language === 'ar' ? 'حالة الأحرف:' : 'Case Style:'}
            </label>
            <Select
              value={options.caseStyle}
              onValueChange={(val) => setOptions((prev) => ({ ...prev, caseStyle: val as any }))}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                <SelectItem value="lowercase" className="text-xs">
                  lowercase (e.g. 001_fruit_bowl)
                </SelectItem>
                <SelectItem value="TitleCase" className="text-xs">
                  TitleCase (e.g. 001_Fruit_Bowl)
                </SelectItem>
                <SelectItem value="preserve" className="text-xs">
                  {language === 'ar' ? 'الحفاظ على الأصل' : 'Preserve original case'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {statusNotification && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            statusNotification.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <X className="w-4 h-4 shrink-0" />
            )}
            <span>{statusNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotification(null)}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace Area */}
      {rawFiles.length === 0 ? (
        /* Empty State Dropzone */
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-border hover:border-foreground/50 bg-card/50 rounded-2xl p-12 text-center transition space-y-4"
        >
          <div className="w-12 h-12 rounded-xl bg-secondary text-foreground flex items-center justify-center mx-auto border border-border">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {language === 'ar' ? 'اسحب الصور أو الفيديوهات هنا' : 'Drop stock files here to clean and rename'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {language === 'ar'
                ? 'يدعم الصور والفيديوهات والمتجهات. يتم فرز الملفات زمنياً وترقيمها بشكل متسلسل آمن.'
                : 'Supports JPG, PNG, MP4, MOV, EPS, SVG. Files are automatically pre-sorted by creation date.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'اختيار ملفات' : 'Select Files'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => folderInputRef.current?.click()}
              className="gap-1.5 text-xs"
            >
              <FolderUp className="w-3.5 h-3.5" />
              <span>{t.selectFolder || 'Select Folder'}</span>
            </Button>
          </div>
        </div>
      ) : (
        /* Populated State with Live Table & Action Toolbar */
        <div className="space-y-3">
          {/* Action Toolbar */}
          <div className="p-3 bg-card rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'إضافة ملفات' : 'Add Files'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                className="gap-1.5 text-xs"
              >
                <FolderUp className="w-3.5 h-3.5" />
                <span>{t.selectFolder || 'Add Folder'}</span>
              </Button>
              <span className="text-xs text-muted-foreground font-mono ml-1">
                {cleanedItems.length} {language === 'ar' ? 'ملفات جاهزة' : 'files ready'}
              </span>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
              {isFSSupported && (
                <Button
                  size="sm"
                  onClick={handleSaveToDirectory}
                  disabled={isProcessing || cleanedItems.length === 0}
                  className="gap-1.5 text-xs font-semibold"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{language === 'ar' ? 'حفظ في مجلد مباشر' : 'Save to Subfolder'}</span>
                </Button>
              )}

              <Button
                size="sm"
                variant={isFSSupported ? 'outline' : 'default'}
                onClick={handleDownloadZip}
                disabled={isProcessing || cleanedItems.length === 0}
                className="gap-1.5 text-xs font-semibold"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{language === 'ar' ? 'تحميل كـ ZIP' : 'Download All as .ZIP'}</span>
              </Button>
            </div>
          </div>

          {/* Progress Indicator */}
          {progressMsg && (
            <div className="p-2.5 rounded-lg bg-secondary/50 border border-border text-xs flex items-center gap-2 font-mono text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>{progressMsg}</span>
            </div>
          )}

          {/* Search Filter */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute start-2.5 top-2.5 pointer-events-none" />
              <Input
                placeholder={language === 'ar' ? 'بحث في الأسماء...' : 'Filter files...'}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-8 ps-8 text-xs bg-background"
              />
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              {filteredItems.length} / {cleanedItems.length}
            </span>
          </div>

          {/* Live Before/After Table */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[200px]">
                      {language === 'ar' ? 'الاسم الأصلي (تاريخ الإنشاء)' : 'Original Filename & Date'}
                    </th>
                    <th className="py-2.5 px-3 w-8 text-center">→</th>
                    <th className="py-2.5 px-3 min-w-[280px]">
                      {language === 'ar' ? 'الاسم النظيف المقترح (قابل للتعديل)' : 'New Cleaned Filename (Editable)'}
                    </th>
                    <th className="py-2.5 px-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredItems.map((item, idx) => {
                    const currentName = item.customName || item.cleanedName;
                    const charCount = currentName.length;
                    const isOptimalLength = charCount <= 55;
                    const isWarningLength = charCount > 55 && charCount <= 75;

                    return (
                      <tr key={item.id} className="hover:bg-secondary/20 transition">
                        <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 min-w-0">
                          <p className="font-mono text-muted-foreground truncate max-w-xs" title={item.originalName}>
                            {item.originalName}
                          </p>
                          <span className="text-[10px] text-muted-foreground/70 font-mono">
                            {new Date(item.lastModified).toLocaleDateString()} • {(item.size / 1024).toFixed(0)} KB
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-muted-foreground">
                          <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                        </td>
                        <td className="py-2.5 px-3 min-w-0">
                          <div className="flex items-center gap-2">
                            <Input
                              value={currentName}
                              onChange={(e) => handleManualNameChange(item.id, e.target.value)}
                              className="h-7 text-xs font-mono bg-background flex-1"
                            />
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono py-0 shrink-0 ${
                                isOptimalLength
                                  ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                                  : isWarningLength
                                  ? 'border-amber-500/30 text-amber-500 bg-amber-500/10'
                                  : 'border-destructive/30 text-destructive bg-destructive/10'
                              }`}
                              title={`${charCount} characters`}
                            >
                              {charCount} chars
                            </Badge>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-muted-foreground hover:text-destructive cursor-pointer transition p-1"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
