import { Loader2, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { type DateRange, DateRangePicker } from '@/components/DateTimePicker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, describeError } from '@/api/client';
import type { BacktestJob, BacktestPlan, BacktestRequest } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/utils/format';
import { formatCost } from './format';

const STEPS = [4, 8, 12, 24] as const;
const POLL_MS = 1500;
const DAY = 86_400_000;

/** "a, b c" → ["A", "B", "C"] */
const parseSymbols = (s: string) => [...new Set(s.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))];

/** Whole local days: from 00:00 of the first day to 23:00 of the last (never past the last closed hour). */
function toRequest(symbols: string, range: DateRange | undefined, stepHours: number): BacktestRequest | null {
  if (!range?.from) return null;
  const to = range.to ?? range.from;
  const start = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate(), 0).getTime();
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23).getTime();
  const end = Math.min(last, Math.floor(Date.now() / 3_600_000) * 3_600_000);
  return { symbols: parseSymbols(symbols), from: new Date(start).toISOString(), to: new Date(end).toISOString(), stepHours };
}

/** Run the chart analysis at many past moments to measure how often it is right. */
export function BacktestCard({ onProgress }: { onProgress: (job: BacktestJob) => void }) {
  const { t, lang } = useI18n();
  const [symbols, setSymbols] = useState('BTC, ETH, SOL');
  // Default: a week ending 3 days ago, so every horizon (up to 3 days) can be judged right away.
  const [range, setRange] = useState<DateRange | undefined>(() => ({ from: new Date(Date.now() - 10 * DAY), to: new Date(Date.now() - 4 * DAY) }));
  const [step, setStep] = useState<number>(12);
  const [plan, setPlan] = useState<BacktestPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [job, setJob] = useState<BacktestJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const req = toRequest(symbols, range, step);
  const key = JSON.stringify(req);

  useEffect(() => {
    if (!req || req.symbols.length === 0) {
      setPlan(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api.planBacktest(req).then(
        (p) => live && (setPlan(p), setPlanError(null)),
        (err) => live && (setPlan(null), setPlanError(describeError(err))),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Pick up a backtest already running (e.g. after a reload), then poll while it runs.
  useEffect(() => {
    api.backtestStatus().then((j) => j && setJob(j), () => undefined);
  }, []);
  useEffect(() => {
    if (job?.status !== 'running') return;
    const timer = setInterval(() => {
      api.backtestStatus().then(
        (j) => {
          if (!j) return;
          setJob(j);
          onProgressRef.current(j);
        },
        (err) => setError(describeError(err)),
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job?.status, job?.id]);

  const start = async () => {
    if (!req) return;
    setStarting(true);
    setError(null);
    try {
      const j = await api.startBacktest(req);
      setJob(j);
      onProgressRef.current(j);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    try {
      const j = await api.stopBacktest();
      if (j) setJob(j);
    } catch (err) {
      setError(describeError(err));
    }
  };

  const running = job?.status === 'running';
  const tooMany = plan ? plan.total > plan.maxTotal : false;
  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <Card role="region" aria-label={t('chart.bt.title')}>
      <CardHeader>
        <CardTitle>{t('chart.bt.title')}</CardTitle>
        <CardDescription>{t('chart.bt.help')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[3fr_3fr_2fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bt-symbols">{t('chart.bt.symbols')}</Label>
            <Input id="bt-symbols" value={symbols} onChange={(e) => setSymbols(e.target.value)} disabled={running} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bt-range">{t('chart.bt.range')}</Label>
            <DateRangePicker id="bt-range" value={range} onChange={setRange} max={new Date()} disabled={running} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bt-step">{t('chart.bt.step')}</Label>
            <Select value={String(step)} onValueChange={(v) => setStep(Number(v))} disabled={running}>
              <SelectTrigger id="bt-step" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STEPS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {t('chart.bt.every', { n: s })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-sm" role="status">
          {planError ? (
            <span className="text-danger">{planError}</span>
          ) : plan ? (
            <>
              {t('chart.bt.plan', { moments: plan.moments, coins: plan.symbols.length, total: plan.total })}{' '}
              <span className="text-muted-foreground">
                {plan.estimatedCost == null ? t('chart.bt.costUnknown') : t('chart.bt.cost', { cost: formatCost(plan.estimatedCost) })}
              </span>
              {tooMany && <span className="block text-danger">{t('chart.bt.tooMany', { max: plan.maxTotal })}</span>}
            </>
          ) : null}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="outline" onClick={stop} disabled={!running}>
              <Square aria-hidden />
              {t('chart.bt.stop')}
            </Button>
          ) : (
            <Button onClick={start} disabled={!plan || tooMany || starting || plan.total === 0}>
              {starting ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              {t('chart.bt.start')}
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {job && (
          <div className="flex flex-col gap-2 rounded-lg border p-3" aria-label={t('chart.bt.progress')} role="group">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {t(`chart.bt.status.${job.status}`)} · {job.symbols.join(', ')} · {formatDateTime(job.from, lang)} – {formatDateTime(job.to, lang)}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {t('chart.bt.counts', { done: job.done, total: job.total, reused: job.reused, failed: job.failed, cost: formatCost(job.cost) })}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('chart.bt.progress')}
            >
              <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            {job.errors.length > 0 && (
              <ul className="text-xs text-danger">
                {job.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
