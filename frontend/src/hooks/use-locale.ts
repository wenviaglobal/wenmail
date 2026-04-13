import { createContext, useContext, useState, useEffect } from "react";
import { type Locale, t as translate } from "../i18n/translations";

interface LocaleContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

export const LocaleContext = createContext<LocaleContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key: string) => key,
});

export function useLocale() {
  return useContext(LocaleContext);
}

export function useLocaleProvider(): LocaleContextType {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem("wenmail-locale") as Locale) || "en";
  });

  useEffect(() => {
    localStorage.setItem("wenmail-locale", locale);
  }, [locale]);

  const setLocale = (l: Locale) => setLocaleState(l);
  const t = (key: string) => translate(key, locale);

  return { locale, setLocale, t };
}
