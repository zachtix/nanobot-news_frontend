import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { DailyUsage, UsageTotals } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import type { Lang, MessageKey } from '@/i18n/messages';
import { formatCredit, formatNumber } from '@/utils/format';

/**
 * Series colors are fixed per entity (never by rank) and come from the validated
 * Nanobot chart slots (--chart-1..5, light + dark). The five real tasks take the five slots;
 * connection tests are not work, so they get neutral ink instead of a sixth (unvalidated) hue.
 */
export const PURPOSES = ['dedup', 'translate', 'tag', 'analyze', 'market', 'test'] as const;
const PURPOSE_COLOR: Record<(typeof PURPOSES)[number], string> = {
  dedup: 'var(--chart-1)',
  translate: 'var(--chart-2)',
  tag: 'var(--chart-3)',
  analyze: 'var(--chart-4)',
  market: 'var(--chart-5)',
  test: 'var(--muted-foreground)',
};

const shortDate = (date: string, lang: Lang) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short' });

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(Math.round(n * 100) / 100));

// ---------------------------------------------------------------- KPI tiles

export type Kpi = 'spend' | 'requests' | 'tokens' | 'cacheRate' | 'blended';

const kpiValue = (k: Kpi, t: UsageTotals): number | null => {
  switch (k) {
    case 'spend':
      return t.cost;
    case 'requests':
      return t.calls;
    case 'tokens':
      return t.totalTokens;
    case 'cacheRate':
      return t.promptTokens ? (t.cachedTokens / t.promptTokens) * 100 : null;
    case 'blended':
      return t.totalTokens ? (t.cost / t.totalTokens) * 1_000_000 : null;
  }
};

const kpiFormat = (k: Kpi, v: number | null) => {
  if (v === null) return '-';
  if (k === 'spend') return formatCredit(v);
  if (k === 'cacheRate') return `${v.toFixed(1)}%`;
  if (k === 'blended') return `$${v.toFixed(2)}`;
  return compact(v);
};

const KPI_LABEL: Record<Kpi, MessageKey> = {
  spend: 'ai.kpi.spend',
  requests: 'ai.kpi.requests',
  tokens: 'ai.kpi.tokens',
  cacheRate: 'ai.kpi.cacheRate',
  blended: 'ai.kpi.blended',
};

