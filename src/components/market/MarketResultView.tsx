import { CircleCheck, ExternalLink, Info, Loader2, Minus, Newspaper, Sparkles, TrendingDown, TrendingUp, Waves } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { MarketRunDetail, MarketStage, MarketStory, Sentiment } from '@/api/types';
import { AssetOutcome, OutcomeScore, useAnalysisOutcomes } from '@/components/AnalysisOutcome';
import { chartAssets, ChartCompanionsPanel, useChartCompanions } from '@/components/chart/ChartCompanions';
import { AssetChip, DIRECTION } from '@/components/NewsAnalysisView';
import { useHealth } from '@/context/HealthContext';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatCredit, formatDateTime } from '@/utils/format';

const SENTIMENT: Record<Sentiment, { variant: 'success' | 'danger' | 'secondary' | 'warning'; Icon: typeof TrendingUp }> = {
  bullish: { variant: 'success', Icon: TrendingUp },
  bearish: { variant: 'danger', Icon: TrendingDown },
  neutral: { variant: 'secondary', Icon: Minus },
  mixed: { variant: 'warning', Icon: Waves },
};

const STAGES: MarketStage[] = ['refresh', 'content', 'stories', 'market'];

/** Which steps this run includes, and where it is now. */
function StageSteps({ run }: { run: MarketRunDetail }) {
  const { t } = useI18n();
  const enabled = (s: MarketStage) => (s === 'refresh' ? run.refresh : s === 'stories' ? run.analyzeMissing : true);
  const current = run.stage ? STAGES.indexOf(run.stage) : -1;
  return (
    <ol className="flex flex-col gap-2" aria-label={t('market.running')}>
      {STAGES.map((s, i) => {
        const skipped = !enabled(s);
        const done = !skipped && i < current;
        const active = !skipped && i === current;
        return (
          <li key={s} className={cn('flex items-center gap-2 text-sm', !active && 'text-muted-foreground')} aria-current={active ? 'step' : undefined}>
            {active ? (
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
            ) : done ? (
              <CircleCheck className="size-4 text-success" aria-hidden />
            ) : (
              <span className="size-4 rounded-full border" aria-hidden />
            )}
            <span className={cn(active && 'font-medium text-foreground')}>{t(`market.stage.${s}`)}</span>
            {skipped && <span className="text-xs">({t('market.stageSkipped')})</span>}
          </li>
        );
      })}
    </ol>
  );
}

const SHOWN_STORIES = 3;

/** Cited stories (most important first); long lists show the first few with a "show more" toggle. */
function StoryLinks({ ids, stories }: { ids: number[]; stories: Map<number, MarketStory> }) {
  const { t, lang } = useI18n();
  const [all, setAll] = useState(false);
  const items = ids.map((id) => stories.get(id)).filter((s): s is MarketStory => Boolean(s));
  if (!items.length) return <p className="text-xs text-muted-foreground">{t('market.noEvidence')}</p>;
  const hidden = items.length - SHOWN_STORIES;
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1" aria-label={t('market.evidence')}>
        {(all ? items : items.slice(0, SHOWN_STORIES)).map((s) => {
          const title = (lang === 'th' ? s.titleTh : s.titleEn) ?? s.title;
          return (
            <li key={s.id} className="text-sm leading-snug">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {title}
                  <ExternalLink className="ml-1 inline size-3 align-baseline" aria-hidden />
                </a>
              ) : (
                <span>{title}</span>
              )}
              <span className="text-xs text-muted-foreground"> · {s.sources.join(', ')}</span>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <Button variant="link" size="sm" className="h-auto self-start p-0 text-xs" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t('market.lessStories') : t('market.moreStories', { n: hidden })}
        </Button>
      )}
    </div>
  );
}

/**
 * A market brief: tone, summary, themes and affected assets, each with the stories behind it — and next to it the
 * chart call of the same assets (each read when asked for), made apart (no news in it) and checked on its own.
 */
