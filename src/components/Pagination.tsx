import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/i18n/I18nContext';

export const PAGE_SIZES = [10, 20, 50, 100];
/** Every table starts at this many rows per page until the user picks another size. */
export const DEFAULT_PAGE_SIZE = 10;

interface Props {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
  /** When given, a "per page" selector is shown. */
  onLimitChange?: (limit: number) => void;
  pageSizes?: number[];
}

/**
 * "1–20 of 135 · per page [20] · « ‹ page 1 / 7 › »". With a size selector the bar stays
 * visible while there is more than the smallest page size, so the size can be raised back.
 */
export function Pagination({ page, limit, total, onChange, onLimitChange, pageSizes = PAGE_SIZES }: Props) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / limit));
  const showSizes = Boolean(onLimitChange) && total > Math.min(...pageSizes);
  if (pages <= 1 && !showSizes) return null;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const sizes = pageSizes.includes(limit) ? pageSizes : [...pageSizes, limit].sort((a, b) => a - b);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3" aria-label={t('page.label')}>
      <span className="text-sm text-muted-foreground tabular-nums">{t('page.showing', { from, to, total: total.toLocaleString('en-US') })}</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {showSizes && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden>{t('page.size')}</span>
            <Select value={String(limit)} onValueChange={(v) => onLimitChange!(Number(v))}>
              <SelectTrigger size="sm" className="w-20" aria-label={t('page.size')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sizes.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label={t('page.first')} disabled={page <= 1} onClick={() => onChange(1)}>
            <ChevronsLeft aria-hidden />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t('page.prev')} disabled={page <= 1} onClick={() => onChange(page - 1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-24 px-1 text-center text-sm tabular-nums">{t('page.of', { page, pages })}</span>
          <Button variant="outline" size="icon-sm" aria-label={t('page.next')} disabled={page >= pages} onClick={() => onChange(page + 1)}>
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t('page.last')} disabled={page >= pages} onClick={() => onChange(pages)}>
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  );
}

/** Page size remembered per list in localStorage (falls back to the default if storage is unavailable). */
export function usePageSize(id: string, fallback = DEFAULT_PAGE_SIZE, allowed = PAGE_SIZES): [number, (size: number) => void] {
  const key = `page-size:${id}`;
  const [size, setSize] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return allowed.includes(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next: number) => {
    setSize(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // storage unavailable
    }
  };
  return [size, update];
}
