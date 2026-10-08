import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, CircleX, Info, Loader2, Recycle, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, describeError } from '@/api/client';
import type { MarketPreview, MarketRun, MarketRunDetail, MarketWindow, Paginated, Source } from '@/api/types';
import { DataTable } from '@/components/DataTable';
import { MarketResultView } from '@/components/market/MarketResultView';
import { Pagination, usePageSize } from '@/components/Pagination';
import { TableToolbar, filterValue, useTableFilters } from '@/components/TableToolbar';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useHealth } from '@/context/HealthContext';
import { gasErrorText, useCreditPrices } from '@/lib/credits';
import { useI18n } from '@/i18n/I18nContext';
import { formatCredit, formatDateTime } from '@/utils/format';

const POLL_MS = 1500;
const SETUP_KEY = 'market:setup';
const ALL = 'all';

interface Setup {
  window: MarketWindow;
  /** Empty = all sources. */
  sourceIds: number[];
  refresh: boolean;
  analyzeMissing: boolean;
}

const DEFAULT_SETUP: Setup = { window: '1d', sourceIds: [], refresh: true, analyzeMissing: false };

function loadSetup(): Setup {
  try {
    const saved = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null') as Partial<Setup> | null;
    // A setup saved when 7 days was still offered falls back to the only window left.
    return saved ? { ...DEFAULT_SETUP, ...saved, window: '1d' } : DEFAULT_SETUP;
  } catch {
    return DEFAULT_SETUP;
  }
}

export function MarketPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get('run')) || null;
  const [historyKey, setHistoryKey] = useState(0);
  const select = useCallback((id: number) => setParams({ run: String(id) }, { replace: true }), [setParams]);
  const refreshHistory = useCallback(() => setHistoryKey((k) => k + 1), []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('market.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('market.subtitle')}</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <SetupCard
          refreshKey={historyKey}
          onStarted={(run) => {
            select(run.id);
            refreshHistory();
          }}
        />
        <SelectedRun id={selectedId} onFinished={refreshHistory} />
      </div>

      <HistoryCard refreshKey={historyKey} selectedId={selectedId} onSelect={select} onLoaded={(first) => !selectedId && first && select(first)} />
    </div>
  );
}

// ---------------------------------------------------------------- setup

