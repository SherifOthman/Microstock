import React, { useState, useEffect } from 'react';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { RejectionReasonRecord, SupportedPlatform } from '../../types';
import { PLATFORMS_CONFIG } from '../../constants/platforms';
import { db } from '../../db';
import { AlertTriangle, Plus, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface RejectionReasonModalProps {
  open: boolean;
  onClose: () => void;
  agencyId: SupportedPlatform;
  assetCount: number;
  onConfirmRejection: (payload: {
    rejectionReasonId?: string;
    customRejectionNote?: string;
  }) => Promise<void>;
}

export const RejectionReasonModal: React.FC<RejectionReasonModalProps> = ({
  open,
  onClose,
  agencyId,
  assetCount,
  onConfirmRejection,
}) => {
  const { language } = useLanguage();
  const [reasons, setReasons] = useState<RejectionReasonRecord[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<string>('');
  const [customNote, setCustomNote] = useState<string>('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newScope, setNewScope] = useState<SupportedPlatform | 'all'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      const list = await db.tracker.getRejectionDictionary(agencyId);
      if (mounted) {
        setReasons(list);
        if (list.length > 0 && !selectedReasonId) {
          setSelectedReasonId(list[0].id);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open, agencyId]);

  const handleSaveNewReasonToDictionary = async () => {
    if (!newTitle.trim()) return;
    const created = await db.tracker.addRejectionReason({
      agencyId: newScope,
      title: newTitle.trim(),
      description: newDescription.trim(),
      severity: 'standard',
    });
    const updatedList = await db.tracker.getRejectionDictionary(agencyId);
    setReasons(updatedList);
    setSelectedReasonId(created.id);
    setNewTitle('');
    setNewDescription('');
    setIsAddingNew(false);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onConfirmRejection({
        rejectionReasonId: selectedReasonId || undefined,
        customRejectionNote: customNote.trim() || undefined,
      });
      setCustomNote('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const agencyName = PLATFORMS_CONFIG[agencyId]?.name || agencyId;
  const activeReason = reasons.find((r) => r.id === selectedReasonId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        language === 'ar'
          ? `تسجيل سبب الرفض — ${agencyName}`
          : `Log Agency Rejection — ${agencyName}`
      }
      size="md"
    >
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2.5 text-xs text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {language === 'ar'
              ? `سيتم تحديد ${assetCount} ملف كـ "مرفوض" في ${agencyName} وحفظ السبب في قاموس الرفض.`
              : `Marking ${assetCount} ${assetCount === 1 ? 'asset' : 'assets'} as Rejected on ${agencyName}.`}
          </span>
        </div>

        {/* Saved Rejection Dictionary Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">
              {language === 'ar' ? 'سبب الرفض (قاموس الأسباب المتكررة)' : 'Rejection Reason (Dictionary)'}
            </label>
            <button
              type="button"
              onClick={() => setIsAddingNew((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>
                {isAddingNew
                  ? language === 'ar'
                    ? 'إلغاء الإضافة'
                    : 'Cancel New Reason'
                  : language === 'ar'
                  ? 'إضافة سبب جديد للقاموس'
                  : 'Save New Reason to Dictionary'}
              </span>
            </button>
          </div>

          <Select value={selectedReasonId} onValueChange={setSelectedReasonId}>
            <SelectTrigger
              data-testid="rejection-reason-select"
              className="w-full h-9 text-xs bg-background"
            >
              <SelectValue placeholder="Select rejection reason..." />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {r.title} {r.usageCount > 0 ? `(${r.usageCount})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeReason?.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
              {activeReason.description}
            </p>
          )}
        </div>

        {/* Inline Add New Dictionary Reason Form */}
        {isAddingNew && (
          <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {language === 'ar' ? 'إضافة سبب متكرر جديد' : 'Add Reusable Rejection Reason'}
              </span>
              <Select
                value={newScope}
                onValueChange={(val) => setNewScope(val as SupportedPlatform | 'all')}
              >
                <SelectTrigger className="h-7 w-36 text-[11px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agencies</SelectItem>
                  <SelectItem value={agencyId}>{agencyName} Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={
                language === 'ar'
                  ? 'عنوان السبب (مثال: تشوه اليدين بالذكاء الاصطناعي)'
                  : 'Reason Title (e.g. AI Hand Anatomy Artifact)'
              }
              className="h-8 text-xs bg-background"
            />
            <Input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder={
                language === 'ar'
                  ? 'وصف مختصر أو طريقة الإصلاح...'
                  : 'Short description or remediation note...'
              }
              className="h-8 text-xs bg-background"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveNewReasonToDictionary}
                disabled={!newTitle.trim()}
                className="h-7 text-xs gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'حفظ في القاموس' : 'Save to Dictionary'}</span>
              </Button>
            </div>
          </div>
        )}

        {/* Custom One-Off Note */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground block">
            {language === 'ar' ? 'ملاحظة مخصصة (اختياري)' : 'Custom One-Off Inspector Note (Optional)'}
          </label>
          <Textarea
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder={
              language === 'ar'
                ? 'انسخ رسالة المراجع أو أضف ملاحظة خاصة بهذا الملف...'
                : 'Paste reviewer comment or specific note for these assets...'
            }
            className="text-xs min-h-[68px] bg-background"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 text-xs cursor-pointer"
          >
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            data-testid="confirm-rejection-btn"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="h-8 text-xs font-semibold cursor-pointer"
          >
            {language === 'ar' ? 'تأكيد الرفض' : 'Confirm Rejected'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
