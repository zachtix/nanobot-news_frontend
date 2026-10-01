import type { ColumnDef } from '@tanstack/react-table';
import { ChartColumn, ChevronRight, CircleCheck, CircleX, ExternalLink, RefreshCw, Table2 } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ANTHROPIC_BILLING_URL, PROVIDER_LABEL } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, describeError } from '@/api/client';
import type { AiAccount, AiUsageCall, AiUsageSummary, DailyUsage, Paginated } from '@/api/types';
import {
  BlendedCostChart,
  bucketText,
  CacheRateChart,
  isHourly,
  KpiTile,
  ModelTrendChart,
  PURPOSES,
  TokenTrendChart,
  UsageTrendChart,
} from '@/components/ai/UsageCharts';
import { DataTable } from '@/components/DataTable';
import { Pagination, usePageSize } from '@/components/Pagination';
import { PromptLogView } from '@/components/PromptLogView';
import { useFetchStatus } from '@/context/FetchStatusContext';
import { useHealth } from '@/context/HealthContext';
import { useI18n } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import { formatCredit, formatDateTime, formatNumber, hostname } from '@/utils/format';

const PURPOSE_LABEL: Record<string, MessageKey> = {
  dedup: 'ai.purpose.dedup',
  translate: 'ai.purpose.translate',
  tag: 'ai.purpose.tag',
  analyze: 'ai.purpose.analyze',
  market: 'ai.purpose.market',
  test: 'ai.purpose.test',
};
const PURPOSE_BADGE: Record<string, string> = {
  dedup: 'bg-chart-1/15 text-chart-1',
  translate: 'bg-chart-2/15 text-chart-2',
  tag: 'bg-chart-3/15 text-chart-3',
  analyze: 'bg-chart-4/15 text-chart-4',
  market: 'bg-chart-5/15 text-chart-5',
  test: 'bg-muted text-muted-foreground',
};
/** 1 = last 24 hours, charted per hour; the rest are calendar days, charted per day. */
const PERIODS = [1, 7, 30, 90] as const;
const ALL = 'all';

export function AiUsagePage() {
  const { completedRun } = useFetchStatus();
  const { t } = useI18n();
  const [days, setDays] = useState<number>(1);
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.aiUsageSummary(days).then(
      (s) => {
        setSummary(s);
        setError(null);
      },
      (err) => setError(describeError(err)),
    );
  }, [completedRun?.id, days]);

  const current = summary?.period?.current ?? summary?.last30d;
  const shownDays = summary?.period?.days ?? days;
  const periodText = shownDays === 1 ? t('ai.last24h') : t('ai.lastDays', { n: shownDays });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('ai.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('ai.subtitle')}
            {summary && t('ai.subtitleDetail', { model: summary.model, tz: summary.timezone })}
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={String(days)}
          onValueChange={(v) => v && setDays(Number(v))}
          aria-label={t('ai.period')}
        >
          {PERIODS.map((p) => (
            <ToggleGroupItem key={p} value={String(p)} className="px-3">
              {t('ai.periodDays', { n: p })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <AccountCard />

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('ai.loadError', { error })}</AlertDescription>
        </Alert>
      )}

      {!summary && !error && <Skeleton className="h-28 rounded-xl" aria-label={t('common.loading')} />}

      {summary && current && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label={t('ai.periods')}>
            {(['spend', 'requests', 'tokens', 'cacheRate', 'blended'] as const).map((k) => (
              <KpiTile key={k} kpi={k} current={current} previous={summary.period?.previous} daily={summary.daily} />
            ))}
          </section>

          {/* 1) usage trend per task  2) token / cost / cache detail  3) models over time */}
          <DailyUsageCard daily={summary.daily} period={periodText} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TokenTrendChart daily={summary.daily} />
            <BlendedCostChart daily={summary.daily} />
            <CacheRateChart daily={summary.daily} />
          </div>

          <ModelTable
            rows={summary.period?.byModel ?? summary.byModel}
            daily={summary.daily}
            models={summary.byModel.map((m) => m.model)}
            period={periodText}
          />
        </>
      )}

      <CallsTable refreshKey={completedRun?.id} />
    </div>
  );
}

