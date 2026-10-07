import { CircleCheck, CircleX, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api/client';
import type { Horizon, PredictionSource, PredictionView } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';

const HORIZONS: Horizon[] = ['1h', '4h', '24h'];
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

/**
 * The measured calls of one story's analysis (or one market brief), by symbol; null while loading (or when they
 * cannot be loaded). `version` reloads them when the analysis is redone.
 */
export function useAnalysisOutcomes(source: PredictionSource, id: number, version: string, enabled: boolean) {
  const [state, setState] = useState<{ key: string; calls: Map<string, PredictionView> } | null>(null);
  const key = `${source}:${id}:${version}`;

  useEffect(() => {
    if (!enabled || state?.key === key) return;
    let cancelled = false;
    api
      .outcomePredictions({ source, q: `#${id}`, page: 1, limit: 50 })
      .then((res) => {
        if (!cancelled) setState({ key, calls: new Map(res.items.map((p) => [p.symbol, p])) });
      })
      .catch(() => {
        // The track record is extra information: the analysis stays readable without it.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, source, id, state?.key]);

  return state?.key === key ? state.calls : null;
}

/** "Right 4 of 6": every horizon of every asset that could be judged so far. */
export function OutcomeScore({ calls }: { calls: Map<string, PredictionView> }) {
  const { t } = useI18n();
  const verdicts = [...calls.values()].flatMap((p) => HORIZONS.map((h) => p.verdicts[h])).filter((v) => v != null);
  if (verdicts.length === 0) {
    if (![...calls.values()].some((p) => p.status === 'pending')) return null;
    return (
      <Badge variant="secondary" title={t('analysis.outcome.help')}>
        <Clock aria-hidden />
        {t('analysis.outcome.waiting')}
      </Badge>
    );
  }
  const hits = verdicts.filter((v) => v === 'hit').length;
  const rate = Math.round((hits / verdicts.length) * 100);
  return (
    <Badge
      variant={rate >= 50 ? 'success' : 'danger'}
      className="tabular-nums"
      title={t('analysis.outcome.help')}
    >
      {rate >= 50 ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
      {t('analysis.outcome.score', { hits, n: verdicts.length })}
    </Badge>
  );
}

/** What the price really did after the story, per horizon, with right/wrong against the call. */
export function AssetOutcome({ call }: { call: PredictionView }) {
  const { t } = useI18n();
  if (call.status === 'unsupported' || call.status === 'error') {
    return <p className="text-xs text-muted-foreground">{t(`analysis.outcome.${call.status}`)}</p>;
  }
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label={t('analysis.outcome.label', { symbol: call.symbol })}>
      <span className="text-muted-foreground">
        {call.benchmark ? t('analysis.outcome.actualVs', { benchmark: call.benchmark }) : t('analysis.outcome.actual')}
      </span>
      {HORIZONS.map((h) => {
        const move = call.moves[h];
        const verdict = call.verdicts[h];
        return (
          <span key={h} className="inline-flex items-center gap-1 tabular-nums" data-verdict={verdict ?? 'pending'}>
            <span className="text-muted-foreground">{t(`analysis.outcome.h${h}`)}</span>
            {move == null || verdict == null ? (
              <span className="text-muted-foreground">{t('analysis.outcome.pending')}</span>
            ) : (
              <span
                className={cn('inline-flex items-center gap-0.5 font-medium', verdict === 'hit' ? 'text-success' : 'text-danger')}
                title={t(`acc.${verdict}`)}
              >
                {verdict === 'hit' ? (
                  <CircleCheck className="size-3.5" aria-label={t('acc.hit')} />
                ) : (
                  <CircleX className="size-3.5" aria-label={t('acc.miss')} />
                )}
                {signed(move)}
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}
