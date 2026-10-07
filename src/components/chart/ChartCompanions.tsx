import { CircleCheck, CircleX, Clock, ExternalLink, LineChart, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, describeError } from '@/api/client';
import type { AssetKind, ChartAnalysis, ChartAsset, ChartCompanion } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/utils/format';
import { CallChip, CHART_HORIZONS, Verdict } from './ChartAnalysisView';
import { formatPrice, signedPct } from './format';

/** The assets of a news / market call, once each (the API leaves out stablecoins and what has no price data). */
export function chartAssets(assets: { symbol: string; assetType: string }[]): ChartAsset[] {
  const out: ChartAsset[] = [];
  for (const a of assets) {
    if (!out.some((x) => x.symbol === a.symbol && x.assetType === a.assetType)) out.push({ symbol: a.symbol, assetType: a.assetType as AssetKind });
  }
  return out;
}

const keyOf = (a: ChartAsset) => `${a.assetType}:${a.symbol}`;

/**
 * The chart calls of these assets as of a news / market call's moment. Only the assets and the moment are sent:
 * the chart analysis never sees the news, and the news analysis never sees the chart. Each asset is analysed only
 * when asked for (every analysis is paid for).
 */
export function useChartCompanions(assets: ChartAsset[], at: string | null, enabled: boolean) {
  const key = at && assets.length ? `${assets.map(keyOf).join(',')}@${at}` : null;
  const [state, setState] = useState<{ key: string; items: ChartCompanion[] } | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ assets, at, key });
  latest.current = { assets, at, key };

  useEffect(() => {
    if (!enabled || !key || !at || state?.key === key) return;
    let cancelled = false;
    api.chartCompanions(assets, at).then(
      (items) => !cancelled && setState((s) => (s?.key === key ? s : { key, items })),
      // The chart side is extra information: the news side stays readable without it.
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for assets + at
  }, [enabled, key, state?.key]);

  /** Analyse one asset's chart (one AI call, unless it was read before) and put it in its place. */
  const run = useCallback(async (asset: ChartAsset) => {
    const { at: moment, key: k } = latest.current;
    if (!moment || !k) return;
    const id = keyOf(asset);
    setBusy((b) => new Set(b).add(id));
    setError(null);
    try {
      const [got] = await api.runChartCompanions([{ symbol: asset.symbol, assetType: asset.assetType }], moment);
      if (got) {
        setState((s) => {
          const items = s?.key === k ? s.items : [];
          const has = items.some((c) => keyOf(c) === id);
          return { key: k, items: has ? items.map((c) => (keyOf(c) === id ? got : c)) : [...items, got] };
        });
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(id);
        return next;
      });
    }
  }, []);

  return { items: state?.key === key ? state.items : null, busy, error, run };
}

