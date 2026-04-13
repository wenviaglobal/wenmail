import { useLocale } from "../hooks/use-locale";
import { Languages } from "lucide-react";

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <button
      onClick={() => setLocale(locale === "en" ? "hi" : "en")}
      className="p-2 rounded-md text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 transition text-xs font-medium"
      title={locale === "en" ? "हिंदी में बदलें" : "Switch to English"}
    >
      {locale === "en" ? "हि" : "EN"}
    </button>
  );
}
