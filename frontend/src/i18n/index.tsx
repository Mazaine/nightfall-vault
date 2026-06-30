import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { en } from "./en";
import { hu } from "./hu";

export type Language = "hu" | "en";
export type TranslationKey = string;

const dictionaries = { hu, en };
const STORAGE_KEY = "webshop-template.language";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLanguage(): Language {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "en" ? "en" : "hu";
}

function resolveValue(source: unknown, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
  return typeof value === "string" ? value : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const value = useMemo<I18nContextValue>(() => {
    function setLanguage(nextLanguage: Language) {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
      setLanguageState(nextLanguage);
    }

    function t(key: TranslationKey) {
      return resolveValue(dictionaries[language], key) ?? resolveValue(dictionaries.hu, key) ?? key;
    }

    return { language, setLanguage, t };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
