import { useI18n } from "@/i18n/context";
import { Button } from "@/components/ui/button";

export function LangToggle() {
  const { lang, setLang } = useI18n();
  const next = lang === "fa" ? "en" : "fa";
  const label = lang === "fa" ? "EN" : "فا";

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2.5 text-xs font-medium"
      onClick={() => setLang(next)}
      aria-label={`Switch to ${next === "fa" ? "Farsi" : "English"}`}
    >
      {label}
    </Button>
  );
}