export function MarketResultView({ run }: { run: MarketRunDetail }) {
  const { t, lang } = useI18n();
  const health = useHealth();
  const showModel = health?.ui?.showModel !== false;
  const done = run.status === 'success' && run.result != null;
  // A reused brief was judged as the run that made it.
  const outcomes = useAnalysisOutcomes('market', run.id, run.finishedAt ?? '', done);
  const staff = useAuth().user?.isStaff ?? false;
  const assets = done ? chartAssets(run.result!.assets) : [];
  const chartAt = run.finishedAt ?? run.createdAt;
  const charts = useChartCompanions(assets, chartAt, done);
  const canRun = health?.ai.enabled ?? false;

  const sources = run.sourceIds.length ? run.sourceNames.join(', ') : t('market.allSources');
  const meta = t('market.meta', {
    window: t(`market.window.${run.window}`),
    sources,
    n: run.storyCount,
    time: formatDateTime(run.createdAt, lang),
  });

  if (run.status === 'running') {
    return (
      <Card role="region" aria-label={t('market.result', { id: run.id })} aria-busy>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
            {t('market.running')}
          </CardTitle>
          <CardDescription>{meta}</CardDescription>
        </CardHeader>
        <CardContent>
          <StageSteps run={run} />
        </CardContent>
      </Card>
    );
  }

  if (run.status === 'failed' || !run.result) {
    return (
      <Card role="region" aria-label={t('market.result', { id: run.id })}>
        <CardHeader>
          <CardTitle>{t('market.result', { id: run.id })}</CardTitle>
          <CardDescription>{meta}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('market.failed', { error: run.error ?? '-' })}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const r = run.result;
  const stories = new Map(run.stories.map((s) => [s.id, s]));
  const { variant, Icon } = SENTIMENT[r.sentiment];

  return (
    <Card role="region" aria-label={t('market.result', { id: run.id })}>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          {t('market.result', { id: run.id })} · {meta}
        </CardDescription>
        <CardTitle className="text-lg leading-snug">{lang === 'th' ? r.headlineTh : r.headlineEn}</CardTitle>
        <CardAction>
          <Badge variant={variant} className="gap-1">
            <Icon aria-hidden />
            {t('market.sentimentLabel', { s: t(`market.sentiment.${r.sentiment}`) })}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {run.reusedFromId && (
          <Alert className="border-info/40 bg-info-bg">
            <Info aria-hidden />
            <AlertDescription className="text-foreground">{t('market.reused', { id: run.reusedFromId })}</AlertDescription>
          </Alert>
        )}

        <p className="leading-relaxed">{lang === 'th' ? r.summaryTh : r.summaryEn}</p>

        {r.assets.length > 0 && (
          <section className="flex flex-col gap-3" aria-label={t('market.assets')}>
            <header className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Newspaper className="size-4 text-primary" aria-hidden />
                {t('market.assets')}
              </h3>
              {outcomes && <OutcomeScore calls={outcomes} />}
            </header>
            <div className="flex flex-wrap gap-1.5">
              {r.assets.map((a) => (
                <AssetChip key={a.symbol} asset={a} />
              ))}
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {r.assets.map((a) => {
                const d = DIRECTION[a.direction];
                return (
                  <li key={a.symbol} className="flex flex-col gap-2 rounded-lg border bg-surface-sunken/40 p-3" aria-label={a.symbol}>
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <strong className="text-base">{a.symbol}</strong>
                      <span className="text-muted-foreground">{a.name}</span>
                      <span className={cn('flex items-center gap-1 font-semibold', d.text)}>
                        <d.Icon className="size-3.5" aria-hidden />
                        {t(`analysis.dir.${a.direction}`)}
                      </span>
                      <span className="tabular-nums">{t('analysis.confidence', { n: a.confidence })}</span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-border"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={a.confidence}
                      aria-label={t('analysis.chipLabel', { symbol: a.symbol, direction: t(`analysis.dir.${a.direction}`), n: a.confidence })}
                    >
                      <span className={cn('block h-full rounded-full', d.bar)} style={{ width: `${a.confidence}%` }} />
                    </div>
                    <p className="text-sm text-muted-foreground">{lang === 'th' ? a.rationaleTh : a.rationaleEn}</p>
                    {outcomes?.get(a.symbol) && <AssetOutcome call={outcomes.get(a.symbol)!} />}
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">{t('market.evidence')}</span>
                      <StoryLinks ids={a.storyIds} stories={stories} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {r.assets.length === 0 && <p className="text-sm text-muted-foreground">{t('analysis.noAssets')}</p>}

        <ChartCompanionsPanel
          subject="market"
          at={chartAt}
          assets={assets}
          companions={charts}
          canRun={canRun}
          className="rounded-lg border border-primary/25 bg-surface-sunken p-4"
        />

        {r.themes.length > 0 && (
          <section className="flex flex-col gap-3" aria-label={t('market.themes')}>
            <h3 className="text-sm font-semibold">{t('market.themes')}</h3>
            <ul className="flex flex-col gap-3">
              {r.themes.map((th, i) => (
                <li key={i} className="flex flex-col gap-1 border-l-2 border-primary/40 pl-3">
                  <span className="font-medium">{lang === 'th' ? th.titleTh : th.titleEn}</span>
                  <StoryLinks ids={th.storyIds} stories={stories} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-start gap-1 border-t pt-4 text-xs text-muted-foreground">
        {/* What the AI cost us is for administrators. */}
        {staff && (
          <span>
            {t('market.cost', { cost: formatCredit(run.cost) })} · {t('market.costBreakdown', {
              market: formatCredit(run.costMarket),
              stories: formatCredit(run.costStories),
              fetch: formatCredit(run.costFetch),
            })}
            {run.newlyAnalyzed > 0 && ` · ${t('market.newlyAnalyzed', { n: run.newlyAnalyzed })}`}
          </span>
        )}
        <span>
          {showModel && run.model ? `${run.model} · ` : ''}
          {t('analysis.disclaimer')}
        </span>
      </CardFooter>
    </Card>
  );
}
