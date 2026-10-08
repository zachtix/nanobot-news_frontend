import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, Loader2, LogIn, Newspaper, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AssetOutcome, OutcomeScore, useAnalysisOutcomes } from '@/components/AnalysisOutcome';
import { chartAssets, ChartCompanionsPanel, useChartCompanions } from '@/components/chart/ChartCompanions';
import { api } from '@/api/client';
import type { AnalysisAsset, Direction, News, NewsAnalysis } from '@/api/types';
import { useAuth } from '@/context/AuthContext';
import { useHealth } from '@/context/HealthContext';
import { useCreditPrices, useErrorText } from '@/lib/credits';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/utils/format';

export const DIRECTION = {
  up: { Icon: ArrowUp, chip: 'bg-success-bg text-success border-success/30', text: 'text-up', bar: 'bg-up' },
  down: { Icon: ArrowDown, chip: 'bg-danger-bg text-danger border-danger/30', text: 'text-down', bar: 'bg-down' },
  neutral: { Icon: ArrowRight, chip: 'bg-muted text-muted-foreground border-border', text: 'text-muted-foreground', bar: 'bg-muted-foreground' },
} satisfies Record<Direction, unknown>;

const IMPACT = { low: 'secondary', medium: 'warning', high: 'danger' } as const;

/** Ticker + direction arrow + confidence. Direction is carried by icon and label, not color alone. */
export function AssetChip({ asset }: { asset: Pick<AnalysisAsset, 'symbol' | 'name' | 'direction' | 'confidence'> }) {
  const { t } = useI18n();
  const direction = t(`analysis.dir.${asset.direction}`);
  const { Icon, chip } = DIRECTION[asset.direction];
  return (
    <Badge
      variant="outline"
      data-direction={asset.direction}
      className={cn('h-6 gap-1 px-2 tabular-nums', chip)}
      title={`${asset.name}: ${direction} · ${t('analysis.confidence', { n: asset.confidence })}`}
      aria-label={t('analysis.chipLabel', { symbol: asset.symbol, direction, n: asset.confidence })}
    >
      <strong>{asset.symbol}</strong>
      <Icon aria-hidden />
      {asset.confidence}%
    </Badge>
  );
}

/** Nobody signed in: sign in first, then come back to this page. */
function SignInButton() {
  const { t } = useI18n();
  const location = useLocation();
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to="/login" state={{ from: location.pathname }}>
        <LogIn aria-hidden />
        {t('analysis.signIn')}
      </Link>
    </Button>
  );
}

interface Props {
  news: News;
  /** AI key configured: allows creating (or re-running) an analysis. */
  canAnalyze: boolean;
  onAnalyzed: (analysis: NewsAnalysis) => void;
}

/**
 * Chips + collapsible panel for an analysis this viewer may see, or the auto tags and the button that gets one:
 * administrators analyse for free; a customer unlocks it (the stored one, or a new one for the first to ask);
 * nobody signed in is asked to sign in.
 * The panel puts the news call and the chart call of the same assets side by side; they are made apart
 * (neither AI sees the other's input) and each is checked against the price on its own. The chart of each
 * asset is read only when the reader asks for it.
 */
