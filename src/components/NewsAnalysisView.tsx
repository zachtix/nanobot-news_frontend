import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { api, describeError } from '@/api/client';
import type { AnalysisAsset, Direction, News, NewsAnalysis } from '@/api/types';
import { useHealth } from '@/context/HealthContext';
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

interface Props {
  news: News;
  /** AI key configured: allows creating (or re-running) an analysis. */
  canAnalyze: boolean;
  onAnalyzed: (analysis: NewsAnalysis) => void;
}

/** Chips + collapsible panel for a stored analysis, or the auto tags and the button that creates one. */
export function NewsAnalysisView({ news, canAnalyze, onAnalyzed }: Props) {
  const { t, lang } = useI18n();
  const showModel = useHealth()?.ui?.showModel !== false;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analysis = news.analysis ?? null;

  const run = async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.analyzeNews(news.id, force);
      onAnalyzed(result.analysis);
      setOpen(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!analysis) {
    const tags = news.tags ?? [];
    if (!canAnalyze && !error && tags.length === 0) return null;
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
        {canAnalyze && (
          <Button variant="outline" size="sm" onClick={() => run(false)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {busy ? t('analysis.analyzing') : t('analysis.analyze')}
          </Button>
        )}
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
          </header>

          <p className="text-sm leading-relaxed">{summary}</p>

          {analysis.assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('analysis.noAssets')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {analysis.assets.map((a) => {
                const d = DIRECTION[a.direction];
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
                  </li>
                );
              })}
            </ul>
          )}

          {newSources > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-warning">
              {t('analysis.stale', { n: newSources })}
              {canAnalyze && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => run(true)} disabled={busy}>
                  {busy ? t('analysis.analyzing') : t('analysis.reanalyze')}
                </Button>
              )}
            </p>
          )}
          {error && <p className="text-sm text-danger">{t('analysis.error', { error })}</p>}

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
