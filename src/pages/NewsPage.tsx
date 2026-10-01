import { Languages, Loader2, Newspaper, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, describeError } from '@/api/client';
import type { AssetOption, Direction, News, NewsQuery, NewsStats, Paginated, Source, TranslationStatus } from '@/api/types';
import { NewsCard } from '@/components/NewsCard';
import { Pagination, usePageSize } from '@/components/Pagination';
import { useFetchStatus } from '@/context/FetchStatusContext';
import { useHealth } from '@/context/HealthContext';
import { useI18n } from '@/i18n/I18nContext';
import { useDebounced } from '@/utils/useDebounced';

const TRANSLATION_POLL_MS = 2000;
/** Radix Select has no empty value; this stands for "no filter". */
const ALL = 'all';

export function NewsPage() {
  const { completedRun } = useFetchStatus();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [pageSize, setPageSize] = usePageSize('news');
  const [query, setQuery] = useState<NewsQuery>({ page: 1, limit: pageSize, sort: 'latest' });
  const [data, setData] = useState<Paginated<News> | null>(null);
  const [stats, setStats] = useState<NewsStats | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const health = useHealth();
  const canAnalyze = health?.analysis?.enabled ?? false;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const update = (patch: Partial<NewsQuery>) => setQuery((q) => ({ ...q, page: 1, ...patch }));

  useEffect(() => {
    setQuery((q) => (q.q === (debouncedSearch || undefined) ? q : { ...q, page: 1, q: debouncedSearch || undefined }));
  }, [debouncedSearch]);

  useEffect(() => {
    api.listSources().then(setSources, () => setSources([]));
  }, []);

  const loadAssets = useCallback(() => {
    api.newsAssets().then(setAssets, () => setAssets([]));
  }, []);
  useEffect(loadAssets, [loadAssets]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.listNews(query), api.newsStats()])
      .then(([news, s]) => {
        if (cancelled) return;
        setData(news);
        setStats(s);
        setError(null);
      })
      .catch((err) => !cancelled && setError(describeError(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, completedRun?.id, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const translation = useTranslationStatus(completedRun?.id, reload);

  const replaceStory = (updated: News) => {
    const before = data?.items.find((n) => n.id === updated.id);
    setData((d) => (d ? { ...d, items: d.items.map((n) => (n.id === updated.id ? updated : n)) } : d));
    // A new analysis may introduce assets the filter does not know about yet.
    if (updated.analysis && updated.analysis !== before?.analysis) {
      loadAssets();
      setStats((st) => (st && !before?.analysis ? { ...st, analyzed: (st.analyzed ?? 0) + 1 } : st));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label={t('news.stats')}>
          <Stat label={t('news.stat.total')} value={stats.news} />
          <Stat label={t('news.stat.last24h')} value={stats.last24h} />
          <Stat label={t('news.stat.multi')} value={stats.multiSource} />
          <Stat label={t('news.stat.refs')} value={stats.references} />
          <Stat label={t('news.stat.analyzed')} value={stats.analyzed ?? 0} />
          <Stat label={t('news.stat.sources')} value={stats.sources} />
        </section>
      )}

      <TranslationBanner {...translation} />

      <section className="flex flex-wrap items-center gap-2" aria-label={t('news.searchLabel')}>
        <InputGroup className="min-w-56 flex-1">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder={t('news.search')}
            aria-label={t('news.searchLabel')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <FilterSelect
          label={t('news.filterSource')}
          value={query.sourceId ? String(query.sourceId) : ALL}
          onChange={(v) => update({ sourceId: v === ALL ? undefined : Number(v) })}
          options={[{ value: ALL, label: t('news.allSources') }, ...sources.map((s) => ({ value: String(s.id), label: s.name }))]}
        />
        <FilterSelect
          label={t('news.sort')}
          value={query.sort ?? 'latest'}
          onChange={(v) => update({ sort: v as NewsQuery['sort'] })}
          options={[
            { value: 'latest', label: t('news.sort.latest') },
            { value: 'popular', label: t('news.sort.popular') },
          ]}
        />
        <FilterSelect
          label={t('news.filterAsset')}
          value={query.asset ?? ALL}
          onChange={(v) => update({ asset: v === ALL ? undefined : v })}
          options={[
            { value: ALL, label: t('news.allAssets') },
            ...assets.map((a) => ({ value: a.symbol, label: `${a.symbol} · ${a.name} (${a.count})` })),
          ]}
        />
        <FilterSelect
          label={t('news.filterDirection')}
          value={query.direction ?? ALL}
          onChange={(v) => update({ direction: v === ALL ? undefined : (v as Direction) })}
          options={[
            { value: ALL, label: t('news.allDirections') },
            { value: 'up', label: `▲ ${t('analysis.dir.up')}` },
            { value: 'down', label: `▼ ${t('analysis.dir.down')}` },
            { value: 'neutral', label: `▬ ${t('analysis.dir.neutral')}` },
          ]}
        />
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            id="multi-only"
            checked={query.minRefs === 2}
            onCheckedChange={(checked) => update({ minRefs: checked === true ? 2 : undefined })}
          />
          <Label htmlFor="multi-only" className="font-normal text-muted-foreground">
            {t('news.multiOnly')}
          </Label>
        </div>
      </section>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('news.loadError', { error })}</AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <div className="flex flex-col gap-3" aria-label={t('common.loading')}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <Card className="items-center gap-1 border-dashed py-10 text-center shadow-none">
          <Newspaper className="mb-2 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t('news.empty')}</p>
          <p className="text-sm text-muted-foreground">{t('news.emptyHint')}</p>
        </Card>
      ) : (
        <div className={loading ? 'flex flex-col gap-3 opacity-60 transition-opacity' : 'flex flex-col gap-3'}>
          {data?.items.map((n) => (
            <NewsCard
              key={n.id}
              news={n}
              canTranslate={translation.status?.enabled ?? false}
              canAnalyze={canAnalyze}
              onUpdated={replaceStory}
            />
          ))}
        </div>
      )}

      {data && (
        <Pagination
          page={data.page}
          limit={data.limit}
          total={data.total}
          onChange={(page) => setQuery((q) => ({ ...q, page }))}
          onLimitChange={(limit) => {
            setPageSize(limit);
            update({ limit });
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Translation backlog: loads on mount / after each fetch, polls while a backfill runs, reloads news when it ends. */
function useTranslationStatus(refreshKey: number | undefined, onFinished: () => void) {
  const [status, setStatus] = useState<TranslationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.translationStatus().then(setStatus, () => setStatus(null)), []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const running = status?.running ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const next = await api.translationStatus().catch(() => null);
      if (!next) return;
      setStatus(next);
      if (!next.running) onFinished();
    }, TRANSLATION_POLL_MS);
    return () => clearInterval(timer);
  }, [running, onFinished]);

  const start = async () => {
    setError(null);
    try {
      setStatus(await api.runTranslation({ includeFailed: true }));
    } catch (err) {
      setError(describeError(err));
    }
  };

  return { status, error, start };
}

function TranslationBanner({ status, error, start }: ReturnType<typeof useTranslationStatus>) {
  const { t } = useI18n();
  if (!status?.enabled) return null;
  const remaining = status.pending + status.failed;
  if (remaining === 0 && !status.running) return null;

  return (
    <Alert role="status" aria-label={t('news.translated')} className="border-info/40 bg-info-bg">
      {status.running ? <Loader2 className="animate-spin" aria-hidden /> : <Languages aria-hidden />}
      <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
        {status.running ? (
          <span>{t('news.translatingAll', { n: status.pending })}</span>
        ) : (
          <>
            <span>{t('news.pendingTranslations', { n: remaining })}</span>
            <Button size="sm" variant="outline" onClick={start}>
              {t('news.translateAll')}
            </Button>
          </>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
      </AlertDescription>
    </Alert>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm" className="gap-1 px-4">
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString('en-US')}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