function SetupCard({ refreshKey, onStarted }: { refreshKey: number; onStarted: (run: MarketRun) => void }) {
  const { t } = useI18n();
  const health = useHealth();
  const aiOn = health?.ai.enabled ?? false;
  // Customers pay per brief and always run on fresh news (no options); administrators pick the options for free.
  const staff = useAuth().user?.isStaff ?? false;
  const price = useCreditPrices().market;
  const [stored, setSetup] = useState<Setup>(loadSetup);
  const setup: Setup = staff ? stored : { ...stored, refresh: true, analyzeMissing: false };
  const [sources, setSources] = useState<Source[]>([]);
  const [preview, setPreview] = useState<MarketPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<Setup>) =>
    setSetup((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETUP_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable
      }
      return next;
    });

  useEffect(() => {
    // Every source: "enabled" only controls the scheduler's automatic fetch; a market run fetches all chosen ones.
    api.listSources().then(setSources, () => setSources([]));
  }, []);

  // Drop selections of sources that no longer exist.
  const validIds = useMemo(() => setup.sourceIds.filter((id) => sources.some((s) => s.id === id)), [setup.sourceIds, sources]);
  const sourcesKey = validIds.join(',');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.marketPreview(setup.window, validIds).then(
        (p) => {
          if (cancelled) return;
          setPreview(p);
          setPreviewError(null);
        },
        (err) => !cancelled && setPreviewError(describeError(err)),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourcesKey stands for validIds
  }, [setup.window, sourcesKey, refreshKey]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await api.startMarket({ ...setup, sourceIds: validIds, analyzeMissing: setup.analyzeMissing && (preview?.missingCount ?? 0) > 0 });
      if (run.credits > 0) toast.info(t('market.creditsOnDone', { n: run.credits }));
      onStarted(run);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleValue = validIds.length ? validIds.map(String) : [ALL];
  const onSourcesChange = (values: string[]) => {
    const pickedAll = values.includes(ALL) && !toggleValue.includes(ALL);
    const ids = pickedAll ? [] : values.filter((v) => v !== ALL).map(Number);
    update({ sourceIds: ids.length === sources.length ? [] : ids });
  };

  const estimate = preview ? preview.estimate.market + (setup.analyzeMissing ? preview.estimate.stories : 0) : 0;
  const canRun = aiOn && !busy && preview !== null && (preview.storyCount > 0 || (setup.refresh && preview.staleSources.length > 0));

  return (
    <Card role="region" aria-label={t('market.setup')}>
      <CardHeader>
        <CardTitle>{t('market.setup')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <Label>{t('market.period')}</Label>
          <p className="text-sm">{t('market.periodFixed')}</p>
          <p className="text-xs text-muted-foreground">{t('market.periodFixedHelp')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('market.sources')}</Label>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={toggleValue}
            onValueChange={onSourcesChange}
            aria-label={t('market.sources')}
            className="flex-wrap justify-start"
          >
            <ToggleGroupItem value={ALL} className="px-3">
              {t('market.allSources')}
            </ToggleGroupItem>
            {sources.map((s) => (
              <ToggleGroupItem key={s.id} value={String(s.id)} className="px-3">
                {s.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {staff && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Checkbox id="market-refresh" checked={setup.refresh} onCheckedChange={(c) => update({ refresh: c === true })} className="mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="market-refresh" className="font-normal">
                {t('market.refresh')}
              </Label>
              {preview && setup.refresh && (
                <span className="text-xs text-muted-foreground">
                  {preview.staleSources.length ? t('market.refreshStale', { names: preview.staleSources.join(', ') }) : t('market.refreshFresh')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="market-analyze-missing"
              checked={setup.analyzeMissing}
              onCheckedChange={(c) => update({ analyzeMissing: c === true })}
              disabled={preview !== null && preview.missingCount === 0}
              className="mt-0.5"
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="market-analyze-missing" className="font-normal">
                {t('market.analyzeMissing')}
              </Label>
              {preview && (
                <span className="text-xs text-muted-foreground">
                  {preview.missingCount
                    ? t('market.analyzeMissingHelp', { n: preview.missingCount, cost: formatCredit(preview.estimate.stories) })
                    : t('market.analyzeMissingNone')}
                </span>
              )}
            </div>
          </div>
        </div>
        )}

        <div className="flex flex-col gap-1.5 rounded-lg border bg-surface-sunken/40 p-3 text-sm" aria-live="polite" data-testid="market-preview">
          {previewError ? (
            <span className="text-danger">{previewError}</span>
          ) : !preview ? (
            <Skeleton className="h-10" />
          ) : (
            <>
              <span className="font-medium">
                {t('market.preview', { n: preview.storyCount, analyzed: preview.analyzedCount, missing: preview.missingCount })}
              </span>
              <span className="text-xs text-muted-foreground">{t('market.previewHelp')}</span>
              {preview.contentMissingCount > 0 && (
                <span className="text-xs text-muted-foreground">{t('market.contentMissing', { n: preview.contentMissingCount })}</span>
              )}
              {preview.truncatedCount > 0 && <span className="text-xs text-warning">{t('market.truncated', { n: preview.truncatedCount })}</span>}
              {preview.storyCount === 0 && <span className="text-xs text-muted-foreground">{t('market.noStories')}</span>}
              {staff ? (
                <span className="tabular-nums">{t('market.estimate', { cost: formatCredit(estimate) })}</span>
              ) : (
                <span className="text-xs text-muted-foreground">{t('market.freshNews')}</span>
              )}
              {preview.cached && (
                <span className="flex items-start gap-1.5 text-xs text-info">
                  <Recycle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t('market.cachedHint', { id: preview.cached.id })}
                </span>
              )}
            </>
          )}
        </div>

        {!aiOn && health && (
          <Alert>
            <Info aria-hidden />
            <AlertDescription>{t('market.aiOff')}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button className="w-full" onClick={start} disabled={!canRun}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {staff ? t('market.run') : t('market.runCredits', { n: price })}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------- selected run (polls while running)

function SelectedRun({ id, onFinished }: { id: number | null; onFinished: () => void }) {
  const { t } = useI18n();
  const [run, setRun] = useState<MarketRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    if (!id) {
      setRun(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasRunning = false;
    const load = async () => {
      try {
        const r = await api.marketRun(id);
        if (cancelled) return;
        setRun(r);
        setError(null);
        // Also while a customer's GAS charge is being confirmed (each look retries it with the same request).
        if (r.status === 'running' || r.charge?.status === 'pending') {
          wasRunning = true;
          timer = setTimeout(load, POLL_MS);
        } else if (wasRunning) {
          finished.current();
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
    };
    setRun((r) => (r?.id === id ? r : null));
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (error) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!id) {
    return (
      <Card className="items-center gap-2 border-dashed py-12 text-center shadow-none">
        <Sparkles className="size-8 text-muted-foreground" aria-hidden />
        <p className="max-w-sm text-sm text-muted-foreground">{t('market.empty')}</p>
      </Card>
    );
  }
  if (!run) return <Skeleton className="h-80 rounded-xl" aria-label={t('common.loading')} />;
  if (run.status === 'success' && run.charge && run.charge.status !== 'paid') {
    return (
      <Card className="items-center gap-2 py-12 text-center" role="status">
        {run.charge.status === 'pending' ? <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden /> : <Info className="size-8 text-danger" aria-hidden />}
        <p className="max-w-md text-sm">
          {run.charge.status === 'pending'
            ? t('market.charging', { n: run.charge.credits })
            : t('market.chargeFailed', { error: gasErrorText(t, run.charge.error ?? 'UNKNOWN') })}
        </p>
      </Card>
    );
  }
  return <MarketResultView run={run} />;
}

// ---------------------------------------------------------------- history

function StatusBadge({ run }: { run: MarketRun }) {
  const { t } = useI18n();
  if (run.status === 'running')
    return (
      <Badge variant="info">
        <Loader2 className="animate-spin" aria-hidden />
        {t('market.status.running')}
      </Badge>
    );
  if (run.status === 'failed')
    return (
      <Badge variant="danger" title={run.error ?? undefined}>
        <CircleX aria-hidden />
        {t('market.status.failed')}
      </Badge>
    );
  if (run.reusedFromId)
    return (
      <Badge variant="secondary" title={`#${run.reusedFromId}`}>
        <Recycle aria-hidden />
        {t('market.status.reused')}
      </Badge>
    );
  return (
    <Badge variant="success">
      <CircleCheck aria-hidden />
      {t('market.status.success')}
    </Badge>
  );
}

function HistoryCard({
  refreshKey,
  selectedId,
  onSelect,
  onLoaded,
}: {
  refreshKey: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onLoaded: (firstId: number | null) => void;
}) {
  const { t, lang } = useI18n();
  // Administrators: every brief, with its AI cost. Customers: the ones they started.
  const staff = useAuth().user?.isStaff ?? false;
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePageSize('market-history');
  const [data, setData] = useState<Paginated<MarketRun> | null>(null);
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;
  const anyRunning = data?.items.some((r) => r.status === 'running') ?? false;
  const list = useTableFilters({ status: ALL });
  const query = useMemo(
    () => ({ page, limit, q: list.q, status: filterValue<MarketRun['status']>(list.filters.status) }),
    [page, limit, list.q, list.filters.status],
  );

  useEffect(() => setPage(1), [list.key]);
  useEffect(() => {
    let cancelled = false;
    api.marketRuns(query).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        loaded.current(d.items[0]?.id ?? null);
      },
      () => !cancelled && setData({ items: [], total: 0, page, limit }),
    );
    return () => {
      cancelled = true;
    };
  }, [query, page, limit, refreshKey]);

  // Keep running rows' status fresh.
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => api.marketRuns(query).then(setData, () => undefined), POLL_MS * 2);
    return () => clearInterval(timer);
  }, [anyRunning, query]);

  const columns = useMemo<ColumnDef<MarketRun, unknown>[]>(
    () => [
      { id: 'id', header: '#', size: 64, minSize: 56, cell: ({ row }) => `#${row.original.id}` },
      { id: 'time', header: t('market.col.time'), size: 160, minSize: 132, cell: ({ row }) => formatDateTime(row.original.createdAt, lang) },
      { id: 'window', header: t('market.col.window'), size: 80, minSize: 72, cell: ({ row }) => t(`market.window.${row.original.window}`) },
      {
        id: 'sources',
        header: t('market.col.sources'),
        size: 180,
        minSize: 120,
        cell: ({ row: { original: r } }) => {
          const text = r.sourceIds.length ? r.sourceNames.join(', ') : t('market.allSources');
          return <span title={text}>{text}</span>;
        },
      },
      { id: 'stories', header: t('market.col.stories'), size: 80, minSize: 72, meta: { align: 'right' }, cell: ({ row }) => row.original.storyCount },
      { id: 'status', header: t('market.col.status'), size: 130, minSize: 116, cell: ({ row }) => <StatusBadge run={row.original} /> },
      {
        id: 'headline',
        header: t('market.col.headline'),
        size: 320,
        minSize: 200,
        meta: { grow: true },
        cell: ({ row: { original: r } }) => {
          const text = (lang === 'th' ? r.headlineTh : r.headlineEn) ?? r.error ?? '-';
          return <span title={text} className={cn(!r.headlineEn && 'text-muted-foreground')}>{text}</span>;
        },
      },
      // What the AI cost us is for administrators.
      ...(staff
        ? [{ id: 'cost', header: t('market.col.cost'), size: 100, minSize: 84, meta: { align: 'right' as const }, cell: ({ row }: { row: { original: MarketRun } }) => formatCredit(row.original.cost) }]
        : []),
    ],
    [t, lang, staff],
  );

  return (
    <Card role="region" aria-label={t('market.history')}>
      <CardHeader>
        <CardTitle>{t('market.history')}</CardTitle>
        <CardDescription>{data ? t('page.showing', { from: data.total ? (data.page - 1) * data.limit + 1 : 0, to: Math.min(data.total, data.page * data.limit), total: data.total }) : ''}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data && (data.total > 0 || list.active) && (
          <TableToolbar
            label={t('market.history')}
            search={{ value: list.search, onChange: list.setSearch, placeholder: t('market.searchHistory') }}
            filters={[
              {
                id: 'status',
                label: t('table.filterStatus'),
                allLabel: t('table.allStatuses'),
                options: (['success', 'running', 'failed'] as const).map((s) => ({ value: s, label: t(`market.status.${s}`) })),
                value: list.filters.status,
                onChange: list.set('status'),
              },
            ]}
            onReset={list.reset}
          />
        )}
        {data === null ? (
          <Skeleton className="h-32" aria-label={t('common.loading')} />
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{list.active ? t('table.noMatches') : t('market.historyEmpty')}</p>
        ) : (
          <DataTable
            id="market-history"
            label={t('market.history')}
            columns={columns}
            data={data.items}
            getRowId={(r) => String(r.id)}
            onRowClick={(r) => onSelect(r.id)}
            rowClassName={(row) => (row.original.id === selectedId ? 'bg-primary/5' : undefined)}
          />
        )}
        {data && data.total > 0 && (
          <Pagination
            page={data.page}
            limit={data.limit}
            total={data.total}
            onChange={setPage}
            onLimitChange={(size) => {
              setLimit(size);
              setPage(1);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
