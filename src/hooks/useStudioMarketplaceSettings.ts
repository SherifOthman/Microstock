import { useState, useCallback, useEffect } from 'react';
import { SupportedPlatform } from '../types';
import { KeywordPhrasing } from '../services/ai/metadataParser';
import { UniversalTransformOptions } from '../services/rules/platformTransformers';

export function useStudioMarketplaceSettings() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<SupportedPlatform[]>(() => {
    const saved = localStorage.getItem('stock_selected_platforms');
    return saved ? JSON.parse(saved) : ['adobe', 'freepik', 'shutterstock', 'vecteezy', 'dreamstime', '123rf'];
  });

  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_is_ai_generated');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [freepikAiGenerated, setFreepikAiGenerated] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_freepik_ai');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [keywordPhrasing, setKeywordPhrasing] = useState<KeywordPhrasing>(() => {
    const saved = localStorage.getItem('stock_keyword_phrasing');
    return (saved as KeywordPhrasing) || 'mixed';
  });

  const [titleLengthPreset, setTitleLengthPreset] = useState<'optimal' | 'short' | 'standard' | 'extended'>(() => {
    return (localStorage.getItem('stock_title_length_preset') as any) || 'optimal';
  });

  const [freepikModel, setFreepikModel] = useState<string>(() => {
    const saved = localStorage.getItem('stock_freepik_model');
    if (saved === 'Nano Banana') return 'Google Nano Banana';
    return saved || 'Google Nano Banana';
  });

  const [customFreepikModel, setCustomFreepikModel] = useState<string>(() => {
    return localStorage.getItem('stock_custom_freepik_model') || '';
  });

  const [userCustomPrompt, setUserCustomPrompt] = useState<string>('');

  // Dreamstime options
  const [dtAiGenerated, setDtAiGenerated] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_ai');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleAiOriginSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ isAiGenerated?: boolean }>;
      if (typeof customEvent.detail?.isAiGenerated === 'boolean') {
        const nextAi = customEvent.detail.isAiGenerated;
        setIsAiGenerated(nextAi);
        setFreepikAiGenerated(nextAi);
        setDtAiGenerated(nextAi);
      }
    };
    window.addEventListener('stockflow:ai-origin-sync', handleAiOriginSync);
    return () => window.removeEventListener('stockflow:ai-origin-sync', handleAiOriginSync);
  }, []);

  const [dtEditorial, setDtEditorial] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_editorial');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [dtFree, setDtFree] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_free');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [dtWel, setDtWel] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_wel');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [dtPel, setDtPel] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_pel');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [dtSrel, setDtSrel] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_srel');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [isDtLocked, setIsDtLocked] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_dt_locked');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Shutterstock options
  const [shutterEditorial, setShutterEditorial] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_shutter_editorial');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [shutterMature, setShutterMature] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_shutter_mature');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [shutterIllustration, setShutterIllustration] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_shutter_illustration');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [isShutterLocked, setIsShutterLocked] = useState<boolean>(() => {
    const saved = localStorage.getItem('stock_shutter_locked');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Vecteezy options
  const [vecLicense, setVecLicense] = useState<'pro' | 'free'>(() => {
    const saved = localStorage.getItem('stock_vec_license');
    return (saved as 'pro' | 'free') || 'pro';
  });

  // 123RF options
  const [rfCountry, setRfCountryState] = useState<string>(() => {
    const saved = localStorage.getItem('stock_rf_country');
    return saved !== null ? saved : 'EG';
  });

  const setRfCountry = useCallback((val: string) => {
    setRfCountryState(val);
    localStorage.setItem('stock_rf_country', val);
  }, []);

  const togglePlatform = useCallback((pid: SupportedPlatform) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid];
      localStorage.setItem('stock_selected_platforms', JSON.stringify(next));
      return next;
    });
  }, []);

  const resetDtLicensing = useCallback(() => {
    setDtWel(true);
    setDtPel(true);
    setDtFree(false);
    setDtSrel(false);
    setIsDtLocked(true);
    localStorage.setItem('stock_dt_wel', JSON.stringify(true));
    localStorage.setItem('stock_dt_pel', JSON.stringify(true));
    localStorage.setItem('stock_dt_free', JSON.stringify(false));
    localStorage.setItem('stock_dt_srel', JSON.stringify(false));
    localStorage.setItem('stock_dt_locked', JSON.stringify(true));
  }, []);

  const resetShutterOptions = useCallback(() => {
    setShutterEditorial(false);
    setShutterMature(false);
    setShutterIllustration(false);
    setIsShutterLocked(true);
    localStorage.setItem('stock_shutter_editorial', JSON.stringify(false));
    localStorage.setItem('stock_shutter_mature', JSON.stringify(false));
    localStorage.setItem('stock_shutter_illustration', JSON.stringify(false));
    localStorage.setItem('stock_shutter_locked', JSON.stringify(true));
  }, []);

  const getTransformOptions = useCallback((): UniversalTransformOptions => {
    const finalModel = freepikModel === 'Other' ? customFreepikModel.trim() || 'Google Nano Banana' : freepikModel;
    return {
      freepik: {
        isAiGenerated: freepikAiGenerated,
        modelName: finalModel,
      },
      shutterstock: {
        editorial: shutterEditorial,
        matureContent: shutterMature,
        illustration: shutterIllustration,
      },
      vecteezy: {
        license: vecLicense,
      },
      dreamstime: {
        isAiGenerated: dtAiGenerated,
        editorial: dtEditorial,
        wel: dtWel,
        pel: dtPel,
        free: dtFree,
        srel: dtSrel,
      },
      '123rf': {
        countryCode: rfCountry === 'none' ? '' : rfCountry,
      },
    };
  }, [
    freepikModel,
    customFreepikModel,
    freepikAiGenerated,
    shutterEditorial,
    shutterMature,
    shutterIllustration,
    vecLicense,
    dtAiGenerated,
    dtEditorial,
    dtWel,
    dtPel,
    dtFree,
    dtSrel,
    rfCountry,
  ]);

  return {
    selectedPlatforms,
    setSelectedPlatforms,
    togglePlatform,
    isAiGenerated,
    setIsAiGenerated,
    freepikAiGenerated,
    setFreepikAiGenerated,
    keywordPhrasing,
    setKeywordPhrasing,
    titleLengthPreset,
    setTitleLengthPreset,
    freepikModel,
    setFreepikModel,
    customFreepikModel,
    setCustomFreepikModel,
    userCustomPrompt,
    setUserCustomPrompt,
    dtAiGenerated,
    setDtAiGenerated,
    dtEditorial,
    setDtEditorial,
    dtFree,
    setDtFree,
    dtWel,
    setDtWel,
    dtPel,
    setDtPel,
    dtSrel,
    setDtSrel,
    isDtLocked,
    setIsDtLocked,
    resetDtLicensing,
    shutterEditorial,
    setShutterEditorial,
    shutterMature,
    setShutterMature,
    shutterIllustration,
    setShutterIllustration,
    isShutterLocked,
    setIsShutterLocked,
    resetShutterOptions,
    vecLicense,
    setVecLicense,
    rfCountry,
    setRfCountry,
    getTransformOptions,
  };
}
