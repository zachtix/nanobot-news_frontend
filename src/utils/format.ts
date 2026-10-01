import { type Lang, type MessageKey, translate } from '../i18n/messages';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const LOCALE: Record<Lang, string> = { th: 'th-TH', en: 'en-US' };

export function timeAgo(value: string | Date | null | undefined, lang: Lang = 'th', now: Date = new Date()): string {
  if (!value) return '-';
  const date = new Date(value);
  const diff = now.getTime() - date.getTime();
  if (Number.isNaN(diff)) return '-';
  if (diff < MINUTE) return translate(lang, 'time.justNow');
  if (diff < HOUR) return translate(lang, 'time.minutesAgo', { n: Math.floor(diff / MINUTE) });
  if (diff < DAY) return translate(lang, 'time.hoursAgo', { n: Math.floor(diff / HOUR) });
  if (diff < 7 * DAY) return translate(lang, 'time.daysAgo', { n: Math.floor(diff / DAY) });
  return formatDateTime(date, lang);
}

export function formatDateTime(value: string | Date | null | undefined, lang: Lang = 'th'): string {
  if (!value) return '-';
  return new Date(value).toLocaleString(LOCALE[lang], { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDuration(start: string, end: string | null, lang: Lang = 'th'): string {
  if (!end) return '-';
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return seconds < 60
    ? translate(lang, 'time.seconds', { n: seconds })
    : translate(lang, 'time.minSec', { m: Math.floor(seconds / 60), s: seconds % 60 });
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** OpenRouter credits (1 credit = 1 USD). Sub-dollar amounts keep up to 6 decimals so per-call costs stay visible. */
export function formatCredit(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const text = abs >= 1 ? abs.toFixed(2) : abs.toFixed(6).replace(/(\.\d\d\d*?)0+$/, '$1');
  return `${n < 0 ? '-' : ''}$${text}`;
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const CRON_PRESETS: { key: MessageKey; cron: string }[] = [
  { key: 'cron.15m', cron: '*/15 * * * *' },
  { key: 'cron.30m', cron: '*/30 * * * *' },
  { key: 'cron.1h', cron: '0 * * * *' },
  { key: 'cron.3h', cron: '0 */3 * * *' },
  { key: 'cron.6h', cron: '0 */6 * * *' },
  { key: 'cron.daily8', cron: '0 8 * * *' },
];

export function cronLabel(cron: string, lang: Lang = 'th'): string {
  const preset = CRON_PRESETS.find((p) => p.cron === cron);
  return preset ? translate(lang, preset.key) : cron;
}
