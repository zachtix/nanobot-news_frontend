import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { enUS, th } from 'react-day-picker/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/i18n/I18nContext';
import type { Lang } from '@/i18n/messages';

export type { DateRange };

const LOCALE = { th, en: enUS } as const;
const INTL: Record<Lang, string> = { th: 'th-TH', en: 'en-US' };
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** Calendar in the app's language; the caption uses the app's (Buddhist in Thai) year like every other date. */
function useCalendarLocale() {
  const { lang } = useI18n();
  return {
    lang,
    locale: LOCALE[lang],
    formatters: { formatCaption: (month: Date) => month.toLocaleDateString(INTL[lang], { month: 'long', year: 'numeric' }) },
  };
}

interface DateTimeProps {
  value: Date | null;
  onChange: (value: Date) => void;
  /** Latest moment allowed (whole hours after it are disabled). */
  max?: Date;
  id?: string;
  'aria-label'?: string;
  placeholder?: string;
  disabled?: boolean;
}

/** A day and a whole hour (minutes are always :00), picked from a calendar and an hour grid. */
export function DateTimePicker({ value, onChange, max, id, placeholder, disabled, 'aria-label': ariaLabel }: DateTimeProps) {
  const { t } = useI18n();
  const { lang, locale, formatters } = useCalendarLocale();
  const [open, setOpen] = useState(false);
  const hour = value?.getHours() ?? 0;

  const at = (day: Date, h: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h);
  // On the last allowed day only the hours up to `max` can be chosen.
  const hourDisabled = (h: number) => Boolean(max && value && sameDay(value, max) && h > max.getHours());

  const pickDay = (day: Date | undefined) => {
    if (!day) return;
    const h = max && sameDay(day, max) ? Math.min(hour, max.getHours()) : hour;
    onChange(at(day, h));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn('w-auto justify-start gap-2 font-normal tabular-nums', !value && 'text-muted-foreground')}
        >
          <CalendarIcon aria-hidden />
          {value ? value.toLocaleString(INTL[lang], { dateStyle: 'medium', timeStyle: 'short' }) : (placeholder ?? t('picker.pick'))}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            defaultMonth={value ?? max}
            onSelect={pickDay}
            disabled={max ? { after: max } : undefined}
            locale={locale}
            formatters={formatters}
          />
          <div className="flex flex-col gap-2 border-t p-3 sm:border-t-0 sm:border-l">
            <span className="text-xs font-medium text-muted-foreground" id={id ? `${id}-hour` : undefined}>
              {t('picker.hour')}
            </span>
            <div className="grid grid-cols-4 gap-1" role="group" aria-label={t('picker.hour')}>
              {HOURS.map((h) => (
                <Button
                  key={h}
                  type="button"
                  size="sm"
                  variant={value && h === hour ? 'default' : 'ghost'}
                  aria-pressed={Boolean(value) && h === hour}
                  disabled={!value || hourDisabled(h)}
                  className="h-7 px-2 tabular-nums"
                  onClick={() => value && onChange(at(value, h))}
                >
                  {String(h).padStart(2, '0')}:00
                </Button>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" className="mt-auto" onClick={() => setOpen(false)}>
              {t('picker.done')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface RangeProps {
  value: DateRange | undefined;
  onChange: (value: DateRange | undefined) => void;
  max?: Date;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

/** First and last day, picked on a two-month calendar. */
export function DateRangePicker({ value, onChange, max, id, disabled, 'aria-label': ariaLabel }: RangeProps) {
  const { t } = useI18n();
  const { lang, locale, formatters } = useCalendarLocale();
  const day = (d: Date) => d.toLocaleDateString(INTL[lang], { dateStyle: 'medium' });
  const label = value?.from ? (value.to ? `${day(value.from)} – ${day(value.to)}` : day(value.from)) : t('picker.pickRange');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn('w-full justify-start gap-2 font-normal tabular-nums', !value?.from && 'text-muted-foreground')}
        >
          <CalendarIcon aria-hidden />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          defaultMonth={value?.from}
          onSelect={onChange}
          numberOfMonths={2}
          disabled={max ? { after: max } : undefined}
          locale={locale}
          formatters={formatters}
        />
      </PopoverContent>
    </Popover>
  );
}
