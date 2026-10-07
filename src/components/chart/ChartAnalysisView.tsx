import { ChevronDown, CircleCheck, CircleX, Clock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, describeError } from '@/api/client';
import type { Candle, CandleInterval, ChartAnalysis, ChartHorizon } from '@/api/types';
import { DIRECTION } from '@/components/NewsAnalysisView';
import { useHealth } from '@/context/HealthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatCredit, formatDateTime } from '@/utils/format';
import { CandleChart, type HorizonMark } from './CandleChart';
import { ChartLegend } from './ChartLegend';
import { formatPrice, signedPct } from './format';

export const CHART_HORIZONS: ChartHorizon[] = ['4h', '24h', '3d'];
export const HORIZON_HOURS: Record<ChartHorizon, number> = { '4h': 4, '24h': 24, '3d': 72 };
const H = 3_600_000;
const INTERVALS: CandleInterval[] = ['1h', '4h', '1d'];
const INTERVAL_MS: Record<CandleInterval, number> = { '1h': H, '4h': 4 * H, '1d': 24 * H };
/** Candles shown before the moment, per interval (the API returns up to 260). */
const BARS_BEFORE: Record<CandleInterval, number> = { '1h': 150, '4h': 90, '1d': 120 };

/** Direction + confidence of one call; direction is carried by icon and label, not color alone. */
export function CallChip({ call, size = 'md' }: { call: ChartAnalysis['calls'][ChartHorizon]; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const { Icon, chip } = DIRECTION[call.direction];
  return (
    <Badge variant="outline" data-direction={call.direction} className={cn('gap-1 tabular-nums', size === 'md' ? 'h-7 px-2.5' : 'h-6 px-2', chip)}>
      <Icon aria-hidden />
      {t(`analysis.dir.${call.direction}`)} {call.confidence}%
    </Badge>
  );
}

export function Verdict({ verdict }: { verdict: 'hit' | 'miss' | null }) {
  const { t } = useI18n();
  if (!verdict) return <Clock className="size-4 text-muted-foreground" aria-label={t('chart.waiting')} />;
  return verdict === 'hit' ? (
    <CircleCheck className="size-4 text-success" aria-label={t('acc.hit')} />
  ) : (
    <CircleX className="size-4 text-danger" aria-label={t('acc.miss')} />
  );
}

function HorizonTile({ a, h }: { a: ChartAnalysis; h: ChartHorizon }) {
  const { t, lang } = useI18n();
  const due = new Date(new Date(a.at).getTime() + HORIZON_HOURS[h] * H);
  const move = a.moves[h];
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t(`chart.h.${h}`)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{t('chart.band', { pct: a.thresholds[h] })}</span>
      </div>
      <CallChip call={a.calls[h]} />
      <div className="flex items-center gap-1.5 text-sm">
        <Verdict verdict={a.verdicts[h]} />
        {move == null ? (
          <span className="text-muted-foreground">{t('chart.dueAt', { time: formatDateTime(due, lang) })}</span>
        ) : (
          <span className="tabular-nums">
            {t('chart.actual', { move: signedPct(move, 2), dir: t(`analysis.dir.${a.actual[h]!}`) })}
          </span>
        )}
      </div>
    </div>
  );
}

