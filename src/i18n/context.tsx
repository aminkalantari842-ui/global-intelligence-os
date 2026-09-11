import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { translations, type Lang } from "./translations";

interface I18nValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: "fa",
  dir: "rtl",
  setLang: () => {},
  t: (k) => k,
});

function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem("gi-lang");
    if (stored === "en" || stored === "fa") return stored;
  } catch {}
  return "fa";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);
  const dir: "ltr" | "rtl" = lang === "fa" ? "rtl" : "ltr";

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("gi-lang", l);
    } catch {}
  };

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  const t = useMemo(() => {
    const dict = translations[lang] ?? translations.en;
    return (key: string, vars?: Record<string, string | number>): string => {
      let val = dict[key] ?? translations.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          val = val.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return val;
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, dir, setLang, t }), [lang, dir, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
