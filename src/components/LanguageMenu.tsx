import { ChevronDown, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/i18n/I18nContext';
import { type Lang, LANGS } from '@/i18n/messages';

/** Each language named in itself, so it can be found whatever the current UI language is. */
const NATIVE_NAME: Record<Lang, string> = { th: 'ไทย', en: 'English' };

/** Header language picker: a compact button showing the current language, opening a menu of all of them. */
export function LanguageMenu() {
  const { t, lang, setLang } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5" aria-label={`${t('lang.label')}: ${NATIVE_NAME[lang]}`}>
          <Languages aria-hidden />
          <span className="text-xs font-semibold">{lang.toUpperCase()}</span>
          <ChevronDown className="opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('lang.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
          {LANGS.map((l) => (
            <DropdownMenuRadioItem key={l} value={l}>
              {NATIVE_NAME[l]}
              <span className="ml-auto pl-4 text-xs text-muted-foreground">{l.toUpperCase()}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
