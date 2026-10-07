import { Search, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/i18n/I18nContext';
import { cn } from '@/lib/utils';
import { useDebounced } from '@/utils/useDebounced';

/** Radix Select has no empty value; this stands for "no filter". */
export const ALL = 'all';

export interface FilterOption {
  value: string;
  label: string;
}

export interface ToolbarFilter {
  id: string;
  /** Accessible name of the select. */
  label: string;
  /** Text of the "no filter" option, e.g. "All statuses". */
  allLabel: string;
  options: FilterOption[];
  /** ALL when not filtering. */
  value: string;
  onChange: (value: string) => void;
}

interface Props {
  label: string;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  filters?: ToolbarFilter[];
  /** Shown when something is filtered; clears search and every filter. */
  onReset?: () => void;
  /** Something outside `search` / `filters` is filtered too (e.g. a checkbox in `children`). */
  active?: boolean;
  /** Extra controls after the selects. */
  children?: ReactNode;
  className?: string;
}

/** Search box + filter selects above a table (client- or server-side filtering alike). */
export function TableToolbar({ label, search, filters = [], onReset, active: extraActive, children, className }: Props) {
  const { t } = useI18n();
  const active = extraActive || Boolean(search?.value) || filters.some((f) => f.value !== ALL);
  return (
    <div role="search" aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {search && (
        <InputGroup className="min-w-48 flex-1 sm:max-w-sm">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
          />
        </InputGroup>
      )}
      {filters.map((f) => (
        <Select key={f.id} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger aria-label={f.label} className={cn('min-w-36', f.value !== ALL && 'border-primary/60 text-foreground')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{f.allLabel}</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {children}
      {onReset && active && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X aria-hidden />
          {t('table.clearFilters')}
        </Button>
      )}
    </div>
  );
}

/** ALL -> undefined, for building a query. */
export const filterValue = <T extends string = string>(v: string) => (v === ALL ? undefined : (v as T));

/**
 * Search text + filter values of a server-paged table. `q` is the debounced search to send;
 * `key` changes whenever the query does (go back to page 1 on it); `active` = something is filtered.
 */
export function useTableFilters<F extends Record<string, string>>(initial: F) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350) || undefined;
  const [filters, setFilters] = useState<F>(initial);
  const set = (id: keyof F) => (value: string) => setFilters((f) => ({ ...f, [id]: value }));
  const reset = () => {
    setSearch('');
    setFilters(initial);
  };
  const active = Boolean(search.trim()) || Object.values(filters).some((v) => v !== ALL);
  return { search, setSearch, q, filters, set, reset, active, key: JSON.stringify([q, filters]) };
}
