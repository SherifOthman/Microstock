import React, { createContext, useContext, useEffect, useState } from 'react';
import { Language, translations } from '../constants/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations['en'];
  isRtl: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('stock_language');
      if (saved === 'ar' || saved === 'en') return saved;
    } catch (e) {
      // ignore
    }
    return 'en';
  });

  useEffect(() => {
    try {
      localStorage.setItem('stock_language', language);
    } catch (e) {
      // ignore
    }
    if (language === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = 'en';
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const currentTranslations = translations[language] || translations['en'];

  // Create a Proxy around t so any missing key fallback to English or key itself, preventing undefined errors
  const t = new Proxy(currentTranslations, {
    get(target, prop: string) {
      if (prop in target && target[prop as keyof typeof target] !== undefined) {
        return target[prop as keyof typeof target];
      }
      if (prop in translations.en && translations.en[prop as keyof typeof translations.en] !== undefined) {
        return translations.en[prop as keyof typeof translations.en];
      }
      return '';
    },
  });

  const isRtl = language === 'ar';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRtl }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