/** Hero number + delta vs the previous period + sparkline of the same metric per day. */
export function KpiTile({ kpi, current, previous, daily }: { kpi: Kpi; current: UsageTotals; previous?: UsageTotals; daily: DailyUsage[] }) {
  const { t } = useI18n();
  const value = kpiValue(kpi, current);
  const prev = previous ? kpiValue(kpi, previous) : null;
  const delta = value !== null && prev ? ((value - prev) / prev) * 100 : null;
  const series = daily.map((d) => ({ date: d.date, value: kpiValue(kpi, d) ?? 0 }));
  const config = { value: { label: t(KPI_LABEL[kpi]), color: 'var(--chart-1)' } } satisfies ChartConfig;
  const DeltaIcon = delta === null ? Minus : delta >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card size="sm" className="gap-2 px-4" role="group" aria-label={t(KPI_LABEL[kpi])}>
      <div className="text-xs text-muted-foreground">
        {t(KPI_LABEL[kpi])}
        {kpi === 'blended' && <span className="ml-1">{t('ai.kpi.perMillion')}</span>}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-2xl font-bold tabular-nums">{kpiFormat(kpi, value)}</div>
        <ChartContainer config={config} className="aspect-auto h-9 w-24" initialDimension={{ width: 96, height: 36 }}>
          <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill="var(--color-value)" fillOpacity={0.12} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ChartContainer>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <DeltaIcon className="size-3.5" aria-hidden />
        {delta === null ? t('ai.kpi.noPrev') : t('ai.kpi.vsPrev', { pct: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` })}
        {kpi === 'requests' && current.failed > 0 && <span className="text-danger">{t('ai.failedCount', { n: current.failed })}</span>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- trend lines

/** Bucket keys are "YYYY-MM-DD" (per day) or "YYYY-MM-DDTHH" (per hour, 1-day view). */
export const isHourly = (daily: DailyUsage[]) => daily[0]?.date.includes('T') ?? false;

export function bucketLabel(key: string, lang: Lang, long = false): string {
  if (!key.includes('T')) return shortDate(key, lang);
  const hour = `${key.slice(11, 13)}:00`;
  return long ? `${shortDate(key.slice(0, 10), lang)} ${hour}` : hour;
}

/** Table text for a bucket key: "2026-10-01" or "2026-10-01 10:00". */
export const bucketText = (key: string) => (key.includes('T') ? `${key.slice(0, 10)} ${key.slice(11, 13)}:00` : key);

type Series = { key: string; label: string; color: string };
type Point = { date: string } & Record<string, number | string | null>;

/** Titled chart card (role="figure", named by its title). */
function ChartCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card role="figure" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

interface TrendProps {
  data: Point[];
  series: Series[];
  format: (n: number) => string;
  className?: string;
  domain?: [number, number | 'auto'];
  /** Add a "Total" row to the tooltip (multi-series sums). */
  total?: boolean;
  /** Ratios: bridge buckets without calls and mark the real data points with dots. */
  sparse?: boolean;
  /** Extra tooltip rows for a bucket. */
  details?: (p: Point) => [string, string][];
  /** Show the legend even for one series (when the title doesn't name it, e.g. a model). */
  legend?: boolean;
}

/**
 * Line chart for usage over time: smooth 2px lines, a soft fill under a single series,
 * crosshair tooltip with every series (text in ink, swatch carries identity).
 */
function TrendLines({ data, series, format, className = 'h-56', domain = [0, 'auto'], total, sparse, details, legend }: TrendProps) {
  const { t, lang } = useI18n();
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;
  const single = series.length === 1;
  const gradientId = useId().replace(/:/g, '');
  return (
    <ChartContainer config={config} className={cn('aspect-auto w-full', className)} initialDimension={{ width: 480, height: 224 }}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        {single && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--color-${series[0].key})`} stopOpacity={0.22} />
              <stop offset="100%" stopColor={`var(--color-${series[0].key})`} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        <CartesianGrid vertical={false} strokeOpacity={0.5} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={(d: string) => bucketLabel(d, lang)} />
        <YAxis tickLine={false} axisLine={false} width={56} domain={domain} tickFormatter={(v: number) => format(v)} />
        <ChartTooltip
          cursor={{ strokeOpacity: 0.4 }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
            if (!p) return null;
            const values = series.map((s) => ({ s, v: p[s.key] as number | null }));
            const has = values.some(({ v }) => v !== null && v !== undefined);
            const sum = values.reduce((n, { v }) => n + (v ?? 0), 0);
            return (
              <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{bucketLabel(p.date, lang, true)}</div>
                {!has ? (
                  <div className="text-muted-foreground">{t('ai.noCallsDay')}</div>
                ) : (
                  <>
                    {values.map(({ s, v }) => (
                      <div key={s.key} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-0.5 w-3 rounded-full" style={{ background: `var(--color-${s.key})` }} />
                          {s.label}
                        </span>
                        <span className="font-mono font-medium tabular-nums">{v === null ? '-' : format(v)}</span>
                      </div>
                    ))}
                    {total && series.length > 1 && (
                      <div className="flex justify-between gap-4 border-t pt-1.5">
                        <span className="text-muted-foreground">{t('ai.total')}</span>
                        <span className="font-mono font-medium tabular-nums">{format(sum)}</span>
                      </div>
                    )}
                    {details?.(p).map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono tabular-nums">{value}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          }}
        />
        {(!single || legend) && <ChartLegend content={<ChartLegendContent />} itemSorter={(item) => series.findIndex((s) => s.key === item.dataKey)} />}
        {single && (
          <Area
            dataKey={series[0].key}
            type="monotone"
            fill={`url(#${gradientId})`}
            stroke="none"
            connectNulls={sparse}
            isAnimationActive={false}
            activeDot={false}
            legendType="none"
            tooltipType="none"
          />
        )}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            connectNulls={sparse}
            dot={sparse ? { r: 4, fill: `var(--color-${s.key})`, stroke: 'var(--color-card)', strokeWidth: 2 } : false}
            activeDot={{ r: 4, stroke: 'var(--color-card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  );
}

export type TaskMetric = 'cost' | 'calls' | 'tokens';
type Mode = 'step' | 'cumulative';
const METRIC_LABEL: Record<TaskMetric, MessageKey> = { cost: 'ai.metric.cost', calls: 'ai.metric.calls', tokens: 'ai.metric.tokens' };
const METRIC_FORMAT: Record<TaskMetric, (n: number) => string> = {
  cost: (n) => (n === 0 ? '$0' : formatCredit(n)),
  calls: (n) => formatNumber(Math.round(n)),
  tokens: compact,
};

/** Running total per series ("growth" view). */
export function accumulate(data: Point[], keys: string[]): Point[] {
  const sums: Record<string, number> = {};
  return data.map((p) => {
    const next: Point = { ...p };
    for (const k of keys) next[k] = sums[k] = (sums[k] ?? 0) + Number(p[k] ?? 0);
    return next;
  });
}

function Switch<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label}>
      {options.map(([v, text]) => (
        <ToggleGroupItem key={v} value={v} className="px-3">
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Usage over time, one line per task; metric switch + per-bucket / cumulative (growth). */
export function UsageTrendChart({ daily }: { daily: DailyUsage[] }) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<TaskMetric>('cost');
  const [mode, setMode] = useState<Mode>('step');
  const field = metric === 'tokens' ? 'totalTokens' : metric;
  // Only tasks that ran in this period get a line (colors stay fixed per task).
  const active = PURPOSES.filter((p) => daily.some((d) => (d.byPurpose?.[p]?.calls ?? 0) > 0));
  const keys = active.length ? active : [...PURPOSES];
  const series = keys.map((p) => ({ key: p, label: t(`ai.purpose.${p}` as MessageKey), color: PURPOSE_COLOR[p] }));
  const raw: Point[] = daily.map((d) => ({ date: d.date, ...Object.fromEntries(keys.map((k) => [k, d.byPurpose?.[k]?.[field] ?? 0])) }));
  const data = mode === 'cumulative' ? accumulate(raw, keys) : raw;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Switch
          label={t('ai.metric')}
          value={metric}
          onChange={setMetric}
          options={(Object.keys(METRIC_LABEL) as TaskMetric[]).map((m) => [m, t(METRIC_LABEL[m])])}
        />
        <Switch
          label={t('ai.mode')}
          value={mode}
          onChange={setMode}
          options={[
            ['step', t(isHourly(daily) ? 'ai.mode.perHour' : 'ai.mode.perDay')],
            ['cumulative', t('ai.mode.cumulative')],
          ]}
        />
      </div>
      <TrendLines data={data} series={series} format={METRIC_FORMAT[metric]} className="h-72" total />
    </div>
  );
}

export function TokenTrendChart({ daily }: { daily: DailyUsage[] }) {
  const { t } = useI18n();
  const data: Point[] = daily.map((d) => ({
    date: d.date,
    input: d.promptTokens,
    output: Math.max(0, d.completionTokens - d.reasoningTokens),
    reasoning: d.reasoningTokens,
  }));
  return (
    <ChartCard title={t('ai.chart.tokens')} description={t('ai.chart.tokensHelp')}>
      <TrendLines
        data={data}
        format={compact}
        total
        series={[
          { key: 'input', label: t('ai.series.input'), color: 'var(--chart-1)' },
          { key: 'output', label: t('ai.series.output'), color: 'var(--chart-3)' },
          { key: 'reasoning', label: t('ai.series.reasoning'), color: 'var(--chart-2)' },
        ]}
      />
    </ChartCard>
  );
}

function RateChart({
  title,
  description,
  daily,
  rate,
  format,
  domain,
  details,
}: {
  title: string;
  description: string;
  daily: DailyUsage[];
  /** null = no calls in that bucket (no dot; the line bridges the gap). */
  rate: (d: DailyUsage) => number | null;
  format: (n: number) => string;
  domain?: [number, number | 'auto'];
  details: (d: DailyUsage) => [string, string][];
}) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const data: Point[] = daily.map((d) => ({ date: d.date, value: rate(d) }));
  return (
    <ChartCard title={title} description={description}>
      <TrendLines
        data={data}
        series={[{ key: 'value', label: title, color: 'var(--chart-1)' }]}
        format={format}
        domain={domain}
        sparse
        details={(p) => details(byDate.get(p.date)!)}
      />
    </ChartCard>
  );
}

export function CacheRateChart({ daily }: { daily: DailyUsage[] }) {
  const { t } = useI18n();
  return (
    <RateChart
      title={t('ai.chart.cacheRate')}
      description={t('ai.chart.cacheRateHelp')}
      daily={daily}
      rate={(d) => (d.promptTokens ? (d.cachedTokens / d.promptTokens) * 100 : null)}
      format={(v) => `${Number(v.toFixed(1))}%`}
      domain={[0, 100]}
      details={(d) => [
        [t('ai.series.cached'), formatNumber(d.cachedTokens)],
        [t('ai.series.input'), formatNumber(d.promptTokens)],
      ]}
    />
  );
}

export function BlendedCostChart({ daily }: { daily: DailyUsage[] }) {
  const { t } = useI18n();
  return (
    <RateChart
      title={t('ai.chart.blended')}
      description={t('ai.chart.blendedHelp')}
      daily={daily}
      rate={(d) => (d.totalTokens ? (d.cost / d.totalTokens) * 1_000_000 : null)}
      format={(v) => `$${v.toFixed(2)}`}
      details={(d) => [
        [t('ai.col.cost'), formatCredit(d.cost)],
        [t('ai.metric.tokens'), formatNumber(d.totalTokens)],
      ]}
    />
  );
}

const MODEL_LINES = 4;
const MODEL_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
const OTHER_KEY = '__other';

/**
 * Credits per model over time. Colors follow the model's all-time rank (`models`), not the
 * selected period, so a model keeps its color when the period changes; the tail folds into "Other".
 */
export function ModelTrendChart({ daily, models }: { daily: DailyUsage[]; models: string[] }) {
  const { t } = useI18n();
  const named = models.slice(0, MODEL_LINES);
  const inPeriod = new Set(daily.flatMap((d) => Object.keys(d.byModel ?? {})));
  const shown = named.filter((m) => inPeriod.has(m));
  const others = [...inPeriod].filter((m) => !named.includes(m));
  const series: Series[] = [
    ...shown.map((m) => ({ key: `m${named.indexOf(m)}`, label: m, color: MODEL_COLORS[named.indexOf(m)] })),
    ...(others.length ? [{ key: OTHER_KEY, label: t('ai.otherModels', { n: others.length }), color: 'var(--chart-5)' }] : []),
  ];
  const data: Point[] = daily.map((d) => {
    const p: Point = { date: d.date };
    for (const m of shown) p[`m${named.indexOf(m)}`] = d.byModel?.[m]?.cost ?? 0;
    if (others.length) p[OTHER_KEY] = others.reduce((n, m) => n + (d.byModel?.[m]?.cost ?? 0), 0);
    return p;
  });
  if (!series.length) return <p className="py-8 text-center text-sm text-muted-foreground">{t('ai.noCalls')}</p>;
  return <TrendLines data={data} series={series} format={METRIC_FORMAT.cost} total legend />;
}