export function NewsAnalysisView({ news, canAnalyze, onAnalyzed }: Props) {
  const { t, lang } = useI18n();
  const showModel = useHealth()?.ui?.showModel !== false;
  const { user } = useAuth();
  const staff = user?.isStaff ?? false;
  const prices = useCreditPrices();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analysis = news.analysis ?? null;
  const outcomes = useAnalysisOutcomes('analysis', news.id, analysis?.createdAt ?? '', open && analysis != null);
  const assets = analysis ? chartAssets(analysis.assets) : [];
  const charts = useChartCompanions(assets, news.publishedAt, open && analysis != null, news.id);

  const run = async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.analyzeNews(news.id, force);
      if (result.credits > 0) toast.success(t('credits.used', { n: result.credits }));
      onAnalyzed(result.analysis);
      setOpen(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!analysis) {
    const tags = news.tags ?? [];
    // A stored analysis can be unlocked even with the AI off; a new one needs it.
    const offer = news.analysisLocked || canAnalyze;
    if (!offer && !error && tags.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length > 0 && (
          <span className="flex flex-wrap gap-1.5" aria-label={t('analysis.tags')}>
            {tags.map((tag) => (
              <Badge key={tag.symbol} variant="info" className="h-6 px-2 font-semibold" title={tag.name}>
                {tag.symbol}
              </Badge>
            ))}
          </span>
        )}
        {offer &&
          (!user ? (
            <SignInButton />
          ) : (
            <Button variant="outline" size="sm" onClick={() => run(false)} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {busy
                ? t('analysis.analyzing')
                : staff
                  ? t('analysis.analyze')
                  : t(news.analysisLocked ? 'analysis.unlockStored' : 'analysis.unlockNew', { n: prices.news })}
            </Button>
          ))}
        {error && <span className="text-sm text-danger">{t('analysis.error', { error })}</span>}
      </div>
    );
  }

  const newSources = news.referenceCount - analysis.referenceCount;
  const summary = lang === 'th' ? analysis.summaryTh : analysis.summaryEn;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {analysis.assets.map((a) => (
          <AssetChip key={a.symbol} asset={a} />
        ))}
        <CollapsibleTrigger asChild>
          <Button variant="link" size="sm" className="h-6 px-1">
            {open ? t('analysis.hide') : t('analysis.show')}
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <section
          className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-surface-sunken p-4"
          aria-label={t('analysis.title')}
        >
          <header className="flex flex-wrap items-center gap-2">
            <strong className="flex items-center gap-1.5 text-primary">
              <Sparkles className="size-4" aria-hidden />
              {t('analysis.title')}
            </strong>
            <Badge variant={IMPACT[analysis.impact]}>
              {t('analysis.impact', { level: t(`analysis.impact.${analysis.impact}`) })}
            </Badge>
            <Badge variant="secondary">{t(`analysis.horizon.${analysis.timeHorizon}`)}</Badge>
            {analysis.eventType && <Badge variant="info">{t(`event.${analysis.eventType}`)}</Badge>}
          </header>

          <div className="@container">
            <div className="grid gap-4 @3xl:grid-cols-2 @3xl:divide-x">
              <section className="flex min-w-0 flex-col gap-3 @3xl:pr-4" aria-label={t('companion.news')}>
                <header className="flex flex-wrap items-center gap-2">
                  <strong className="flex items-center gap-1.5 text-sm">
                    <Newspaper className="size-4 text-primary" aria-hidden />
                    {t('companion.news')}
                  </strong>
                  {outcomes && <OutcomeScore calls={outcomes} />}
                </header>

                <p className="text-sm leading-relaxed">{summary}</p>

                {analysis.assets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('analysis.noAssets')}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {analysis.assets.map((a) => {
                      const d = DIRECTION[a.direction];
                      const call = outcomes?.get(a.symbol);
                      return (
                        <li key={a.symbol} className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-baseline gap-2 text-sm">
                            <strong>{a.symbol}</strong>
                            <span className="text-muted-foreground">{a.name}</span>
                            <span className={cn('flex items-center gap-1 font-semibold', d.text)}>
                              <d.Icon className="size-3.5" aria-hidden />
                              {t(`analysis.dir.${a.direction}`)}
                            </span>
                            <span>{t('analysis.confidence', { n: a.confidence })}</span>
                          </div>
                          <div
                            className="h-1.5 max-w-xs overflow-hidden rounded-full bg-border"
                            role="meter"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={a.confidence}
                            aria-label={t('analysis.confidence', { n: a.confidence })}
                          >
                            <span className={cn('block h-full rounded-full', d.bar)} style={{ width: `${a.confidence}%` }} />
                          </div>
                          <p className="text-sm text-muted-foreground">{lang === 'th' ? a.rationaleTh : a.rationaleEn}</p>
                          {call ? (
                            <AssetOutcome call={call} />
                          ) : (
                            // Calls are being measured, but not this one: a stock or other asset without a USDT pair.
                            outcomes != null && outcomes.size > 0 && <p className="text-xs text-muted-foreground">{t('analysis.outcome.unsupported')}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {newSources > 0 && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-warning">
                    {t('analysis.stale', { n: newSources })}
                    {canAnalyze && staff && (
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => run(true)} disabled={busy}>
                        {busy ? t('analysis.analyzing') : t('analysis.reanalyze')}
                      </Button>
                    )}
                  </p>
                )}
                {error && <p className="text-sm text-danger">{t('analysis.error', { error })}</p>}
              </section>

              <ChartCompanionsPanel
                subject="news"
                at={news.publishedAt}
                assets={assets}
                companions={charts}
                canRun={canAnalyze}
                className="@3xl:pl-4"
              />
            </div>
          </div>

          <footer className="text-xs text-muted-foreground">
            {showModel
              ? t('analysis.meta', { time: formatDateTime(analysis.createdAt, lang), model: analysis.model })
              : t('analysis.metaNoModel', { time: formatDateTime(analysis.createdAt, lang) })}{' '}
            · {t('analysis.disclaimer')}
          </footer>
        </section>
      </CollapsibleContent>
    </Collapsible>
  );
}
