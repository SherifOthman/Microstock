import { useState, useCallback, useEffect } from 'react';
import { SupportedPlatform } from '../types';
import { KeywordPhrasing } from '../services/ai/metadataParser';
import { UniversalTransformOptions } from '../services/rules/platformTransformers';
import { getDesktopSetting, setDesktopSetting } from '../db';

export function useStudioMarketplaceSettings() {
  const [selectedPlatforms, setSelectedPlatformsState] = useState<SupportedPlatform[]>(() => {
    try {
      const saved = localStorage.getItem('stock_selected_platforms');
      return saved ? JSON.parse(saved) : ['adobe', 'freepik', 'shutterstock', 'vecteezy', 'dreamstime', '123rf'];
    } catch {
      return ['adobe', 'freepik', 'shutterstock', 'vecteezy', 'dreamstime', '123rf'];
    }
  });

  const setSelectedPlatforms = useCallback((val: SupportedPlatform[] | ((prev: SupportedPlatform[]) => SupportedPlatform[])) => {
    setSelectedPlatformsState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_selected_platforms', next);
      return next;
    });
  }, []);

  const [isAiGenerated, setIsAiGeneratedState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_is_ai_generated');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const setIsAiGenerated = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setIsAiGeneratedState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_is_ai_generated', next);
      return next;
    });
  }, []);

  const [freepikAiGenerated, setFreepikAiGeneratedState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_freepik_ai');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const setFreepikAiGenerated = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setFreepikAiGeneratedState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_freepik_ai', next);
      return next;
    });
  }, []);

  const [keywordPhrasing, setKeywordPhrasingState] = useState<KeywordPhrasing>(() => {
    const saved = localStorage.getItem('stock_keyword_phrasing');
    return (saved as KeywordPhrasing) || 'mixed';
  });

  const setKeywordPhrasing = useCallback((val: KeywordPhrasing | ((prev: KeywordPhrasing) => KeywordPhrasing)) => {
    setKeywordPhrasingState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_keyword_phrasing', next);
      return next;
    });
  }, []);

  const [titleLengthPreset, setTitleLengthPresetState] = useState<'optimal' | 'short' | 'standard' | 'extended'>(() => {
    return (localStorage.getItem('stock_title_length_preset') as any) || 'optimal';
  });

  const setTitleLengthPreset = useCallback((val: 'optimal' | 'short' | 'standard' | 'extended' | ((prev: any) => any)) => {
    setTitleLengthPresetState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_title_length_preset', next);
      return next;
    });
  }, []);

  const [freepikModel, setFreepikModelState] = useState<string>(() => {
    const saved = localStorage.getItem('stock_freepik_model');
    if (saved === 'Nano Banana') return 'Google Nano Banana';
    return saved || 'Google Nano Banana';
  });

  const setFreepikModel = useCallback((val: string | ((prev: string) => string)) => {
    setFreepikModelState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_freepik_model', next);
      return next;
    });
  }, []);

  const [customFreepikModel, setCustomFreepikModelState] = useState<string>(() => {
    return localStorage.getItem('stock_custom_freepik_model') || '';
  });

  const setCustomFreepikModel = useCallback((val: string | ((prev: string) => string)) => {
    setCustomFreepikModelState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_custom_freepik_model', next);
      return next;
    });
  }, []);

  const [userCustomPrompt, setUserCustomPromptState] = useState<string>(() => {
    return localStorage.getItem('stock_context_hint') || '';
  });

  const setUserCustomPrompt = useCallback((prompt: string) => {
    setUserCustomPromptState(prompt);
    setDesktopSetting('stock_context_hint', prompt);
  }, []);

  // Dreamstime options
  const [dtAiGenerated, setDtAiGeneratedState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_dt_ai');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const setDtAiGenerated = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setDtAiGeneratedState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_dt_ai', next);
      return next;
    });
  }, []);

  const [dtEditorial, setDtEditorialState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_dt_editorial');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const setDtEditorial = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setDtEditorialState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_dt_editorial', next);
      return next;
    });
  }, []);

  const [dtFree, setDtFreeState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_dt_free');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const setDtFree = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setDtFreeState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_dt_free', next);
      return next;
    });
  }, []);

  const [dtWel, setDtWelState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_dt_wel');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const setDtWel = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setDtWelState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_dt_wel', next);
      return next;
    });
  }, []);

  const [dtPel, setDtPelState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_dt_pel');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const setDtPel = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setDtPelState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_dt_pel', next);
      return next;
    });
  }, []);

  const [dtSrel, setDtSrelState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_dt_srel');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const setDtSrel = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setDtSrelState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_dt_srel', next);
      return next;
    });
  }, []);

  const [isDtLocked, setIsDtLockedState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_dt_locked');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const setIsDtLocked = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setIsDtLockedState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_dt_locked', next);
      return next;
    });
  }, []);

  // Shutterstock options
  const [shutterEditorial, setShutterEditorialState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_shutter_editorial');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const setShutterEditorial = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setShutterEditorialState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_shutter_editorial', next);
      return next;
    });
  }, []);

  const [shutterMature, setShutterMatureState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_shutter_mature');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const setShutterMature = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setShutterMatureState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_shutter_mature', next);
      return next;
    });
  }, []);

  const [shutterIllustration, setShutterIllustrationState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_shutter_illustration');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const setShutterIllustration = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setShutterIllustrationState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_shutter_illustration', next);
      return next;
    });
  }, []);

  const [isShutterLocked, setIsShutterLockedState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_shutter_locked');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const setIsShutterLocked = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setIsShutterLockedState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_shutter_locked', next);
      return next;
    });
  }, []);

  // Vecteezy options
  const [vecLicense, setVecLicenseState] = useState<'pro' | 'free'>(() => {
    const saved = localStorage.getItem('stock_vec_license');
    return (saved as 'pro' | 'free') || 'pro';
  });

  const setVecLicense = useCallback((val: 'pro' | 'free' | ((prev: 'pro' | 'free') => 'pro' | 'free')) => {
    setVecLicenseState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      setDesktopSetting('stock_vec_license', next);
      return next;
    });
  }, []);

  // 123RF options
  const [rfCountry, setRfCountryState] = useState<string>(() => {
    const saved = localStorage.getItem('stock_rf_country');
    return saved !== null ? saved : 'EG';
  });

  const setRfCountry = useCallback((val: string) => {
    setRfCountryState(val);
    setDesktopSetting('stock_rf_country', val);
  }, []);

  // Sync with AI Origin event from file cleaner or elsewhere
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
  }, [setIsAiGenerated, setFreepikAiGenerated, setDtAiGenerated]);

  // Load all options from desktop SQLite database on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [
        savedPlatforms,
        savedIsAi,
        savedFpAi,
        savedPhrasing,
        savedPreset,
        savedFpModel,
        savedCustomFpModel,
        savedHint,
        savedDtAi,
        savedDtEd,
        savedDtFree,
        savedDtWel,
        savedDtPel,
        savedDtSrel,
        savedDtLocked,
        savedShutterEd,
        savedShutterMat,
        savedShutterIll,
        savedShutterLocked,
        savedVecLic,
        savedRfCountry,
      ] = await Promise.all([
        getDesktopSetting<SupportedPlatform[]>('stock_selected_platforms', ['adobe', 'freepik', 'shutterstock', 'vecteezy', 'dreamstime', '123rf']),
        getDesktopSetting<boolean>('stock_is_ai_generated', true),
        getDesktopSetting<boolean>('stock_freepik_ai', true),
        getDesktopSetting<KeywordPhrasing>('stock_keyword_phrasing', 'mixed'),
        getDesktopSetting<'optimal' | 'short' | 'standard' | 'extended'>('stock_title_length_preset', 'optimal'),
        getDesktopSetting<string>('stock_freepik_model', 'Google Nano Banana'),
        getDesktopSetting<string>('stock_custom_freepik_model', ''),
        getDesktopSetting<string>('stock_context_hint', ''),
        getDesktopSetting<boolean>('stock_dt_ai', true),
        getDesktopSetting<boolean>('stock_dt_editorial', false),
        getDesktopSetting<boolean>('stock_dt_free', false),
        getDesktopSetting<boolean>('stock_dt_wel', true),
        getDesktopSetting<boolean>('stock_dt_pel', true),
        getDesktopSetting<boolean>('stock_dt_srel', false),
        getDesktopSetting<boolean>('stock_dt_locked', true),
        getDesktopSetting<boolean>('stock_shutter_editorial', false),
        getDesktopSetting<boolean>('stock_shutter_mature', false),
        getDesktopSetting<boolean>('stock_shutter_illustration', false),
        getDesktopSetting<boolean>('stock_shutter_locked', true),
        getDesktopSetting<'pro' | 'free'>('stock_vec_license', 'pro'),
        getDesktopSetting<string>('stock_rf_country', 'EG'),
      ]);

      if (!isMounted) return;

      if (savedPlatforms) setSelectedPlatformsState(savedPlatforms);
      if (typeof savedIsAi === 'boolean') setIsAiGeneratedState(savedIsAi);
      if (typeof savedFpAi === 'boolean') setFreepikAiGeneratedState(savedFpAi);
      if (savedPhrasing) setKeywordPhrasingState(savedPhrasing);
      if (savedPreset) setTitleLengthPresetState(savedPreset);
      if (savedFpModel) setFreepikModelState(savedFpModel);
      if (savedCustomFpModel !== undefined) setCustomFreepikModelState(savedCustomFpModel);
      if (savedHint !== undefined) setUserCustomPromptState(savedHint);
      if (typeof savedDtAi === 'boolean') setDtAiGeneratedState(savedDtAi);
      if (typeof savedDtEd === 'boolean') setDtEditorialState(savedDtEd);
      if (typeof savedDtFree === 'boolean') setDtFreeState(savedDtFree);
      if (typeof savedDtWel === 'boolean') setDtWelState(savedDtWel);
      if (typeof savedDtPel === 'boolean') setDtPelState(savedDtPel);
      if (typeof savedDtSrel === 'boolean') setDtSrelState(savedDtSrel);
      if (typeof savedDtLocked === 'boolean') setIsDtLockedState(savedDtLocked);
      if (typeof savedShutterEd === 'boolean') setShutterEditorialState(savedShutterEd);
      if (typeof savedShutterMat === 'boolean') setShutterMatureState(savedShutterMat);
      if (typeof savedShutterIll === 'boolean') setShutterIllustrationState(savedShutterIll);
      if (typeof savedShutterLocked === 'boolean') setIsShutterLockedState(savedShutterLocked);
      if (savedVecLic) setVecLicenseState(savedVecLic);
      if (savedRfCountry) setRfCountryState(savedRfCountry);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const togglePlatform = useCallback((pid: SupportedPlatform) => {
    setSelectedPlatforms((prev) => {
      return prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid];
    });
  }, [setSelectedPlatforms]);

  const resetDtLicensing = useCallback(() => {
    setDtWel(true);
    setDtPel(true);
    setDtFree(false);
    setDtSrel(false);
    setIsDtLocked(true);
  }, [setDtWel, setDtPel, setDtFree, setDtSrel, setIsDtLocked]);

  const resetShutterOptions = useCallback(() => {
    setShutterEditorial(false);
    setShutterMature(false);
    setShutterIllustration(false);
    setIsShutterLocked(true);
  }, [setShutterEditorial, setShutterMature, setShutterIllustration, setIsShutterLocked]);

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