/** "Right 3 of 6" over every horizon of every asset judged so far. */
function ChartScore({ analyses }: { analyses: ChartAnalysis[] }) {
  const { t } = useI18n();
  const verdicts = analyses.flatMap((a) => CHART_HORIZONS.map((h) => a.verdicts[h])).filter((v) => v != null);
  if (verdicts.length === 0) {
    if (analyses.length === 0) return null;
    return (
      <Badge variant="secondary" title={t('companion.scoreHelp')}>
        <Clock aria-hidden />
        {t('analysis.outcome.waiting')}
      </Badge>
    );
  }
  const hits = verdicts.filter((v) => v === 'hit').length;
  const good = hits * 2 >= verdicts.length;
  return (
    <Badge variant={good ? 'success' : 'danger'} className="tabular-nums" title={t('companion.scoreHelp')}>
      {good ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
      {t('analysis.outcome.score', { hits, n: verdicts.length })}
    </Badge>
  );
}

/** One asset: the price it was read at, the call per horizon with how it turned out, the levels and the reading. */
function CompanionCard({ a }: { a: ChartAnalysis }) {
  const { t, lang } = useI18n();
  const currency = a.assetType === 'crypto' ? 'USDT' : 'USD';
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background/60 p-3" aria-label={t('companion.coin', { symbol: a.symbol })}>
      <div className="flex flex-wrap items-center gap-2">
        <strong>{a.symbol}</strong>
        <Badge variant="outline">{t(`chart.trend.${a.trend}`)}</Badge>
        <Button variant="link" size="xs" className="ml-auto h-auto p-0" asChild>
          <Link to={`/chart?analysis=${a.id}`}>
            {t('companion.open')}
            <ExternalLink aria-hidden />
          </Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {t('companion.price', { price: formatPrice(a.lastClose), currency })}
      </p>
      <dl className="grid grid-cols-3 gap-2">
        {CHART_HORIZONS.map((h) => {
          const move = a.moves[h];
          return (
            <div key={h} className="flex min-w-0 flex-col items-start gap-1" data-verdict={a.verdicts[h] ?? 'pending'}>
              <dt className="text-xs text-muted-foreground">{t(`chart.h.${h}`)}</dt>
              <dd className="flex flex-col items-start gap-1">
                <CallChip call={a.calls[h]} size="sm" />
                <span className="flex items-center gap-1 text-xs tabular-nums">
                  <Verdict verdict={a.verdicts[h]} />
                  {move == null || a.verdicts[h] == null ? (
                    <span className="text-muted-foreground">{t('analysis.outcome.pending')}</span>
                  ) : (
                    <span className={a.verdicts[h] === 'hit' ? 'text-success' : 'text-danger'}>{signedPct(move)}</span>
                  )}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      {(a.supports.length > 0 || a.resistances.length > 0) && (
        <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums">
          <div>
            <dt className="text-muted-foreground">{t('chart.resistance')}</dt>
            <dd className="text-down">{a.resistances.length ? a.resistances.slice(0, 2).map(formatPrice).join(' · ') : '-'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('chart.support')}</dt>
            <dd className="text-up">{a.supports.length ? a.supports.slice(0, 2).map(formatPrice).join(' · ') : '-'}</dd>
          </div>
        </dl>
      )}
      <p className="line-clamp-3 text-sm text-muted-foreground">{lang === 'th' ? a.summaryTh : a.summaryEn}</p>
      {a.indexed && <p className="text-xs text-muted-foreground">{t('chart.indexNote', { price: formatPrice(a.lastClose) })}</p>}
    </li>
  );
}

interface PanelProps {
  /** What the chart is read as of: the story's publish time or the brief's time. */
  subject: 'news' | 'market';
  at: string;
  /** Assets of the call (empty: it names none). */
  assets: ChartAsset[];
  companions: ReturnType<typeof useChartCompanions>;
  /** AI key set: assets without a chart call can be analysed. */
  canRun: boolean;
  className?: string;
}

/** The chart side of a news / market call: its own calls and its own right/wrong, apart from the news side. */
export function ChartCompanionsPanel({ subject, at, assets, companions, canRun, className }: PanelProps) {
  const { t, lang } = useI18n();
  const { items, busy, error, run } = companions;
  const done = (items ?? []).flatMap((c) => (c.analysis ? [c.analysis] : []));
  const open = (items ?? []).filter((c) => !c.analysis);
  const hour = new Date(Math.floor(new Date(at).getTime() / 3_600_000) * 3_600_000);

  return (
    <section className={cn('@container flex min-w-0 flex-col gap-3', className)} aria-label={t('companion.chart')}>
      <header className="flex flex-wrap items-center gap-2">
        <strong className="flex items-center gap-1.5 text-sm">
          <LineChart className="size-4 text-primary" aria-hidden />
          {t('companion.chart')}
        </strong>
        <ChartScore analyses={done} />
      </header>
      <p className="text-xs text-muted-foreground">
        {t(subject === 'news' ? 'companion.noteNews' : 'companion.noteMarket', { time: formatDateTime(hour.toISOString(), lang) })}
      </p>

      {assets.length === 0 || (items !== null && items.length === 0) ? (
        <p className="text-sm text-muted-foreground">{t('companion.none')}</p>
      ) : items === null ? (
        <Skeleton className="h-16" aria-label={t('common.loading')} />
      ) : (
        <>
          {done.length > 0 && (
            <ul className="grid gap-3 @2xl:grid-cols-2">
              {done.map((a) => (
                <CompanionCard key={`${a.assetType}:${a.symbol}`} a={a} />
              ))}
            </ul>
          )}
          {open.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label={t('companion.notYet')}>
              {open.map((c) => {
                const running = busy.has(keyOf(c));
                return (
                  <li key={keyOf(c)} className="flex flex-wrap items-center gap-2 text-sm" aria-label={t('companion.coin', { symbol: c.symbol })}>
                    <strong>{c.symbol}</strong>
                    {c.error ? (
                      <span className="text-xs text-muted-foreground">{t('companion.unavailable', { error: c.error })}</span>
                    ) : canRun ? (
                      <Button variant="outline" size="sm" onClick={() => run(c)} disabled={running}>
                        {running ? <Loader2 className="animate-spin" aria-hidden /> : <LineChart aria-hidden />}
                        {running ? t('companion.running') : t('companion.run', { symbol: c.symbol })}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('companion.notYet')}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {error && <p className="text-sm text-danger">{t('companion.error', { error })}</p>}
    </section>
  );
}
