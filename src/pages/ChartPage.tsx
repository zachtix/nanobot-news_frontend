import { Loader2, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, describeError } from '@/api/client';
import type { BacktestJob, ChartAnalysis } from '@/api/types';
import { BacktestCard } from '@/components/chart/BacktestCard';
import { ChartAccuracyCard } from '@/components/chart/ChartAccuracyCard';
import { ChartAnalysisView } from '@/components/chart/ChartAnalysisView';
import { ChartHistoryCard } from '@/components/chart/ChartHistoryCard';
import { DateTimePicker } from '@/components/DateTimePicker';
import { useHealth } from '@/context/HealthContext';
import { useI18n } from '@/i18n/I18nContext';

const QUICK = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'];

/** Chart analysis: the AI reads one coin's chart alone, as of now or any past moment, and every call is checked later. */
export function ChartPage() {
  const { t } = useI18n();
  const health = useHealth();
  const [symbol, setSymbol] = useState('BTC');
  const [when, setWhen] = useState<'now' | 'past'>('now');
  // Default: 4 days ago on the hour, so all three horizons are already judged.
  const [at, setAt] = useState<Date | null>(() => {
    const d = new Date(Date.now() - 4 * 86_400_000);
    d.setMinutes(0, 0, 0);
    return d;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ analysis: ChartAnalysis; cached: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const lastDone = useRef(0);
  // ?analysis=<id>: opened from a news or market call to see that coin's chart in full.
  const [params] = useSearchParams();
  const linked = Number(params.get('analysis')) || null;

  useEffect(() => {
    if (!linked) return;
    let live = true;
    api.chartAnalysis(linked).then(
      (analysis) => {
        if (!live) return;
        setSymbol(analysis.symbol);
        setResult({ analysis, cached: false });
      },
      (err) => live && setError(describeError(err)),
    );
    return () => {
      live = false;
    };
  }, [linked]);

  const aiOff = health ? !health.ai.enabled : false;

  const run = async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      const body = { symbol: symbol.trim(), ...(when === 'past' && at ? { at: at.toISOString() } : {}), ...(force ? { force } : {}) };
      setResult(await api.analyzeChart(body));
      setReload((n) => n + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const open = (analysis: ChartAnalysis) => {
    setResult({ analysis, cached: false });
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Refresh the accuracy and history as backtest analyses come in (not on every poll).
  const onBacktest = (job: BacktestJob) => {
    if (job.done - lastDone.current >= 5 || job.status !== 'running') {
      lastDone.current = job.done;
      setReload((n) => n + 1);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold">{t('chart.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('chart.subtitle')}</p>
      </div>

      <Card role="region" aria-label={t('chart.form')}>
        <CardHeader>
          <CardTitle>{t('chart.form')}</CardTitle>
          <CardDescription>{t('chart.blindNote')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chart-symbol">{t('chart.symbol')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="chart-symbol"
                className="w-32 uppercase"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && run()}
              />
              {QUICK.map((s) => (
                <Button key={s} variant={symbol.toUpperCase() === s ? 'secondary' : 'ghost'} size="sm" onClick={() => setSymbol(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" id="chart-when">
              {t('chart.when')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup type="single" variant="outline" value={when} onValueChange={(v) => v && setWhen(v as 'now' | 'past')} aria-labelledby="chart-when">
                <ToggleGroupItem value="now" className="px-3">
                  {t('chart.when.now')}
                </ToggleGroupItem>
                <ToggleGroupItem value="past" className="px-3">
                  {t('chart.when.past')}
                </ToggleGroupItem>
              </ToggleGroup>
              {when === 'past' && (
                <DateTimePicker value={at} onChange={setAt} max={new Date()} aria-label={t('chart.when.pick')} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t(when === 'past' ? 'chart.when.pastHelp' : 'chart.when.nowHelp')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => run()} disabled={busy || aiOff || !symbol.trim() || (when === 'past' && !at)}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ScanLine aria-hidden />}
              {busy ? t('chart.running') : t('chart.run')}
            </Button>
            {result?.cached && (
              <Button variant="outline" onClick={() => run(true)} disabled={busy || aiOff}>
                {t('chart.rerun')}
              </Button>
            )}
            {aiOff && <span className="text-sm text-muted-foreground">{t('chart.aiOff')}</span>}
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div ref={resultRef} className="scroll-mt-20">
        {result && (
          <Card>
            <CardContent>
              <ChartAnalysisView key={result.analysis.id} analysis={result.analysis} cached={result.cached} />
            </CardContent>
          </Card>
        )}
      </div>

      <ChartAccuracyCard reload={reload} />
      <BacktestCard onProgress={onBacktest} />
      <ChartHistoryCard reload={reload} onOpen={open} />
    </div>
  );
}
