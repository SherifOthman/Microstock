import React, { useState, useEffect } from 'react';
import { ProviderType, ApiKeyRecord } from '../../../types';
import { PROVIDERS_META, PROVIDER_ORDER, MODEL_DISPLAY_NAMES } from '../../../constants/providers';
import { createApiKeyRecord, saveApiKey, updateApiKey } from '../../../db';
import { decryptSecret } from '../../../services/desktop/secureStorage';
import { Dialog } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { ExternalLink } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

interface AddKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onKeyAdded: () => void;
  editKey?: ApiKeyRecord | null;
}

export const AddKeyDialog: React.FC<AddKeyDialogProps> = ({
  open,
  onClose,
  onKeyAdded,
  editKey,
}) => {
  const { language } = useLanguage();
  const [providerId, setProviderId] = useState<ProviderType>('gemini');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [cfAccountId, setCfAccountId] = useState('');
  const [modelId, setModelId] = useState(PROVIDERS_META.gemini.defaultModelId);
  const [rpmLimit, setRpmLimit] = useState<number>(PROVIDERS_META.gemini.defaultRpm);

  useEffect(() => {
    let active = true;
    const loadEditKey = async () => {
      if (editKey && open) {
        setProviderId(editKey.providerId);
        setLabel(editKey.label);
        setModelId(editKey.modelId);
        setRpmLimit(editKey.rpmLimit);

        const decrypted = await decryptSecret(editKey.key);
        if (!active) return;

        if (editKey.providerId === 'cloudflare' && decrypted.includes(':')) {
          const [accId, token] = decrypted.split(':');
          setCfAccountId(accId);
          setApiKey(token);
        } else {
          setApiKey(decrypted);
          setCfAccountId('');
        }
      } else if (!editKey && open) {
        setProviderId('gemini');
        setLabel('');
        setApiKey('');
        setCfAccountId('');
        setModelId(PROVIDERS_META.gemini.defaultModelId);
        setRpmLimit(PROVIDERS_META.gemini.defaultRpm);
      }
    };
    loadEditKey();
    return () => {
      active = false;
    };
  }, [editKey, open]);

  const handleProviderChange = (newProvider: ProviderType) => {
    setProviderId(newProvider);
    const cfg = PROVIDERS_META[newProvider];
    setModelId(cfg.defaultModelId);
    setRpmLimit(cfg.defaultRpm);
  };

  const getCombinedKey = () => {
    if (providerId === 'cloudflare') {
      return `${cfAccountId.trim()}:${apiKey.trim()}`;
    }
    return apiKey.trim();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalKey = getCombinedKey();
    if (!apiKey.trim() || (providerId === 'cloudflare' && !cfAccountId.trim())) return;

    if (editKey) {
      await updateApiKey(editKey.id, {
        providerId,
        label: label.trim() || `${PROVIDERS_META[providerId].name} Key`,
        key: finalKey,
        modelId,
        rpmLimit: Number(rpmLimit) || PROVIDERS_META[providerId].defaultRpm,
        status: 'healthy',
        lastError: undefined,
      });
    } else {
      const record = createApiKeyRecord(
        providerId,
        finalKey,
        label.trim() || undefined,
        modelId,
        Number(rpmLimit) || PROVIDERS_META[providerId].defaultRpm,
        PROVIDERS_META[providerId].defaultRpd
      );
      await saveApiKey(record);
    }

    onKeyAdded();
    onClose();
  };

  const currentProvider = PROVIDERS_META[providerId];
  const isFormValid =
    apiKey.trim().length > 0 && (providerId !== 'cloudflare' || cfAccountId.trim().length > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        editKey
          ? language === 'ar'
            ? 'تعديل مفتاح API'
            : 'Edit API Key'
          : language === 'ar'
          ? 'إضافة مفتاح API'
          : 'Add API Key'
      }
      size="sm"
    >
      <form onSubmit={handleSave} className="space-y-3.5 text-xs">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-medium text-foreground">
              {language === 'ar' ? 'مزود الخدمة (Provider)' : 'AI Provider'}
            </label>
            <a
              href={currentProvider.signupUrl || currentProvider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <span>{language === 'ar' ? 'الحصول على مفتاح' : 'Get API Key'}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <Select value={providerId} onValueChange={(v) => handleProviderChange(v as ProviderType)}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
              {PROVIDER_ORDER.map((id) => {
                const p = PROVIDERS_META[id];
                return (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="font-medium text-foreground block">
            {language === 'ar' ? 'اسم تعريفي' : 'Key Label'}
          </label>
          <Input
            placeholder={
              language === 'ar'
                ? `مثال: مفتاح ${currentProvider.name} الأساسي`
                : `e.g. ${currentProvider.name} Primary`
            }
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        {providerId === 'cloudflare' && (
          <div className="space-y-1.5">
            <label className="font-medium text-foreground block">
              {language === 'ar' ? 'معرّف حساب Cloudflare (Account ID)' : 'Cloudflare Account ID'}
            </label>
            <Input
              dir="ltr"
              placeholder="e.g. 8a9b0c1d2e3f4g5h6i7j8k9l0m1n2o3p"
              value={cfAccountId}
              onChange={(e) => setCfAccountId(e.target.value)}
              required
              className="font-mono h-8 text-xs text-left"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="font-medium text-foreground block">
            {providerId === 'cloudflare'
              ? language === 'ar'
                ? 'رمز Cloudflare API'
                : 'Cloudflare API Token'
              : language === 'ar'
              ? 'مفتاح API'
              : 'API Key'}
          </label>
          <Input
            dir="ltr"
            type="password"
            placeholder={providerId === 'cloudflare' ? 'API Token...' : 'AIzaSy... / gsk_...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            className="font-mono h-8 text-xs text-left"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="font-medium text-foreground block">
              {language === 'ar' ? 'نموذج الرؤية (Vision Model)' : 'Vision Model'}
            </label>
            <Select value={modelId} onValueChange={(v) => setModelId(v)}>
              <SelectTrigger className="w-full font-mono text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                {currentProvider.recommendedVisionModels.map((m) => (
                  <SelectItem key={m} value={m} className="font-mono text-xs">
                    {MODEL_DISPLAY_NAMES[m] || m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-foreground block">
              {language === 'ar' ? 'حد الطلبات/دقيقة (RPM)' : 'RPM Limit'}
            </label>
            <Input
              dir="ltr"
              type="number"
              min={1}
              max={500}
              value={rpmLimit}
              onChange={(e) => setRpmLimit(Number(e.target.value))}
              className="font-mono tabular-nums h-8 text-xs text-left"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs cursor-pointer">
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button type="submit" size="sm" disabled={!isFormValid} className="h-8 text-xs font-semibold cursor-pointer">
            {editKey ? (language === 'ar' ? 'تحديث' : 'Update Key') : (language === 'ar' ? 'حفظ المفتاح' : 'Save Key')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