/** One chart analysis: the calls per horizon (and how they turned out), the chart with its levels, and the reasoning. */
export function ChartAnalysisView({ analysis: a, cached = false }: { analysis: ChartAnalysis; cached?: boolean }) {
  const { t, lang } = useI18n();
  const showModel = useHealth()?.ui?.showModel !== false;
  const [timeframe, setTimeframe] = useState<CandleInterval>('4h');
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const at = new Date(a.at).getTime();
  const until = at + HORIZON_HOURS['3d'] * H;

  useEffect(() => {
    setCandles(null);
    setChartError(null);
    // Up to the end of the longest horizon (or now), so a past call shows what happened next.
    const before = new Date(Math.min(Date.now(), until + 2 * INTERVAL_MS[timeframe])).toISOString();
    let live = true;
    api.chartCandles(a.symbol, timeframe, before, a.assetType).then(
      (cs) => {
        if (!live) return;
        const first = cs.findIndex((c) => c.openTime >= at);
        setCandles(cs.slice(Math.max(0, (first < 0 ? cs.length : first) - BARS_BEFORE[timeframe])));
      },
      (err) => live && setChartError(describeError(err)),
    );
    return () => {
      live = false;
    };
  }, [a.symbol, a.assetType, at, until, timeframe]);

  const marks = useMemo<HorizonMark[]>(
    () =>
      // On daily candles the 4h end is inside the first candle after the call: too close to mark.
      CHART_HORIZONS.filter((h) => timeframe !== '1d' || h !== '4h').map((h) => ({
        at: at + HORIZON_HOURS[h] * H,
        label: t(`chart.hShort.${h}`),
        hit: a.verdicts[h] == null ? null : a.verdicts[h] === 'hit',
      })),
    [a.verdicts, at, t, timeframe],
  );

  const summary = lang === 'th' ? a.summaryTh : a.summaryEn;
  return (
    <div className="flex flex-col gap-4" aria-label={t('chart.resultLabel', { symbol: a.symbol })} role="region">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{a.symbol}</h2>
        <span className="text-sm text-muted-foreground">{t('chart.asOf', { time: formatDateTime(a.at, lang) })}</span>
        <Badge variant={a.backtest ? 'info' : 'secondary'}>{t(a.backtest ? 'chart.mode.backtest' : 'chart.mode.live')}</Badge>
        <Badge variant="outline">{t(`chart.trend.${a.trend}`)}</Badge>
        {cached && <Badge variant="success">{t('chart.cached')}</Badge>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {CHART_HORIZONS.map((h) => (
          <HorizonTile key={h} a={a} h={h} />
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={timeframe}
          onValueChange={(v) => v && setTimeframe(v as CandleInterval)}
          aria-label={t('chart.interval')}
          className="self-end"
        >
          {INTERVALS.map((i) => (
            <ToggleGroupItem key={i} value={i} className="px-3">
              {t(`chart.interval.${i}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {chartError ? (
          <p className="p-4 text-sm text-danger">{chartError}</p>
        ) : candles ? (
          <CandleChart
            candles={candles}
            at={at}
            until={until}
            supports={a.supports}
            resistances={a.resistances}
            horizons={marks}
            intraday={timeframe !== '1d'}
          />
        ) : (
          <Skeleton className="h-[360px]" aria-label={t('common.loading')} />
        )}
        <ChartLegend />
      </div>

      <div className="flex flex-col gap-1">
        <p className="leading-relaxed">{summary}</p>
        {/* Older analyses only saw indexed prices, so the numbers they write are on that scale. */}
        {a.indexed && <p className="text-xs text-muted-foreground">{t('chart.indexNote', { price: formatPrice(a.lastClose) })}</p>}
      </div>

      {a.signals.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label={t('chart.signals')}>
          {a.signals.map((s, i) => {
            const { Icon, text } = DIRECTION[s.bias];
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Icon className={cn('mt-0.5 size-4 shrink-0', text)} aria-label={t(`analysis.dir.${s.bias}`)} />
                <span>{lang === 'th' ? s.th : s.en}</span>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t('chart.resistance')}</dt>
          <dd className="tabular-nums text-down">{a.resistances.length ? a.resistances.map(formatPrice).join(' · ') : '-'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('chart.support')}</dt>
          <dd className="tabular-nums text-up">{a.supports.length ? a.supports.map(formatPrice).join(' · ') : '-'}</dd>
        </div>
      </dl>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="group -ml-2 w-fit">
            <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
            {t('chart.input')}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="mb-2 text-xs text-muted-foreground">
            {a.indexed ? t('chart.inputHelp', { price: formatPrice(a.lastClose) }) : t('chart.inputHelpReal')}
          </p>
          <pre className="max-h-80 overflow-auto rounded-md bg-surface-sunken p-3 text-xs leading-relaxed whitespace-pre-wrap">{a.input}</pre>
        </CollapsibleContent>
      </Collapsible>

      <p className="text-xs text-muted-foreground">
        {showModel && `${a.model} · `}
        {t('chart.cost', { cost: formatCredit(a.cost) })} · {t('analysis.disclaimer')}
      </p>
    </div>
  );
}
