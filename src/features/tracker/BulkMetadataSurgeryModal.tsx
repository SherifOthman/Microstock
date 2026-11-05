import React, { useState } from 'react';
import { MasterMetadataRecord, SupportedPlatform } from '../../types';
import {
  AGENCY_KEYWORD_CAPS,
  applyBulkMetadataSurgery,
  autoTrimKeywordsForAgency,
} from '../../services/tracker/bulkTrackerOperations';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Scissors, Tag, Type, CheckCircle2 } from 'lucide-react';

const AGENCY_NAMES: Record<SupportedPlatform, string> = {
  adobe: 'Adobe Stock',
  freepik: 'Freepik',
  shutterstock: 'Shutterstock',
  vecteezy: 'Vecteezy',
  dreamstime: 'Dreamstime',
  '123rf': '123RF',
};

export interface BulkMetadataSurgeryModalProps {
  open: boolean;
  onClose: () => void;
  targetRecords: MasterMetadataRecord[];
  activeAgency: SupportedPlatform;
  onCompleted: (summaryMessage: string) => void;
}

export const BulkMetadataSurgeryModal: React.FC<BulkMetadataSurgeryModalProps> = ({
  open,
  onClose,
  targetRecords,
  activeAgency,
  onCompleted,
}) => {
  const [activeTab, setActiveTab] = useState<'keywords' | 'text'>('keywords');

  // Keyword state
  const [keywordAction, setKeywordAction] = useState<'remove' | 'replace' | 'prepend' | 'append'>('remove');
  const [targetKeywordsRaw, setTargetKeywordsRaw] = useState('');
  const [replacementKeywordRaw, setReplacementKeywordRaw] = useState('');

  // Text Find & Replace state
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [applyToTitle, setApplyToTitle] = useState(true);
  const [applyToDescription, setApplyToDescription] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);

  const cap = AGENCY_KEYWORD_CAPS[activeAgency] || 50;
  const overCapCount = targetRecords.filter((r) => (r.rankedKeywords || []).length > cap).length;

  const handleAutoTrim = async () => {
    const res = await autoTrimKeywordsForAgency(targetRecords, activeAgency);
    onCompleted(
      `Auto-trimmed keywords on ${res.updatedCount} asset(s) to ${AGENCY_NAMES[activeAgency]} max cap (${res.cap} tags).`
    );
    onClose();
  };

  const handleApplyKeywords = async () => {
    const res = await applyBulkMetadataSurgery(targetRecords, {
      mode: 'keywords',
      keywordAction,
      targetKeywordsRaw,
      replacementKeywordRaw,
    });
    onCompleted(
      `Bulk keyword ${keywordAction} updated ${res.updatedCount} of ${targetRecords.length} asset(s).`
    );
    setTargetKeywordsRaw('');
    setReplacementKeywordRaw('');
    onClose();
  };

  const handleApplyText = async () => {
    const res = await applyBulkMetadataSurgery(targetRecords, {
      mode: 'text',
      findText,
      replaceText,
      applyToTitle,
      applyToDescription,
      caseSensitive,
    });
    onCompleted(
      `Bulk Find & Replace ("${findText}" → "${replaceText}") updated ${res.updatedCount} of ${targetRecords.length} asset(s).`
    );
    setFindText('');
    setReplaceText('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Bulk SEO & Keyword Surgery (${targetRecords.length} Assets Targeted)`}
      size="md"
    >
      <div className="space-y-4 text-xs">
        {/* 1-Click Auto-Trim Banner */}
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5 text-amber-500" />
              <span>
                1-Click Auto-Trim for {AGENCY_NAMES[activeAgency]} (Max {cap} Keywords)
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {overCapCount > 0
                ? `${overCapCount} targeted asset(s) currently exceed ${cap} keywords.`
                : `All ${targetRecords.length} targeted asset(s) are currently within the ${cap}-keyword cap.`}
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            data-testid="surgery-autotrim-btn"
            onClick={handleAutoTrim}
            className="h-7 px-3 text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Trim to Top {cap} Keywords</span>
          </Button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary border border-border">
          <button
            type="button"
            data-testid="surgery-tab-keywords"
            onClick={() => setActiveTab('keywords')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'keywords'
                ? 'bg-card text-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Keyword Sanitizer (Add / Remove / Replace)</span>
          </button>

          <button
            type="button"
            data-testid="surgery-tab-text"
            onClick={() => setActiveTab('text')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'text'
                ? 'bg-card text-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Title & Description Find / Replace</span>
          </button>
        </div>

        {activeTab === 'keywords' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'remove', label: 'Remove Tags' },
                  { id: 'replace', label: 'Replace Tag' },
                  { id: 'prepend', label: 'Prepend (Top)' },
                  { id: 'append', label: 'Append (End)' },
                ] as const
              ).map((op) => (
                <button
                  key={op.id}
                  type="button"
                  data-testid={`surgery-kw-op-${op.id}`}
                  onClick={() => setKeywordAction(op.id)}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                    keywordAction === op.id
                      ? 'border-primary bg-primary/15 text-primary font-semibold'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-foreground block">
                {keywordAction === 'remove'
                  ? 'Keywords to Remove (comma-separated)'
                  : keywordAction === 'replace'
                  ? 'Misspelled or Forbidden Keyword(s) to Find'
                  : 'Keywords to Add (comma-separated)'}
              </label>
              <Input
                data-testid="surgery-target-keywords-input"
                value={targetKeywordsRaw}
                onChange={(e) => setTargetKeywordsRaw(e.target.value)}
                placeholder="e.g. midjourney, canon, illustartion"
                className="h-8 text-xs"
              />
            </div>

            {keywordAction === 'replace' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-foreground block">
                  Replacement Keyword(s)
                </label>
                <Input
                  data-testid="surgery-replacement-keywords-input"
                  value={replacementKeywordRaw}
                  onChange={(e) => setReplacementKeywordRaw(e.target.value)}
                  placeholder="e.g. illustration"
                  className="h-8 text-xs"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="surgery-apply-keywords-btn"
                disabled={!targetKeywordsRaw.trim()}
                onClick={handleApplyKeywords}
                className="gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Apply to {targetRecords.length} Asset(s)</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-foreground block">
                Find Text in Selected Assets
              </label>
              <Input
                data-testid="surgery-find-input"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="e.g. Commercial Stock Background"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-foreground block">
                Replace With (leave empty to delete text)
              </label>
              <Input
                data-testid="surgery-replace-input"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="e.g. Editorial Studio Concept"
                className="h-8 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={applyToTitle}
                  onCheckedChange={(v) => setApplyToTitle(Boolean(v))}
                />
                <span>SEO Title</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={applyToDescription}
                  onCheckedChange={(v) => setApplyToDescription(Boolean(v))}
                />
                <span>Detailed Description</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={caseSensitive}
                  onCheckedChange={(v) => setCaseSensitive(Boolean(v))}
                />
                <span>Case-sensitive</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="surgery-apply-text-btn"
                disabled={!findText}
                onClick={handleApplyText}
                className="gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Replace Across {targetRecords.length} Asset(s)</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