function AccountCard() {
  const { t } = useI18n();
  const health = useHealth();
  const [account, setAccount] = useState<AiAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      setAccount(await api.aiAccount(refresh));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const key = account?.key;
  const credits = account?.credits;
  const provider = account?.provider ?? health?.ai.provider ?? 'openrouter';
  const title = t('ai.account', { provider: PROVIDER_LABEL[provider] });

  return (
    <Card role="region" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden />
            {loading ? t('common.loading') : t('ai.refresh')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-danger">{error}</p>}
        {account && !account.enabled && (
          <p className="text-sm text-muted-foreground">{t('ai.noKey', { provider: PROVIDER_LABEL[provider] })}</p>
        )}

        {/* Anthropic has no balance API: show the key status and where to see the credit instead. */}
        {account?.enabled && provider === 'anthropic' && (
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label={t('ai.anthropic.keyStatus')}>
              <div
                className={cn('flex items-center gap-2 text-2xl font-bold', account.verified ? 'text-success' : 'text-danger')}
                data-testid="anthropic-key"
              >
                {account.verified ? <CircleCheck className="size-5" aria-hidden /> : <CircleX className="size-5" aria-hidden />}
                {account.verified ? t('ai.anthropic.keyOk') : t('ai.anthropic.keyBad')}
              </div>
              <div className="text-xs text-muted-foreground">{t('ai.anthropic.costNote')}</div>
            </Metric>
            <Metric label={t('ai.creditsRemaining')}>
              <p className="text-sm">{t('ai.anthropic.noBalance')}</p>
              <Button asChild variant="outline" size="sm" className="mt-1 self-start">
                <a href={ANTHROPIC_BILLING_URL} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  {t('ai.anthropic.openBilling')}
                </a>
              </Button>
            </Metric>
          </div>
        )}

        {account?.enabled && provider !== 'anthropic' && (
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label={t('ai.creditsRemaining')}>
              <div className="text-2xl font-bold tabular-nums" data-testid="credits-remaining">
                {credits ? formatCredit(credits.remaining) : '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                {credits
                  ? t('ai.creditsDetail', { total: formatCredit(credits.totalCredits), used: formatCredit(credits.totalUsage) })
                  : t('ai.needMgmtKey')}
              </div>
              {credits && credits.totalCredits > 0 && (
                <RemainingBar
                  remaining={credits.remaining}
                  total={credits.totalCredits}
                  label={t('ai.creditsRemaining')}
                  lowText={t('ai.lowCredits')}
                />
              )}
            </Metric>
            <Metric label={t('ai.keyLimit')}>
              <div className="text-2xl font-bold tabular-nums" data-testid="key-remaining">
                {key ? (key.limit === null ? t('ai.unlimited') : t('ai.remaining', { amount: formatCredit(key.limitRemaining) })) : '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                {key?.limit !== null && key?.limit !== undefined
                  ? t('ai.limitDetail', { limit: formatCredit(key.limit) }) +
                    (key.limitReset ? t('ai.limitReset', { reset: key.limitReset }) : '')
                  : (key?.label ?? '')}
              </div>
              {key && key.limit !== null && key.limit > 0 && key.limitRemaining !== null && (
                <RemainingBar
                  remaining={key.limitRemaining}
                  total={key.limit}
                  label={t('ai.keyLimit')}
                  lowText={key.limitReset ? t('ai.lowKeyReset', { reset: key.limitReset }) : t('ai.lowKey')}
                />
              )}
            </Metric>
            <Metric label={t('ai.keyUsage')}>
              {key ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                  {(
                    [
                      ['ai.today', key.usageDaily],
                      ['ai.thisWeek', key.usageWeekly],
                      ['ai.thisMonth', key.usageMonthly],
                      ['ai.allTime', key.usage],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted-foreground">{t(label)}</dt>
                      <dd className="text-right tabular-nums">{formatCredit(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="text-2xl font-bold">-</div>
              )}
            </Metric>
          </div>
        )}

        {account && account.errors.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {account.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const LEVEL = {
  ok: { bar: 'bg-success', text: 'text-muted-foreground' },
  warning: { bar: 'bg-warning', text: 'text-warning' },
  critical: { bar: 'bg-danger', text: 'text-danger' },
} as const;

/**
 * How much is left, like a battery: the fill shrinks as it is used. Below 50% it turns amber,
 * below 20% red — always with a text label, never color alone.
 */
export function RemainingBar({ remaining, total, label, lowText }: { remaining: number; total: number; label: string; lowText: string }) {
  const { t } = useI18n();
  const pct = total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0;
  const level = pct < 20 ? 'critical' : pct < 50 ? 'warning' : 'ok';
  const shown = pct < 10 ? pct.toFixed(1) : String(Math.round(pct));
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div
        className="h-2 overflow-hidden rounded-full bg-border"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={t('ai.leftPct', { pct: shown })}
        data-level={level}
      >
        <span className={cn('block h-full rounded-full transition-[width]', LEVEL[level].bar)} style={{ width: `${pct}%` }} />
      </div>
      <div className={cn('flex flex-wrap justify-between gap-x-2 text-xs', LEVEL[level].text)}>
        <span className="tabular-nums">{t('ai.leftPct', { pct: shown })}</span>
        {level === 'warning' && <span>{t('ai.lowWarning')}</span>}
        {level === 'critical' && <span className="font-medium">{lowText}</span>}
      </div>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-surface-sunken p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

/** Usage trend per task (lines); its table view lists every day / hour (newest first). */
function DailyUsageCard({ daily, period }: { daily: DailyUsage[]; period: string }) {
  const { t } = useI18n();
  const rows = useMemo(() => [...daily].reverse(), [daily]);
  const hourly = isHourly(daily);
  const columns = useMemo<ColumnDef<DailyUsage, unknown>[]>(
    () => [
      {
        id: 'date',
        header: t(hourly ? 'ai.col.time' : 'ai.col.date'),
        size: 130,
        minSize: 100,
        meta: { grow: true },
        cell: ({ row }) => bucketText(row.original.date),
      },
      { id: 'calls', header: t('ai.col.calls'), size: 64, minSize: 56, meta: { align: 'right' }, cell: ({ row }) => formatNumber(row.original.calls) },
      { id: 'in', header: 'Input', size: 84, minSize: 72, meta: { align: 'right' }, cell: ({ row }) => formatNumber(row.original.promptTokens) },
      { id: 'out', header: 'Output', size: 84, minSize: 72, meta: { align: 'right' }, cell: ({ row }) => formatNumber(row.original.completionTokens) },
      { id: 'cost', header: t('ai.col.cost'), size: 96, minSize: 84, meta: { align: 'right' }, cell: ({ row }) => formatCredit(row.original.cost) },
    ],
    [t, hourly],
  );
  return (
    <ViewCard
      id="ai-daily"
      label={t('ai.daily')}
      title={t('ai.dailyTitle')}
      description={t('ai.dailyHelp', { period })}
      chart={<UsageTrendChart daily={daily} />}
      table={
        <DataTable
          id="ai-daily"
          label={t('ai.daily')}
          columns={columns}
          data={rows}
          getRowId={(d) => d.date}
          rowClassName={(row) => (row.original.calls === 0 ? 'text-muted-foreground/70' : undefined)}
          paginate
        />
      }
    />
  );
}

type ModelRow = AiUsageSummary['byModel'][number];

/** Models over time (lines); the table view ranks the period's totals. */
function ModelTable({ rows, daily, models, period }: { rows: ModelRow[]; daily: DailyUsage[]; models: string[]; period: string }) {
  const { t } = useI18n();
  const columns = useMemo<ColumnDef<ModelRow, unknown>[]>(
    () => [
      { id: 'model', header: t('ai.col.model'), size: 150, minSize: 120, meta: { grow: true }, cell: ({ row }) => row.original.model },
      { id: 'calls', header: t('ai.col.calls'), size: 64, minSize: 56, meta: { align: 'right' }, cell: ({ row }) => formatNumber(row.original.calls) },
      { id: 'in', header: 'Input', size: 84, minSize: 72, meta: { align: 'right' }, cell: ({ row }) => formatNumber(row.original.promptTokens) },
      { id: 'out', header: 'Output', size: 84, minSize: 72, meta: { align: 'right' }, cell: ({ row }) => formatNumber(row.original.completionTokens) },
      { id: 'cost', header: t('ai.col.cost'), size: 96, minSize: 84, meta: { align: 'right' }, cell: ({ row }) => formatCredit(row.original.cost) },
    ],
    [t],
  );
  return (
    <ViewCard
      id="ai-models"
      label={t('ai.byModel')}
      title={t('ai.byModel')}
      description={t('ai.byModelHelp', { period })}
      chart={<ModelTrendChart daily={daily} models={models} />}
      table={
        <DataTable
          id="ai-models"
          label={t('ai.byModel')}
          columns={columns}
          data={rows}
          getRowId={(m) => m.model}
          empty={t('ai.noCalls')}
          paginate
        />
      }
    />
  );
}

type View = 'chart' | 'table';

/** A card that shows a chart by default, with a table view of the same numbers one click away (remembered). */
function ViewCard({ id, label, title, description, chart, table }: { id: string; label: string; title: string; description?: string; chart: ReactNode; table: ReactNode }) {
  const { t } = useI18n();
  const storageKey = `view:${id}`;
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(storageKey) === 'table' ? 'table' : 'chart';
    } catch {
      return 'chart';
    }
  });
  const choose = (v: string) => {
    if (v !== 'chart' && v !== 'table') return;
    setView(v);
    try {
      localStorage.setItem(storageKey, v);
    } catch {
      // storage unavailable
    }
  };
  return (
    <Card role="region" aria-label={label}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={choose} aria-label={t('ai.view')}>
            <ToggleGroupItem value="chart" aria-label={t('ai.view.chart')}>
              <ChartColumn aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label={t('ai.view.table')}>
              <Table2 aria-hidden />
            </ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>{view === 'chart' ? chart : table}</CardContent>
    </Card>
  );
}

/** Batched calls reference many stories ("news#116,115,…"); keep the cell short, full list in the tooltip. */
export function shortContext(context: string | null): string {
  if (!context) return '-';
  const match = /^news#([\d,]+)$/.exec(context);
  if (!match) return context.length > 40 ? `${context.slice(0, 39)}…` : context;
  const ids = match[1].split(',');
  return ids.length <= 3 ? context : `news#${ids.slice(0, 3).join(',')} +${ids.length - 3}`;
}

function CallsTable({ refreshKey }: { refreshKey?: number }) {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePageSize('ai-calls');
  const [failedOnly, setFailedOnly] = useState(false);
  const [purpose, setPurpose] = useState(ALL);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [data, setData] = useState<Paginated<AiUsageCall> | null>(null);

  useEffect(() => {
    api
      .aiUsageCalls({
        page,
        limit,
        success: failedOnly ? false : undefined,
        purpose: purpose === ALL ? undefined : purpose,
      })
      .then(setData, () => setData({ items: [], total: 0, page, limit }));
  }, [page, limit, failedOnly, purpose, refreshKey]);

  const label = useCallback((p: string) => (PURPOSE_LABEL[p] ? t(PURPOSE_LABEL[p]) : p), [t]);

  const columns = useMemo<ColumnDef<AiUsageCall, unknown>[]>(
    () => [
      { id: 'time', header: t('ai.col.time'), size: 160, minSize: 132, cell: ({ row }) => formatDateTime(row.original.createdAt, lang) },
      {
        id: 'purpose',
        header: t('ai.col.purpose'),
        size: 140,
        minSize: 120,
        cell: ({ row }) => (
          <Badge data-purpose={row.original.purpose} className={PURPOSE_BADGE[row.original.purpose] ?? 'bg-muted text-muted-foreground'}>
            {label(row.original.purpose)}
          </Badge>
        ),
      },
      { id: 'model', header: t('ai.col.model'), size: 170, minSize: 120, cell: ({ row }) => <span title={row.original.model}>{row.original.model}</span> },
      { id: 'in', header: 'Input', size: 88, minSize: 72, meta: { align: 'right' }, cell: ({ row }) => formatNumber(row.original.promptTokens) },
      { id: 'out', header: 'Output', size: 88, minSize: 72, meta: { align: 'right' }, cell: ({ row }) => formatNumber(row.original.completionTokens) },
      { id: 'cost', header: t('ai.col.cost'), size: 104, minSize: 88, meta: { align: 'right' }, cell: ({ row }) => formatCredit(row.original.cost) },
      {
        id: 'duration',
        header: t('ai.col.duration'),
        size: 92,
        minSize: 76,
        meta: { align: 'right' },
        cell: ({ row }) => t('time.seconds', { n: (row.original.durationMs / 1000).toFixed(1) }),
      },
      {
        id: 'status',
        header: t('ai.col.status'),
        size: 104,
        minSize: 92,
        cell: ({ row: { original: c } }) =>
          c.success ? (
            <Badge variant="success">{t('ai.success')}</Badge>
          ) : (
            <Badge variant="danger" title={c.error ?? undefined}>
              {t('ai.failed')}
            </Badge>
          ),
      },
      { id: 'run', header: t('ai.col.run'), size: 84, minSize: 72, cell: ({ row }) => (row.original.fetchRunId ? `#${row.original.fetchRunId}` : '-') },
      {
        id: 'context',
        header: t('ai.col.context'),
        size: 190,
        minSize: 140,
        meta: { grow: true },
        cell: ({ row: { original: c } }) =>
          c.context?.startsWith('http') ? (
            <a href={c.context} target="_blank" rel="noreferrer" title={c.context} className="hover:text-primary hover:underline">
              {hostname(c.context)}
            </a>
          ) : (
            <span title={c.context ?? undefined}>{shortContext(c.context)}</span>
          ),
      },
      {
        id: 'prompt',
        header: 'Prompt',
        size: 120,
        minSize: 108,
        cell: ({ row: { original: c } }) =>
          c.hasLog ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              aria-expanded={expanded === c.id}
              onClick={() => setExpanded((e) => (e === c.id ? null : c.id))}
            >
              <ChevronRight className={cn('transition-transform', expanded === c.id && 'rotate-90')} aria-hidden />
              {expanded === c.id ? t('ai.log.hide') : t('ai.log.show')}
            </Button>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
    ],
    [t, lang, expanded, label],
  );

  return (
    <Card role="region" aria-label={t('ai.recent')}>
      <CardHeader>
        <CardTitle>{t('ai.recent')}</CardTitle>
        <CardAction className="flex flex-wrap items-center gap-3">
          <Select
            value={purpose}
            onValueChange={(v) => {
              setPurpose(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label={t('ai.filterPurpose')} className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('ai.allPurposes')}</SelectItem>
              {PURPOSES.map((p) => (
                <SelectItem key={p} value={p}>
                  {label(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox
              id="failed-only"
              checked={failedOnly}
              onCheckedChange={(c) => {
                setFailedOnly(c === true);
                setPage(1);
              }}
            />
            <Label htmlFor="failed-only" className="font-normal text-muted-foreground">
              {t('ai.failedOnly')}
            </Label>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data === null ? (
          <Skeleton className="h-40" aria-label={t('common.loading')} />
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('ai.noCalls')}</p>
        ) : (
          <DataTable
            id="ai-calls"
            label={t('ai.recent')}
            columns={columns}
            data={data.items}
            getRowId={(c) => String(c.id)}
            isExpanded={(c) => expanded === c.id}
            renderExpanded={(c) => <PromptLogView usageId={c.id} />}
            onRowClick={(c) => setExpanded((e) => (e === c.id ? null : c.id))}
            canClickRow={(c) => Boolean(c.hasLog)}
          />
        )}
        {data && (
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
