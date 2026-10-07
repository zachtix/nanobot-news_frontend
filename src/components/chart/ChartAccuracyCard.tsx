import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, describeError } from '@/api/client';
import type { ChartAccuracyGroup, ChartAccuracySummary, ChartMode, Direction } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import { CHART_HORIZONS } from './ChartAnalysisView';

const MODES = ['all', 'live', 'backtest'] as const;
type ModeFilter = (typeof MODES)[number];
const DIRS: Direction[] = ['neutral', 'up', 'down'];
const pct = (v: number | null) => (v == null ? '-' : `${v}%`);

/** How often the chart calls were right, next to always giving the same answer on the same calls. */
export function ChartAccuracyCard({ reload }: { reload: number }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ModeFilter>('all');
  const [summary, setSummary] = useState<ChartAccuracySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.chartSummary(mode === 'all' ? {} : { mode: mode as ChartMode }).then(
      (s) => {
        setSummary(s);
        setError(null);
      },
      (err) => setError(describeError(err)),
    );
  }, [mode, reload, tick]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshChartOutcomes();
      setTick((n) => n + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card role="region" aria-label={t('chart.acc.title')}>
      <CardHeader>
        <CardTitle>{t('chart.acc.title')}</CardTitle>
        <CardDescription>{t('chart.acc.help')}</CardDescription>
        <CardAction className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as ModeFilter)} aria-label={t('chart.acc.mode')}>
            {MODES.map((m) => (
              <ToggleGroupItem key={m} value={m} className="px-3">
                {t(`chart.acc.mode.${m}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} aria-hidden />
            {t('acc.refresh')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!summary && !error && <Skeleton className="h-40" aria-label={t('common.loading')} />}
        {summary && (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('chart.acc.horizon')}</TableHead>
                    <TableHead className="text-right">{t('chart.acc.judged')}</TableHead>
                    <TableHead className="text-right">{t('chart.acc.ai')}</TableHead>
                    <TableHead className="text-right">{t('chart.acc.directional')}</TableHead>
                    {DIRS.map((d) => (
                      <TableHead key={d} className="text-right text-muted-foreground">
                        {t('chart.acc.always', { dir: t(`analysis.dir.${d}`) })}
                      </TableHead>
                    ))}
                    <TableHead>{t('chart.acc.verdict')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CHART_HORIZONS.map((h) => {
                    const r = summary.horizons[h];
                    const best = Math.max(...DIRS.map((d) => r.baselines[d] ?? 0));
                    return (
                      <TableRow key={h}>
                        <TableCell className="font-medium">{t(`chart.h.${h}`)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.n}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{pct(r.hitRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(r.directional.hitRate)} <span className="text-xs text-muted-foreground">({r.directional.n})</span>
                        </TableCell>
                        {DIRS.map((d) => (
                          <TableCell key={d} className="text-right text-muted-foreground tabular-nums">
                            {pct(r.baselines[d])}
                          </TableCell>
                        ))}
                        <TableCell>
                          {r.hitRate == null ? (
                            '-'
                          ) : r.hitRate > best ? (
                            <Badge variant="success">{t('chart.acc.beats')}</Badge>
                          ) : (
                            <Badge variant="warning">{t('chart.acc.loses')}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('chart.acc.counts', { pending: summary.counts.pending, done: summary.counts.done, unsupported: summary.counts.unsupported + summary.counts.error })}
              {' · '}
              {t('chart.acc.smallSample')}
            </p>
            <Groups summary={summary} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

type GroupTab = 'direction' | 'confidence' | 'symbol' | 'trend';

function Groups({ summary }: { summary: ChartAccuracySummary }) {
  const { t } = useI18n();
  const tabs: { id: GroupTab; title: MessageKey; rows: ChartAccuracyGroup[]; label: (k: string) => string }[] = [
    { id: 'direction', title: 'acc.by.direction', rows: summary.byDirection, label: (k) => t(`analysis.dir.${k}` as MessageKey) },
    { id: 'confidence', title: 'acc.by.confidence', rows: summary.byConfidence, label: (k) => `${k}%` },
    { id: 'symbol', title: 'chart.acc.bySymbol', rows: summary.bySymbol, label: (k) => k },
    { id: 'trend', title: 'chart.acc.byTrend', rows: summary.byTrend, label: (k) => t(`chart.trend.${k}` as MessageKey) },
  ];
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('chart.acc.groups', { h: t(`chart.h.${summary.mainHorizon}`) })}</h3>
      <Tabs defaultValue="direction">
        <TabsList className="flex-wrap" aria-label={t('chart.acc.groups', { h: t(`chart.h.${summary.mainHorizon}`) })}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {t(tab.title)}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="pt-2">
            {tab.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('acc.noGroups')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {tab.rows.map((g) => (
                  <li key={g.key} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate">{tab.label(g.key)}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full bg-primary" style={{ width: `${g.hitRate ?? 0}%` }} />
                    </div>
                    <span className="tabular-nums">
                      {pct(g.hitRate)} <span className="text-xs text-muted-foreground">({g.n})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
